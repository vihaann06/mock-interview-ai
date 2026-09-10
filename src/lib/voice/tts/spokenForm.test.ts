import { describe, expect, it } from "vitest";
import { normalizeCodeSpan, toSpokenForm } from "./spokenForm";

describe("toSpokenForm — complexity notation", () => {
  it("says complexity classes the way an interviewer does", () => {
    expect(toSpokenForm("Is that O(n log n) or O(n^2)?")).toBe(
      "Is that big O of n log n or big O of n squared?",
    );
  });

  it("spells single digits inside a complexity class", () => {
    expect(toSpokenForm("It's O(1) space, right?")).toBe("It's big O of one space, right?");
  });

  it("expands arithmetic inside the class", () => {
    expect(toSpokenForm("Complexity is O(V + E) for BFS.")).toBe(
      "Complexity is big O of V plus E for BFS.",
    );
    expect(toSpokenForm("So O(n/2) then.")).toBe("So big O of n over two then.");
    expect(toSpokenForm("Worst case O(n!)?")).toBe("Worst case big O of n factorial?");
    expect(toSpokenForm("That's O(sqrt(n)).")).toBe("That's big O of square root of n.");
  });

  it("handles theta and omega", () => {
    expect(toSpokenForm("Θ(n) and Ω(1).")).toBe("theta of n and omega of one.");
  });

  it("leaves ordinary parenthesised prose alone", () => {
    expect(toSpokenForm("Do (or don't) memoize.")).toBe("Do (or don't) memoize.");
  });
});

describe("toSpokenForm — exponents", () => {
  it("reads squares and cubes as words", () => {
    expect(toSpokenForm("n^2 comparisons, n^3 space.")).toBe(
      "n squared comparisons, n cubed space.",
    );
  });

  it("reads other exponents as 'to the'", () => {
    expect(toSpokenForm("`2^n` is exponential")).toBe("2 to the n is exponential.");
    expect(toSpokenForm("n^(k+1) terms.")).toBe("n to the k+1 terms.");
  });
});

describe("toSpokenForm — subscripts", () => {
  it("reads an index as 'of'", () => {
    expect(toSpokenForm("Why compare `nums[i]` and `nums[i+1]`?")).toBe(
      "Why compare nums of i and nums of i plus one?",
    );
  });

  it("joins chained subscripts with a comma", () => {
    expect(toSpokenForm("So `dp[i][j]` depends on `dp[i-1][j]`?")).toBe(
      "So dp of i, j depends on dp of i minus one, j?",
    );
  });
});

describe("toSpokenForm — markdown", () => {
  it("drops emphasis markers but keeps the words", () => {
    expect(toSpokenForm("Walk me through the **while** loop.")).toBe(
      "Walk me through the while loop.",
    );
    expect(toSpokenForm("That is *not* linear.")).toBe("That is not linear.");
    expect(toSpokenForm("Really ~~fast~~ slow.")).toBe("Really fast slow.");
  });

  it("keeps link text and drops the URL", () => {
    expect(toSpokenForm("See [the docs](https://example.com) for that.")).toBe(
      "See the docs for that.",
    );
  });

  it("turns list items into separate spoken sentences", () => {
    expect(toSpokenForm("- first point\n- second point")).toBe("first point. second point.");
  });

  it("strips heading markers", () => {
    expect(toSpokenForm("## Complexity")).toBe("Complexity.");
  });

  it("never emits a stray backtick or asterisk", () => {
    const spoken = toSpokenForm("Use `left` **and** `right`, not `mid`.");
    expect(spoken).not.toMatch(/[`*]/);
    expect(spoken).toBe("Use left and right, not mid.");
  });
});

describe("toSpokenForm — code spans", () => {
  it("reads member access as 'dot' rather than a sentence break", () => {
    expect(toSpokenForm("What's `arr.length` here?")).toBe("What's arr dot length here?");
  });

  it("splits snake_case and camelCase identifiers", () => {
    expect(toSpokenForm("When `left_pointer` passes `rightPointer`?")).toBe(
      "When left pointer passes right pointer?",
    );
  });

  it("keeps acronym casing so it is still spelled out", () => {
    expect(normalizeCodeSpan("parseHTMLDoc")).toBe("parse HTML Doc");
  });

  it("reads comparison and boolean operators as words", () => {
    expect(toSpokenForm("Why `if (a == b && c != d)`?")).toBe(
      "Why if a equals b and c not equal to d?",
    );
    expect(toSpokenForm("Check `nums[i] <= nums[j]`")).toBe(
      "Check nums of i less than or equal to nums of j.",
    );
  });

  it("reads arithmetic and assignment as words", () => {
    expect(toSpokenForm("Consider `x = y * 2 / 3`")).toBe("Consider x equals y times 2 over 3.");
  });

  it("drops the parentheses of a call", () => {
    expect(toSpokenForm("Try `seen.add(x)` then `seen.has(x)`")).toBe(
      "Try seen dot add x then seen dot has x.",
    );
    expect(normalizeCodeSpan("sort()")).toBe("sort");
  });

  it("flattens a fenced block into one spoken clause", () => {
    expect(toSpokenForm("```py\nfor i in range(n):\n    total += nums[i]\n```\nAnd the cost?")).toBe(
      "for i in range n, total plus equals nums of i. And the cost?",
    );
  });
});

describe("toSpokenForm — prose safety", () => {
  it("leaves a clean interviewer question byte-identical", () => {
    const line = "You said this is linear — how many comparisons does the inner loop actually do?";
    expect(toSpokenForm(line)).toBe(line);
  });

  it("does not mangle decimals or abbreviations", () => {
    expect(toSpokenForm("The price rose 3.5 percent, i.e. a lot.")).toBe(
      "The price rose 3.5 percent, i.e. a lot.",
    );
  });

  it("does not split camelCase outside a code span", () => {
    expect(toSpokenForm("Tell me about JavaScript closures.")).toBe(
      "Tell me about JavaScript closures.",
    );
  });

  it("maps arrow glyphs to a spoken word", () => {
    expect(toSpokenForm("left → right, always.")).toBe("left to right, always.");
  });

  it("removes emoji and invisible characters", () => {
    expect(toSpokenForm("Nice \u{1F44D} work​.")).toBe("Nice work.");
  });
});

describe("toSpokenForm — terminal punctuation", () => {
  it("adds a full stop so the model lands a falling contour", () => {
    expect(toSpokenForm("no trailing punctuation here")).toBe("no trailing punctuation here.");
  });

  it("preserves an existing question mark", () => {
    expect(toSpokenForm("`O(n)`?")).toBe("big O of n?");
  });

  it("replaces a dangling separator with a full stop", () => {
    expect(toSpokenForm("so, then,")).toBe("so, then.");
    expect(toSpokenForm("and then —")).toBe("and then.");
  });
});

describe("toSpokenForm — degenerate input", () => {
  it("returns empty for empty, whitespace, and non-strings", () => {
    expect(toSpokenForm("")).toBe("");
    expect(toSpokenForm("   \n ")).toBe("");
    expect(toSpokenForm(null)).toBe("");
    expect(toSpokenForm(undefined)).toBe("");
  });

  it("falls back to the original when nothing pronounceable survives", () => {
    // Losing the utterance outright is worse than reading it badly.
    expect(toSpokenForm("**")).toBe("**");
  });

  it("is idempotent on already-normalized text", () => {
    const once = toSpokenForm("That's `O(n^2)` — why compare `nums[i]` and `nums[i+1]`?");
    expect(toSpokenForm(once)).toBe(once);
  });
});
