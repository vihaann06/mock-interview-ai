/**
 * Interview session state machine — immutable pure helpers.
 * All mutations return a new InterviewSession; callers own persistence.
 */

import type { InterviewEvent } from "@/lib/types/events";
import type {
  InterviewerAction,
  InterviewMessage,
  InterviewSession,
  InterviewStage,
} from "@/lib/types/interview";
import { appendEvent, createEvent } from "./event-logger";
import {
  assertTransition,
  canTransition,
  getNextStage,
  isTerminal,
} from "./stages";

const SUBSTANTIAL_CODE_DELTA = 24;
const MAX_HINTS = 3;

function newSessionId(): string {
  return `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function newMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function nowMs(): number {
  return Date.now();
}

/** Elapsed ms since interview start; 0 if not started. */
export function getElapsedMs(
  session: InterviewSession,
  at: number = nowMs(),
): number {
  if (!session.startedAt) return 0;
  const end = session.endedAt ?? at;
  return Math.max(0, end - session.startedAt);
}

function elapsedForEvent(session: InterviewSession, at: number = nowMs()): number {
  return getElapsedMs(session, at);
}

function ensureActive(session: InterviewSession): void {
  if (!session.startedAt) {
    throw new Error("Interview has not started.");
  }
  if (session.endedAt != null) {
    throw new Error("Interview has already ended.");
  }
}

function withEvent(
  session: InterviewSession,
  event: InterviewEvent,
): InterviewSession {
  return {
    ...session,
    events: appendEvent(session.events, event),
  };
}

export interface CreateSessionInput {
  companyId: string;
  questionId: string;
  starterCode: string;
  language?: string;
}

/**
 * Creates an unstarted session at INTRO.
 * Call startInterview() to begin the clock and emit interview_started.
 */
export function createSession(input: CreateSessionInput): InterviewSession {
  return {
    id: newSessionId(),
    companyId: input.companyId,
    questionId: input.questionId,
    stage: "INTRO",
    startedAt: 0,
    endedAt: null,
    code: input.starterCode,
    language: input.language ?? "python",
    hintsUsed: 0,
    messages: [],
    events: [],
  };
}

/**
 * Starts the interview clock, logs interview_started.
 * Keeps INTRO (or CLARIFICATION if already advanced) as the active stage.
 */
export function startInterview(session: InterviewSession): InterviewSession {
  if (session.startedAt) {
    throw new Error("Interview already started.");
  }
  if (session.endedAt != null) {
    throw new Error("Cannot start an ended interview.");
  }

  const startedAt = nowMs();
  const stage: InterviewStage =
    session.stage === "CLARIFICATION" ? "CLARIFICATION" : "INTRO";

  const base: InterviewSession = {
    ...session,
    stage,
    startedAt,
    endedAt: null,
  };

  return withEvent(
    base,
    createEvent("interview_started", stage, undefined, 0, {
      language: base.language,
    }),
  );
}

export function appendCandidateMessage(
  session: InterviewSession,
  content: string,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const message: InterviewMessage = {
    id: newMessageId(),
    role: "candidate",
    content,
    timestamp,
  };

  const next: InterviewSession = {
    ...session,
    messages: [...session.messages, message],
  };

  return withEvent(
    next,
    createEvent(
      "candidate_message",
      session.stage,
      content,
      elapsedForEvent(session, timestamp),
    ),
  );
}

export function appendInterviewerMessage(
  session: InterviewSession,
  content: string,
  action?: InterviewerAction,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const message: InterviewMessage = {
    id: newMessageId(),
    role: "interviewer",
    content,
    timestamp,
    action,
  };

  const next: InterviewSession = {
    ...session,
    messages: [...session.messages, message],
  };

  return withEvent(
    next,
    createEvent(
      "interviewer_message",
      session.stage,
      content,
      elapsedForEvent(session, timestamp),
      action ? { action } : undefined,
    ),
  );
}

function isSubstantialCodeChange(prev: string, next: string): boolean {
  if (prev === next) return false;
  const delta = Math.abs(next.length - prev.length);
  if (delta >= SUBSTANTIAL_CODE_DELTA) return true;
  // Also treat large in-place edits as substantial (Levenshtein is heavy; use simple overlap).
  const minLen = Math.min(prev.length, next.length);
  let same = 0;
  for (let i = 0; i < minLen; i++) {
    if (prev[i] === next[i]) same++;
  }
  const changed = Math.max(prev.length, next.length) - same;
  return changed >= SUBSTANTIAL_CODE_DELTA;
}

/**
 * Updates live code. Emits `code_changed` always when different,
 * and `code_snapshot` when the change is substantial.
 */
export function updateCode(
  session: InterviewSession,
  code: string,
): InterviewSession {
  ensureActive(session);
  if (code === session.code) return session;

  const timestamp = nowMs();
  const elapsed = elapsedForEvent(session, timestamp);
  let next: InterviewSession = {
    ...session,
    code,
  };

  next = withEvent(
    next,
    createEvent("code_changed", session.stage, undefined, elapsed, {
      language: session.language,
    }),
  );

  if (isSubstantialCodeChange(session.code, code)) {
    next = withEvent(
      next,
      createEvent("code_snapshot", session.stage, code, elapsed, {
        language: session.language,
      }),
    );
  }

  return next;
}

/** Explicit code snapshot (e.g. on blur / stable pause). */
export function snapshotCode(session: InterviewSession): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  return withEvent(
    {
      ...session,
    },
    createEvent(
      "code_snapshot",
      session.stage,
      session.code,
      elapsedForEvent(session, timestamp),
      { language: session.language },
    ),
  );
}

/** Candidate requests a hint — does not advance hintsUsed until applyHintGiven. */
export function requestHint(session: InterviewSession): InterviewSession {
  ensureActive(session);
  if (session.hintsUsed >= MAX_HINTS) {
    throw new Error("All hints have already been used.");
  }
  const nextLevel = (session.hintsUsed + 1) as 1 | 2 | 3;
  const timestamp = nowMs();
  return withEvent(
    session,
    createEvent(
      "hint_requested",
      session.stage,
      undefined,
      elapsedForEvent(session, timestamp),
      { hintLevel: nextLevel },
    ),
  );
}

/**
 * Apply a given hint at `level` (1–3).
 * Ladder: only allowed when hintsUsed === level - 1 (cannot skip).
 */
export function applyHintGiven(
  session: InterviewSession,
  level: 1 | 2 | 3,
  content?: string,
): InterviewSession {
  ensureActive(session);
  if (session.hintsUsed !== level - 1) {
    throw new Error(
      `Hint ladder violation: cannot give hint ${level} when hintsUsed=${session.hintsUsed}.`,
    );
  }

  const timestamp = nowMs();
  const next: InterviewSession = {
    ...session,
    hintsUsed: level,
  };

  return withEvent(
    next,
    createEvent(
      "hint_given",
      session.stage,
      content,
      elapsedForEvent(session, timestamp),
      { hintLevel: level, action: `GIVE_HINT_${level}` as InterviewerAction },
    ),
  );
}

/** Map GIVE_HINT_n interviewer actions onto applyHintGiven. */
export function applyHintFromAction(
  session: InterviewSession,
  action: InterviewerAction,
  content?: string,
): InterviewSession {
  switch (action) {
    case "GIVE_HINT_1":
      return applyHintGiven(session, 1, content);
    case "GIVE_HINT_2":
      return applyHintGiven(session, 2, content);
    case "GIVE_HINT_3":
      return applyHintGiven(session, 3, content);
    default:
      throw new Error(`Action ${action} is not a hint action.`);
  }
}

export function isHintActionAllowed(
  action: InterviewerAction,
  hintsUsed: number,
): boolean {
  if (action === "GIVE_HINT_1") return hintsUsed === 0;
  if (action === "GIVE_HINT_2") return hintsUsed === 1;
  if (action === "GIVE_HINT_3") return hintsUsed === 2;
  return true;
}

/**
 * Transition to `toStage` only if it is the immediate next stage.
 */
export function transitionStage(
  session: InterviewSession,
  toStage: InterviewStage,
): InterviewSession {
  ensureActive(session);
  assertTransition(session.stage, toStage);

  const fromStage = session.stage;
  const timestamp = nowMs();
  let next: InterviewSession = {
    ...session,
    stage: toStage,
  };

  next = withEvent(
    next,
    createEvent(
      "interview_stage_changed",
      toStage,
      undefined,
      elapsedForEvent(session, timestamp),
      { fromStage, toStage },
    ),
  );

  if (toStage === "CODING" && fromStage !== "CODING") {
    next = withEvent(
      next,
      createEvent(
        "coding_started",
        toStage,
        undefined,
        elapsedForEvent(session, timestamp),
        { language: session.language },
      ),
    );
  }

  return next;
}

/** MOVE_FORWARD — advance exactly one stage if possible. */
export function moveForward(session: InterviewSession): InterviewSession {
  ensureActive(session);
  if (isTerminal(session.stage)) {
    throw new Error("Already at terminal stage WRAP_UP.");
  }
  const next = getNextStage(session.stage);
  if (!next) {
    throw new Error(`Cannot move forward from ${session.stage}.`);
  }
  return transitionStage(session, next);
}

/**
 * Apply MOVE_FORWARD or a validated suggestedStage.
 * Never jumps arbitrarily — only next stage or canTransition-validated.
 */
export function applyStageAction(
  session: InterviewSession,
  action: InterviewerAction,
  suggestedStage?: InterviewStage | null,
): InterviewSession {
  if (action === "MOVE_FORWARD") {
    return moveForward(session);
  }
  if (suggestedStage && canTransition(session.stage, suggestedStage)) {
    return transitionStage(session, suggestedStage);
  }
  return session;
}

export function endInterview(session: InterviewSession): InterviewSession {
  if (!session.startedAt) {
    throw new Error("Cannot end an interview that has not started.");
  }
  if (session.endedAt != null) {
    return session;
  }

  const endedAt = nowMs();
  const next: InterviewSession = {
    ...session,
    endedAt,
  };

  return withEvent(
    next,
    createEvent(
      "interview_ended",
      session.stage,
      undefined,
      getElapsedMs(next, endedAt),
    ),
  );
}
