/**
 * Interview stage machine (Day 1 skeleton).
 * The interviewer should always know which stage is active.
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

export interface InterviewSession {
  id: string;
  companyId: string;
  questionId: string;
  stage: InterviewStage;
  startedAt: number | null;
  endedAt: number | null;
  hintsGiven: number;
  code: string;
}
