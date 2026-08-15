/**
 * Interviewer engine types — re-export shared interview contracts
 * so API callers can import from @/lib/interviewer.
 */

export type {
  InterviewerAction,
  InterviewerResponse,
  InterviewStage,
  InterviewMessage,
  LatestExecution,
  ExecutionStatus,
  CandidateClaim,
  CandidateApproach,
  InterviewConcern,
  AskedQuestion,
  HintRecord,
  CandidateReasoningState,
  TopicKey,
  ClaimCorrectness,
  ClaimStatus,
  ConcernSeverity,
  ConcernStatus,
  ConcernType,
  ProbeEscalationLevel,
} from "@/lib/types/interview";

export type {
  Question,
  HintLadder,
  CompanyProfile,
  InterviewerConcernTemplate,
} from "@/lib/types/question";

/** Question fields safe to expose in model-visible prompts (no solutions). */
export interface InterviewerQuestionContext {
  id: string;
  title: string;
  difficulty: string;
  statement: string;
  constraints: string[];
  clarifications: string[];
  expectedApproaches: string[];
  commonMistakes: string[];
  edgeCases: string[];
  /** Progressive ladder; only levels > hintsUsed should be surfaced carefully. */
  hintLadder: Array<{ level: 1 | 2 | 3; text: string }>;
  followups: string[];
  expectedComplexity: { time: string; space: string };
  /** Rubric guidance for the interviewer persona — not full solution dumps. */
  rubricNotes: string[];
  /** Optional adaptive-probing metadata (not a solution dump). */
  interviewerConcerns?: import("@/lib/types/question").InterviewerConcernTemplate[];
}

/** Latest candidate turn snapshot for claim-vs-code comparison. */
export interface InterviewerCandidateTurn {
  transcript: string;
  codeSnapshot: string;
  elapsedSeconds: number;
}

export interface InterviewerContextInput {
  question: InterviewerQuestionContext | {
    id: string;
    title: string;
    difficulty: string;
    statement: string;
    constraints: string[];
    clarifications: string[];
    expectedApproaches: string[];
    commonMistakes: string[];
    edgeCases: string[];
    hintLadder: Array<{ level: 1 | 2 | 3; text: string }>;
    followups: string[];
    expectedComplexity: { time: string; space: string };
    rubricNotes: string[];
    /** Omitted from prompt when present — kept for evaluators only. */
    solutions?: string[];
    starterCode?: string;
    interviewerConcerns?: import("@/lib/types/question").InterviewerConcernTemplate[];
  };
  stage: import("@/lib/types/interview").InterviewStage;
  transcript: Array<{
    role: "candidate" | "interviewer" | "system";
    content: string;
  }>;
  hintsUsed: number;
  currentCode: string;
  companyBehaviors?: string[];
  language?: string;
  /** Most recent free-form run result (stdout/stderr/status). */
  latestExecution?: import("@/lib/types/interview").LatestExecution | null;
  /** Semantic turn (spoken/text + code at send time). */
  candidateTurn?: InterviewerCandidateTurn | null;
  /** First spoken interviewer turn — opening only; omit later-stage script fields. */
  isOpeningTurn?: boolean;
  /** Persistent candidate reasoning memory — consult when present; never re-ask resolved/asked intents. */
  reasoningState?: import("@/lib/types/interview").CandidateReasoningState | null;
}

export interface ActionPolicyContext {
  hintsUsed: number;
  stage: import("@/lib/types/interview").InterviewStage;
  /** Latest candidate utterance — used to detect readiness / hint requests. */
  candidateMessage?: string;
  /** Structured candidate understanding — drives duplicate / escalation policy. */
  reasoningState?: import("@/lib/types/interview").CandidateReasoningState | null;
  /** Recent interviewer turns — secondary duplicate signal. */
  lastInterviewerMessages?: Array<{ content: string; action?: string }>;
}

export type ParseResult =
  | { ok: true; value: import("@/lib/types/interview").InterviewerResponse }
  | { ok: false; error: string };
