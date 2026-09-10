/**
 * Resolve an authored question + its generated dossier into a full `Question`.
 *
 * Precedence, least explicit to most explicit:
 *   dossier (generated)  →  override (hand patch)  →  authored inline (wins)
 *
 * So the four deeply-enriched questions in the bank keep their hand-written
 * knowledge untouched, while a new question that authors only Tier 1 gets
 * everything from its dossier.
 */
import type {
  AuthoredQuestion,
  Question,
  QuestionKnowledge,
} from "@/lib/types/question";
import type { QuestionDossier } from "./dossier";
import { dossierToKnowledge } from "./dossier";

/** A hand-written patch over a generated dossier — per-field, not whole-file. */
export type QuestionKnowledgeOverride = Partial<QuestionKnowledge>;

const EMPTY_KNOWLEDGE: QuestionKnowledge = {
  clarifications: [],
  expectedApproaches: [],
  solutions: [],
  commonMistakes: [],
  edgeCases: [],
  hintLadder: [],
  followups: [],
  rubricNotes: [],
  expectedComplexity: { time: "", space: "" },
  interviewerConcerns: [],
};

/**
 * A field counts as authored only when it carries real content — an empty array
 * in the bank means "not authored", not "deliberately empty".
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasContent);
  }
  return true;
}

function pick<K extends keyof QuestionKnowledge>(
  key: K,
  authored: AuthoredQuestion,
  override: QuestionKnowledgeOverride | undefined,
  base: QuestionKnowledge,
): QuestionKnowledge[K] {
  if (hasContent(authored[key])) return authored[key] as QuestionKnowledge[K];
  if (override && hasContent(override[key])) {
    return override[key] as QuestionKnowledge[K];
  }
  return base[key];
}

export interface ResolveSources {
  dossier?: QuestionDossier;
  override?: QuestionKnowledgeOverride;
}

export function resolveQuestion(
  authored: AuthoredQuestion,
  sources: ResolveSources = {},
): Question {
  const base = sources.dossier
    ? dossierToKnowledge(sources.dossier)
    : EMPTY_KNOWLEDGE;
  const { override } = sources;

  return {
    id: authored.id,
    title: authored.title,
    company: authored.company,
    difficulty: authored.difficulty,
    expectedTimeMinutes: authored.expectedTimeMinutes,
    statement: authored.statement,
    constraints: authored.constraints,
    starterCode: authored.starterCode,

    clarifications: pick("clarifications", authored, override, base),
    expectedApproaches: pick("expectedApproaches", authored, override, base),
    solutions: pick("solutions", authored, override, base),
    commonMistakes: pick("commonMistakes", authored, override, base),
    edgeCases: pick("edgeCases", authored, override, base),
    hintLadder: pick("hintLadder", authored, override, base),
    followups: pick("followups", authored, override, base),
    rubricNotes: pick("rubricNotes", authored, override, base),
    expectedComplexity: pick("expectedComplexity", authored, override, base),
    interviewerConcerns: pick("interviewerConcerns", authored, override, base),
  };
}

/** Which knowledge fields a question is still missing after resolution. */
export function missingKnowledgeFields(question: Question): string[] {
  return (Object.keys(EMPTY_KNOWLEDGE) as Array<keyof QuestionKnowledge>).filter(
    (key) => !hasContent(question[key]),
  );
}
