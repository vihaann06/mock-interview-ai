import type {
  DeepgramTokenResponse,
  FinalSpeechTurn,
  FluxTurnEventType,
  StreamingSTTProvider,
  TranscriptUpdate,
} from "../types";

const SAMPLE_RATE = 16_000;
/** ~80ms of PCM16 mono at 16 kHz (Deepgram Flux recommendation). */
const CHUNK_SAMPLES = 1280;
const FLUX_WS_BASE =
  "wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000&eot_threshold=0.7&eager_eot_threshold=0.5";

type Listener<T> = (value: T) => void;

interface FluxTurnInfoMessage {
  type: "TurnInfo";
  event: FluxTurnEventType;
  turn_index: number;
  transcript: string;
  end_of_turn_confidence?: number;
}

function isFluxTurnInfo(value: unknown): value is FluxTurnInfoMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "TurnInfo" &&
    typeof v.event === "string" &&
    typeof v.transcript === "string" &&
    typeof v.turn_index === "number"
  );
}

function floatTo16BitPCM(
  input: Float32Array,
  output: Int16Array,
  offset = 0,
): void {
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    output[offset + i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
}

/** Linear resample Float32 audio to TARGET_RATE. */
function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate || input.length === 0) {
    return input;
  }
  const ratio = inputRate / outputRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = srcIndex - i0;
    output[i] = (1 - t) * input[i0]! + t * input[i1]!;
  }
  return output;
}

class DeepgramFluxSTTProvider implements StreamingSTTProvider {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private pcmBuffer = new Int16Array(0);
  private sending = false;
  private intentionalClose = false;
  private reconnectAttempted = false;
  private connectPromise: Promise<void> | null = null;

  private transcriptListeners = new Set<Listener<TranscriptUpdate>>();
  private turnStartListeners = new Set<Listener<void>>();
  private eagerEndListeners = new Set<Listener<TranscriptUpdate>>();
  private turnResumedListeners = new Set<Listener<void>>();
  private turnEndListeners = new Set<Listener<FinalSpeechTurn>>();
  private errorListeners = new Set<Listener<Error>>();

  async connect(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Deepgram Flux STT requires a browser environment");
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.openConnection({ allowReconnect: true }).finally(
      () => {
        this.connectPromise = null;
      },
    );
    return this.connectPromise;
  }

  async start(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    if (!this.mediaStream) {
      await this.setupMicrophone();
    }
    this.sending = true;
  }

  async stop(): Promise<void> {
    this.sending = false;
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.sending = false;
    this.teardownAudio();
    this.closeSocket();
    this.reconnectAttempted = false;
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

  onEagerEndOfTurn(callback: (draft: TranscriptUpdate) => void): () => void {
    this.eagerEndListeners.add(callback);
    return () => this.eagerEndListeners.delete(callback);
  }

  onTurnResumed(callback: () => void): () => void {
    const wrapped: Listener<void> = () => callback();
    this.turnResumedListeners.add(wrapped);
    return () => this.turnResumedListeners.delete(wrapped);
  }

  onTurnEnd(callback: (turn: FinalSpeechTurn) => void): () => void {
    this.turnEndListeners.add(callback);
    return () => this.turnEndListeners.delete(callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private async openConnection(opts: { allowReconnect: boolean }): Promise<void> {
    const token = await this.fetchAccessToken();
    await this.setupMicrophone();

    this.intentionalClose = false;
    const url = FLUX_WS_BASE;
    // Browser WebSocket cannot set Authorization headers; Deepgram accepts
    // Bearer via the Sec-WebSocket-Protocol subprotocol (SDK pattern).
    const ws = new WebSocket(url, [`Bearer ${token.accessToken}`]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Deepgram Flux WebSocket failed to open"));
      };
      const cleanup = () => {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("error", onError);
      };
      ws.addEventListener("open", onOpen);
      ws.addEventListener("error", onError);
    });

    ws.addEventListener("message", (event) => {
      this.handleSocketMessage(event.data);
    });

    ws.addEventListener("close", () => {
      if (this.ws === ws) {
        this.ws = null;
      }
      if (this.intentionalClose) return;

      if (opts.allowReconnect && !this.reconnectAttempted) {
        this.reconnectAttempted = true;
        void this.openConnection({ allowReconnect: false }).catch((err) => {
          this.emitError(
            err instanceof Error ? err : new Error("Deepgram reconnect failed"),
          );
        });
        return;
      }

      this.emitError(new Error("Deepgram Flux WebSocket closed unexpectedly"));
    });

    ws.addEventListener("error", () => {
      // close handler covers reconnect / user-facing error
    });
  }

  private async fetchAccessToken(): Promise<DeepgramTokenResponse> {
    const res = await fetch("/api/deepgram/token", { method: "POST" });
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error("Invalid token response from /api/deepgram/token");
    }

    if (!res.ok) {
      const record =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : null;
      const message =
        typeof record?.error === "string"
          ? record.error
          : `Failed to mint Deepgram token (${res.status})`;
      throw new Error(message);
    }

    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;
    const accessToken =
      typeof record?.accessToken === "string" ? record.accessToken : null;
    const expiresIn =
      typeof record?.expiresIn === "number" ? record.expiresIn : 30;

    if (!accessToken) {
      throw new Error("Token response missing accessToken");
    }

    return {
      accessToken,
      expiresIn,
      expiresAt:
        typeof record?.expiresAt === "number" ? record.expiresAt : undefined,
    };
  }

