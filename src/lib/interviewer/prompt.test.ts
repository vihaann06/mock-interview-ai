import { describe, expect, it } from "vitest";
import { buildInterviewerContext } from "./prompt";
import type { InterviewerContextInput } from "./types";

const question: InterviewerContextInput["question"] = {
  id: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",
  statement: "Find two indices that sum to target.",
  constraints: ["Exactly one valid answer exists"],
  clarifications: ["Return indices, not values."],
  expectedApproaches: ["Hash map one-pass"],
  commonMistakes: ["Reusing the same index"],
  edgeCases: ["[3, 3], target 6"],
  hintLadder: [{ level: 1, text: "What complementary value completes the target?" }],
  followups: ["What if the input is a stream?"],
  expectedComplexity: { time: "O(n)", space: "O(n)" },
  rubricNotes: ["Strong: reaches hash-map insight"],
};

const baseInput: InterviewerContextInput = {
  question,
  stage: "INTRO",
  transcript: [],
  hintsUsed: 0,
  currentCode: "def two_sum():\n    pass\n",
};

describe("buildInterviewerContext", () => {
  it("omits later-stage script fields on the opening turn", () => {
    const payload = JSON.parse(
      buildInterviewerContext({ ...baseInput, isOpeningTurn: true }),
    ) as {
      isOpeningTurn?: boolean;
      instructions: string;
      policyNotes: { openingTurn?: string };
      question: Record<string, unknown>;
    };

    expect(payload.isOpeningTurn).toBe(true);
    expect(payload.instructions).toMatch(/ASK_CLARIFICATION/);
    expect(payload.instructions).toMatch(/suggestedStage: null/);
    expect(payload.policyNotes.openingTurn).toMatch(/OPENING TURN/);
    expect(payload.question.statement).toBe(question.statement);
    expect(payload.question.constraints).toEqual(question.constraints);
    expect(payload.question.clarifications).toEqual(question.clarifications);
    expect(payload.question.edgeCases).toEqual(question.edgeCases);
    expect(payload.question).not.toHaveProperty("expectedApproaches");
    expect(payload.question).not.toHaveProperty("commonMistakes");
    expect(payload.question).not.toHaveProperty("rubricNotes");
    expect(payload.question).not.toHaveProperty("hintLadderVisible");
    expect(payload.question).not.toHaveProperty("followups");
    expect(payload.question).not.toHaveProperty("expectedComplexity");
  });

  it("keeps evaluation notes after the opening, with early-stage guardrails", () => {
    const payload = JSON.parse(
      buildInterviewerContext({
        ...baseInput,
        stage: "CLARIFICATION",
        isOpeningTurn: false,
      }),
    ) as {
      isOpeningTurn?: boolean;
      instructions: string;
      policyNotes: { earlyStages?: string };
      question: Record<string, unknown>;
    };

    expect(payload.isOpeningTurn).toBeUndefined();
    expect(payload.question.expectedApproaches).toEqual(question.expectedApproaches);
    expect(payload.question.hintLadderVisible).toBeDefined();
    expect(payload.policyNotes.earlyStages).toMatch(/Do NOT steer/);
    expect(payload.instructions).toMatch(/invite more questions/);
  });

  it("injects a compact reasoningState summary when present", () => {
    const payload = JSON.parse(
      buildInterviewerContext({
        ...baseInput,
        stage: "APPROACH_DISCUSSION",
        reasoningState: {
          claims: [
            {
              id: "c1",
              statement: "This is O(n)",
              topic: "complexity",
              correctness: "uncertain",
              status: "open",
              firstObservedAt: 1,
              lastObservedAt: 2,
            },
            {
              id: "c2",
              statement: "Sort first",
              topic: "ordering",
              correctness: "likely-correct",
              status: "resolved",
              firstObservedAt: 1,
              lastObservedAt: 1,
            },
          ],
          approaches: [
            {
              id: "a1",
              summary: "Sort then two pointer",
              tags: ["sort", "two-pointer"],
              active: true,
              firstObservedAt: 1,
              lastObservedAt: 2,
            },
            {
              id: "a2",
              summary: "Brute force",
              tags: ["brute"],
              active: false,
              firstObservedAt: 1,
              lastObservedAt: 1,
            },
          ],
          resolvedTopics: ["ordering"],
          unresolvedConcerns: [
            {
              id: "u1",
              type: "COMPLEXITY",
              topic: "complexity",
              summary: "Claimed O(n) with nested loops",
              severity: "important",
              status: "unresolved",
              attemptsToProbe: 1,
              escalationLevel: 1,
              firstObservedAt: 1,
            },
          ],
          questionsAlreadyAsked: [
            {
              id: "q1",
              intentKey: "complexity-justify",
              text: "Why O(n)?",
              topic: "complexity",
              askedAt: 1,
              resolved: false,
            },
          ],
          hintsGiven: [],
          updatedAt: 3,
        },
      }),
    ) as {
      reasoningState: {
        activeApproaches: Array<{ id: string }>;
        openClaims: Array<{ id: string }>;
        unresolvedConcerns: Array<{
          id: string;
          topic: string;
          summary: string;
          attemptsToProbe: number;
          escalationLevel: number;
        }>;
        resolvedTopics: string[];
        recentAskedIntents: Array<{ intentKey: string; resolved: boolean }>;
        recommendedFocus: { kind: string; id: string } | string;
      };
      policyNotes: { memory?: string; style?: string };
    };

    expect(payload.reasoningState.activeApproaches.map((a) => a.id)).toEqual(["a1"]);
    expect(payload.reasoningState.openClaims.map((c) => c.id)).toEqual(["c1"]);
    expect(payload.reasoningState.unresolvedConcerns).toEqual([
      {
        id: "u1",
        topic: "complexity",
        summary: "Claimed O(n) with nested loops",
        attemptsToProbe: 1,
        escalationLevel: 1,
      },
    ]);
    expect(payload.reasoningState.resolvedTopics).toEqual(["ordering"]);
    expect(payload.reasoningState.recentAskedIntents).toEqual([
      { intentKey: "complexity-justify", resolved: false },
    ]);
    expect(payload.reasoningState.recommendedFocus).toMatchObject({
      kind: "unresolved-concern",
      id: "u1",
    });
    expect(payload.policyNotes.memory).toMatch(/reasoningState/);
    expect(payload.policyNotes.style).toMatch(/1 concise sentence/);
  });

  it("recommends allow-coding when there are no open concerns", () => {
    const payload = JSON.parse(
      buildInterviewerContext({
        ...baseInput,
        stage: "CODING",
        reasoningState: {
          claims: [],
          approaches: [],
          resolvedTopics: ["complexity"],
          unresolvedConcerns: [],
          questionsAlreadyAsked: [],
          hintsGiven: [],
          updatedAt: 1,
        },
      }),
    ) as { reasoningState: { recommendedFocus: string } };

    expect(payload.reasoningState.recommendedFocus).toBe("allow-coding");
  });
});
