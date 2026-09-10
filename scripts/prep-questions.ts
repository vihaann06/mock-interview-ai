/**
 * Question dossier generator.
 *
 *   npm run questions:prep                 # fill in questions missing knowledge
 *   npm run questions:prep -- --only two-sum
 *   npm run questions:prep -- --force      # regenerate every dossier
 *   npm run questions:prep -- --dry-run    # print, write nothing
 *
 * One LLM pass per question, validated against `questionDossierSchema` and
 * committed as JSON. Nothing here runs at interview time.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { authoredQuestions, questions } from "../src/lib/data/questions";
import {
  DOSSIER_PROMPT_VERSION,
  concernIdFromLabel,
  parseDossier,
  type QuestionDossier,
} from "../src/lib/questions/dossier";
import { missingKnowledgeFields } from "../src/lib/questions/resolve";
import type { AuthoredQuestion } from "../src/lib/types/question";

const DOSSIER_DIR = join(process.cwd(), "src", "lib", "data", "dossiers");

/**
 * General instructions only — nothing problem-specific. Everything the
 * interviewer knows about a given problem is derived from the seed below.
 */
const GENERATOR_SYSTEM_PROMPT = `You are building the interviewer's private knowledge dossier for one technical-interview problem. You are not talking to a candidate. You are preparing the notes a senior interviewer would hold in their head before walking into the room.

Return JSON only — no prose, no markdown fences.

## Shape

{
  "clarifications": string[3-8],
  "expectedApproaches": string[2-5],
  "solutions": string[1-3],
  "commonMistakes": string[2-6],
  "edgeCases": string[3-8],
  "hintLadder": [{"level":1,"text":...},{"level":2,"text":...},{"level":3,"text":...}],
  "followups": string[1-4],
  "rubricNotes": string[2-6],
  "expectedComplexity": {"time": string, "space": string},
  "interviewerConcerns": [{
    "topic": one of "complexity" | "invariant" | "update_logic" | "edge_cases" | "data_structure" | "algorithm_justification" | "ordering" | "testing",
    "label": string,
    "incorrectPatterns": string[2-6],
    "probeExamples": string[3],
    "counterexamples": string[1-3],
    "invariant": string
  }]
}

## Field rules

clarifications — candidate-facing Q&A the interviewer can answer in one fact. Write as "Question? Answer." Cover the ambiguities a strong candidate actually asks about (input domain, duplicates, ties, return shape, mutation, empty input).

expectedApproaches — one line each, from naive to optimal, naming the technique and its complexity. Not code.

solutions — evaluator-only ground truth. Be explicit and correct here; this is never shown to the candidate or to the interviewer persona.

commonMistakes — specific wrong moves on THIS problem, not generic advice. "Off-by-one on the right pointer" beats "not testing carefully".

edgeCases — concrete literal inputs where possible: "[]", "[5]", "[3,3] target 6", "all duplicates", "single-node tree".

hintLadder — three escalating nudges. Level 1 asks a question that reorients without giving direction. Level 2 names the useful data structure or reframing. Level 3 gives the key mechanical step but still not the full solution. Each level must stand alone: level 2 may not assume the candidate heard level 1, and no level may state the answer outright.

followups — what you would ask a candidate who finished early (scale, streaming, concurrency, a constraint removed).

rubricNotes — what separates signal levels. Write as "Strong: …", "Adequate: …", "Weak: …".

expectedComplexity — the optimal solution's complexity, in big-O.

## interviewerConcerns — the important part

Each concern is one misconception that shows up repeatedly on this problem and that the interviewer should notice and pursue. One to four of them; prefer two or three real ones over four padded ones.

topic — MUST be exactly one of these eight canonical values, chosen for what the misconception is really about:
  complexity — cost claims, big-O, "this is linear"
  invariant — a property the algorithm must preserve
  update_logic — how state is mutated per step, off-by-one, wrong accumulator
  edge_cases — empty / single / duplicate / boundary inputs
  data_structure — wrong or missing structure (map, set, stack, heap, linked list)
  algorithm_justification — why the approach is correct at all
  ordering — sort key, traversal order, processing sequence
  testing — verifying behavior, tracing an example
This value is a namespace key, not prose. Do not invent new values and do not use "other" — two concerns sharing a topic become interchangeable, so pick the most specific fit and prefer distinct topics across a question's concerns.

label — the readable two-to-four-word name for the misconception, e.g. "sort order", "nested loop cost", "visited marking", "capacity eviction". This is what the interviewer's own notes will say, and the concern id is derived from it, so make it specific to this problem.

incorrectPatterns — THE MATCHING KEYS. These are matched mechanically against the lowercased concatenation of what the candidate SAID and the code they have WRITTEN. A pattern fires if it appears as a substring, or if all of its words (longer than two characters) appear anywhere in that text. So:
  - Write short lowercase fragments of 2-4 words: "sort by end", "nested for loop", "o(n) time", "while queue".
  - Use the words a candidate would really say out loud or really type as identifiers: "seen", "visited", "dp table".
  - Do NOT write full sentences, questions, or explanations — they will never match.
  - Do NOT use punctuation-heavy code snippets; keep to words and simple parens like "o(n^2)".
  - Prefer several narrow patterns over one broad one. A pattern like "the" or "array" would fire constantly and is useless.

probeExamples — exactly three interviewer questions, escalating:
  1. Open: invites them to justify their own reasoning. Does not reveal that anything is wrong.
  2. Targeted: names the specific topic or quantity in doubt.
  3. Walkthrough: makes them execute their logic on something concrete.
Each is ONE sentence, spoken plainly, and never contains the answer, the fix, or the words "hint", "concern", or "wrong".

counterexamples — concrete literal inputs that break the misconception, written so they can be dropped straight into a sentence: "[[1,4],[2,3]]", "[3,3] with target 6", "a tree with only a right child".

invariant — the one property a correct solution maintains, stated in a single clause. This is the interviewer's yardstick, not something read aloud.`;

