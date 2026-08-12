export type Difficulty = "Easy" | "Medium" | "Hard";

export interface HintLadder {
  level: 1 | 2 | 3;
  text: string;
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
}

export interface CompanyProfile {
  id: string;
  name: string;
  styleLabel: string;
  description: string;
  behaviors: string[];
}
