/**
 * Shared contracts for multi-agent MVP pass.
 * Interview domain source of truth — keep imports pointing here.
 */

export type InterviewStage =
  | "INTRO"
  | "CLARIFICATION"
  | "APPROACH_DISCUSSION"
  | "CODING"
  | "TESTING"
  | "COMPLEXITY_ANALYSIS"
  | "WRAP_UP";

export const INTERVIEW_STAGE_ORDER: InterviewStage[] = [
  "INTRO",
  "CLARIFICATION",
  "APPROACH_DISCUSSION",
  "CODING",
  "TESTING",
  "COMPLEXITY_ANALYSIS",
  "WRAP_UP",
];

/** Structured interviewer actions (model must choose one). */
export type InterviewerAction =
  | "ACKNOWLEDGE"
  | "PROBE"
  | "ASK_CLARIFICATION"
  | "CHALLENGE_ASSUMPTION"
  | "REQUEST_EXPLANATION"
  | "REQUEST_COMPLEXITY"
  | "GIVE_HINT_1"
  | "GIVE_HINT_2"
  | "GIVE_HINT_3"
  | "REQUEST_TESTING"
  | "MOVE_FORWARD"
  | "WAIT";

export type HiringVerdict =
  | "Strong Hire"
  | "Hire"
  | "Lean No Hire"
  | "No Hire";

export type MessageRole = "candidate" | "interviewer" | "system";

export interface InterviewMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number; // ms since epoch
  action?: InterviewerAction;
}

export interface InterviewSession {
  id: string;
  companyId: string;
  questionId: string;
  stage: InterviewStage;
  startedAt: number; // ms epoch; 0 if not started
  endedAt: number | null;
  code: string;
  language: string; // "python" for MVP
  hintsUsed: number; // 0–3; next hint must be hintsUsed + 1
  messages: InterviewMessage[];
  events: import("./events").InterviewEvent[];
}

/** Strict LLM interviewer output — validate before applying. */
export interface InterviewerResponse {
  action: InterviewerAction;
  message: string;
  /** Optional requested next stage — server/session must validate; never trust blindly. */
  suggestedStage?: InterviewStage | null;
}