function buildUserPayload(seed: AuthoredQuestion, missing: string[]): string {
  return JSON.stringify(
    {
      problem: {
        id: seed.id,
        title: seed.title,
        difficulty: seed.difficulty,
        expectedTimeMinutes: seed.expectedTimeMinutes,
        statement: seed.statement,
        constraints: seed.constraints,
        starterCode: seed.starterCode,
      },
      language: "python",
      note: `Produce the full dossier. Fields already hand-authored in the bank (${
        missing.length === 0 ? "none" : missing.join(", ")
      } are the ones currently missing) will be overridden by the human's version, so fill in everything regardless.`,
    },
    null,
    2,
  );
}

interface CliOptions {
  force: boolean;
  dryRun: boolean;
  only: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { force: false, dryRun: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--only") {
      opts.only = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return opts;
}

/** Deterministic ids + stable key order, so regenerating produces a clean diff. */
function normalizeDossier(
  raw: Record<string, unknown>,
  questionId: string,
  model: string,
): unknown {
  const concerns = Array.isArray(raw.interviewerConcerns)
    ? raw.interviewerConcerns
    : [];
  const seenIds = new Set<string>();
  const normalizedConcerns = concerns.map((c) => {
    const concern = c as Record<string, unknown>;
    const label =
      typeof concern.label === "string" && concern.label.trim()
        ? concern.label
        : typeof concern.topic === "string"
          ? concern.topic
          : "concern";
    let id = concernIdFromLabel(label);
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${concernIdFromLabel(label)}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    return {
      id,
      topic: concern.topic,
      label,
      incorrectPatterns: concern.incorrectPatterns,
      probeExamples: concern.probeExamples,
      counterexamples: concern.counterexamples,
      invariant: concern.invariant,
    };
  });

  return {
    questionId,
    generatedAt: new Date().toISOString(),
    generator: { model, promptVersion: DOSSIER_PROMPT_VERSION },
    clarifications: raw.clarifications,
    expectedApproaches: raw.expectedApproaches,
    solutions: raw.solutions,
    commonMistakes: raw.commonMistakes,
    edgeCases: raw.edgeCases,
    hintLadder: raw.hintLadder,
    followups: raw.followups,
    rubricNotes: raw.rubricNotes,
    expectedComplexity: raw.expectedComplexity,
    interviewerConcerns: normalizedConcerns,
  };
}

async function generateDossier(
  client: OpenAI,
  model: string,
  seed: AuthoredQuestion,
  missing: string[],
): Promise<QuestionDossier> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: GENERATOR_SYSTEM_PROMPT },
    { role: "user", content: buildUserPayload(seed, missing) },
  ];

  // One retry, with the validation error fed back so the model can repair it.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("empty model response");

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error("model returned non-JSON");
    }

    const parsed = parseDossier(normalizeDossier(raw, seed.id, model));
    if (parsed.ok) return parsed.value;

    if (attempt === 2) {
      throw new Error(`schema validation failed: ${parsed.error}`);
    }
    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content: `That output failed validation: ${parsed.error}. Return corrected JSON only, obeying every count and length rule.`,
    });
  }

  throw new Error("unreachable");
}

