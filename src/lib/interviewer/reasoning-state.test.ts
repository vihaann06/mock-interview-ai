import { describe, expect, it } from "vitest";
import type { AskedQuestion, CandidateReasoningState } from "@/lib/types/interview";
import {
  emptyReasoningState,
  intentKeyForQuestion,
  isSemanticallyDuplicateQuestion,
  nextEscalationProbe,
  primaryUnresolvedConcern,
  updateCandidateReasoningState,
} from "./reasoning-state";

function baseInput(
  partial: Partial<Parameters<typeof updateCandidateReasoningState>[1]> & {
    candidateMessage: string;
  },
): Parameters<typeof updateCandidateReasoningState>[1] {
  return {
    transcript: [],
    code: "",
    question: {},
    stage: "APPROACH_DISCUSSION",
    ...partial,
  };
}

describe("intentKeyForQuestion / isSemanticallyDuplicateQuestion", () => {
  it("treats curr-update wording variants as the same intent", () => {
    const a = intentKeyForQuestion("How do you update curr?");
    const b = intentKeyForQuestion(
      "Can you explain your curr update logic?",
    );
    const c = intentKeyForQuestion(
      "You mentioned sorting. How does curr change after an overlap?",
    );

    expect(a).toContain("update");
    expect(a).toContain("curr");
    expect(b).toContain("update");
    expect(b).toContain("curr");

    const asked: AskedQuestion[] = [
      {
        id: "q1",
        intentKey: a,
        text: "How do you update curr?",
        topic: "update_logic",
        askedAt: 1,
        resolved: false,
      },
    ];

    expect(isSemanticallyDuplicateQuestion("How do you update curr?", asked)).toBe(
      true,
    );
    expect(
      isSemanticallyDuplicateQuestion(
        "Can you explain your curr update logic?",
        asked,
      ),
    ).toBe(true);
    expect(
      isSemanticallyDuplicateQuestion(
        "I see you're merging. How does curr change after an overlap?",
        asked,
      ),
    ).toBe(true);
    expect(c.includes("curr") || c.includes("update")).toBe(true);
  });

  it("strips you-mentioned / i-see fillers from intent keys", () => {
    const raw = intentKeyForQuestion(
      "You mentioned sorting by end times. Why does that ordering work?",
    );
    const clean = intentKeyForQuestion("Why does that ordering work?");
    expect(raw).not.toContain("mentioned");
    expect(raw.split("|")).toEqual(expect.arrayContaining(clean.split("|").slice(0, 2)));
  });
});

describe("updateCandidateReasoningState — concerns & escalation", () => {
  const sortingConcern = {
    id: "sorting-invariant",
    topic: "ordering",
    incorrectPatterns: ["sort by end", "sorting by end"],
    probeExamples: [
      "Why does sorting by end time guarantee adjacent merges are enough?",
      "What property does end-time ordering give you on a left-to-right scan?",
    ],
    counterexamples: ["[1,10], [2,3], [4,5]"],
  };

  it("opens a concern when incorrectPatterns match speech", () => {
    const state = updateCandidateReasoningState(
      null,
      baseInput({
        candidateMessage: "I think sorting by end time is the right approach here.",
        question: { interviewerConcerns: [sortingConcern] },
      }),
    );

    expect(state.unresolvedConcerns.some((c) => c.status === "unresolved")).toBe(
      true,
    );
    const concern = state.unresolvedConcerns.find(
      (c) => c.templateId === "sorting-invariant",
    );
    expect(concern).toBeTruthy();
    expect(concern!.topic).toBe("ordering");
    expect(concern!.attemptsToProbe).toBe(0);
  });

  it("escalates when the same unresolved concern reappears", () => {
    let state = updateCandidateReasoningState(
      null,
      baseInput({
        candidateMessage: "I'll go with sorting by end.",
        question: { interviewerConcerns: [sortingConcern] },
      }),
    );

    state = updateCandidateReasoningState(
      state,
      baseInput({
        candidateMessage: "Still sorting by end time — that should be fine.",
        question: { interviewerConcerns: [sortingConcern] },
        lastInterviewerMessage: {
          action: "PROBE",
          message: "Why does sorting by end time guarantee correctness?",
        },
      }),
    );

    const concern = primaryUnresolvedConcern(state);
    expect(concern).toBeTruthy();
    expect(concern!.attemptsToProbe).toBeGreaterThanOrEqual(1);
    expect(concern!.escalationLevel).toBeGreaterThanOrEqual(1);

    state = updateCandidateReasoningState(
      state,
      baseInput({
        candidateMessage: "Sorting by end still feels correct to me.",
        question: { interviewerConcerns: [sortingConcern] },
        lastInterviewerMessage: {
          action: "PROBE",
          message: "Can you walk through a small example with that ordering?",
        },
      }),
    );

    const again = primaryUnresolvedConcern(state)!;
    expect(again.attemptsToProbe).toBeGreaterThan(concern!.attemptsToProbe);
    expect(again.escalationLevel).toBeGreaterThanOrEqual(concern!.escalationLevel);

    const probe = nextEscalationProbe(state, {
      interviewerConcerns: [sortingConcern],
    });
    expect(probe).toBeTruthy();
    expect(probe!.level).toBeGreaterThanOrEqual(1);
    expect(probe!.suggestion.length).toBeGreaterThan(0);
  });
});

