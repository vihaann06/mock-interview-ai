/**
 * TEMP stub TTS surface for orchestration until Agent3 merges OpenAI speech.
 */

import type { TTSProvider, TtsPlaybackState } from "@/lib/voice/types";

/**
 * No-op TTSProvider. Marked TEMP — replace via Agent3 provider merge.
 */
export function createTempStubTTS(): TTSProvider {
  let state: TtsPlaybackState = "idle";
  const listeners = new Set<(s: TtsPlaybackState) => void>();

  const setState = (next: TtsPlaybackState) => {
    state = next;
    for (const cb of listeners) cb(state);
  };

  return {
    async speak(text: string) {
      if (!text.trim()) return;
      setState("speaking");
      // Instant complete — real provider plays audio then settles.
      setState("idle");
    },
    stop() {
      if (state === "speaking" || state === "generating") {
        setState("stopped");
      }
    },
    isSpeaking() {
      return state === "speaking" || state === "generating";
    },
    getState() {
      return state;
    },
    onStateChange(callback: (s: TtsPlaybackState) => void) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

/** Prefer OpenAI TTS factory when Agent3 lands; falls back to TEMP stub. */
export function createTTSProvider(): TTSProvider {
  return createTempStubTTS();
}
