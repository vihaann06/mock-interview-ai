/**
 * UI-local session helpers — TEMP until Agent 1 `@/lib/interview` session API merges.
 * Mirrors the expected createSession / append* / hint / stage contract for the chat UI.
 */
import { getNextStage } from "@/lib/interview/stages";
import type {
  InterviewerAction,
  InterviewMessage,
  InterviewSession,
  InterviewStage,
} from "@/lib/types/interview";

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function createSession(input: {
  companyId: string;
  questionId: string;
  starterCode: string;
  language?: string;
}): InterviewSession {
  return {
    id: newId("sess"),
    companyId: input.companyId,
    questionId: input.questionId,
    stage: "CLARIFICATION",
    startedAt: 0,
    endedAt: null,
    code: input.starterCode,
    language: input.language ?? "python",
    hintsUsed: 0,
    messages: [],
    events: [],
  };
}

export function startInterview(
  session: InterviewSession,
  openingMessage?: string,
): InterviewSession {
  const startedAt = session.startedAt || Date.now();
  const messages = [...session.messages];
  if (openingMessage) {
    messages.push({
      id: newId("msg"),
      role: "interviewer",
      content: openingMessage,
      timestamp: startedAt,
    });
  }
  return {
    ...session,
    startedAt,
    stage: session.stage === "INTRO" ? "CLARIFICATION" : session.stage,
    messages,
  };
}

export function appendCandidateMessage(
  session: InterviewSession,
  content: string,
): InterviewSession {
  const message: InterviewMessage = {
    id: newId("msg"),
    role: "candidate",
    content,
    timestamp: Date.now(),
  };
  return { ...session, messages: [...session.messages, message] };
}

export function appendInterviewerMessage(
  session: InterviewSession,
  content: string,
  action?: InterviewerAction,
): InterviewSession {
  const message: InterviewMessage = {
    id: newId("msg"),
    role: "interviewer",
    content,
    timestamp: Date.now(),
    action,
  };
  return { ...session, messages: [...session.messages, message] };
}

export function getElapsedMs(session: InterviewSession, now = Date.now()): number {
  if (!session.startedAt) return 0;
  const end = session.endedAt ?? now;
  return Math.max(0, end - session.startedAt);
}

/** Apply hint ladder side-effect from interviewer action. No-op if not a hint action. */
export function applyHintFromAction(
  session: InterviewSession,
  action: InterviewerAction,
): InterviewSession {
  if (action === "GIVE_HINT_1" && session.hintsUsed === 0) {
    return { ...session, hintsUsed: 1 };
  }
  if (action === "GIVE_HINT_2" && session.hintsUsed === 1) {
    return { ...session, hintsUsed: 2 };
  }
  if (action === "GIVE_HINT_3" && session.hintsUsed === 2) {
    return { ...session, hintsUsed: 3 };
  }
  return session;
}

/** Safe forward-only stage move (next stage only). */
export function moveForwardIfSafe(session: InterviewSession): InterviewSession {
  const next = getNextStage(session.stage);
  if (!next) return session;
  return { ...session, stage: next };
}

/**
 * Apply optional suggestedStage only when it is exactly the next stage.
 * Never trust arbitrary jumps from the model.
 */
export function applySuggestedStageIfSafe(
  session: InterviewSession,
  suggestedStage?: InterviewStage | null,
): InterviewSession {
  if (!suggestedStage) return session;
  const next = getNextStage(session.stage);
  if (suggestedStage === next) {
    return { ...session, stage: suggestedStage };
  }
  return session;
}

export function updateSessionCode(
  session: InterviewSession,
  code: string,
): InterviewSession {
  return { ...session, code };
}

export function endInterview(session: InterviewSession): InterviewSession {
  return {
    ...session,
    endedAt: session.endedAt ?? Date.now(),
  };
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
