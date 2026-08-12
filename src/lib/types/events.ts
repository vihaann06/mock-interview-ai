import type { InterviewStage, InterviewerAction } from "./interview";

/**
 * Event stream is the source of truth for the interview.
 * `timestamp` is milliseconds since interview start (elapsed).
 */
export type InterviewEventType =
  | "interview_started"
  | "candidate_message"
  | "interviewer_message"
  | "candidate_explanation"
  | "hint_requested"
  | "hint_given"
  | "coding_started"
  | "code_changed"
  | "code_snapshot"
  | "test_run"
  | "test_passed"
  | "test_failed"
  | "runtime_error"
  | "interview_stage_changed"
  | "interview_ended"
  | "candidate_silent";

export interface InterviewEvent {
  id: string;
  timestamp: number;
  type: InterviewEventType;
  content?: string;
  stage: InterviewStage;
  metadata?: {
    action?: InterviewerAction;
    hintLevel?: 1 | 2 | 3;
    fromStage?: InterviewStage;
    toStage?: InterviewStage;
    language?: string;
    [key: string]: unknown;
  };
}
