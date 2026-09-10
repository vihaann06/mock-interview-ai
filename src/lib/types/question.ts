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
  /**
   * Canonical `TopicKey` — drives cross-turn dedupe and resolution.
   * Off-list values degrade to "other", which collides unrelated concerns.
   */
  topic: string;
  /** Human-readable phrase for the concern, used in the interviewer's summary. */
  label?: string;
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

/**
 * Tier 1 — the only fields a new question must author by hand.
 * Candidate-facing content and identity: it *is* the input, so it cannot be derived.
 */
export type QuestionSeed = Pick<
  Question,
  | "id"
  | "title"
  | "company"
  | "difficulty"
  | "expectedTimeMinutes"
  | "statement"
  | "constraints"
  | "starterCode"
>;

/**
 * Tier 2 — interviewer knowledge about a problem. Derived once by
 * `npm run questions:prep` into a committed dossier, then treated as authored data.
 */
export type QuestionKnowledge = Omit<Question, keyof QuestionSeed>;

/**
 * What actually lives in the question bank: a seed, plus any knowledge field you
 * choose to hand-author. Hand-authored fields always win over a generated dossier.
 */
export type AuthoredQuestion = QuestionSeed & Partial<QuestionKnowledge>;

export interface CompanyProfile {
  id: string;
  name: string;
  styleLabel: string;
  description: string;
  behaviors: string[];
}
