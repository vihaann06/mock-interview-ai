import type { Question } from "@/lib/types/question";

const STATEMENT_MAX_CHARS = 520;
const MAX_SPOKEN_CONSTRAINTS = 3;

const POW10_WORDS: Record<string, string> = {
  "3": "a thousand",
  "4": "ten thousand",
  "5": "a hundred thousand",
  "6": "a million",
  "9": "a billion",
};

/**
 * First spoken interviewer turn (non-LLM fallback).
 * Conversational walkthrough — not a spec dump. Stays on INTRO.
 */
export function buildOpeningMessage(question: Question): string {
  const goal = spokenGoal(question);
  const example = tinySpokenExample(question);
  const constraints = spokenKeyConstraints(question.constraints);

  const parts: string[] = [
    "Hey, thanks for jumping on. We'll do one problem today, about forty-five minutes — think out loud as you go, and take a beat to read the prompt if you want.",
    goal
      ? `Today we're looking at ${question.title}. ${goal}`
      : `Today we're looking at ${question.title}.`,
  ];

  if (example) parts.push(example);
  if (constraints) parts.push(constraints);

  parts.push(
    "If anything is unclear, feel free to ask clarifying questions. The full prompt is on the screen as a reference — I'll give you a moment with it.",
  );

  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Restate the actual task in spoken English; cover the goal, not every sentence. */
function spokenGoal(question: Question): string {
  const trimmed = stripMarkdown(question.statement).replace(/\s+/g, " ").trim();
  if (!trimmed) return "";

  const cleaned = softenIdentifiers(trimmed);
  const sentences = splitSentences(cleaned).map((s, i) =>
    i === 0 ? makeConversational(s) : s,
  );

  if (sentences.length === 0) {
    return ensurePeriod(truncateAtSentenceOrWord(cleaned, STATEMENT_MAX_CHARS));
  }

  let out = sentences[0]!;
  for (let i = 1; i < sentences.length && i < 3; i++) {
    const next = sentences[i]!;
    if (out.length + next.length + 1 > STATEMENT_MAX_CHARS) break;
    // Skip later sentences that are pure constraint recap — those get a spoken pass.
    if (i > 0 && looksLikeConstraintRecap(next) && out.length > 80) break;
    out = `${out} ${next}`;
  }

  if (out.length > STATEMENT_MAX_CHARS) {
    out = truncateAtSentenceOrWord(out, STATEMENT_MAX_CHARS);
  }

  return ensurePeriod(out);
}

function makeConversational(sentence: string): string {
  const trimmed = sentence.trim();
  const given = trimmed.match(
    /^Given\s+(.+?),\s+(return|find|determine|compute|design|implement)\s+(.+)$/i,
  );
  if (!given) return trimmed;

  const verb = given[2]!.toLowerCase();
  let rest = given[3]!.replace(/\.+$/, "");
  if (verb === "return" && /^(indices|index)\b/i.test(rest)) {
    rest = `the ${rest}`;
  }
  return `You're given ${given[1]}, and you need to ${verb} ${rest}.`;
}

function looksLikeConstraintRecap(sentence: string): boolean {
  return /exactly one|same element|same index|any order|return order|you may assume/i.test(
    sentence,
  );
}

function tinySpokenExample(question: Question): string {
  if (question.id === "two-sum") {
    return "So if the array is 2, 7, 11, 15 and the target is 9, you'd return the indices of 2 and 7.";
  }

  const fromStatement = exampleFromText(question.statement);
  if (fromStatement) return fromStatement;
  return "";
}

function exampleFromText(text: string): string {
  const match = text.match(
    /example[:\s]+(.{12,160}?)(?:\.(?:\s|$)|$)/i,
  );
  if (!match?.[1]) return "";
  const snippet = stripMarkdown(match[1]).replace(/\s+/g, " ").trim();
  if (!snippet || /[≤≥]/.test(snippet)) return "";
  return ensurePeriod(`For a quick example, ${snippet.charAt(0).toLowerCase()}${snippet.slice(1)}`);
}

/** Pick 2–3 key constraints and phrase them for speech. */
function spokenKeyConstraints(constraints: string[]): string {
  const items = selectSpokenConstraints(constraints);
  if (items.length === 0) return "";
  return `A couple of things to know: ${joinSpokenList(items)}.`;
}

function selectSpokenConstraints(constraints: string[]): string[] {
  const classified = constraints
    .map((c) => c.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, speech: constraintToSpeech(raw), kind: classifyConstraint(raw) }))
    .filter((c) => c.speech.length > 0);

  const uniq = classified.find((c) => c.kind === "uniqueness");
  const reuse = classified.find((c) => c.kind === "reuse");
  const size = classified.find((c) => c.kind === "size");
  const values = classified.find((c) => c.kind === "values");
  const other = classified.filter(
    (c) =>
      c.kind !== "uniqueness" &&
      c.kind !== "reuse" &&
      c.kind !== "size" &&
      c.kind !== "values",
  );

  const picked: string[] = [];
  if (size) picked.push(size.speech);
  if (values) picked.push(values.speech);

  if (uniq && reuse) {
    picked.push("there's exactly one valid pair — you can't reuse the same index");
  } else if (uniq) {
    picked.push(uniq.speech);
  } else if (reuse) {
    picked.push(reuse.speech);
  }

  for (const item of other) {
    if (picked.length >= MAX_SPOKEN_CONSTRAINTS) break;
    if (!picked.includes(item.speech)) picked.push(item.speech);
  }

  return picked.slice(0, MAX_SPOKEN_CONSTRAINTS);
}

