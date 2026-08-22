import type {
  FinalSpeechTurn,
  StreamingSTTProvider,
  TranscriptUpdate,
} from "../types";
import {
  DEFAULT_SILENCE_DURATION_MS,
  DEFAULT_SPEECH_START_RMS,
  ICE_GATHERING_TIMEOUT_MS,
} from "./realtime-config";

const SESSION_ENDPOINT = "/api/realtime/transcribe";

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
 * Auth: browser POSTs SDP to our server; the server proxies to OpenAI
 * `/v1/realtime/calls` with the permanent API key (unified interface).
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
  /** Bumps on every teardown so in-flight connect work can abort cleanly. */
  private connectGeneration = 0;
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
      if (
        this.pc.connectionState === "connected" ||
        this.pc.connectionState === "connecting"
      ) {
        return;
      }
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
    this.connectGeneration += 1;
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

  private assertGeneration(gen: number): void {
    if (gen !== this.connectGeneration) {
      throw new DOMException("Realtime connect aborted", "AbortError");
    }
  }

  private async openConnection(): Promise<void> {
    this.intentionalClose = false;
    const gen = ++this.connectGeneration;
    this.teardownPeerOnly();

    await this.refreshSilenceConfig();
    this.assertGeneration(gen);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    this.assertGeneration(gen);
    this.mediaStream = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
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
      if (gen !== this.connectGeneration) return;
      this.handleDataMessage(event.data);
    });

    pc.addEventListener("connectionstatechange", () => {
      if (this.intentionalClose) return;
      if (this.pc !== pc || gen !== this.connectGeneration) return;
      if (pc.connectionState === "failed") {
        const ice = pc.iceConnectionState;
        this.emitError(
          new Error(
            `OpenAI Realtime WebRTC connection failed (ice=${ice}). Check network/firewall and retry.`,
          ),
        );
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.assertGeneration(gen);

    await waitForIceGathering(pc, ICE_GATHERING_TIMEOUT_MS);
    this.assertGeneration(gen);

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      throw new Error("Failed to create WebRTC SDP offer");
    }

    const sdpResponse = await fetch(SESSION_ENDPOINT, {
      method: "POST",
      body: localSdp,
      headers: {
        "Content-Type": "application/sdp",
      },
    });
    this.assertGeneration(gen);

    const answerBody = await sdpResponse.text();
    if (!sdpResponse.ok) {
      this.teardown();
      throw new Error(parseJsonError(answerBody, sdpResponse.status));
    }

    const silenceHeader = sdpResponse.headers.get("X-Silence-Duration-Ms");
    if (silenceHeader) {
      const n = Number(silenceHeader);
      if (Number.isFinite(n)) {
        this.silenceMs = Math.min(10_000, Math.max(200, Math.floor(n)));
      }
    }

    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerBody,
    });
    this.assertGeneration(gen);

    this.setupAnalyser(stream);

    if (!this.sending) {
      this.setMicEnabled(false);
    } else {
      this.startEnergyMonitor();
    }
  }

  private async refreshSilenceConfig(): Promise<void> {
    try {
      const res = await fetch(SESSION_ENDPOINT, { method: "GET" });
      if (!res.ok) return;
      const parsed = (await res.json()) as { silenceDurationMs?: number };
      if (
        typeof parsed.silenceDurationMs === "number" &&
        Number.isFinite(parsed.silenceDurationMs)
      ) {
        this.silenceMs = Math.min(
          10_000,
          Math.max(200, Math.floor(parsed.silenceDurationMs)),
        );
      }
    } catch {
      // Keep default silence window.
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

function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs: number,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };

    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };

    pc.addEventListener("icegatheringstatechange", onChange);
    setTimeout(finish, timeoutMs);
  });
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