/** Rewrite the static-import barrel so dossiers bundle without fs at runtime. */
function writeBarrel(ids: string[]): void {
  const sorted = [...ids].sort();
  const imports = sorted
    .map((id) => `import ${identifierFor(id)} from "./${id}.json";`)
    .join("\n");
  const entries = sorted
    .map((id) => `  "${id}": ${identifierFor(id)} as QuestionDossier,`)
    .join("\n");

  const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with \`npm run questions:prep\`.
 *
 * Maps question id → committed dossier JSON. Static imports (rather than fs)
 * so dossiers bundle cleanly and work in any runtime.
 */
import type { QuestionDossier } from "@/lib/questions/dossier";
${imports ? `\n${imports}\n` : ""}
export const dossiers: Record<string, QuestionDossier> = {
${entries}
};
`;
  writeFileSync(join(DOSSIER_DIR, "index.ts"), body, "utf8");
}

function identifierFor(id: string): string {
  const camel = id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return `${camel}Dossier`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "OPENAI_API_KEY is not set. Add it to .env.local and re-run with:\n" +
        "  set -a && . ./.env.local && set +a && npm run questions:prep",
    );
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_DOSSIER_MODEL || "gpt-4o";

  const resolvedById = new Map(questions.map((q) => [q.id, q]));
  const targets = authoredQuestions.filter((q) => {
    if (opts.only) return q.id === opts.only;
    if (opts.force) return true;
    const resolved = resolvedById.get(q.id);
    return !resolved || missingKnowledgeFields(resolved).length > 0;
  });

  if (opts.only && targets.length === 0) {
    console.error(`No question with id "${opts.only}".`);
    process.exit(1);
  }

  if (targets.length === 0) {
    console.log("Every question already has complete knowledge. Nothing to do.");
    console.log("Use --force to regenerate anyway.");
    return;
  }

  mkdirSync(DOSSIER_DIR, { recursive: true });

  console.log(`Model: ${model}`);
  console.log(`Generating ${targets.length} dossier(s)…\n`);

  const written: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const seed of targets) {
    const resolved = resolvedById.get(seed.id);
    const missing = resolved ? missingKnowledgeFields(resolved) : [];
    process.stdout.write(`  ${seed.id} … `);
    try {
      const dossier = await generateDossier(client, model, seed, missing);
      if (opts.dryRun) {
        console.log(
          `ok (dry run, ${dossier.interviewerConcerns.length} concerns)`,
        );
      } else {
        writeFileSync(
          join(DOSSIER_DIR, `${seed.id}.json`),
          `${JSON.stringify(dossier, null, 2)}\n`,
          "utf8",
        );
        console.log(`ok (${dossier.interviewerConcerns.length} concerns)`);
      }
      written.push(seed.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED — ${message}`);
      failed.push({ id: seed.id, error: message });
    }
  }

  if (!opts.dryRun && written.length > 0) {
    // Barrel must list every dossier on disk, not just this run's.
    const existing = authoredQuestions
      .map((q) => q.id)
      .filter(
        (id) =>
          written.includes(id) ||
          existsSync(join(DOSSIER_DIR, `${id}.json`)),
      );
    writeBarrel(existing);
    console.log(`\nWrote ${written.length} dossier(s) + regenerated barrel.`);
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} question(s) failed:`);
    for (const f of failed) console.error(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

void main();
