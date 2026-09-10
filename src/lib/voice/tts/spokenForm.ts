/**
 * Spoken-form normalizer for interviewer text.
 *
 * The interviewer's *written* text is tuned in `src/lib/interviewer/prompt.ts`, and it
 * routinely contains things that read fine on screen but sound terrible aloud:
 *
 *   "That's `O(n^2)` — why compare `nums[i]` and `nums[i+1]`?"
 *
 * Read literally, a TTS model spells out backticks, says "oh, open paren, n, caret, two"
 * or drops the symbols entirely, and treats `arr.length` as a sentence boundary — which
 * lands a full stop's downward intonation in the middle of a question. This module
 * rewrites the text into the words a senior engineer would actually say. It runs only on
 * the audio path, so the transcript the candidate reads is untouched.
 *
 * Everything here is pure: no I/O, no env, no randomness.
 */

/** Single digits are spelled out inside math so "O(1)" never reads as a bare glyph. */
const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;

/** Emoji, pictographs, variation selectors, and invisible spacing characters. */
const DECORATION_RE =
  /[\u200B-\u200D\uFEFF\u00A0\u2009\u202F\u2007\u2060]|[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

/** Not `\b` — the Big-O symbol set includes non-ASCII letters, which `\b` mishandles. */
const NOT_WORD_BEHIND = "(?<![A-Za-z0-9_])";

function collapseWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:?!])/g, "$1")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^[,\s]+/, "")
    .trim();
}

function spellSingleDigits(text: string): string {
  return text.replace(/(?<![\w.])(\d)(?![\w.])/g, (_m, d: string) => DIGIT_WORDS[Number(d)]);
}

/**
 * `n^2` → "n squared", `n^3` → "n cubed", `2^n` → "2 to the n", `n^(k+1)` → "n to the k+1".
 */
function expandExponents(text: string): string {
  return text
    .replace(/\^\s*\(\s*([^()]{1,40}?)\s*\)/g, (_m, exp: string) => ` to the ${exp}`)
    .replace(/\^\s*2(?![\w.])/g, " squared")
    .replace(/\^\s*3(?![\w.])/g, " cubed")
    .replace(/\^\s*(-?\w+)/g, (_m, exp: string) => ` to the ${exp}`);
}

/** Inner expression of a Big-O group or subscript, in words. */
function spokenMathExpression(inner: string): string {
  let out = inner.trim();
  if (!out) return "";
  out = out.replace(/\bsqrt\s*\(?\s*([\w^]+)\s*\)?/gi, "square root of $1");
  out = expandExponents(out);
  out = out
    .replace(/!/g, " factorial")
    .replace(/\*/g, " times ")
    .replace(/\//g, " over ")
    .replace(/\+/g, " plus ")
    .replace(/(?<=[\w)])\s*-\s*(?=[\w(])/g, " minus ");
  out = spellSingleDigits(out);
  return collapseWhitespace(out);
}

/**
 * `nums[i]` → "nums of i"; `nums[i+1]` → "nums of i plus one"; `dp[i][j]` → "dp of i, j".
 *
 * Chained subscripts collapse into a single "of" with comma-separated indices, which is
 * how the expression is normally read out loud.
 */
function expandSubscripts(text: string): string {
  return text.replace(
    /([A-Za-z_$][\w$]*)((?:\[[^[\]]{0,40}\])+)/g,
    (match, name: string, subs: string) => {
      const indices = [...subs.matchAll(/\[([^[\]]*)\]/g)]
        .map((m) => spokenMathExpression(m[1]))
        .filter(Boolean);
      if (indices.length === 0) return match;
      return `${name} of ${indices.join(", ")}`;
    },
  );
}

/**
 * Complexity notation: `O(n log n)` → "big O of n log n", `Θ(1)` → "theta of one".
 *
 * "big O of" rather than a bare "oh of": read aloud, "oh" is ambiguous between the letter
 * and the interjection, and "big O" is what an interviewer actually says at a whiteboard.
 */
function expandComplexity(text: string): string {
  const re = new RegExp(
    `${NOT_WORD_BEHIND}([OΘθΩω])\\s*\\(\\s*([^()]{0,60}(?:\\([^()]{0,40}\\)[^()]{0,40})*?)\\s*\\)`,
    "g",
  );
  return text.replace(re, (match, symbol: string, inner: string) => {
    const name =
      symbol === "O"
        ? "big O"
        : symbol === "Θ" || symbol === "θ"
          ? "theta"
          : "omega";
    const expr = spokenMathExpression(inner);
    return expr ? `${name} of ${expr}` : match;
  });
}

/**
 * Operators, in the words an engineer says. The bare `<` / `>` / `=` / `.` rules are
 * applied to code spans only — in prose those characters are far more likely to be stray
 * markup, a decimal point, or an abbreviation than an operator.
 */
function expandOperators(text: string): string {
  return text
    .replace(/!==|!=/g, " not equal to ")
    .replace(/===|==/g, " equals ")
    .replace(/<=/g, " less than or equal to ")
    .replace(/>=/g, " greater than or equal to ")
    .replace(/&&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/\+\+/g, " plus plus ")
    .replace(/--/g, " minus minus ")
    .replace(/\+=/g, " plus equals ")
    .replace(/-=/g, " minus equals ")
    .replace(/=>|->/g, " to ")
    .replace(/</g, " less than ")
    .replace(/>/g, " greater than ")
    .replace(/(?<=[\w)\]])\s*\*\s*(?=[\w(])/g, " times ")
    .replace(/(?<=[\w)\]])\s*\/\s*(?=[\w(])/g, " over ")
    .replace(/(?<=[\w)\]])\s*%\s*(?=[\w(])/g, " mod ")
    .replace(/(?<=[\w)\]])\s*\+\s*(?=[\w(])/g, " plus ")
    .replace(/(?<=\S)\s*=\s*(?=\S)/g, " equals ");
}

