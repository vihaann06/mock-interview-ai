"use client";

import { useEffect, useRef } from "react";
import {
  INACTIVITY_POLL_MS,
  LONG_INACTIVITY_MS,
  isLongInactive,
  type InterviewActivityClocks,
  type LongInactivityPayload,
} from "@/lib/interview/inactivity";

export interface UseInterviewInactivityOptions {
  clocks: InterviewActivityClocks;
  /** When false, polling stops and the quiet-period latch resets. */
  enabled?: boolean;
  thresholdMs?: number;
  /** Local poll interval (15–30s). Does not call the LLM. */
  pollMs?: number;
  /**
   * Fired once per quiet period when inactivity exceeds the threshold.
   * Resets when any activity clock advances (coding, turn, execution, etc.).
   * Do not speak or call the interviewer from here unless intentionally wired.
   */
  onLongInactivity?: (payload: LongInactivityPayload) => void;
}

/**
 * Local inactivity monitor for interview voice-readiness.
 * Polls activity clocks every ~20s; never emits semantic/LLM events.
 */
export function useInterviewInactivity({
  clocks,
  enabled = true,
  thresholdMs = LONG_INACTIVITY_MS,
  pollMs = INACTIVITY_POLL_MS,
  onLongInactivity,
}: UseInterviewInactivityOptions): void {
  const firedForQuietPeriodRef = useRef(false);
  const onLongInactivityRef = useRef(onLongInactivity);
  onLongInactivityRef.current = onLongInactivity;

  const clocksRef = useRef(clocks);
  clocksRef.current = clocks;

  const {
    startedAt,
    endedAt = null,
    lastCandidateTurnAt = null,
    lastCodeActivityAt = null,
    lastExecutionAt = null,
  } = clocks;

  useEffect(() => {
    if (!enabled || !startedAt || endedAt != null) {
      firedForQuietPeriodRef.current = false;
      return;
    }

    const tick = () => {
      if (isLongInactive(clocksRef.current, Date.now(), thresholdMs)) {
        if (!firedForQuietPeriodRef.current) {
          firedForQuietPeriodRef.current = true;
          onLongInactivityRef.current?.({ reason: "LONG_INACTIVITY" });
        }
      } else {
        // Activity resumed — allow one fire for the next quiet period.
        firedForQuietPeriodRef.current = false;
      }
    };

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
  }, [
    enabled,
    startedAt,
    endedAt,
    lastCandidateTurnAt,
    lastCodeActivityAt,
    lastExecutionAt,
    thresholdMs,
    pollMs,
  ]);
}
