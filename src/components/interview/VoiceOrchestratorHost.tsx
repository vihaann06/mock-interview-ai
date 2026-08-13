"use client";

import { useCallback, useEffect, useRef } from "react";
import { InactivityWatcher } from "@/components/interview/InactivityWatcher";
import {
  useVoiceOrchestrator,
  type UseVoiceOrchestratorResult,
} from "@/hooks/useVoiceOrchestrator";
import { suggestInactivityFollowUp } from "@/lib/interview/inactivity";
import type { InterviewerResponse } from "@/lib/types/interview";
import type { TTSProvider, VoiceConversationState } from "@/lib/voice/types";

export interface VoiceOrchestratorHostProps {
  startedAt: number;
  endedAt?: number | null;
  lastCandidateTurnAt?: number | null;
  lastCodeActivityAt?: number | null;
  lastExecutionAt?: number | null;
  /** Master enable for inactivity + orchestration. */
  enabled?: boolean;
  interviewActive?: boolean;
  /**
   * Shared with typed chat / VoicePanel EndOfTurn (Agent2).
   * When omitted, barge-in state still works but submits/probes no-op.
   */
  submitCandidateTurn?: (
    transcript: string,
  ) => Promise<InterviewerResponse | null | undefined>;
  tts?: TTSProvider;
  speakInterviewer?: (text: string) => Promise<void>;
  stopSpeaking?: () => void;
  onStateChange?: (state: VoiceConversationState) => void;
  /** Agent2: bind STT StartOfTurn / EndOfTurn to these handlers. */
  onOrchestratorReady?: (api: UseVoiceOrchestratorResult) => void;
}

async function defaultSubmit(
  transcript: string,
): Promise<InterviewerResponse | null> {
  void transcript;
  return null;
}

/**
 * Mount point for voice turn-taking, barge-in, and inactivity probe.
 * Keeps InterviewRoom diffs thin — Agent2 wires STT via onOrchestratorReady.
 */
export function VoiceOrchestratorHost({
  startedAt,
  endedAt = null,
  lastCandidateTurnAt = null,
  lastCodeActivityAt = null,
  lastExecutionAt = null,
  enabled = true,
  interviewActive = true,
  submitCandidateTurn,
  tts,
  speakInterviewer,
  stopSpeaking,
  onStateChange,
  onOrchestratorReady,
}: VoiceOrchestratorHostProps) {
  const orchestrator = useVoiceOrchestrator({
    submitCandidateTurn: submitCandidateTurn ?? defaultSubmit,
    tts,
    speakInterviewer,
    stopSpeaking,
    enabled,
    interviewActive,
    onStateChange,
  });

  const orchestratorRef = useRef(orchestrator);

  useEffect(() => {
    orchestratorRef.current = orchestrator;
  }, [orchestrator]);

  useEffect(() => {
    onOrchestratorReady?.(orchestrator);
  }, [orchestrator, onOrchestratorReady]);

  const handleInactivityProbe = useCallback(() => {
    // isLongInactive already requires stale lastCodeActivityAt.
    // suggestInactivityFollowUp soft-defaults to PROBE; WAIT skips.
    const action = suggestInactivityFollowUp({ reason: "LONG_INACTIVITY" });
    if (action !== "PROBE") return;
    const api = orchestratorRef.current;
    if (!api.canProbeInactivity) return;
    void api.handleInactivityProbe();
  }, []);

  return (
    <InactivityWatcher
      startedAt={startedAt}
      endedAt={endedAt}
      lastCandidateTurnAt={lastCandidateTurnAt}
      lastCodeActivityAt={lastCodeActivityAt}
      lastExecutionAt={lastExecutionAt}
      enabled={enabled && interviewActive}
      onInactivityProbe={handleInactivityProbe}
    />
  );
}
