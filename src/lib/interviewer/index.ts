/**
 * Interviewer engine — provider-agnostic prompts + validation.
 * API layer calls the LLM; this package does not depend on any LLM SDK.
 */

export {
  buildSystemPrompt,
  buildInterviewerContext,
  buildInterviewerUserPayload,
} from "./prompt";

export {
  truncateForPrompt,
  summarizeLatestExecution,
} from "./execution-context";

export {
  parseAndValidateInterviewerResponse,
  tryParseInterviewerResponse,
} from "./parse";

export {
  assertActionAllowed,
  isActionAllowed,
  sanitizeAction,
  stripSolutionLeaks,
  normalizeWaitMessage,
  enforceInterviewerPolicy,
} from "./policy";

export {
  interviewerResponseSchema,
  interviewerActionSchema,
  interviewStageSchema,
} from "./schema";

export {
  emptyReasoningState,
  updateCandidateReasoningState,
  intentKeyForQuestion,
  isSemanticallyDuplicateQuestion,
  primaryUnresolvedConcern,
  nextEscalationProbe,
} from "./reasoning-state";

export type { ReasoningUpdateInput } from "./reasoning-state";

export type {
  InterviewerResponse,
  InterviewerAction,
  InterviewStage,
  InterviewMessage,
  LatestExecution,
  ExecutionStatus,
  InterviewerQuestionContext,
  InterviewerCandidateTurn,
  InterviewerContextInput,
  ActionPolicyContext,
  ParseResult,
  Question,
  HintLadder,
  CompanyProfile,
  InterviewerConcernTemplate,
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
} from "./types";
