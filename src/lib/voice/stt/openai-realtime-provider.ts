import type {
  FinalSpeechTurn,
  StreamingSTTProvider,
  TranscriptUpdate,
} from "../types";
import {
  DEFAULT_SILENCE_DURATION_MS,
  DEFAULT_SPEECH_START_RMS,
} from "./realtime-config";

const SECRET_ENDPOINT = "/api/realtime/transcribe";
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type Listener<T> = (value: T) => void;

interface RealtimeServerEvent {
  type: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  error?: { message?: string };
}

/**
 * OpenAI Realtime transcription over WebRTC (gpt-live-transcribe).
 *
 * Auth: server mints ephemeral client secret; browser POSTs SDP to OpenAI.
 * Turn end: client silence window → input_audio_buffer.commit (server VAD
 * is unsupported for this model).
 */
class OpenAiRealtimeSTTProvider implements StreamingSTTProvider {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private sending = false;
  private intentionalClose = false;
  private connectPromise: Promise<void> | null = null;
  private draft = "";
  private turnIndex = 0;
  private speaking = false;
  private commitInFlight = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceMs = DEFAULT_SILENCE_DURATION_MS;

  private transcriptListeners = new Set<Listener<TranscriptUpdate>>();
  private turnStartListeners = new Set<Listener<void>>();
  private turnEndListeners = new Set<Listener<FinalSpeechTurn>>();
  private errorListeners = new Set<Listener<Error>>();

  async connect(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("OpenAI Realtime STT requires a browser environment");
    }
    if (this.pc && this.pc.connectionState !== "closed") {
      if (this.connectPromise) return this.connectPromise;
      return;
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.openConnection().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async start(): Promise<void> {
    if (!this.pc || this.pc.connectionState === "closed") {
      await this.connect();
    }
    this.sending = true;
    this.setMicEnabled(true);
    this.startEnergyMonitor();
  }

  async stop(): Promise<void> {
    this.sending = false;
    this.clearSilenceTimer();
    this.stopEnergyMonitor();
    this.setMicEnabled(false);
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.sending = false;
    this.teardown();
    this.intentionalClose = false;
  }

  onTranscriptUpdate(callback: (update: TranscriptUpdate) => void): () => void {
    this.transcriptListeners.add(callback);
    return () => this.transcriptListeners.delete(callback);
  }

  onTurnStart(callback: () => void): () => void {
    const wrapped: Listener<void> = () => callback();
    this.turnStartListeners.add(wrapped);
    return () => this.turnStartListeners.delete(wrapped);
  }

  onTurnEnd(callback: (turn: FinalSpeechTurn) => void): () => void {
    this.turnEndListeners.add(callback);
    return () => this.turnEndListeners.delete(callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private async openConnection(): Promise<void> {
    this.intentionalClose = false;
    this.teardownPeerOnly();

    const secretRes = await fetch(SECRET_ENDPOINT, { method: "POST" });
    const secretBody = await secretRes.text();
    if (!secretRes.ok) {
      throw new Error(parseJsonError(secretBody, secretRes.status));
    }
    let clientSecret: string;
    try {
      const parsed = JSON.parse(secretBody) as {
        clientSecret?: string;
        silenceDurationMs?: number;
      };
      if (!parsed.clientSecret) {
        throw new Error("Token response missing clientSecret");
      }
      clientSecret = parsed.clientSecret;
      if (
        typeof parsed.silenceDurationMs === "number" &&
        Number.isFinite(parsed.silenceDurationMs)
      ) {
        this.silenceMs = Math.min(
          10_000,
          Math.max(200, Math.floor(parsed.silenceDurationMs)),
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("clientSecret")) throw err;
      throw new Error("Invalid token response from /api/realtime/transcribe");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    this.mediaStream = stream;

    const pc = new RTCPeerConnection();
    this.pc = pc;
    pc.ontrack = () => {
      // Transcription sessions should not play remote audio.
    };

    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (event) => {
      this.handleDataMessage(event.data);
    });

    pc.addEventListener("connectionstatechange", () => {
      if (this.intentionalClose) return;
      if (pc.connectionState === "failed") {
        this.emitError(new Error("OpenAI Realtime WebRTC connection failed"));
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!offer.sdp) {
      throw new Error("Failed to create WebRTC SDP offer");
    }

    const sdpResponse = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });
    const answerBody = await sdpResponse.text();
    if (!sdpResponse.ok) {
      this.teardown();
      throw new Error(parseJsonError(answerBody, sdpResponse.status));
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerBody,
    });

    this.setupAnalyser(stream);

    if (!this.sending) {
      this.setMicEnabled(false);
    } else {
      this.startEnergyMonitor();
    }
  }

  private setupAnalyser(stream: MediaStream): void {
    this.stopEnergyMonitor();
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
    }
    const ctx = new AudioContext();
    this.audioContext = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    this.analyser = analyser;
  }

  private startEnergyMonitor(): void {
    if (this.rafId !== null) return;
    const analyser = this.analyser;
    if (!analyser) return;
    const data = new Float32Array(analyser.fftSize);

    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.sending || this.commitInFlight) return;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] ?? 0;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      if (rms >= DEFAULT_SPEECH_START_RMS) {
        this.onLocalSpeechEnergy();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopEnergyMonitor(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private onLocalSpeechEnergy(): void {
    if (!this.speaking) {
      this.speaking = true;
      this.draft = "";
      this.emitTurnStart();
      this.emitTranscript({
        transcript: "",
        isFinal: false,
        turnIndex: this.turnIndex,
      });
    }
    // Activity resets the commit timer; commit only after silence with draft.
    this.armSilenceCommit();
  }

  private armSilenceCommit(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      void this.commitIfNeeded();
    }, this.silenceMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async commitIfNeeded(): Promise<void> {
    if (!this.sending || this.commitInFlight) return;
    if (!this.draft.trim()) {
      this.speaking = false;
      return;
    }
    if (!this.dc || this.dc.readyState !== "open") return;

    this.commitInFlight = true;
    this.clearSilenceTimer();
    try {
      this.dc.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        }),
      );
    } catch (err) {
      this.commitInFlight = false;
      this.emitError(
        err instanceof Error ? err : new Error("Failed to commit audio turn"),
      );
    }
  }

