/**
 * Interview session state machine — immutable pure helpers.
 * All mutations return a new InterviewSession; callers own persistence.
 */

import type { InterviewEvent } from "@/lib/types/events";
import type {
  CandidateTurnPayload,
  InterviewerAction,
  InterviewMessage,
  InterviewSession,
  InterviewStage,
  LatestExecution,
} from "@/lib/types/interview";
import { appendEvent, createEvent } from "./event-logger";
import {
  assertTransition,
  canTransition,
  getNextStage,
  isTerminal,
} from "./stages";

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

export type RecordCandidateTurnInput = {
  transcript: string;
  codeSnapshot?: string;
  latestExecution?: LatestExecution | null;
};

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
    latestExecution: null,
    lastCandidateTurnAt: null,
    lastCodeActivityAt: null,
    lastExecutionAt: null,
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

/**
 * Primary candidate interaction — one turn per send / end-of-speech.
 * Emits a single `candidate_turn` (not `candidate_message`).
 */
export function recordCandidateTurn(
  session: InterviewSession,
  input: RecordCandidateTurnInput,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const elapsedMs = elapsedForEvent(session, timestamp);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const codeSnapshot = input.codeSnapshot ?? session.code;

  const message: InterviewMessage = {
    id: newMessageId(),
    role: "candidate",
    content: input.transcript,
    timestamp,
  };

  let next: InterviewSession = {
    ...session,
    code: input.codeSnapshot !== undefined ? input.codeSnapshot : session.code,
    lastCandidateTurnAt: timestamp,
    messages: [...session.messages, message],
  };

  if (input.latestExecution !== undefined) {
    next = {
      ...next,
      latestExecution: input.latestExecution,
    };
  }

  const payloadMeta: CandidateTurnPayload = {
    transcript: input.transcript,
    codeSnapshot,
    stage: session.stage,
    elapsedSeconds,
    latestExecution:
      input.latestExecution !== undefined
        ? input.latestExecution
        : session.latestExecution,
  };

  return withEvent(
    next,
    createEvent(
      "candidate_turn",
      session.stage,
      input.transcript,
      elapsedMs,
      {
        codeSnapshot: payloadMeta.codeSnapshot,
        elapsedSeconds: payloadMeta.elapsedSeconds,
        latestExecution: payloadMeta.latestExecution ?? null,
        stage: payloadMeta.stage,
      },
    ),
  );
}

/**
 * @deprecated Prefer recordCandidateTurn — thin wrapper for compatibility.
 */
export function appendCandidateMessage(
  session: InterviewSession,
  content: string,
): InterviewSession {
  return recordCandidateTurn(session, { transcript: content });
}

/**
 * Interviewer turn. WAIT does not append a chat bubble; other actions do.
 * Emits `interviewer_turn` (not `interviewer_message`).
 */
export function recordInterviewerTurn(
  session: InterviewSession,
  message: string,
  action: InterviewerAction,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const elapsedMs = elapsedForEvent(session, timestamp);

  if (action === "WAIT") {
    return withEvent(
      session,
      createEvent("interviewer_turn", session.stage, "", elapsedMs, {
        action: "WAIT",
      }),
    );
  }

  const chatMessage: InterviewMessage = {
    id: newMessageId(),
    role: "interviewer",
    content: message,
    timestamp,
    action,
  };

  const next: InterviewSession = {
    ...session,
    messages: [...session.messages, chatMessage],
  };

  return withEvent(
    next,
    createEvent("interviewer_turn", session.stage, message, elapsedMs, {
      action,
    }),
  );
}

/**
 * @deprecated Prefer recordInterviewerTurn.
 * When `action` is provided, delegates to recordInterviewerTurn (WAIT adds no chat bubble).
 */
export function appendInterviewerMessage(
  session: InterviewSession,
  content: string,
  action?: InterviewerAction,
): InterviewSession {
  if (action) {
    return recordInterviewerTurn(session, content, action);
  }
  ensureActive(session);
  const timestamp = nowMs();
  const chatMessage: InterviewMessage = {
    id: newMessageId(),
    role: "interviewer",
    content,
    timestamp,
  };
  const next: InterviewSession = {
    ...session,
    messages: [...session.messages, chatMessage],
  };
  return withEvent(
    next,
    createEvent(
      "interviewer_turn",
      session.stage,
      content,
      elapsedForEvent(session, timestamp),
    ),
  );
}

/**
 * Live editor activity — updates code + lastCodeActivityAt only.
 * Does NOT emit code_changed (no keystroke flood).
 */
export function touchCodeActivity(
  session: InterviewSession,
  code: string,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  if (code === session.code && session.lastCodeActivityAt != null) {
    return {
      ...session,
      lastCodeActivityAt: timestamp,
    };
  }
  return {
    ...session,
    code,
    lastCodeActivityAt: timestamp,
  };
}

/**
 * Updates live code without flooding the event stream.
 * Redirects to touchCodeActivity (no code_changed).
 * Use snapshotCode for an explicit code_snapshot event.
 */
export function updateCode(
  session: InterviewSession,
  code: string,
): InterviewSession {
  return touchCodeActivity(session, code);
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

/**
 * Records a free-form execution run result.
 * Sets latestExecution / lastExecutionAt and emits execution_run.
 */
export function recordExecutionRun(
  session: InterviewSession,
  result: LatestExecution,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const next: InterviewSession = {
    ...session,
    latestExecution: result,
    lastExecutionAt: result.ranAt ?? timestamp,
  };

  return withEvent(
    next,
    createEvent(
      "execution_run",
      session.stage,
      undefined,
      elapsedForEvent(session, timestamp),
      { execution: result },
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
 *
 * Early-stage hold: stay in welcome/clarify until an explicit, gated advance.
 * INTRO may only go to CLARIFICATION (MOVE_FORWARD or suggestedStage CLARIFICATION).
 * CLARIFICATION advances only on MOVE_FORWARD + suggestedStage APPROACH_DISCUSSION.
 */
export function applyStageAction(
  session: InterviewSession,
  action: InterviewerAction,
  suggestedStage?: InterviewStage | null,
): InterviewSession {
  if (session.stage === "INTRO") {
    if (action === "MOVE_FORWARD") {
      return moveForward(session);
    }
    if (suggestedStage === "CLARIFICATION" && canTransition(session.stage, suggestedStage)) {
      return transitionStage(session, "CLARIFICATION");
    }
    return session;
  }

  if (session.stage === "CLARIFICATION") {
    if (action === "MOVE_FORWARD" && suggestedStage === "APPROACH_DISCUSSION") {
      return moveForward(session);
    }
    return session;
  }

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
