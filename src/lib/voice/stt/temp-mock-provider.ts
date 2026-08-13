/**
 * TEMP — no-op StreamingSTTProvider for Agent2 Voice UI wiring.
 * Agent1 should replace this with Deepgram Flux; do not treat as production STT.
 */

import type {
  FinalSpeechTurn,
  StreamingSTTProvider,
  TranscriptUpdate,
} from "@/lib/voice";

type Listener<T> = (value: T) => void;

class TempMockSTTProvider implements StreamingSTTProvider {
  private connected = false;
  private listening = false;

  private transcriptListeners = new Set<Listener<TranscriptUpdate>>();
  private turnStartListeners = new Set<Listener<void>>();
  private eagerEndListeners = new Set<Listener<TranscriptUpdate>>();
  private turnResumedListeners = new Set<Listener<void>>();
  private turnEndListeners = new Set<Listener<FinalSpeechTurn>>();
  private errorListeners = new Set<Listener<Error>>();

  async connect(): Promise<void> {
    // Simulate a short connect so UI can show "Connecting".
    await new Promise((r) => setTimeout(r, 120));
    this.connected = true;
  }

  async start(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
    // Permission probe — recoverable via hook retry if denied.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Microphone permission denied");
        this.errorListeners.forEach((cb) => cb(error));
        throw error;
      }
    }
    this.listening = true;
  }

  async stop(): Promise<void> {
    this.listening = false;
  }

  async disconnect(): Promise<void> {
    this.listening = false;
    this.connected = false;
  }

  onTranscriptUpdate(callback: (update: TranscriptUpdate) => void): () => void {
    this.transcriptListeners.add(callback);
    return () => {
      this.transcriptListeners.delete(callback);
    };
  }

  onTurnStart(callback: () => void): () => void {
    this.turnStartListeners.add(callback);
    return () => {
      this.turnStartListeners.delete(callback);
    };
  }

  onEagerEndOfTurn(callback: (draft: TranscriptUpdate) => void): () => void {
    this.eagerEndListeners.add(callback);
    return () => {
      this.eagerEndListeners.delete(callback);
    };
  }

  onTurnResumed(callback: () => void): () => void {
    this.turnResumedListeners.add(callback);
    return () => {
      this.turnResumedListeners.delete(callback);
    };
  }

  onTurnEnd(callback: (turn: FinalSpeechTurn) => void): () => void {
    this.turnEndListeners.add(callback);
    return () => {
      this.turnEndListeners.delete(callback);
    };
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  /** TEMP test helper — not part of StreamingSTTProvider. */
  __tempEmitTurnEnd(transcript: string): void {
    if (!this.listening) return;
    const text = transcript.trim();
    if (!text) return;
    this.turnStartListeners.forEach((cb) => cb());
    const update: TranscriptUpdate = { transcript: text, isFinal: true };
    this.transcriptListeners.forEach((cb) => cb(update));
    const turn: FinalSpeechTurn = {
      transcript: text,
      endedAt: Date.now(),
    };
    this.turnEndListeners.forEach((cb) => cb(turn));
  }
}

/** Factory name matches Agent1 export for drop-in merge. */
export function createDeepgramFluxSTT(): StreamingSTTProvider {
  return new TempMockSTTProvider();
}
