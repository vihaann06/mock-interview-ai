/**
 * Pure CandidateReasoningState updater — heuristic memory for adaptive probing.
 * No LLM calls; generic across questions (data-driven via interviewerConcerns).
 */

import type {
  AskedQuestion,
  CandidateApproach,
  CandidateReasoningState,
  ClaimCorrectness,
  ConcernSeverity,
  ConcernType,
  InterviewConcern,
  ProbeEscalationLevel,
  TopicKey,
} from "@/lib/types/interview";

export type ReasoningUpdateInput = {
  transcript: Array<{ role: string; content: string; action?: string }>;
  candidateMessage: string;
  code: string;
  question: {
    commonMistakes?: string[];
    expectedApproaches?: string[];
    expectedComplexity?: { time: string; space: string };
    interviewerConcerns?: Array<{
      id: string;
      topic: string;
      incorrectPatterns?: string[];
      probeExamples?: string[];
      counterexamples?: string[];
      invariant?: string;
    }>;
  };
  stage: string;
  latestExecution?: { status: string } | null;
  /** Last interviewer response after this turn (optional; for recording asked Q). */
  lastInterviewerMessage?: { action?: string; message: string } | null;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "do",
  "does",
  "did",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "can",
  "could",
  "would",
  "should",
  "your",
  "you",
  "me",
  "my",
  "we",
  "our",
  "this",
  "that",
  "with",
  "from",
  "into",
  "about",
  "after",
  "before",
  "while",
  "during",
  "please",
  "just",
  "also",
  "really",
  "actually",
  "like",
  "okay",
  "ok",
  "so",
  "then",
  "than",
  "as",
  "it",
  "its",
  "at",
  "by",
]);

/** Phrase prefixes interviewers often prepend — strip before intent keying. */
const FILLER_PREFIXES = [
  /^you\s+mentioned[^.?!]*[.?!]?\s*/i,
  /^i\s+see\s+(?:that\s+)?(?:you're|you\s+are|you're)[^.?!]*[.?!]?\s*/i,
  /^i\s+see\s+(?:that\s+)?[^.?!]*[.?!]?\s*/i,
  /^i\s+noticed\s+(?:that\s+)?[^.?!]*[.?!]?\s*/i,
  /^got\s+it[^.?!]*[.?!]?\s*/i,
  /^okay[,.]?\s*/i,
  /^alright[,.]?\s*/i,
];

/** Stemming map for semantic intent (update/curr/merge/sort family). */
const STEM_MAP: Record<string, string> = {
  update: "update",
  updates: "update",
  updating: "update",
  updated: "update",
  change: "update",
  changes: "update",
  changing: "update",
  changed: "update",
  modify: "update",
  modifying: "update",
  modified: "update",
  curr: "curr",
  current: "curr",
  "current_interval": "curr",
  "curr_interval": "curr",
  merge: "merge",
  merges: "merge",
  merging: "merge",
  merged: "merge",
  sort: "sort",
  sorts: "sort",
  sorting: "sort",
  sorted: "sort",
  order: "sort",
  ordering: "sort",
  ordered: "sort",
  overlap: "overlap",
  overlaps: "overlap",
  overlapping: "overlap",
  invariant: "invariant",
  complexity: "complexity",
  time: "complexity",
  space: "complexity",
  hashmap: "hash",
  hash: "hash",
  hashset: "hash",
  dict: "hash",
  dictionary: "hash",
  set: "set",
  stack: "stack",
  queue: "queue",
  pointer: "pointer",
  pointers: "pointer",
  walkthrough: "walkthrough",
  walk: "walkthrough",
  through: "walkthrough",
  example: "example",
  counterexample: "example",
};

const TOPIC_ALIASES: Record<string, TopicKey> = {
  complexity: "complexity",
  time: "complexity",
  space: "complexity",
  big_o: "complexity",
  invariant: "invariant",
  update: "update_logic",
  update_logic: "update_logic",
  curr: "update_logic",
  edge: "edge_cases",
  edge_case: "edge_cases",
  edge_cases: "edge_cases",
  data_structure: "data_structure",
  hashmap: "data_structure",
  hash: "data_structure",
  set: "data_structure",
  stack: "data_structure",
  queue: "data_structure",
  algorithm: "algorithm_justification",
  algorithm_justification: "algorithm_justification",
  approach: "algorithm_justification",
  ordering: "ordering",
  sort: "ordering",
  sorting: "ordering",
  order: "ordering",
  testing: "testing",
  test: "testing",
};

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

