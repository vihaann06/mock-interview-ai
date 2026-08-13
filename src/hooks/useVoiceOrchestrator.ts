"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InterviewerResponse } from "@/lib/types/interview";
import {
  INACTIVITY_PROBE_MESSAGE,
  canProbeInactivity,
  hasSpeakableInterviewerMessage,
  initialVoiceConversationState,
  reduceVoiceConversation,
  type OrchestratorEvent,
} from "@/lib/voice/orchestration";
import type {
  FinalSpeechTurn,
  TranscriptUpdate,
  TTSProvider,
  VoiceConversationState,
} from "@/lib/voice/types";
import { createTempStubTTS } from "@/lib/voice/tts";

export interface UseVoiceOrchestratorOptions {
  /**
   * Shared submit path with typed chat (Agent2).
   * Must record candidate turn + POST /api/interview/turn.
   * Return the interviewer response (or null on failure).
   */
  submitCandidateTurn: (
    transcript: string,
  ) => Promise<InterviewerResponse | null | undefined>;
  /**
   * Optional TTS. Defaults to TEMP stub until Agent3 wires real speech.
   * Prefer passing speak/stop from useInterviewerSpeech when available.
   */
  tts?: TTSProvider;
  speakInterviewer?: (text: string) => Promise<void>;
  stopSpeaking?: () => void;
  /** When false, orchestrator stays IDLE and ignores STT events. */
  enabled?: boolean;
  /** Interview still running (not ended). */
  interviewActive?: boolean;
  onStateChange?: (state: VoiceConversationState) => void;
  /**
   * Optional override for inactivity probe submit.
   * Defaults to submitCandidateTurn(INACTIVITY_PROBE_MESSAGE).
   */
  onInactivityProbe?: (
    syntheticMessage: string,
  ) => Promise<InterviewerResponse | null | undefined | void>;
}

export interface UseVoiceOrchestratorResult {
  state: VoiceConversationState;
  /** Begin listening for candidate speech. */
  startListening: () => void;
  /** Hard stop → IDLE (also stops TTS). */
  stop: () => void;
  /**
   * Flux StartOfTurn. If TTS is playing, barge-in stops it immediately.
   */
  handleStartOfTurn: () => void;
  /**
   * Confirmed Flux EndOfTurn only.
   * Transitions to PROCESSING_TURN, submits candidate turn, then
   * WAIT → LISTENING (no TTS) or message → INTERVIEWER_SPEAKING → TTS → LISTENING.
   */
  handleEndOfTurn: (turn: FinalSpeechTurn) => Promise<void>;
  /**
   * Flux EagerEndOfTurn — intentionally a no-op for interviewer invocation.
   * Agent2 may update draft UI separately; do NOT call this for submit.
   */
  handleEagerEndOfTurn: (draft: TranscriptUpdate) => void;
  /**
   * Apply an interviewer response already obtained outside EndOfTurn
   * (e.g. typed chat or inactivity probe). Speaks when appropriate.
   */
  handleInterviewerResponse: (
    response: InterviewerResponse,
  ) => Promise<void>;
  /**
   * Once-per-quiet-period probe. No-ops when PROCESSING / speaking / inactive.
   * Active coding is gated by isLongInactive upstream — do not bypass clocks.
   */
  handleInactivityProbe: () => Promise<void>;
  /** Clean API flag for Agent2 UI. */
  canProbeInactivity: boolean;
  inactivityProbeMessage: typeof INACTIVITY_PROBE_MESSAGE;
}

/**
 * Turn-taking / barge-in orchestrator.
 * EagerEndOfTurn never invokes the interviewer.
 */
