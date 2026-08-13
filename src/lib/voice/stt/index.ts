/**
 * TEMP stub STT surface for orchestration until Agent1 merges Deepgram Flux.
 * EagerEndOfTurn callbacks are supported but MUST NOT create candidate turns.
 */

import type {
  FinalSpeechTurn,
  StreamingSTTProvider,
  TranscriptUpdate,
} from "@/lib/voice/types";

type Unsubscribe = () => void;

function noopUnsub(): Unsubscribe {
  return () => {};
}

/**
 * No-op StreamingSTTProvider. Marked TEMP — replace via Agent1
 * `createDeepgramFluxSTT()` merge; keep this export for type-safe imports.
 */
export function createTempStubSTT(): StreamingSTTProvider {
  return {
    async connect() {},
    async start() {},
    async stop() {},
    async disconnect() {},
    onTranscriptUpdate(cb: (update: TranscriptUpdate) => void) {
      void cb;
      return noopUnsub();
    },
    onTurnStart(cb: () => void) {
      void cb;
      return noopUnsub();
    },
    onEagerEndOfTurn(cb: (draft: TranscriptUpdate) => void) {
      void cb;
      return noopUnsub();
    },
    onTurnResumed(cb: () => void) {
      void cb;
      return noopUnsub();
    },
    onTurnEnd(cb: (turn: FinalSpeechTurn) => void) {
      void cb;
      return noopUnsub();
    },
    onError(cb: (error: Error) => void) {
      void cb;
      return noopUnsub();
    },
  };
}

/** Prefer Deepgram factory when Agent1 lands; falls back to TEMP stub. */
export function createStreamingSTT(): StreamingSTTProvider {
  return createTempStubSTT();
}