function now(): number {
  return Date.now();
}

export function emptyReasoningState(): CandidateReasoningState {
  return {
    claims: [],
    approaches: [],
    resolvedTopics: [],
    unresolvedConcerns: [],
    questionsAlreadyAsked: [],
    hintsGiven: [],
    updatedAt: now(),
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripFillerPrefixes(text: string): string {
  let out = normalizeWhitespace(text);
  for (const re of FILLER_PREFIXES) {
    out = out.replace(re, "");
  }
  return normalizeWhitespace(out);
}

function stemToken(token: string): string {
  const t = token.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!t || STOP_WORDS.has(t)) return "";
  if (STEM_MAP[t]) return STEM_MAP[t];
  // light suffix trim
  if (t.endsWith("ing") && t.length > 5) {
    const base = t.slice(0, -3);
    return STEM_MAP[base] ?? base;
  }
  if (t.endsWith("ed") && t.length > 4) {
    const base = t.slice(0, -2);
    return STEM_MAP[base] ?? base;
  }
  if (t.endsWith("s") && t.length > 3 && !t.endsWith("ss")) {
    const base = t.slice(0, -1);
    return STEM_MAP[base] ?? base;
  }
  return t;
}

function tokenizeIntent(text: string): string[] {
  const cleaned = stripFillerPrefixes(text)
    .toLowerCase()
    .replace(/[`'"“”]/g, "")
    .replace(/[^a-z0-9_\s]/g, " ");
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const raw of cleaned.split(/\s+/)) {
    const stemmed = stemToken(raw);
    if (!stemmed || seen.has(stemmed)) continue;
    seen.add(stemmed);
    tokens.push(stemmed);
  }
  return tokens;
}

/**
 * Normalized intent key for semantic dedupe of interviewer questions.
 * Lowercases, strips "you mentioned / i see" fillers, stems update/curr/merge/sort synonyms.
 */
export function intentKeyForQuestion(text: string): string {
  const tokens = tokenizeIntent(text);
  if (tokens.length === 0) {
    return normalizeWhitespace(text).toLowerCase().slice(0, 80) || "empty";
  }
  return tokens.join("|");
}

function inferTopicFromText(text: string): TopicKey {
  const lower = text.toLowerCase();
  if (/\b(o\s*\(|complexity|time\s+complexity|space\s+complexity|big\s*o)\b/i.test(lower)) {
    return "complexity";
  }
  if (/\b(invariant|always\s+true|maintain)\b/i.test(lower)) {
    return "invariant";
  }
  if (/\b(curr|current|update\s+(rule|logic)|how\s+.*\s+update)\b/i.test(lower)) {
    return "update_logic";
  }
  if (/\b(edge\s*case|empty|duplicate|overflow|boundary)\b/i.test(lower)) {
    return "edge_cases";
  }
  if (/\b(hash\s*map|hashmap|dict|set|stack|queue|heap|tree)\b/i.test(lower)) {
    return "data_structure";
  }
  if (/\b(sort|order|ordering|by\s+start|by\s+end)\b/i.test(lower)) {
    return "ordering";
  }
  if (/\b(test|assert|example\s+input|walk\s*through)\b/i.test(lower)) {
    return "testing";
  }
  if (/\b(approach|algorithm|why\s+(does|would)|justify)\b/i.test(lower)) {
    return "algorithm_justification";
  }
  return "other";
}

function topicFromTemplateTopic(topic: string): TopicKey {
  const key = topic
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (TOPIC_ALIASES[key]) return TOPIC_ALIASES[key];
  for (const [alias, mapped] of Object.entries(TOPIC_ALIASES)) {
    if (key.includes(alias)) return mapped;
  }
  return inferTopicFromText(topic);
}

function tokenOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let overlap = 0;
  for (const t of a) {
    if (setB.has(t)) overlap += 1;
  }
  const denom = Math.min(a.length, b.length);
  return denom === 0 ? 0 : overlap / denom;
}

/**
 * True if intentKey matches or high token overlap on the same topic.
 */
export function isSemanticallyDuplicateQuestion(
  text: string,
  asked: AskedQuestion[],
): boolean {
  if (!text.trim() || asked.length === 0) return false;
  const key = intentKeyForQuestion(text);
  const topic = inferTopicFromText(text);
  const tokens = tokenizeIntent(text);

  for (const q of asked) {
    if (q.intentKey === key) return true;
    // Same topic + high overlap counts as duplicate (including resolved).
    if (q.topic === topic || topic === "other" || q.topic === "other") {
      const priorTokens = tokenizeIntent(q.text);
      const overlap = tokenOverlapRatio(tokens, priorTokens);
      if (overlap >= 0.6 && tokens.length >= 2 && priorTokens.length >= 2) {
        return true;
      }
    }
    // Shared core stems (update+curr, sort+order, etc.)
    const shared = tokens.filter((t) => tokenizeIntent(q.text).includes(t));
    const coreShared = shared.filter((t) =>
      ["update", "curr", "merge", "sort", "overlap", "invariant", "complexity"].includes(
        t,
      ),
    );
    if (coreShared.length >= 2) return true;
  }
  return false;
}

function cloneState(prev: CandidateReasoningState | null | undefined): CandidateReasoningState {
  if (!prev) return emptyReasoningState();
  return {
    claims: prev.claims.map((c) => ({ ...c })),
    approaches: prev.approaches.map((a) => ({ ...a, tags: [...a.tags] })),
    resolvedTopics: [...prev.resolvedTopics],
    unresolvedConcerns: prev.unresolvedConcerns.map((c) => ({ ...c })),
    questionsAlreadyAsked: prev.questionsAlreadyAsked.map((q) => ({ ...q })),
    hintsGiven: prev.hintsGiven.map((h) => ({ ...h })),
    updatedAt: prev.updatedAt,
  };
}

function speechAndCodeCorpus(candidateMessage: string, code: string): string {
  return `${candidateMessage}\n${code}`.toLowerCase();
}

type DetectedClaim = {
  statement: string;
  topic: TopicKey;
  correctness: ClaimCorrectness;
  tags?: string[];
};

function detectClaimsFromSpeech(message: string): DetectedClaim[] {
  const text = message.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const claims: DetectedClaim[] = [];

  // Ordering / sort approach
  if (/\bsort(?:ing|ed)?\s+(?:the\s+)?(?:intervals?\s+)?by\s+end\b/i.test(text)) {
    claims.push({
      statement: "Sort by end time",
      topic: "ordering",
      correctness: "uncertain",
      tags: ["sort-by-end"],
    });
  } else if (/\bsort(?:ing|ed)?\s+(?:the\s+)?(?:intervals?\s+)?by\s+start\b/i.test(text)) {
    claims.push({
      statement: "Sort by start time",
      topic: "ordering",
      correctness: "uncertain",
      tags: ["sort-by-start"],
    });
  } else if (/\bsort(?:ing|ed)?\b/i.test(text) && /\b(order|ordering)\b/i.test(text)) {
    claims.push({
      statement: extractSnippet(text, /sort[^.!]{0,60}/i) ?? "Sorting-based approach",
      topic: "ordering",
      correctness: "uncertain",
      tags: ["sort"],
    });
  }

  // Complexity claims
  const complexityMatch = lower.match(
    /\b(?:o\s*\(\s*n(?:\s*\^\s*2|\s*\*\s*n)?\s*\)|o\s*\(\s*n\s*log\s*n\s*\)|linear(?:\s+time)?|quadratic|o\s*\(\s*1\s*\))\b/i,
  );
  if (complexityMatch || /\b(?:time\s+)?complexity\b/i.test(lower)) {
    const snip =
      extractSnippet(text, /O\s*\([^)]+\)[^.]{0,40}/i) ??
      extractSnippet(text, /(?:time\s+)?complexity[^.!]{0,40}/i) ??
      "Complexity claim";
    claims.push({
      statement: snip,
      topic: "complexity",
      correctness: "uncertain",
    });
  }

  // Data structure claims
  if (/\b(hash\s*map|hashmap|dictionary|dict)\b/i.test(text)) {
    claims.push({
      statement: extractSnippet(text, /(?:hash\s*map|hashmap|dict(?:ionary)?)[^.!]{0,50}/i) ??
        "Use a hashmap/dict",
      topic: "data_structure",
      correctness: "uncertain",
      tags: ["hashmap"],
    });
  }
  if (/\b(?:hash\s*)?set\b/i.test(text) && !/\boffset\b/i.test(text)) {
    claims.push({
      statement: extractSnippet(text, /(?:hash\s*)?set[^.!]{0,50}/i) ?? "Use a set",
      topic: "data_structure",
      correctness: "uncertain",
      tags: ["set"],
    });
  }
  if (/\bstack\b/i.test(text)) {
    claims.push({
      statement: extractSnippet(text, /stack[^.!]{0,50}/i) ?? "Use a stack",
      topic: "data_structure",
      correctness: "uncertain",
      tags: ["stack"],
    });
  }

  // Update / curr logic
  if (/\b(curr|current)\b/i.test(text) && /\b(update|extend|merge|max|min)\b/i.test(text)) {
    claims.push({
      statement:
        extractSnippet(text, /(?:curr|current)[^.!]{0,80}/i) ??
        "Update current interval / pointer",
      topic: "update_logic",
      correctness: "uncertain",
      tags: ["update-curr"],
    });
  } else if (/\bupdate\s+(?:rule|logic|the)\b/i.test(text)) {
    claims.push({
      statement: extractSnippet(text, /update[^.!]{0,80}/i) ?? "Update rule",
      topic: "update_logic",
      correctness: "uncertain",
    });
  }

  // Two-pointer / scan
  if (/\btwo[\s-]?pointer/i.test(text) || /\bscan\s+(?:left|right|once)\b/i.test(text)) {
    claims.push({
      statement:
        extractSnippet(text, /(?:two[\s-]?pointer|scan)[^.!]{0,50}/i) ??
        "Two-pointer / linear scan",
      topic: "algorithm_justification",
      correctness: "uncertain",
      tags: ["two-pointer"],
    });
  }

  return claims;
}

function extractSnippet(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m?.[0]) return null;
  return normalizeWhitespace(m[0]).slice(0, 120);
}

function hasNestedLoops(code: string): boolean {
  // Python / JS-ish nested for/while
  const lines = code.split("\n");
  let depth = 0;
  let loopDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
    // Approximate: track loop keywords and indentation nesting
    const isLoop = /\b(for|while)\b/.test(trimmed);
    if (isLoop) {
      if (indent > depth && loopDepth >= 1) return true;
      // also detect `for ...: ... for` on same conceptual nest via indent stack
      loopDepth += 1;
      depth = indent;
    } else if (indent <= depth && loopDepth > 0 && !isLoop) {
      // leaving block — crude reset when indent drops
      if (indent < depth) {
        loopDepth = Math.max(0, loopDepth - 1);
        depth = indent;
      }
    }
  }
  // Fallback: two for/while within a short window with increasing indent
  const loopIndents: number[] = [];
  for (const line of lines) {
    if (!/\b(for|while)\b/.test(line)) continue;
    const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
    for (const prev of loopIndents) {
      if (indent > prev) return true;
    }
    loopIndents.push(indent);
  }
  // Braced languages: for (...) { ... for (
  if (/for\s*\([^)]*\)\s*\{[\s\S]*?for\s*\(/.test(code)) return true;
  if (/while\s*\([^)]*\)\s*\{[\s\S]*?for\s*\(/.test(code)) return true;
  if (/for\s*\([^)]*\)\s*\{[\s\S]*?while\s*\(/.test(code)) return true;
  return false;
}

function codeHasSetOrDict(code: string): boolean {
  const c = code.toLowerCase();
  return (
    /\bset\s*\(/.test(c) ||
    /\bdict\s*\(/.test(c) ||
    /\{\s*\}/.test(c) ||
    /:\s*[\[\{]/.test(c) || // dict literal hint
    /\bnew\s+Set\b/.test(code) ||
    /\bnew\s+Map\b/.test(code) ||
    /\bHashMap\b/.test(code) ||
    /\bHashSet\b/.test(code) ||
    /\.add\s*\(/.test(c) ||
    (/\bsetdefault\b/.test(c) || /\bdefaultdict\b/.test(c))
  );
}

function claimsOOfN(message: string): boolean {
  return (
    /\bo\s*\(\s*n\s*\)/i.test(message) ||
    /\blinear\s+time\b/i.test(message)
  );
}

function claimsSetOrHash(message: string): boolean {
  return /\b(hash\s*map|hashmap|hash\s*set|dict(?:ionary)?|(?:^|\s)set(?:\s|$))\b/i.test(
    message,
  );
}

function isSubstantialExplanation(message: string): boolean {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;
  // Needs explanatory signal, not just "yes" / "ok"
  return /\b(because|since|so\s+that|which\s+means|i\s+(?:then|update|check|compare|merge|maintain)|when\s+\w+|if\s+\w+)\b/i.test(
    message,
  );
}

function codeContradictsTopic(
  topic: TopicKey,
  message: string,
  code: string,
): boolean {
  if (topic === "complexity" && claimsOOfN(message) && hasNestedLoops(code)) {
    return true;
  }
  if (topic === "data_structure" && claimsSetOrHash(message) && !codeHasSetOrDict(code)) {
    return true;
  }
  return false;
}

function upsertClaims(
  state: CandidateReasoningState,
  detected: DetectedClaim[],
  ts: number,
): void {
  for (const d of detected) {
    const existing = state.claims.find(
      (c) =>
        c.status !== "superseded" &&
        c.topic === d.topic &&
        normalizeWhitespace(c.statement).toLowerCase() ===
          normalizeWhitespace(d.statement).toLowerCase(),
    );
    if (existing) {
      existing.lastObservedAt = ts;
      existing.correctness = d.correctness;
      continue;
    }
    // Same topic different statement → supersede prior open claim on topic when approach-like
    if (d.topic === "ordering" || d.topic === "algorithm_justification" || d.topic === "data_structure") {
      for (const c of state.claims) {
        if (c.topic === d.topic && c.status === "open") {
          c.status = "superseded";
        }
      }
    }
    state.claims.push({
      id: nextId("claim"),
      statement: d.statement,
      topic: d.topic,
      correctness: d.correctness,
      status: "open",
      firstObservedAt: ts,
      lastObservedAt: ts,
    });
  }
}

function approachTagsFromClaims(detected: DetectedClaim[]): string[] {
  const tags = new Set<string>();
  for (const d of detected) {
    for (const t of d.tags ?? []) tags.add(t);
  }
  return [...tags];
}

function upsertApproaches(
  state: CandidateReasoningState,
  detected: DetectedClaim[],
  ts: number,
): void {
  const tags = approachTagsFromClaims(detected);
  if (tags.length === 0) {
    // Also detect from raw speech tags already on claims
    return;
  }

  const summary =
    detected.find((d) => d.tags?.length)?.statement ?? tags.join(", ");

  // Supersede when ordering flips (start-time ↔ end-time) or approach tags diverge
  const active = state.approaches.filter((a) => a.active);
  const newTagSet = new Set(tags);
  let matched: CandidateApproach | undefined;

  for (const a of active) {
    const sameCore =
      a.tags.some((t) => newTagSet.has(t)) &&
      a.tags.filter((t) => newTagSet.has(t)).length >= Math.min(1, tags.length);
    const conflictingOrder =
      (a.tags.includes("sort-by-start") && newTagSet.has("sort-by-end")) ||
      (a.tags.includes("sort-by-end") && newTagSet.has("sort-by-start"));
    if (conflictingOrder) {
      a.active = false;
      continue;
    }
    if (sameCore) {
      matched = a;
    } else if (tags.some((t) => t.startsWith("sort-") || t === "hashmap" || t === "stack")) {
      // Different primary technique → supersede
      const aPrimary = a.tags.find((t) =>
        t.startsWith("sort-") || t === "hashmap" || t === "stack" || t === "two-pointer" || t === "set",
      );
      const bPrimary = tags.find((t) =>
        t.startsWith("sort-") || t === "hashmap" || t === "stack" || t === "two-pointer" || t === "set",
      );
      if (aPrimary && bPrimary && aPrimary !== bPrimary) {
        a.active = false;
      }
    }
  }

  if (matched) {
    matched.lastObservedAt = ts;
    matched.summary = summary;
    matched.tags = [...new Set([...matched.tags, ...tags])];
    return;
  }

  state.approaches.push({
    id: nextId("approach"),
    summary,
    tags,
    active: true,
    firstObservedAt: ts,
    lastObservedAt: ts,
  });
}

function openOrEscalateConcern(
  state: CandidateReasoningState,
  partial: {
    type: ConcernType;
    topic: TopicKey;
    summary: string;
    severity: ConcernSeverity;
    templateId?: string;
    relatedClaimId?: string;
  },
  ts: number,
  /** When true, bump attemptsToProbe + escalation (reappearance / unanswered). */
  escalate: boolean,
): InterviewConcern {
  const existing = state.unresolvedConcerns.find(
    (c) =>
      c.status === "unresolved" &&
      ((partial.templateId && c.templateId === partial.templateId) ||
        (!partial.templateId &&
          c.type === partial.type &&
          c.topic === partial.topic &&
          c.summary === partial.summary)),
  );

  if (existing) {
    if (escalate) {
      existing.attemptsToProbe += 1;
      const nextLevel = Math.min(3, existing.escalationLevel + 1) as ProbeEscalationLevel;
      existing.escalationLevel = nextLevel === 0 ? 1 : nextLevel;
      existing.lastProbedAt = ts;
    }
    return existing;
  }

  const concern: InterviewConcern = {
    id: nextId("concern"),
    type: partial.type,
    topic: partial.topic,
    summary: partial.summary,
    relatedClaimId: partial.relatedClaimId,
    templateId: partial.templateId,
    severity: partial.severity,
    status: "unresolved",
    attemptsToProbe: escalate ? 1 : 0,
    escalationLevel: escalate ? 1 : 0,
    firstObservedAt: ts,
    lastProbedAt: escalate ? ts : undefined,
  };
  state.unresolvedConcerns.push(concern);
  return concern;
}

function matchIncorrectPatterns(
  state: CandidateReasoningState,
  input: ReasoningUpdateInput,
  ts: number,
): void {
  const corpus = speechAndCodeCorpus(input.candidateMessage, input.code);
  const templates = input.question.interviewerConcerns ?? [];

  for (const tmpl of templates) {
    const patterns = tmpl.incorrectPatterns ?? [];
    const matched = patterns.some((p) => {
      const needle = p.trim().toLowerCase();
      if (!needle) return false;
      if (corpus.includes(needle)) return true;
      // loose word presence
      const words = needle.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 0) return false;
      return words.every((w) => corpus.includes(w));
    });
    if (!matched) continue;

    const topic = topicFromTemplateTopic(tmpl.topic);
    const alreadyResolved = state.resolvedTopics.includes(topic);
    if (alreadyResolved) {
      // Re-open only if pattern still present and prior was resolved without contradiction fix — skip
      continue;
    }

    const prior = state.unresolvedConcerns.find(
      (c) => c.templateId === tmpl.id && c.status === "unresolved",
    );
    openOrEscalateConcern(
      state,
      {
        type: "ALGORITHM_CORRECTNESS",
        topic,
        summary: `Possible issue: ${tmpl.topic}`,
        severity: "important",
        templateId: tmpl.id,
      },
      ts,
      Boolean(prior), // escalate if concern already open and still matching
    );
  }
}

function detectCodeSpeechMismatches(
  state: CandidateReasoningState,
  message: string,
  code: string,
  ts: number,
): void {
  if (!message.trim() || !code.trim()) return;

  if (claimsOOfN(message) && hasNestedLoops(code)) {
    openOrEscalateConcern(
      state,
      {
        type: "CODE_SPEECH_MISMATCH",
        topic: "complexity",
        summary: "Claimed O(n) but code appears to use nested loops",
        severity: "important",
      },
      ts,
      Boolean(
        state.unresolvedConcerns.find(
          (c) =>
            c.status === "unresolved" &&
            c.type === "CODE_SPEECH_MISMATCH" &&
            c.topic === "complexity",
        ),
      ),
    );
  }

  if (claimsSetOrHash(message) && !codeHasSetOrDict(code) && code.length > 40) {
    openOrEscalateConcern(
      state,
      {
        type: "CODE_SPEECH_MISMATCH",
        topic: "data_structure",
        summary: "Claimed set/hash usage but code lacks set/dict structures",
        severity: "minor",
      },
      ts,
      Boolean(
        state.unresolvedConcerns.find(
          (c) =>
            c.status === "unresolved" &&
            c.type === "CODE_SPEECH_MISMATCH" &&
            c.topic === "data_structure",
        ),
      ),
    );
  }
}

function maybeResolveTopics(
  state: CandidateReasoningState,
  message: string,
  code: string,
  ts: number,
): void {
  if (!isSubstantialExplanation(message)) return;

  const topicsTouched = new Set<TopicKey>();
  for (const c of state.claims) {
    if (c.status === "open") topicsTouched.add(c.topic);
  }
  // Infer from this message too
  topicsTouched.add(inferTopicFromText(message));

  for (const topic of topicsTouched) {
    if (topic === "other") continue;
    if (codeContradictsTopic(topic, message, code)) continue;

    // Mark claims resolved
    for (const c of state.claims) {
      if (c.topic === topic && c.status === "open") {
        c.status = "resolved";
        c.lastObservedAt = ts;
      }
    }

    // Resolve matching concerns (except active code mismatch until fixed)
    for (const concern of state.unresolvedConcerns) {
      if (concern.status !== "unresolved") continue;
      if (concern.topic !== topic) continue;
      if (concern.type === "CODE_SPEECH_MISMATCH") continue;
      concern.status = "resolved";
    }

    if (!state.resolvedTopics.includes(topic)) {
      state.resolvedTopics.push(topic);
    }

    // Mark asked questions on this topic resolved
    for (const q of state.questionsAlreadyAsked) {
      if (q.topic === topic) q.resolved = true;
    }
  }
}

function recordInterviewerQuestion(
  state: CandidateReasoningState,
  last: { action?: string; message: string },
  ts: number,
): void {
  const message = last.message?.trim() ?? "";
  if (!message) return;

  // Hint actions → HintRecord
  if (last.action === "GIVE_HINT_1" || last.action === "GIVE_HINT_2" || last.action === "GIVE_HINT_3") {
    const level = Number(last.action.replace("GIVE_HINT_", "")) as 1 | 2 | 3;
    if (!state.hintsGiven.some((h) => h.level === level && h.text === message)) {
      state.hintsGiven.push({ level, text: message, givenAt: ts });
    }
  }

  // WAIT with empty message — skip
  if (last.action === "WAIT" && !message.trim()) return;

  // Only record question-like interviewer turns
  const looksLikeQuestion =
    /\?/.test(message) ||
    /^(how|why|what|walk|can you|could you|tell me|explain)/i.test(message.trim()) ||
    last.action === "PROBE" ||
    last.action === "ASK_CLARIFICATION" ||
    last.action === "CHALLENGE_ASSUMPTION" ||
    last.action === "REQUEST_EXPLANATION" ||
    last.action === "REQUEST_COMPLEXITY" ||
    last.action === "REQUEST_TESTING";

  if (!looksLikeQuestion) return;

  if (isSemanticallyDuplicateQuestion(message, state.questionsAlreadyAsked)) {
    // Still bump escalation on matching open concern if probing again
    const topic = inferTopicFromText(message);
    const open = state.unresolvedConcerns.find(
      (c) => c.status === "unresolved" && (c.topic === topic || topic === "other"),
    );
    if (open && (last.action === "PROBE" || last.action === "CHALLENGE_ASSUMPTION")) {
      open.attemptsToProbe += 1;
      open.escalationLevel = Math.min(
        3,
        Math.max(1, open.escalationLevel + 1),
      ) as ProbeEscalationLevel;
      open.lastProbedAt = ts;
    }
    return;
  }

  const topic = inferTopicFromText(message);
  // If topic already resolved, still record but mark resolved to prevent re-ask pressure
  const resolved = state.resolvedTopics.includes(topic);

  state.questionsAlreadyAsked.push({
    id: nextId("asked"),
    intentKey: intentKeyForQuestion(message),
    text: message,
    topic,
    askedAt: ts,
    resolved,
  });

  // Escalation: probing an open concern
  if (
    last.action === "PROBE" ||
    last.action === "CHALLENGE_ASSUMPTION" ||
    last.action === "REQUEST_EXPLANATION"
  ) {
    const open = primaryUnresolvedConcern(state);
    if (open && (open.topic === topic || topic === "other" || open.topic === "other")) {
      open.attemptsToProbe += 1;
      open.escalationLevel = Math.min(
        3,
        Math.max(1, open.escalationLevel + 1),
      ) as ProbeEscalationLevel;
      open.lastProbedAt = ts;
    }
  }
}

const SEVERITY_RANK: Record<ConcernSeverity, number> = {
  critical: 3,
  important: 2,
  minor: 1,
};

/**
 * Highest-priority unresolved concern (severity → escalation → age).
 */
export function primaryUnresolvedConcern(
  state: CandidateReasoningState,
): InterviewConcern | null {
  const open = state.unresolvedConcerns.filter((c) => c.status === "unresolved");
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (s !== 0) return s;
    if (b.escalationLevel !== a.escalationLevel) {
      return b.escalationLevel - a.escalationLevel;
    }
    return a.firstObservedAt - b.firstObservedAt;
  })[0]!;
}

/**
 * Next escalation probe suggestion for the primary unresolved concern.
 * level 1 = open probeExamples[0], 2 = targeted, 3 = counterexample/walkthrough.
 */
export function nextEscalationProbe(
  state: CandidateReasoningState,
  question: {
    interviewerConcerns?: Array<{
      id: string;
      probeExamples?: string[];
      counterexamples?: string[];
    }>;
  },
): { level: 1 | 2 | 3; suggestion: string } | null {
  const concern = primaryUnresolvedConcern(state);
  if (!concern) return null;

  const templates = question.interviewerConcerns ?? [];
  const tmpl = concern.templateId
    ? templates.find((t) => t.id === concern.templateId)
    : templates[0];

  const probes = tmpl?.probeExamples ?? [];
  const counters = tmpl?.counterexamples ?? [];

  // Target level is next step after current escalation
  let level = Math.min(3, Math.max(1, concern.escalationLevel + 1)) as 1 | 2 | 3;
  if (concern.escalationLevel === 0) level = 1;
  if (concern.escalationLevel >= 3) level = 3;

  if (level === 3 && counters.length > 0) {
    const example = counters[Math.min(counters.length - 1, concern.attemptsToProbe)]!;
    return {
      level: 3,
      suggestion: `Walk through your algorithm on ${example}.`,
    };
  }

  if (probes.length > 0) {
    const idx = Math.min(probes.length - 1, level - 1);
    return { level, suggestion: probes[idx]! };
  }

  if (counters.length > 0) {
    return {
      level: 3,
      suggestion: `Walk through your algorithm on ${counters[0]}.`,
    };
  }

  // Generic fallbacks by level
  const fallbacks: Record<1 | 2 | 3, string> = {
    1: `Why does your approach guarantee correctness for ${concern.topic}?`,
    2: `Can you walk through a small example focusing on ${concern.topic}?`,
    3: `Take a concrete input that stresses ${concern.topic} and step through your logic.`,
  };
  return { level, suggestion: fallbacks[level] };
}

/**
 * Recompute / update reasoning state from the latest candidate turn (+ optional interviewer reply).
 */
export function updateCandidateReasoningState(
  prev: CandidateReasoningState | null | undefined,
  input: ReasoningUpdateInput,
): CandidateReasoningState {
  const state = cloneState(prev);
  const ts = now();
  state.updatedAt = ts;

  const detected = detectClaimsFromSpeech(input.candidateMessage);
  upsertClaims(state, detected, ts);
  upsertApproaches(state, detected, ts);

  matchIncorrectPatterns(state, input, ts);
  detectCodeSpeechMismatches(state, input.candidateMessage, input.code, ts);
  maybeResolveTopics(state, input.candidateMessage, input.code, ts);

  // Retire concerns tied to superseded approaches when ordering flipped
  const activeTags = new Set(
    state.approaches.filter((a) => a.active).flatMap((a) => a.tags),
  );
  if (activeTags.has("sort-by-start") || activeTags.has("sort-by-end")) {
    for (const c of state.unresolvedConcerns) {
      if (c.status !== "unresolved") continue;
      // Keep ordering concerns — they may still apply; retire only if template no longer matches corpus
    }
  }

  if (input.lastInterviewerMessage) {
    recordInterviewerQuestion(state, input.lastInterviewerMessage, ts);
  }

  // Prune resolved concerns from the "unresolved" list semantically — keep history but status=resolved
  // (array name is historical; includes resolved/retired entries for memory)

  return state;
}
