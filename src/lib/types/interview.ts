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

/** Free-form run result (candidate-written tests only — no harness). */
export type ExecutionStatus =
  | "success"
  | "error"
  | "timeout"
  | "not_run";

export interface LatestExecution {
  status: ExecutionStatus;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  exitCode?: number | null;
  provider?: string;
  ranAt: number; // ms epoch
}

/**
 * Semantic candidate turn — primary interaction event for text or future STT.
 * One turn per send / end-of-speech; not per keystroke.
 */
export interface CandidateTurnPayload {
  transcript: string;
  codeSnapshot: string;
  stage: InterviewStage;
  /** Seconds since interview start. */
  elapsedSeconds: number;
  latestExecution?: LatestExecution | null;
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
  /** Latest free-form execution result (not question harness). */
  latestExecution: LatestExecution | null;
  /**
   * Transient activity clocks (ms epoch). Not semantic events.
   * Used for inactivity / voice readiness — update without flooding `events`.
   */
  lastCandidateTurnAt: number | null;
  lastCodeActivityAt: number | null;
  lastExecutionAt: number | null;
  /**
   * Structured memory of candidate reasoning / asked questions / open concerns.
   * Server recomputes each turn; client round-trips as warm start only.
   */
  reasoningState?: CandidateReasoningState | null;
}

/** Strict LLM interviewer output — validate before applying. */
export interface InterviewerResponse {
  action: InterviewerAction;
  /**
   * Spoken/text reply. Empty/whitespace allowed for WAIT
   * (UI must not render a bubble for WAIT).
   */
  message: string;
  /** Optional requested next stage — server/session must validate; never trust blindly. */
  suggestedStage?: InterviewStage | null;
}

// --- Candidate reasoning memory (live interview, not evaluator) ---

export type ClaimCorrectness = "uncertain" | "likely-correct" | "likely-incorrect";
export type ClaimStatus = "open" | "resolved" | "superseded";
export type ConcernSeverity = "minor" | "important" | "critical";
export type ConcernStatus = "unresolved" | "resolved" | "retired";
export type ProbeEscalationLevel = 0 | 1 | 2 | 3;

export type ConcernType =
  | "ALGORITHM_CORRECTNESS"
  | "COMPLEXITY"
  | "INVARIANT"
  | "DATA_STRUCTURE"
  | "EDGE_CASE"
  | "CODE_SPEECH_MISMATCH"
  | "OTHER";

export type TopicKey =
  | "complexity"
  | "invariant"
  | "update_logic"
  | "edge_cases"
  | "data_structure"
  | "algorithm_justification"
  | "ordering"
  | "testing"
  | "other";

export interface CandidateClaim {
  id: string;
  statement: string;
  /** Normalized topic for dedupe / resolution. */
  topic: TopicKey;
  correctness: ClaimCorrectness;
  status: ClaimStatus;
  firstObservedAt: number;
  lastObservedAt: number;
}

export interface CandidateApproach {
  id: string;
  summary: string;
  /** e.g. "sort-by-end", "hashmap", "two-pointer" — free-form tags. */
  tags: string[];
  active: boolean;
  firstObservedAt: number;
  lastObservedAt: number;
}

export interface InterviewConcern {
  id: string;
  type: ConcernType;
  topic: TopicKey;
  summary: string;
  relatedClaimId?: string;
  /** Optional link to Question.interviewerConcerns[].id */
  templateId?: string;
  severity: ConcernSeverity;
  status: ConcernStatus;
  /** How many times this concern has been probed. */
  attemptsToProbe: number;
  /** 0 = none, 1 = open probe, 2 = targeted, 3 = walkthrough/counterexample. */
  escalationLevel: ProbeEscalationLevel;
  firstObservedAt: number;
  lastProbedAt?: number;
}

export interface AskedQuestion {
  id: string;
  /** Normalized intent key for semantic dedupe. */
  intentKey: string;
  /** Original interviewer wording. */
  text: string;
  topic: TopicKey;
  askedAt: number;
  resolved: boolean;
}

export interface HintRecord {
  level: 1 | 2 | 3;
  text: string;
  givenAt: number;
}

/**
 * Persistent structured understanding of the candidate across turns.
 * Every interviewer turn should consult this — not only raw transcript.
 */
export interface CandidateReasoningState {
  claims: CandidateClaim[];
  approaches: CandidateApproach[];
  resolvedTopics: TopicKey[];
  unresolvedConcerns: InterviewConcern[];
  questionsAlreadyAsked: AskedQuestion[];
  hintsGiven: HintRecord[];
  updatedAt: number;
}
