/**
 * Interviewer engine types — re-export shared interview contracts
 * so API callers can import from @/lib/interviewer.
 */

export type {
  InterviewerAction,
  InterviewerResponse,
  InterviewStage,
  InterviewMessage,
} from "@/lib/types/interview";

export type { Question, HintLadder, CompanyProfile } from "@/lib/types/question";

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
}

export interface ActionPolicyContext {
  hintsUsed: number;
  stage: import("@/lib/types/interview").InterviewStage;
}

export type ParseResult =
  | { ok: true; value: import("@/lib/types/interview").InterviewerResponse }
  | { ok: false; error: string };
