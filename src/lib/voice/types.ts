/**
 * Shared voice-layer contracts.
 * Voice is an I/O layer around the existing interview engine — not a second engine.
 */

/** Connection / mic / playback high-level UI states. */
export type VoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "error"
  | "disconnected";

export type TtsPlaybackState =
  | "idle"
  | "generating"
  | "speaking"
  | "stopped"
  | "error";

/**
 * Voice conversation orchestration states.
 * Prevents invalid overlaps between STT capture and TTS playback.
 */
export type VoiceConversationState =
  | "IDLE"
  | "LISTENING"
  | "CANDIDATE_SPEAKING"
  | "PROCESSING_TURN"
  | "INTERVIEWER_SPEAKING";

export interface TranscriptUpdate {
  /** Full draft transcript for the current turn so far. */
  transcript: string;
  isFinal: boolean;
  turnIndex?: number;
}

/**
 * Completed spoken turn from STT (Flux EndOfTurn).
 * Downstream must create exactly one CANDIDATE_TURN from this.
 */
export interface FinalSpeechTurn {
  transcript: string;
  turnIndex?: number;
  endedAt: number; // ms epoch
  confidence?: number;
}

export type FluxTurnEventType =
  | "StartOfTurn"
  | "Update"
  | "EagerEndOfTurn"
  | "TurnResumed"
  | "EndOfTurn";

export interface StreamingSTTProvider {
  connect(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  disconnect(): Promise<void>;

  onTranscriptUpdate(callback: (update: TranscriptUpdate) => void): () => void;
  onTurnStart(callback: () => void): () => void;
  /** EagerEndOfTurn — for MVP do NOT create candidate turns from this. */
  onEagerEndOfTurn?(callback: (draft: TranscriptUpdate) => void): () => void;
  onTurnResumed?(callback: () => void): () => void;
  /** Confirmed EndOfTurn — sole trigger for CANDIDATE_TURN from voice. */
  onTurnEnd(callback: (turn: FinalSpeechTurn) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
}

export interface TTSProvider {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
  getState(): TtsPlaybackState;
  onStateChange?(callback: (state: TtsPlaybackState) => void): () => void;
}

export interface DeepgramTokenResponse {
  accessToken: string;
  expiresIn: number;
  /** Optional absolute expiry ms epoch */
  expiresAt?: number;
}