type ConstraintKind = "size" | "values" | "uniqueness" | "reuse" | "other";

function classifyConstraint(raw: string): ConstraintKind {
  if (/exactly one/i.test(raw) && /solution|answer|pair/i.test(raw)) {
    return "uniqueness";
  }
  if (
    /same (element|index)/i.test(raw) ||
    /not use the same/i.test(raw) ||
    /reuse/i.test(raw)
  ) {
    return "reuse";
  }
  if (
    /\.length/i.test(raw) ||
    /\b(m,\s*n|capacity|numCourses|wordList|nodes)\b/i.test(raw) ||
    /number of nodes/i.test(raw)
  ) {
    return "size";
  }
  if (
    /\[i\]|\[i\]\[j\]/.test(raw) ||
    /nums\[|grid\[|height\[|node values|values in/i.test(raw)
  ) {
    return "values";
  }
  return "other";
}

/** Turn a raw constraint (often an inequality) into spoken English. */
function constraintToSpeech(raw: string): string {
  const c = stripMarkdown(raw).replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
  if (!c) return "";

  if (/exactly one/i.test(c) && /solution|answer|pair/i.test(c)) {
    return "there's exactly one valid pair";
  }
  if (
    /same (element|index)/i.test(c) ||
    /you may not use the same/i.test(c) ||
    /cannot reuse|can't reuse|not reuse/i.test(c)
  ) {
    return "you can't reuse the same index";
  }
  if (/return order|any order/i.test(c)) {
    return "";
  }

  const lengthBound = c.match(
    /^([^\s≤<]+)\s*(?:≤|<=|<)\s*([A-Za-z_]\w*)\.length\s*(?:≤|<=|<)\s*(.+)$/i,
  );
  if (lengthBound) {
    const ident = lengthBound[2]!;
    const maxSpeech = numberTokenToSpeech(lengthBound[3]!.trim());
    return `${subjectForIdent(ident)} can be up to about ${maxSpeech} ${unitForIdent(ident)}`;
  }

  const twoDim = c.match(
    /^([^\s≤<]+)\s*(?:≤|<=|<)\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*(?:≤|<=|<)\s*(.+)$/,
  );
  if (twoDim) {
    const maxSpeech = numberTokenToSpeech(twoDim[4]!.trim());
    return `the grid can be up to about ${maxSpeech} by ${maxSpeech}`;
  }

  const valueBound = c.match(
    /^(.+?)\s*(?:≤|<=|<)\s*([A-Za-z_]\w*)\s*\[[^\]]+\](?:\[[^\]]+\])?\s*(?:≤|<=|<)\s*(.+)$/,
  );
  if (valueBound) {
    const lo = valueBound[1]!.trim();
    if (lo.startsWith("-") || /-\s*10/.test(lo)) {
      return "values can be negative";
    }
    const hi = numberTokenToSpeech(valueBound[3]!.trim());
    return `values go up to about ${hi}`;
  }

  const identBound = c.match(
    /^([^\s≤<]+)\s*(?:≤|<=|<)\s*([A-Za-z_]\w*)\s*(?:≤|<=|<)\s*(.+)$/,
  );
  if (identBound) {
    const ident = identBound[2]!;
    const maxSpeech = numberTokenToSpeech(identBound[3]!.trim());
    return `${subjectForIdent(ident)} can be up to about ${maxSpeech}`;
  }

  const nodeCount = c.match(/number of nodes in\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\]/i);
  if (nodeCount) {
    return `there can be up to about ${numberTokenToSpeech(nodeCount[2]!.trim())} nodes`;
  }

  const nodeValues = c.match(/node values in\s*\[\s*([^,\]]+)\s*,\s*([^\]]+)\]/i);
  if (nodeValues) {
    const lo = nodeValues[1]!.trim();
    if (lo.startsWith("-")) return "node values can be negative";
    return `node values go up to about ${numberTokenToSpeech(nodeValues[2]!.trim())}`;
  }

  const atMost = c.match(/^at most\s+(.+?)\s+calls(.+)$/i);
  if (atMost) {
    return `there can be up to about ${numberTokenToSpeech(atMost[1]!.trim())} calls${atMost[2]}`;
  }

  if (/O\(\s*1\s*\)/i.test(c) && /get|put|average/i.test(c)) {
    return "get and put should each be constant time on average";
  }

  if (!/[≤≥<>]/.test(c) && !/10\^\d/.test(c) && !/<=|>=/.test(c)) {
    return c.replace(/^[A-Z]/, (ch) => ch.toLowerCase());
  }

  return speakMathTokens(c).replace(/^[A-Z]/, (ch) => ch.toLowerCase());
}