  private async setupMicrophone(): Promise<void> {
    if (this.mediaStream && this.audioContext && this.processorNode) {
      return;
    }

    this.teardownAudio();

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

    const audioContext = new AudioContext();
    this.audioContext = audioContext;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    this.sourceNode = source;

    // ScriptProcessor is deprecated but widely available without a worklet file.
    // Buffer size 4096 ≈ 85ms at 48kHz — we resample + chunk to ~80ms @ 16kHz.
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    this.processorNode = processor;

    processor.onaudioprocess = (event) => {
      if (!this.sending || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const resampled = resampleLinear(
        input,
        audioContext.sampleRate,
        SAMPLE_RATE,
      );
      const pcm = new Int16Array(resampled.length);
      floatTo16BitPCM(resampled, pcm);
      this.appendAndFlushPcm(pcm);
    };

    source.connect(processor);
    // Keep the processor alive; mute output to avoid feedback.
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    processor.connect(gain);
    gain.connect(audioContext.destination);
  }

  private appendAndFlushPcm(chunk: Int16Array): void {
    const merged = new Int16Array(this.pcmBuffer.length + chunk.length);
    merged.set(this.pcmBuffer, 0);
    merged.set(chunk, this.pcmBuffer.length);
    this.pcmBuffer = merged;

    while (this.pcmBuffer.length >= CHUNK_SAMPLES) {
      const frame = this.pcmBuffer.subarray(0, CHUNK_SAMPLES);
      this.pcmBuffer = this.pcmBuffer.subarray(CHUNK_SAMPLES);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(frame.slice().buffer);
      }
    }
  }

  private handleSocketMessage(data: unknown): void {
    if (typeof data !== "string") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    if (!isFluxTurnInfo(parsed)) return;

    const turnIndex = parsed.turn_index;
    const transcript = parsed.transcript ?? "";
    const trimmed = transcript.trim();

    switch (parsed.event) {
      case "StartOfTurn":
        for (const cb of this.turnStartListeners) cb();
        break;
      case "Update":
        for (const cb of this.transcriptListeners) {
          cb({ transcript, isFinal: false, turnIndex });
        }
        break;
      case "EagerEndOfTurn":
        // MVP: optional callback only — do NOT emit onTurnEnd / semantic turn.
        for (const cb of this.eagerEndListeners) {
          cb({ transcript, isFinal: false, turnIndex });
        }
        break;
      case "TurnResumed":
        for (const cb of this.turnResumedListeners) cb();
        break;
      case "EndOfTurn": {
        if (!trimmed) break;
        const turn: FinalSpeechTurn = {
          transcript: trimmed,
          turnIndex,
          endedAt: Date.now(),
          confidence:
            typeof parsed.end_of_turn_confidence === "number"
              ? parsed.end_of_turn_confidence
              : undefined,
        };
        for (const cb of this.transcriptListeners) {
          cb({ transcript: trimmed, isFinal: true, turnIndex });
        }
        for (const cb of this.turnEndListeners) cb(turn);
        break;
      }
      default:
        break;
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorListeners) cb(error);
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      // ignore
    }
  }

  private teardownAudio(): void {
    this.pcmBuffer = new Int16Array(0);

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }
  }
}

/** Factory for the Deepgram Flux streaming STT provider. */
export function createDeepgramFluxSTT(): StreamingSTTProvider {
  return new DeepgramFluxSTTProvider();
}
