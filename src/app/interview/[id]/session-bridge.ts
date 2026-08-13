/**
 * TEMP — approximates Agent1 session APIs until `@/lib/interview` exports
 * `recordCandidateTurn`, `recordInterviewerTurn`, `touchCodeActivity`, and
 * `recordExecutionRun`. Prefer real exports when present; otherwise fall back
 * to these wrappers. Delete this file after Agent1 merge.
 */

import { createEvent } from "@/lib/interview/event-logger";
import {
  appendInterviewerMessage,
  getElapsedMs,
} from "@/lib/interview";
import type {
  InterviewerAction,
  InterviewMessage,
  InterviewSession,
  LatestExecution,
} from "@/lib/types/interview";

function nowMs(): number {
  return Date.now();
}

function newMessageId(): string {
  return `msg_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function withEvent(
  session: InterviewSession,
  event: ReturnType<typeof createEvent>,
): InterviewSession {
  return {
    ...session,
    events: [...session.events, event],
  };
}

function ensureActive(session: InterviewSession): void {
  if (!session.startedAt) {
    throw new Error("Interview has not started.");
  }
  if (session.endedAt != null) {
    throw new Error("Interview has already ended.");
  }
}

export interface RecordCandidateTurnInput {
  transcript: string;
  codeSnapshot?: string;
  latestExecution?: LatestExecution | null;
}

/** TEMP — one semantic candidate_turn (no candidate_message flood). */
export function recordCandidateTurn(
  session: InterviewSession,
  input: RecordCandidateTurnInput,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const codeSnapshot =
    input.codeSnapshot !== undefined ? input.codeSnapshot : session.code;
  const latestExecution =
    input.latestExecution !== undefined
      ? input.latestExecution
      : session.latestExecution;
  const elapsedMs = getElapsedMs(session, timestamp);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  const message: InterviewMessage = {
    id: newMessageId(),
    role: "candidate",
    content: input.transcript,
    timestamp,
  };

  const next: InterviewSession = {
    ...session,
    code: codeSnapshot,
    latestExecution: latestExecution ?? session.latestExecution,
    lastCandidateTurnAt: timestamp,
    messages: [...session.messages, message],
  };

  return withEvent(
    next,
    createEvent(
      "candidate_turn",
      session.stage,
      input.transcript,
      elapsedMs,
      {
        codeSnapshot,
        elapsedSeconds,
        latestExecution: latestExecution ?? null,
      },
    ),
  );
}

/**
 * TEMP — for WAIT: log interviewer_turn, no chat bubble.
 * Otherwise append interviewer message + interviewer_turn.
 */
export function recordInterviewerTurn(
  session: InterviewSession,
  message: string,
  action: InterviewerAction,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const elapsedMs = getElapsedMs(session, timestamp);
  const trimmed = message.trim();

  if (action === "WAIT") {
    return withEvent(
      session,
      createEvent("interviewer_turn", session.stage, trimmed || undefined, elapsedMs, {
        action,
      }),
    );
  }

  const withMsg = appendInterviewerMessage(session, message, action);
  // appendInterviewerMessage already logged interviewer_message; add semantic turn.
  return withEvent(
    withMsg,
    createEvent(
      "interviewer_turn",
      session.stage,
      message,
      getElapsedMs(withMsg, timestamp),
      { action },
    ),
  );
}

/** TEMP — update code + lastCodeActivityAt only (no code_changed events). */
export function touchCodeActivity(
  session: InterviewSession,
  code: string,
): InterviewSession {
  ensureActive(session);
  if (code === session.code && session.lastCodeActivityAt != null) {
    return {
      ...session,
      lastCodeActivityAt: nowMs(),
    };
  }
  return {
    ...session,
    code,
    lastCodeActivityAt: nowMs(),
  };
}

/** TEMP — store free-form run + emit execution_run. */
export function recordExecutionRun(
  session: InterviewSession,
  latestExecution: LatestExecution,
): InterviewSession {
  ensureActive(session);
  const timestamp = nowMs();
  const next: InterviewSession = {
    ...session,
    latestExecution,
    lastExecutionAt: latestExecution.ranAt || timestamp,
  };
  return withEvent(
    next,
    createEvent(
      "execution_run",
      session.stage,
      undefined,
      getElapsedMs(session, timestamp),
      { execution: latestExecution },
    ),
  );
}
