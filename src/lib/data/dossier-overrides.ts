/**
 * Hand-written patches over generated dossiers.
 *
 * Use this when `npm run questions:prep` produces one bad field for one question:
 * patch that field here instead of hand-authoring the whole entry or rerunning
 * the generator until it happens to agree with you. Overrides survive
 * regeneration; a regenerated dossier does not clobber them.
 *
 * Precedence: dossier → override (this file) → authored inline in questions.ts.
 */
import type { QuestionKnowledgeOverride } from "@/lib/questions/resolve";

export const dossierOverrides: Record<string, QuestionKnowledgeOverride> = {
  // "word-ladder": {
  //   expectedComplexity: { time: "O(N * L^2)", space: "O(N * L)" },
  // },
};

export function getDossierOverride(
  questionId: string,
): QuestionKnowledgeOverride | undefined {
  return dossierOverrides[questionId];
}
