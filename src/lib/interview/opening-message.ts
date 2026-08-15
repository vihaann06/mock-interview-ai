import type { Question } from "@/lib/types/question";

const STATEMENT_MAX_CHARS = 220;
const MAX_CONSTRAINTS = 4;

/** First 1–2 sentences, truncated sensibly for spoken intro. */
function briefStatement(statement: string): string {
  const trimmed = statement.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const sentenceMatches = trimmed.match(/[^.!?]+[.!?]+/g);
  if (sentenceMatches && sentenceMatches.length > 0) {
    let out = sentenceMatches[0]!.trim();
    if (
      sentenceMatches.length > 1 &&
      out.length + sentenceMatches[1]!.trim().length + 1 <= STATEMENT_MAX_CHARS
    ) {
      out = `${out} ${sentenceMatches[1]!.trim()}`;
    }
    if (out.length > STATEMENT_MAX_CHARS) {
      return truncateAtWord(out, STATEMENT_MAX_CHARS);
    }
    return out;
  }

  return truncateAtWord(trimmed, STATEMENT_MAX_CHARS);
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const base = (lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trim();
  return `${base}…`;
}

/** Pick 2–4 constraints and phrase them for speech. */
function spokenConstraints(constraints: string[]): string {
  const picked = constraints
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, MAX_CONSTRAINTS);

  if (picked.length === 0) return "";
  if (picked.length === 1) return picked[0]!;
  if (picked.length === 2) return `${picked[0]} and ${picked[1]}`;

  const head = picked.slice(0, -1).join("; ");
  return `${head}; and ${picked[picked.length - 1]}`;
}

/**
 * Calm interviewer opening: welcome, brief problem walkthrough, invite questions.
 * Stays on INTRO — does not push into approach discussion.
 */
export function buildOpeningMessage(question: Question): string {
  const problem = briefStatement(question.statement);
  const constraints = spokenConstraints(question.constraints);

  const parts: string[] = [
    "Welcome to the interview. This is a company-style coding round — you'll have about forty-five minutes for one problem in the shared editor.",
    problem
      ? `Today we're working on "${question.title}". ${problem}`
      : `Today we're working on "${question.title}".`,
  ];

  if (constraints) {
    parts.push(`A few constraints to keep in mind: ${constraints}.`);
  }

  parts.push(
    "If anything is unclear, feel free to ask clarifying questions — you can also read the full prompt on the screen.",
  );

  return parts.join(" ");
}