describe("approach supersession", () => {
  it("supersedes start-time approach when candidate switches to end-time", () => {
    let state = updateCandidateReasoningState(
      null,
      baseInput({
        candidateMessage: "I'll sort the intervals by start time first.",
      }),
    );

    expect(state.approaches.some((a) => a.active && a.tags.includes("sort-by-start"))).toBe(
      true,
    );

    state = updateCandidateReasoningState(
      state,
      baseInput({
        candidateMessage: "Actually, sorting by end time might be better.",
      }),
    );

    const start = state.approaches.find((a) => a.tags.includes("sort-by-start"));
    const end = state.approaches.find((a) => a.tags.includes("sort-by-end") && a.active);
    expect(start?.active).toBe(false);
    expect(end).toBeTruthy();
  });
});

describe("code vs speech mismatch", () => {
  it("opens CODE_SPEECH_MISMATCH for O(n) claim with nested loops", () => {
    const code = `
def solve(intervals):
    for i in range(len(intervals)):
        for j in range(i + 1, len(intervals)):
            if intervals[i][1] >= intervals[j][0]:
                pass
    return intervals
`;
    const state = updateCandidateReasoningState(
      null,
      baseInput({
        candidateMessage: "This is O(n) because I only scan once.",
        code,
        stage: "CODING",
      }),
    );

    const mismatch = state.unresolvedConcerns.find(
      (c) => c.type === "CODE_SPEECH_MISMATCH" && c.status === "unresolved",
    );
    expect(mismatch).toBeTruthy();
    expect(mismatch!.topic).toBe("complexity");
  });
});

describe("resolved topics prevent re-asking", () => {
  it("marks update_logic resolved after a substantial explanation and flags asked Q resolved", () => {
    let state: CandidateReasoningState = emptyReasoningState();
    state = updateCandidateReasoningState(
      state,
      baseInput({
        candidateMessage: "I update curr when they overlap.",
        lastInterviewerMessage: {
          action: "PROBE",
          message: "How do you update curr?",
        },
      }),
    );

    expect(state.questionsAlreadyAsked.length).toBeGreaterThanOrEqual(1);
    expect(
      isSemanticallyDuplicateQuestion(
        "Can you explain your curr update logic?",
        state.questionsAlreadyAsked,
      ),
    ).toBe(true);

    state = updateCandidateReasoningState(
      state,
      baseInput({
        candidateMessage:
          "When they overlap I update curr by taking min of the starts and max of the ends because that preserves the merged coverage, then I move to the next interval.",
        code: "curr = [min(curr[0], nxt[0]), max(curr[1], nxt[1])]",
      }),
    );

    expect(state.resolvedTopics).toContain("update_logic");
    const asked = state.questionsAlreadyAsked.filter((q) => q.topic === "update_logic");
    expect(asked.every((q) => q.resolved)).toBe(true);

    // Duplicate detection still true — resolved topic must not be re-asked
    expect(
      isSemanticallyDuplicateQuestion("How does curr change after an overlap?", asked),
    ).toBe(true);
  });
});

describe("emptyReasoningState / primaryUnresolvedConcern", () => {
  it("starts empty and returns null when no concerns", () => {
    const empty = emptyReasoningState();
    expect(empty.claims).toEqual([]);
    expect(empty.unresolvedConcerns).toEqual([]);
    expect(primaryUnresolvedConcern(empty)).toBeNull();
  });
});
