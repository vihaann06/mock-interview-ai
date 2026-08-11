import type { InterviewStage } from "./interview";

/**
 * Event stream is the source of truth for the interview.
 * timestamp is seconds (or ms) from interview start.
 */
export type InterviewEventType =
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
  timestamp: number;
  type: InterviewEventType;
  content?: string;
  stage: InterviewStage;
  metadata?: Record<string, unknown>;
}
