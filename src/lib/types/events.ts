import type {
  InterviewStage,
  InterviewerAction,
  LatestExecution,
} from "./interview";

/**
 * Event stream is the source of truth for the interview.
 * `timestamp` is milliseconds since interview start (elapsed).
 *
 * Prefer semantic events (candidate_turn / interviewer_turn / execution_run).
 * Do NOT log every Monaco keystroke.
 */
export type InterviewEventType =
  | "interview_started"
  | "candidate_turn"
  | "interviewer_turn"
  /** @deprecated Prefer candidate_turn — kept for reading older sessions. */
  | "candidate_message"
  /** @deprecated Prefer interviewer_turn */
  | "interviewer_message"
  | "candidate_explanation"
  | "hint_requested"
  | "hint_given"
  | "coding_started"
  /** @deprecated Do not emit on every edit — use activity timestamps. */
  | "code_changed"
  | "code_snapshot"
  | "execution_run"
  | "test_run"
  | "test_passed"
  | "test_failed"
  | "runtime_error"
  | "interview_stage_changed"
  | "interview_ended"
  | "candidate_silent"
  | "long_inactivity";

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
    codeSnapshot?: string;
    elapsedSeconds?: number;
    latestExecution?: LatestExecution | null;
    execution?: LatestExecution | null;
    reason?: string;
    [key: string]: unknown;
  };
}
