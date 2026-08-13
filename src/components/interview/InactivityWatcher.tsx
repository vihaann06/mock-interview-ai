"use client";

import { useCallback } from "react";
import { useInterviewInactivity } from "@/hooks/useInterviewInactivity";
import type { LongInactivityPayload } from "@/lib/interview/inactivity";

export interface InactivityWatcherProps {
  startedAt: number;
  endedAt?: number | null;
  lastCandidateTurnAt?: number | null;
  lastCodeActivityAt?: number | null;
  lastExecutionAt?: number | null;
  enabled?: boolean;
  /**
   * Once per quiet period. Prefer `onInactivityProbe` for interviewer
   * check-ins — this remains available for telemetry / UI.
   */
  onLongInactivity?: (payload: LongInactivityPayload) => void;
  /**
   * Once per quiet period when LONG_INACTIVITY fires.
   * Wire to voice orchestrator probe (synthetic candidate turn).
   * Do not spam — the inactivity hook latches until activity resumes.
   * Active coding (fresh lastCodeActivityAt) prevents the fire via isLongInactive.
   */
  onInactivityProbe?: (payload: LongInactivityPayload) => void;
}

/**
 * Tiny client mount point for inactivity monitoring.
 * Keeps InterviewRoom diffs minimal when other agents own that file.
 */
export function InactivityWatcher({
  startedAt,
  endedAt = null,
  lastCandidateTurnAt = null,
  lastCodeActivityAt = null,
  lastExecutionAt = null,
  enabled = true,
  onLongInactivity,
  onInactivityProbe,
}: InactivityWatcherProps) {
  const handleLongInactivity = useCallback(
    (payload: LongInactivityPayload) => {
      onLongInactivity?.(payload);
      onInactivityProbe?.(payload);
    },
    [onLongInactivity, onInactivityProbe],
  );

  useInterviewInactivity({
    clocks: {
      startedAt,
      endedAt,
      lastCandidateTurnAt,
      lastCodeActivityAt,
      lastExecutionAt,
    },
    enabled,
    onLongInactivity: handleLongInactivity,
  });

  return null;
}