  private handleDataMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let event: RealtimeServerEvent;
    try {
      event = JSON.parse(raw) as RealtimeServerEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case "conversation.item.input_audio_transcription.delta": {
        if (!this.speaking) {
          this.speaking = true;
          this.emitTurnStart();
        }
        this.draft += event.delta ?? "";
        this.emitTranscript({
          transcript: this.draft,
          isFinal: false,
          turnIndex: this.turnIndex,
        });
        this.armSilenceCommit();
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        this.commitInFlight = false;
        const transcript = (event.transcript ?? this.draft).trim();
        this.draft = "";
        this.speaking = false;
        this.clearSilenceTimer();
        if (!transcript) {
          this.emitTranscript({
            transcript: "",
            isFinal: true,
            turnIndex: this.turnIndex,
          });
          break;
        }
        const turn: FinalSpeechTurn = {
          transcript,
          turnIndex: this.turnIndex,
          endedAt: Date.now(),
        };
        this.turnIndex += 1;
        this.emitTranscript({
          transcript,
          isFinal: true,
          turnIndex: turn.turnIndex,
        });
        this.emitTurnEnd(turn);
        break;
      }
      case "error": {
        this.commitInFlight = false;
        this.emitError(
          new Error(event.error?.message || "OpenAI Realtime error"),
        );
        break;
      }
      default:
        break;
    }
  }

  private setMicEnabled(enabled: boolean): void {
    const tracks = this.mediaStream?.getAudioTracks() ?? [];
    for (const track of tracks) {
      track.enabled = enabled;
    }
  }

  private teardownPeerOnly(): void {
    this.clearSilenceTimer();
    this.stopEnergyMonitor();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {
        // ignore
      }
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.analyser = null;
  }

  private teardown(): void {
    this.setMicEnabled(false);
    this.teardownPeerOnly();
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
    this.draft = "";
    this.speaking = false;
    this.commitInFlight = false;
  }

  private emitTranscript(update: TranscriptUpdate): void {
    for (const cb of this.transcriptListeners) cb(update);
  }

  private emitTurnStart(): void {
    for (const cb of this.turnStartListeners) cb();
  }

  private emitTurnEnd(turn: FinalSpeechTurn): void {
    for (const cb of this.turnEndListeners) cb(turn);
  }

  private emitError(error: Error): void {
    for (const cb of this.errorListeners) cb(error);
  }
}

function parseJsonError(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return `Realtime transcription failed (${status})`;
  if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed) || /error code:\s*\d+/i.test(trimmed)) {
    return `OpenAI Realtime temporarily unavailable (${status}). Retry in a moment.`;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object" && parsed.error.message) {
      return parsed.error.message;
    }
    if (parsed.message) return parsed.message;
  } catch {
    // fall through
  }
  return trimmed.slice(0, 240);
}

/** Factory for OpenAI Realtime streaming STT. */
export function createOpenAiRealtimeSTT(): StreamingSTTProvider {
  return new OpenAiRealtimeSTTProvider();
}
