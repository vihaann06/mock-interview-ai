export type Difficulty = "Easy" | "Medium" | "Hard";

export interface HintLadder {
  level: 1 | 2 | 3;
  text: string;
}

/**
 * Data-driven interviewer concern for a question.
 * Generic across problems — used for adaptive probing, not special-cased in code.
 */
export interface InterviewerConcernTemplate {
  /** Stable id, e.g. "sorting-invariant". */
  id: string;
  topic: string;
  /** Patterns / approaches that often indicate this concern. */
  incorrectPatterns?: string[];
  /** Escalating probe suggestions (open → targeted → walkthrough). */
  probeExamples?: string[];
  /** Concrete inputs that stress the misconception. */
  counterexamples?: string[];
  /** Important invariant the candidate should maintain. */
  invariant?: string;
}

/**
 * Question bank schema. Enrich deeply for a few MVP questions;
 * other entries may remain lighter stubs.
 */
export interface Question {
  id: string;
  title: string;
  company: string;
  difficulty: Difficulty;
  expectedTimeMinutes: number;
  statement: string;
  constraints: string[];
  /** Candidate-facing clarifying Q&A the interviewer may use. */
  clarifications: string[];
  /** High-level expected approaches (not full solution dumps in prompts). */
  expectedApproaches: string[];
  /** Kept for backwards compat / evaluator; interviewer must not leak these. */
  solutions: string[];
  commonMistakes: string[];
  edgeCases: string[];
  hintLadder: HintLadder[];
  followups: string[];
  rubricNotes: string[];
  starterCode: string;
  expectedComplexity: {
    time: string;
    space: string;
  };
  /** Optional adaptive-probing metadata (generic; not Merge-Intervals-specific logic). */
  interviewerConcerns?: InterviewerConcernTemplate[];
}

export interface CompanyProfile {
  id: string;
  name: string;
  styleLabel: string;
  description: string;
  behaviors: string[];
}
