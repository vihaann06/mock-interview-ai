/**
 * Question dossier — the derived half of the question bank.
 *
 * A dossier holds the *interviewer knowledge* for one problem (concerns, hint
 * ladder, rubric, complexity). It is generated once by `npm run questions:prep`,
 * validated by the schema below, and committed as JSON. At runtime it is read
 * like authored data — never regenerated per turn.
 *
 * Why generate once instead of letting the model improvise each turn:
 * `reasoning-state.ts` tracks concerns across turns by `templateId` and escalates
 * on re-match. Stable ids are load-bearing; per-turn generation would silently
 * reset escalation to level 1 forever.
 */
import { z } from "zod";
import { TOPIC_KEYS } from "@/lib/types/interview";
import type { QuestionKnowledge } from "@/lib/types/question";

/** Bump when the generator prompt changes meaningfully, so stale dossiers are visible. */
export const DOSSIER_PROMPT_VERSION = 2;

/**
 * Deterministic concern id from its readable label, so regenerating a dossier
 * does not renumber concerns and orphan in-flight escalation state.
 */
export function concernIdFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "concern";
}

const nonEmpty = z.string().trim().min(1);

/**
 * Exactly three probes, ordered open → targeted → walkthrough.
 * `nextEscalationProbe` indexes these by escalation level, so a short list would
 * make levels 2 and 3 collapse onto the same question.
 */
const concernSchema = z.object({
  id: nonEmpty,
  /**
   * Canonical topic only. A free-form phrase degrades to "other" in
   * `topicFromTemplateTopic`, which puts unrelated concerns in one namespace and
   * lets resolving either one suppress the other.
   */
  topic: z.enum(TOPIC_KEYS).exclude(["other"]),
  /** Readable phrase — what the interviewer's summary actually says. */
  label: nonEmpty,
  incorrectPatterns: z.array(nonEmpty).min(2).max(6),
  probeExamples: z.array(nonEmpty).length(3),
  counterexamples: z.array(nonEmpty).min(1).max(3),
  invariant: nonEmpty,
});

const hintLadderSchema = z
  .array(
    z.object({
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      text: nonEmpty,
    }),
  )
  .length(3)
  .refine(
    (ladder) => ladder.every((h, i) => h.level === i + 1),
    "hintLadder must be levels 1, 2, 3 in order",
  );

export const questionDossierSchema = z.object({
  questionId: nonEmpty,
  generatedAt: nonEmpty,
  generator: z.object({
    model: nonEmpty,
    promptVersion: z.number().int().positive(),
  }),
  clarifications: z.array(nonEmpty).min(3).max(8),
  expectedApproaches: z.array(nonEmpty).min(2).max(5),
  solutions: z.array(nonEmpty).min(1).max(3),
  commonMistakes: z.array(nonEmpty).min(2).max(6),
  edgeCases: z.array(nonEmpty).min(3).max(8),
  hintLadder: hintLadderSchema,
  followups: z.array(nonEmpty).min(1).max(4),
  rubricNotes: z.array(nonEmpty).min(2).max(6),
  expectedComplexity: z.object({ time: nonEmpty, space: nonEmpty }),
  interviewerConcerns: z.array(concernSchema).min(1).max(4),
});

export type QuestionDossier = z.infer<typeof questionDossierSchema>;

/** The knowledge fields a dossier contributes to a resolved Question. */
export function dossierToKnowledge(dossier: QuestionDossier): QuestionKnowledge {
  return {
    clarifications: dossier.clarifications,
    expectedApproaches: dossier.expectedApproaches,
    solutions: dossier.solutions,
    commonMistakes: dossier.commonMistakes,
    edgeCases: dossier.edgeCases,
    hintLadder: dossier.hintLadder,
    followups: dossier.followups,
    rubricNotes: dossier.rubricNotes,
    expectedComplexity: dossier.expectedComplexity,
    interviewerConcerns: dossier.interviewerConcerns,
  };
}

export function parseDossier(
  value: unknown,
): { ok: true; value: QuestionDossier } | { ok: false; error: string } {
  const result = questionDossierSchema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  const issues = result.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: issues };
}
