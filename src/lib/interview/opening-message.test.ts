import { describe, expect, it } from "vitest";
import { getQuestionById } from "@/lib/data/questions";
import type { Question } from "@/lib/types/question";
import { buildOpeningMessage } from "./opening-message";

function stubQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "stub",
    title: "Stub Problem",
    company: "Google",
    difficulty: "Easy",
    expectedTimeMinutes: 30,
    statement:
      "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
    constraints: [
      "2 ≤ nums.length ≤ 10^4",
      "-10^9 ≤ nums[i] ≤ 10^9",
      "Exactly one valid answer exists",
    ],
    clarifications: [],
    expectedApproaches: [],
    solutions: [],
    commonMistakes: [],
    edgeCases: [],
    hintLadder: [],
    followups: [],
    rubricNotes: [],
    starterCode: "pass",
    expectedComplexity: { time: "O(n)", space: "O(n)" },
    ...overrides,
  };
}

describe("buildOpeningMessage", () => {
  const question = getQuestionById("two-sum")!;
  const opening = buildOpeningMessage(question);

  it("includes a welcome/logistics beat", () => {
    expect(question).toBeDefined();
    expect(opening.toLowerCase()).toMatch(/thanks for jumping on|hey/);
    expect(opening.toLowerCase()).toMatch(/forty-five minutes|one problem/);
    expect(opening.toLowerCase()).toMatch(/think out loud/);
    expect(opening).not.toMatch(/Welcome to the interview/);
    expect(opening).not.toMatch(/company-style coding round/);
  });

  it("includes the problem goal", () => {
    expect(opening).toMatch(/Two Sum/);
    expect(opening).toMatch(/You're given an array of integers and a target/);
    expect(opening.toLowerCase()).toMatch(
      /the indices of the two numbers|add up to (that )?target/,
    );
  });

  it("includes at least one constraint in plain language (not a raw inequality dump)", () => {
    expect(opening).not.toMatch(/2 ≤ nums\.length ≤ 10\^4/);
    expect(opening).not.toMatch(/-10\^9 ≤ nums\[i\]/);
    expect(opening).not.toMatch(/≤/);
    expect(opening).not.toMatch(/10\^4/);
    expect(opening).not.toMatch(/A few constraints to keep in mind:/);
    expect(opening.toLowerCase()).toMatch(
      /ten thousand|values can be negative|exactly one valid pair|same index/,
    );
  });

  it("invites clarifying questions", () => {
    expect(opening.toLowerCase()).toMatch(/clarifying questions/);
    expect(opening.toLowerCase()).toMatch(/on the screen/);
  });

  it("does not ask how they would solve / complexity", () => {
    expect(opening.toLowerCase()).not.toMatch(/how would you solve/);
    expect(opening.toLowerCase()).not.toMatch(/how would you approach/);
    expect(opening.toLowerCase()).not.toMatch(/time complexity|space complexity/);
    expect(opening.toLowerCase()).not.toMatch(/what is the complexity/);
  });

  it("stays TTS-friendly: no markdown or bullet lists", () => {
    expect(opening).not.toMatch(/[*_`#]/);
    expect(opening).not.toMatch(/^\s*[-•]/m);
  });

  it("phrases synthetic inequalities in spoken English", () => {
    const spoken = buildOpeningMessage(stubQuestion());
    expect(spoken).not.toMatch(/≤|10\^4|nums\.length/);
    expect(spoken.toLowerCase()).toMatch(/ten thousand/);
    expect(spoken.toLowerCase()).toMatch(/negative|exactly one/);
  });
});
