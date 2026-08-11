import type { HiringVerdict } from "./interview";

export interface CategoryScore {
  category: EvaluationCategory;
  score: number; // 1–5
  evidence: string;
}

export type EvaluationCategory =
  | "Problem Understanding"
  | "Clarifying Questions"
  | "Algorithmic Reasoning"
  | "Communication"
  | "Implementation"
  | "Testing & Debugging"
  | "Complexity Analysis"
  | "Independence";

export interface EvaluationReport {
  interviewId: string;
  overallScore: number; // 0–100
  verdict: HiringVerdict;
  categories: CategoryScore[];
  strengths: string[];
  improvements: string[];
  readinessScore?: number;
}
