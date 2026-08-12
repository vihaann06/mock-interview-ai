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
  parseAndValidateInterviewerResponse,
  tryParseInterviewerResponse,
} from "./parse";

export {
  assertActionAllowed,
  isActionAllowed,
  sanitizeAction,
  stripSolutionLeaks,
  enforceInterviewerPolicy,
} from "./policy";

export {
  interviewerResponseSchema,
  interviewerActionSchema,
  interviewStageSchema,
} from "./schema";

export type {
  InterviewerResponse,
  InterviewerAction,
  InterviewStage,
  InterviewMessage,
  InterviewerQuestionContext,
  InterviewerContextInput,
  ActionPolicyContext,
  ParseResult,
  Question,
  HintLadder,
  CompanyProfile,
} from "./types";