/**
 * `left_pointer` → "left pointer", `leftPointer` → "left pointer".
 * camelCase splitting is deliberately confined to code spans: applying it to prose would
 * mangle ordinary capitalised words mid-sentence.
 */
function splitIdentifiers(text: string): string {
  return text
    .replace(/([A-Za-z0-9])_+([A-Za-z0-9])/g, "$1 $2")
    // `leftPointer` → "left pointer" (lowercased, so it is not stressed as a new word)…
    .replace(/([a-z0-9])([A-Z])(?=[a-z])/g, (_m, a: string, b: string) => `${a} ${b.toLowerCase()}`)
    // …but `parseHTML` keeps its acronym casing so it is still spelled out.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2");
}

/**
 * Normalizes the inside of a code span (inline backticks or a fenced block). Code gets
 * the aggressive treatment; surrounding prose does not.
 */
export function normalizeCodeSpan(code: string): string {
  let out = code;
  out = expandComplexity(out);
  out = out.replace(/\bsqrt\s*\(\s*([^()]{1,40})\s*\)/gi, "square root of $1");
  out = expandSubscripts(out);
  out = expandExponents(out);
  // A call with no arguments is just the function's name when spoken.
  out = out.replace(/([A-Za-z_$][\w$]*)\s*\(\s*\)/g, "$1");
  out = expandOperators(out);
  // Member access must not survive as "." or it reads as a sentence break.
  out = out.replace(/(?<=[\w)\]])\s*\.\s*(?=[A-Za-z_$])/g, " dot ");
  out = out.replace(/::/g, " ");
  out = splitIdentifiers(out);
  // Remaining syntax is punctuation nobody says out loud. Parens around arguments become
  // nothing ("seen dot add x"), and statement separators become commas so they read as a
  // short pause instead of "semicolon" or a hard sentence break.
  out = out.replace(/[`{}()[\]\\|#]/g, " ").replace(/[;:]/g, ", ");
  return collapseWhitespace(out);
}

/** Gives every clause a terminator so the model lands an intonation contour on it. */
function ensureTerminalPunctuation(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/[.?!…]$/.test(trimmed)) return trimmed;
  if (/[,;:]$/.test(trimmed)) return `${trimmed.slice(0, -1)}.`;
  if (/[—–-]$/.test(trimmed)) return `${trimmed.slice(0, -1).trim()}.`;
  return `${trimmed}.`;
}

/**
 * Rewrites interviewer text into its spoken form.
 *
 * Returns the original trimmed text if normalization would leave nothing pronounceable
 * (e.g. the input was only markdown punctuation) — losing the utterance entirely is worse
 * than reading it badly.
 */
export function toSpokenForm(input: string | null | undefined): string {
  if (typeof input !== "string") return "";
  const original = input.trim();
  if (!original) return "";

  // Arrow glyphs carry meaning ("left \u2192 right"); map them before stripping symbols.
  let text = original.replace(/\s*[\u2192\u21D2\u27F6\u27F9]\s*/g, " to ");
  text = text.replace(DECORATION_RE, " ");

  // Fenced blocks and inline spans: keep the code, normalized, drop the markers.
  text = text.replace(
    /```[A-Za-z0-9_+#-]*\r?\n?([\s\S]*?)```/g,
    (_m, code: string) => ` ${normalizeCodeSpan(code.replace(/\r?\n/g, "; "))} `,
  );
  text = text.replace(/`+([^`]+?)`+/g, (_m, code: string) => ` ${normalizeCodeSpan(code)} `);

  // Markdown that is pure decoration.
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/~~([^~]+)~~/g, "$1");
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1");
  text = text.replace(/(?<![\w_])__([^_\n]+)__(?![\w_])/g, "$1");
  text = text.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1");
  text = text.replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+[.)]|>)[ \t]+/gm, "");
  text = text.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "");

  // Notation that shows up in plain prose too, handled conservatively.
  text = expandComplexity(text);
  text = text.replace(/\bsqrt\s*\(\s*([^()]{1,40})\s*\)/gi, "square root of $1");
  text = expandSubscripts(text);
  text = expandExponents(text);
  text = text.replace(/(?<=[\w)])\s*(?:!==|!=)\s*(?=[\w(])/g, " not equal to ");
  text = text.replace(/(?<=[\w)])\s*(?:===|==)\s*(?=[\w(])/g, " equals ");
  text = text.replace(/(?<=[\w)])\s*<=\s*(?=[\w(])/g, " less than or equal to ");
  text = text.replace(/(?<=[\w)])\s*>=\s*(?=[\w(])/g, " greater than or equal to ");
  text = text.replace(/(?<=[\w)])\s*&&\s*(?=[\w(])/g, " and ");
  text = text.replace(/(?<=[\w)])\s*\|\|\s*(?=[\w(])/g, " or ");
  text = text.replace(/(?<=[\w)])\s*(?:=>|->)\s*(?=[\w(])/g, " to ");
  text = text.replace(/(?<=\d)\s*\*\s*(?=\d)/g, " times ");
  text = text.replace(/(?<=[A-Za-z0-9])_+(?=[A-Za-z0-9])/g, " ");
  text = text.replace(/[`*|]/g, " ");

  const spoken = text
    .split(/\r?\n+/)
    .map((line) => ensureTerminalPunctuation(collapseWhitespace(line)))
    .filter(Boolean)
    .join(" ");

  const normalized = collapseWhitespace(spoken);
  if (!/[A-Za-z0-9]/.test(normalized)) return original;
  return ensureTerminalPunctuation(normalized);
}