function subjectForIdent(ident: string): string {
  const id = ident.toLowerCase();
  if (id === "nums" || id === "nums1" || id === "nums2" || id === "arr") {
    return "the array";
  }
  if (id === "s" || id === "str" || id === "word") return "the string";
  if (id === "grid") return "the grid";
  if (id === "intervals") return "the list of intervals";
  if (id === "height") return "the height array";
  if (id === "wordlist") return "the word list";
  if (id === "prerequisites") return "the prerequisites list";
  if (id === "capacity") return "capacity";
  if (id === "numcourses") return "the number of courses";
  if (id === "n" || id === "m") return ident;
  return `the ${ident} input`;
}

function unitForIdent(ident: string): string {
  const id = ident.toLowerCase();
  if (id === "s" || id === "str" || id === "word") return "characters";
  if (id === "intervals") return "intervals";
  if (id === "wordlist") return "words";
  return "elements";
}

function numberTokenToSpeech(raw: string): string {
  const t = raw.replace(/,/g, "").replace(/·/g, "*").replace(/\s+/g, "").trim();

  const coeffPow = t.match(/^(\d+)\*?10\^(\d+)$/);
  if (coeffPow) {
    const coeff = Number(coeffPow[1]);
    const exp = coeffPow[2]!;
    if (coeff === 2 && exp === "4") return "twenty thousand";
    if (coeff === 2 && exp === "5") return "two hundred thousand";
    if (coeff === 1 && POW10_WORDS[exp]) return POW10_WORDS[exp]!;
  }

  const pow = t.match(/^10\^(\d+)$/);
  if (pow && POW10_WORDS[pow[1]!]) return POW10_WORDS[pow[1]!]!;

  const n = Number(t);
  if (Number.isFinite(n)) return integerToLooseSpeech(n);

  return speakMathTokens(raw);
}

function integerToLooseSpeech(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1000) return "a thousand";
  if (abs === 2000) return "two thousand";
  if (abs === 3000) return "three thousand";
  if (abs === 5000) return "five thousand";
  if (abs === 10000) return "ten thousand";
  if (abs === 20000) return "twenty thousand";
  if (abs === 300) return "three hundred";
  if (abs === 200) return "two hundred";
  if (n < 0) return `negative ${abs}`;
  return String(n);
}

function speakMathTokens(text: string): string {
  return text
    .replace(/2\s*[·*]\s*10\^5/g, "two hundred thousand")
    .replace(/2\s*[·*]\s*10\^4/g, "twenty thousand")
    .replace(/10\^9/g, "a billion")
    .replace(/10\^6/g, "a million")
    .replace(/10\^5/g, "a hundred thousand")
    .replace(/10\^4/g, "ten thousand")
    .replace(/10\^3/g, "a thousand")
    .replace(/[≤⩽]/g, " at most ")
    .replace(/[≥⩾]/g, " at least ")
    .replace(/<=/g, " at most ")
    .replace(/>=/g, " at least ")
    .replace(/\s+/g, " ")
    .trim();
}

function softenIdentifiers(text: string): string {
  return text
    .replace(/\barray of integers nums\b/gi, "array of integers")
    .replace(/\ban integer target\b/gi, "a target")
    .replace(/\bstring s containing\b/gi, "string containing")
    .replace(/\ban? m x n 2D binary grid\b/gi, "a grid of zeros and ones")
    .replace(/`+/g, "");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .trim();
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function truncateAtSentenceOrWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const sentences = splitSentences(text);
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out.length > 40) return out;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const base = (lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trim();
  return ensurePeriod(base.replace(/[.,;:]+$/, ""));
}

function ensurePeriod(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function joinSpokenList(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
