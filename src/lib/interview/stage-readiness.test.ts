import { describe, expect, it } from "vitest";
import {
  createSession,
  recordCandidateTurn,
  recordExecutionRun,
  startInterview,
  transitionStage,
  updateCode,
} from "./session";
import {
  canAdvanceStage,
  candidateTurnsInStage,
  hasDiscussedComplexity,
  hasExecutedCode,
  hasRealCode,
  stageAdvanceBlockers,
} from "./stage-readiness";
import type { InterviewSession, InterviewStage } from "@/lib/types/interview";

const STARTER = "def two_sum(nums, target):\n    # Write your solution here\n    pass\n";
const SOLUTION =
  "def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n";

function at(stage: InterviewStage): InterviewSession {
  let s = startInterview(
    createSession({ companyId: "google", questionId: "two-sum", starterCode: STARTER }),
  );
  const ladder: InterviewStage[] = [
    "CLARIFICATION",
    "APPROACH_DISCUSSION",
    "CODING",
    "TESTING",
    "COMPLEXITY_ANALYSIS",
    "WRAP_UP",
  ];
  for (const next of ladder) {
    if (s.stage === stage) break;
    s = transitionStage(s, next);
  }
  return s;
}

const say = (s: InterviewSession, transcript: string, codeSnapshot?: string) =>
  recordCandidateTurn(s, { transcript, codeSnapshot });

describe("hasRealCode", () => {
  it("does not count the generated scaffold", () => {
    expect(hasRealCode(STARTER)).toBe(false);
    expect(hasRealCode("")).toBe(false);
    expect(hasRealCode("def f(a):\n    pass\n")).toBe(false);
    // Comments and imports alone are not an implementation.
    expect(hasRealCode("# thinking\nfrom typing import List\ndef f(a):\n    pass")).toBe(
      false,
    );
  });

  it("counts a real body line", () => {
    expect(hasRealCode(SOLUTION)).toBe(true);
    expect(hasRealCode("def f(a):\n    return a\n")).toBe(true);
  });
});

describe("candidateTurnsInStage", () => {
  it("counts only turns taken in the given stage", () => {
    let s = at("CODING");
    s = say(s, "one");
    s = say(s, "two");
    expect(candidateTurnsInStage(s)).toBe(2);
    s = transitionStage(s, "TESTING");
    expect(candidateTurnsInStage(s)).toBe(0);
    expect(candidateTurnsInStage(s, "CODING")).toBe(2);
  });
});

describe("stageAdvanceBlockers", () => {
  it("leaves the early stages to the existing hold", () => {
    expect(stageAdvanceBlockers(at("INTRO"))).toEqual([]);
    expect(stageAdvanceBlockers(at("CLARIFICATION"))).toEqual([]);
  });

  it("holds APPROACH_DISCUSSION until an approach is described", () => {
    const s = at("APPROACH_DISCUSSION");
    expect(canAdvanceStage(s)).toBe(false);
    expect(stageAdvanceBlockers(s).join()).toMatch(/approach/i);
  });

  /** The reported failure: one implementing turn, then straight to a dry run. */
  it("holds CODING on an empty editor and on a single turn", () => {
    let s = at("CODING");
    expect(stageAdvanceBlockers(s).join()).toMatch(/no candidate-written code/i);

    s = updateCode(s, SOLUTION);
    s = say(s, "Writing the loop.", SOLUTION);
    expect(canAdvanceStage(s)).toBe(false);
    expect(stageAdvanceBlockers(s).join()).toMatch(/single|one candidate turn/i);

    s = say(s, "That handles duplicates too.", SOLUTION);
    expect(canAdvanceStage(s)).toBe(true);
  });

  it("holds TESTING until the solution is run or traced", () => {
    let s = at("TESTING");
    expect(canAdvanceStage(s)).toBe(false);
    s = recordExecutionRun(s, {
      status: "success",
      stdout: "[0, 1]",
      exitCode: 0,
      ranAt: Date.now(),
      provider: "pyodide",
    });
    expect(hasExecutedCode(s)).toBe(true);
    expect(canAdvanceStage(s)).toBe(true);
  });

  it("lets a verbal walkthrough substitute for clicking Run", () => {
    let s = at("TESTING");
    for (const t of ["On [3,3] I get 0 and 1.", "Empty input returns nothing.", "Negatives work."]) {
      s = say(s, t);
    }
    expect(hasExecutedCode(s)).toBe(false);
    expect(canAdvanceStage(s)).toBe(true);
  });

  it("holds COMPLEXITY_ANALYSIS until costs are given", () => {
    let s = at("COMPLEXITY_ANALYSIS");
    expect(canAdvanceStage(s)).toBe(false);
    s = say(s, "Time is O(n), space is O(n) for the map.");
    expect(hasDiscussedComplexity(s)).toBe(true);
    expect(canAdvanceStage(s)).toBe(true);
  });

  /**
   * The claim detector misses ordinary phrasings, so readiness reads the
   * transcript directly rather than depending on it alone.
   */
  it.each([
    "O(n) time and O(n) space",
    "time is O(n), space is O(n)",
    "it's linear in the input",
    "n log n because of the sort",
    "the complexity is quadratic",
  ])("recognizes complexity phrased as %j", (phrase) => {
    const s = say(at("COMPLEXITY_ANALYSIS"), phrase);
    expect(hasDiscussedComplexity(s)).toBe(true);
  });

  it("never blocks WRAP_UP", () => {
    expect(stageAdvanceBlockers(at("WRAP_UP"))).toEqual([]);
  });
});
