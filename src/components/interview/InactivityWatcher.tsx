"use client";

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
   * Once per quiet period. Wire later to interviewer PROBE vs WAIT
   * via `suggestInactivityFollowUp` — do not auto-speak here.
   */
  onLongInactivity?: (payload: LongInactivityPayload) => void;
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
}: InactivityWatcherProps) {
  useInterviewInactivity({
    clocks: {
      startedAt,
      endedAt,
      lastCandidateTurnAt,
      lastCodeActivityAt,
      lastExecutionAt,
    },
    enabled,
    onLongInactivity,
  });

  return null;
}
