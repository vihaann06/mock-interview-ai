"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOpenAiTtsProvider } from "@/lib/voice/tts";
import type { TtsPlaybackState } from "@/lib/voice/types";

export interface UseInterviewerSpeechResult {
  /**
   * Speak an interviewer message. Empty / whitespace (WAIT) is a no-op.
   * Cancels any in-flight utterance so only one plays at a time.
   */
  speakInterviewer: (text: string) => Promise<void>;
  /** Cancel current generation/playback → state `stopped`. */
  stopSpeaking: () => void;
  ttsState: TtsPlaybackState;
}

/**
 * Interviewer TTS hook for InterviewRoom / voice orchestration.
 *
 * After `applyInterviewerTurn(base, reply)`:
 * ```ts
 * const { speakInterviewer, stopSpeaking, ttsState } = useInterviewerSpeech();
 * // …
 * void speakInterviewer(reply.message);
 * ```
 */
export function useInterviewerSpeech(): UseInterviewerSpeechResult {
  const [ttsState, setTtsState] = useState<TtsPlaybackState>("idle");
  const providerRef = useRef<ReturnType<typeof createOpenAiTtsProvider> | null>(
    null,
  );

  useEffect(() => {
    const provider = createOpenAiTtsProvider();
    providerRef.current = provider;
    const unsub = provider.onStateChange?.((next) => {
      setTtsState(next);
    });

    return () => {
      unsub?.();
      provider.dispose();
      providerRef.current = null;
    };
  }, []);

  const speakInterviewer = useCallback(async (text: string) => {
    const provider = providerRef.current;
    if (!provider) return;
    try {
      await provider.speak(text);
    } catch {
      // State already set to `error` by the provider; swallow so callers can fire-and-forget.
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    providerRef.current?.stop();
  }, []);

  return { speakInterviewer, stopSpeaking, ttsState };
}