export function useVoiceOrchestrator({
  submitCandidateTurn,
  tts,
  speakInterviewer,
  stopSpeaking,
  enabled = true,
  interviewActive = true,
  onStateChange,
  onInactivityProbe,
}: UseVoiceOrchestratorOptions): UseVoiceOrchestratorResult {
  const [state, setState] = useState<VoiceConversationState>(
    initialVoiceConversationState,
  );

  const stateRef = useRef(state);
  const processingRef = useRef(false);
  const probeInFlightRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  const submitRef = useRef(submitCandidateTurn);
  const probeRef = useRef(onInactivityProbe);
  const speakRef = useRef(speakInterviewer);
  const stopRef = useRef(stopSpeaking);
  const ttsRef = useRef<TTSProvider | null>(tts ?? null);
  const stubTtsRef = useRef<TTSProvider | null>(null);

  useEffect(() => {
    stateRef.current = state;
    onStateChangeRef.current?.(state);
  }, [state]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    submitRef.current = submitCandidateTurn;
  }, [submitCandidateTurn]);

  useEffect(() => {
    probeRef.current = onInactivityProbe;
  }, [onInactivityProbe]);

  useEffect(() => {
    speakRef.current = speakInterviewer;
  }, [speakInterviewer]);

  useEffect(() => {
    stopRef.current = stopSpeaking;
  }, [stopSpeaking]);

  useEffect(() => {
    if (tts) {
      ttsRef.current = tts;
      return;
    }
    if (!stubTtsRef.current) {
      stubTtsRef.current = createTempStubTTS();
    }
    ttsRef.current = stubTtsRef.current;
  }, [tts]);

  const dispatch = useCallback((event: OrchestratorEvent): boolean => {
    const current = stateRef.current;
    const result = reduceVoiceConversation(current, event);
    if (result.state !== current) {
      stateRef.current = result.state;
      setState(result.state);
    }
    return result.bargeIn;
  }, []);

  const stopTts = useCallback(() => {
    stopRef.current?.();
    ttsRef.current?.stop();
  }, []);

  const speakText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (speakRef.current) {
      await speakRef.current(trimmed);
      return;
    }
    await ttsRef.current?.speak(trimmed);
  }, []);

  const startListening = useCallback(() => {
    if (!enabled || !interviewActive) return;
    dispatch({ type: "START_LISTENING" });
  }, [dispatch, enabled, interviewActive]);

  const stop = useCallback(() => {
    stopTts();
    processingRef.current = false;
    probeInFlightRef.current = false;
    dispatch({ type: "STOP" });
  }, [dispatch, stopTts]);

  const handleStartOfTurn = useCallback(() => {
    if (!enabled || !interviewActive) return;
    const bargeIn = dispatch({ type: "START_OF_TURN" });
    if (bargeIn) {
      stopTts();
    }
  }, [dispatch, enabled, interviewActive, stopTts]);

  const applyInterviewerResponse = useCallback(
    async (response: InterviewerResponse) => {
      const speakable = hasSpeakableInterviewerMessage(
        response.action,
        response.message,
      );

      if (!speakable) {
        dispatch({ type: "INTERVIEWER_WAIT" });
        return;
      }

      dispatch({ type: "INTERVIEWER_MESSAGE" });
      try {
        await speakText(response.message);
      } catch {
        // Fall through to LISTENING even if TTS fails.
      } finally {
        // Only settle if we are still in INTERVIEWER_SPEAKING
        // (barge-in may have already moved us to CANDIDATE_SPEAKING).
        if (stateRef.current === "INTERVIEWER_SPEAKING") {
          dispatch({ type: "TTS_DONE" });
        }
      }
    },
    [dispatch, speakText],
  );

  const handleInterviewerResponse = useCallback(
    async (response: InterviewerResponse) => {
      if (!enabled || !interviewActive) return;
      // Allow typed-chat path to speak when currently LISTENING/IDLE.
      if (
        stateRef.current === "LISTENING" ||
        stateRef.current === "IDLE"
      ) {
        dispatch({ type: "END_OF_TURN" });
      }
      if (stateRef.current !== "PROCESSING_TURN") return;
      await applyInterviewerResponse(response);
    },
    [applyInterviewerResponse, dispatch, enabled, interviewActive],
  );

  const handleEndOfTurn = useCallback(
    async (turn: FinalSpeechTurn) => {
      if (!enabled || !interviewActive) return;
      const transcript = turn.transcript?.trim() ?? "";
      if (!transcript) return;
      if (processingRef.current) return;

      const accepted = reduceVoiceConversation(stateRef.current, {
        type: "END_OF_TURN",
      });
      if (accepted.state !== "PROCESSING_TURN") return;

      processingRef.current = true;
      dispatch({ type: "END_OF_TURN" });

      try {
        const response = await submitRef.current(transcript);
        if (!response) {
          dispatch({ type: "INTERVIEWER_WAIT" });
          return;
        }
        await applyInterviewerResponse(response);
      } catch {
        dispatch({ type: "INTERVIEWER_WAIT" });
      } finally {
        processingRef.current = false;
      }
    },
    [applyInterviewerResponse, dispatch, enabled, interviewActive],
  );

  /**
   * IMPORTANT: EagerEndOfTurn must NOT invoke the interviewer.
   * Draft UI updates belong in VoicePanel / useVoiceInput — not here.
   */
  const handleEagerEndOfTurn = useCallback((_draft: TranscriptUpdate) => {
    void _draft;
    // Intentionally empty — no state change, no submit, no TTS.
  }, []);

  const handleInactivityProbe = useCallback(async () => {
    if (!enabled || !interviewActive) return;
    if (!canProbeInactivity(stateRef.current)) return;
    if (processingRef.current || probeInFlightRef.current) return;

    probeInFlightRef.current = true;
    processingRef.current = true;
    dispatch({ type: "END_OF_TURN" });

    try {
      const probe =
        probeRef.current ??
        ((msg: string) => submitRef.current(msg));
      const response = await probe(INACTIVITY_PROBE_MESSAGE);
      if (!response) {
        dispatch({ type: "INTERVIEWER_WAIT" });
        return;
      }
      await applyInterviewerResponse(response as InterviewerResponse);
    } catch {
      dispatch({ type: "INTERVIEWER_WAIT" });
    } finally {
      processingRef.current = false;
      probeInFlightRef.current = false;
    }
  }, [applyInterviewerResponse, dispatch, enabled, interviewActive]);

  useEffect(() => {
    if (!enabled || !interviewActive) {
      stopTts();
      processingRef.current = false;
      probeInFlightRef.current = false;
      if (stateRef.current !== "IDLE") {
        dispatch({ type: "STOP" });
      }
      return;
    }
    if (stateRef.current === "IDLE") {
      dispatch({ type: "START_LISTENING" });
    }
  }, [dispatch, enabled, interviewActive, stopTts]);

  return useMemo(
    () => ({
      state,
      startListening,
      stop,
      handleStartOfTurn,
      handleEndOfTurn,
      handleEagerEndOfTurn,
      handleInterviewerResponse,
      handleInactivityProbe,
      canProbeInactivity:
        canProbeInactivity(state) && interviewActive && enabled,
      inactivityProbeMessage: INACTIVITY_PROBE_MESSAGE,
    }),
    [
      state,
      startListening,
      stop,
      handleStartOfTurn,
      handleEndOfTurn,
      handleEagerEndOfTurn,
      handleInterviewerResponse,
      handleInactivityProbe,
      interviewActive,
      enabled,
    ],
  );
}
