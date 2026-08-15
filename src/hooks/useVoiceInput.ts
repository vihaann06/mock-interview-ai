"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinalSpeechTurn, TranscriptUpdate } from "@/lib/voice";
import { createOpenAiRealtimeSTT } from "@/lib/voice/stt";

export type VoiceUiStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "candidate_speaking"
  | "processing"
  | "muted"
  | "error";

export interface UseVoiceInputOptions {
  /** When false, disconnects STT and stays idle. */
  enabled?: boolean;
  /** Shared candidate submit path (typed chat + voice EndOfTurn). */
  onFinalTurn: (turn: FinalSpeechTurn) => void | Promise<void>;
  /** Orchestration hooks (barge-in / optional turn end). */
  onVoiceTurnStart?: () => void;
  onVoiceTurnEnd?: (turn: FinalSpeechTurn) => void;
}

export interface UseVoiceInputResult {
  status: VoiceUiStatus;
  draftTranscript: string;
  error: string | null;
  muted: boolean;
  mute: () => void;
  unmute: () => void;
  retry: () => void;
}

function voiceErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Microphone permission denied. Allow access in the browser address bar and retry.";
    }
    if (err.name === "NotFoundError") {
      return "No microphone found. Connect a mic and retry.";
    }
    return err.message || err.name;
  }
  if (err instanceof Error) {
    if (/notallowederror|permission denied|microphone permission/i.test(err.message)) {
      return "Microphone permission denied. Allow access in the browser address bar and retry.";
    }
    return err.message;
  }
  return "Voice input failed";
}

/**
 * Wraps OpenAI Realtime streaming STT.
 * Partial transcripts are draft-only — only completed turns call onFinalTurn.
 */
export function useVoiceInput({
  enabled = true,
  onFinalTurn,
  onVoiceTurnStart,
  onVoiceTurnEnd,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [status, setStatus] = useState<VoiceUiStatus>("idle");
  const [draftTranscript, setDraftTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const providerRef = useRef<ReturnType<typeof createOpenAiRealtimeSTT> | null>(
    null,
  );
  const mutedRef = useRef(false);
  const processingRef = useRef(false);
  const onFinalTurnRef = useRef(onFinalTurn);
  const onVoiceTurnStartRef = useRef(onVoiceTurnStart);
  const onVoiceTurnEndRef = useRef(onVoiceTurnEnd);
  const sessionGenRef = useRef(0);

  useEffect(() => {
    onFinalTurnRef.current = onFinalTurn;
  }, [onFinalTurn]);

  useEffect(() => {
    onVoiceTurnStartRef.current = onVoiceTurnStart;
  }, [onVoiceTurnStart]);

  useEffect(() => {
    onVoiceTurnEndRef.current = onVoiceTurnEnd;
  }, [onVoiceTurnEnd]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const ensureProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = createOpenAiRealtimeSTT();
    }
    return providerRef.current;
  }, []);

  const startListening = useCallback(
    async (gen: number) => {
      const provider = ensureProvider();
      setError(null);
      setStatus("connecting");
      try {
        await provider.connect();
        if (gen !== sessionGenRef.current) return;
        await provider.start();
        if (gen !== sessionGenRef.current) return;
        if (mutedRef.current) {
          await provider.stop();
          setStatus("muted");
          return;
        }
        setStatus("listening");
      } catch (err) {
        if (gen !== sessionGenRef.current) return;
        setError(voiceErrorMessage(err));
        setStatus("error");
      }
    },
    [ensureProvider],
  );

  useEffect(() => {
    if (!enabled) {
      sessionGenRef.current += 1;
      const provider = providerRef.current;
      providerRef.current = null;
      if (provider) {
        void provider.stop().catch(() => undefined);
        void provider.disconnect().catch(() => undefined);
      }
      return;
    }

    const gen = ++sessionGenRef.current;
    const provider = ensureProvider();

    const unsubUpdate = provider.onTranscriptUpdate(
      (update: TranscriptUpdate) => {
        if (mutedRef.current || processingRef.current) return;
        setDraftTranscript(update.transcript);
        if (update.transcript.trim()) {
          setStatus((prev) =>
            prev === "muted" || prev === "error" || prev === "processing"
              ? prev
              : "candidate_speaking",
          );
        }
      },
    );

    const unsubStart = provider.onTurnStart(() => {
      if (mutedRef.current || processingRef.current) return;
      setDraftTranscript("");
      setStatus("candidate_speaking");
      onVoiceTurnStartRef.current?.();
    });

    const unsubEnd = provider.onTurnEnd((turn: FinalSpeechTurn) => {
      void (async () => {
        if (mutedRef.current || processingRef.current) return;
        const text = turn.transcript.trim();
        if (!text) {
          setDraftTranscript("");
          setStatus(mutedRef.current ? "muted" : "listening");
          return;
        }

        processingRef.current = true;
        setStatus("processing");
        setDraftTranscript(text);
        onVoiceTurnEndRef.current?.(turn);

        try {
          const done = Promise.resolve(onFinalTurnRef.current(turn));
          // Release the mic UI lock once the turn is handed off. Waiting on
          // full orchestrator TTS kept status stuck on "Processing" and
          // blocked later speech-start / speech-end events.
          processingRef.current = false;
          setDraftTranscript("");
          if (mutedRef.current) {
            setStatus("muted");
          } else if (sessionGenRef.current === gen) {
            setStatus("listening");
          }
          await done;
        } catch (err) {
          setError(voiceErrorMessage(err));
          // Keep interview alive — voice error is recoverable.
          processingRef.current = false;
          if (mutedRef.current) {
            setStatus("muted");
          } else if (sessionGenRef.current === gen) {
            setStatus("listening");
          }
        }
      })();
    });

    const unsubError = provider.onError((err: Error) => {
      if (mutedRef.current) return;
      setError(voiceErrorMessage(err));
      setStatus("error");
    });

    void startListening(gen);

    return () => {
      sessionGenRef.current += 1;
      unsubUpdate();
      unsubStart();
      unsubEnd();
      unsubError();
      void provider.stop().catch(() => undefined);
      void provider.disconnect().catch(() => undefined);
      providerRef.current = null;
      processingRef.current = false;
    };
  }, [enabled, ensureProvider, startListening]);

  const mute = useCallback(() => {
    mutedRef.current = true;
    setMuted(true);
    setDraftTranscript("");
    const provider = providerRef.current;
    if (provider) {
      void provider.stop().catch(() => undefined);
    }
    setStatus("muted");
  }, []);

  const unmute = useCallback(() => {
    mutedRef.current = false;
    setMuted(false);
    if (!enabled) return;
    const gen = sessionGenRef.current;
    void startListening(gen);
  }, [enabled, startListening]);

  const retry = useCallback(() => {
    if (!enabled) return;
    setError(null);
    mutedRef.current = false;
    setMuted(false);
    // Force a fresh provider/session after errors.
    const old = providerRef.current;
    providerRef.current = null;
    if (old) {
      void old.disconnect().catch(() => undefined);
    }
    const gen = ++sessionGenRef.current;
    void startListening(gen);
  }, [enabled, startListening]);

  return {
    status: enabled ? status : "idle",
    draftTranscript: enabled ? draftTranscript : "",
    error: enabled ? error : null,
    muted,
    mute,
    unmute,
    retry,
  };
}
