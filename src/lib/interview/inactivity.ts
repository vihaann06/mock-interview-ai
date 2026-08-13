/**
 * Local inactivity / voice-readiness clocks.
 * Polls in the client only — never talks to the LLM or interviewer by itself.
 */

export const LONG_INACTIVITY_MS = 5 * 60 * 1000;
/** Midpoint of the 15–30s local poll window. */
export const INACTIVITY_POLL_MS = 20_000;

export type LongInactivityReason = "LONG_INACTIVITY";

export interface LongInactivityPayload {
  reason: LongInactivityReason;
}

/**
 * Later hookup for interviewer policy after a quiet period.
 * This module never invokes the interviewer — callers decide.
 */
export type InactivityFollowUpAction = "PROBE" | "WAIT";

/** Activity clocks (ms epoch). Null/undefined clocks are ignored. */
export interface InterviewActivityClocks {
  /** Baseline activity when the interview starts. */
  startedAt: number;
  lastCandidateTurnAt?: number | null;
  lastCodeActivityAt?: number | null;
  lastExecutionAt?: number | null;
  /** When set, monitoring is inactive. */
  endedAt?: number | null;
}

/** Latest of startedAt + activity clocks; null if interview has not started. */
export function getLastActivityAt(
  clocks: InterviewActivityClocks,
): number | null {
  if (!clocks.startedAt) return null;

  let last = clocks.startedAt;
  if (clocks.lastCandidateTurnAt != null) {
    last = Math.max(last, clocks.lastCandidateTurnAt);
  }
  if (clocks.lastCodeActivityAt != null) {
    last = Math.max(last, clocks.lastCodeActivityAt);
  }
  if (clocks.lastExecutionAt != null) {
    last = Math.max(last, clocks.lastExecutionAt);
  }
  return last;
}

export function isLongInactive(
  clocks: InterviewActivityClocks,
  nowMs: number = Date.now(),
  thresholdMs: number = LONG_INACTIVITY_MS,
): boolean {
  if (clocks.endedAt != null) return false;
  const last = getLastActivityAt(clocks);
  if (last == null) return false;
  return nowMs - last > thresholdMs;
}

/**
 * Suggested interviewer action after LONG_INACTIVITY.
 * Soft default for a later wire-up — not called automatically.
 *
 * Call sites can override (e.g. WAIT while code is mid-edit elsewhere,
 * PROBE when the candidate appears stuck).
 */
export function suggestInactivityFollowUp(
  payload: LongInactivityPayload,
): InactivityFollowUpAction {
  void payload;
  return "PROBE";
}

/**
 * Merge session clocks with local mirrors (e.g. live typing before
 * session.lastCodeActivityAt is wired). Prefers the freshest timestamp.
 */
export function mergeActivityClocks(
  base: InterviewActivityClocks,
  local?: Partial<
    Pick<
      InterviewActivityClocks,
      "lastCandidateTurnAt" | "lastCodeActivityAt" | "lastExecutionAt"
    >
  >,
): InterviewActivityClocks {
  if (!local) return base;
  return {
    ...base,
    lastCandidateTurnAt: newer(
      base.lastCandidateTurnAt,
      local.lastCandidateTurnAt,
    ),
    lastCodeActivityAt: newer(
      base.lastCodeActivityAt,
      local.lastCodeActivityAt,
    ),
    lastExecutionAt: newer(base.lastExecutionAt, local.lastExecutionAt),
  };
}

function newer(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Read optional activity clocks from a session-like object without
 * requiring InterviewSession to declare the fields yet.
 */
export function readSessionActivityClocks(session: {
  startedAt: number;
  endedAt?: number | null;
  lastCandidateTurnAt?: number | null;
  lastCodeActivityAt?: number | null;
  lastExecutionAt?: number | null;
}): InterviewActivityClocks {
  return {
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    lastCandidateTurnAt: session.lastCandidateTurnAt ?? null,
    lastCodeActivityAt: session.lastCodeActivityAt ?? null,
    lastExecutionAt: session.lastExecutionAt ?? null,
  };
}
