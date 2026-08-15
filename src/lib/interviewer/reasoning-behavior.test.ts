/**
 * Adversarial end-to-end simulations across reasoning-state + policy.
 * Pure functions only — no live LLM calls.
 */
import { describe, expect, it } from "vitest";
import { getQuestionById } from "@/lib/data/questions";
import { enforceInterviewerPolicy } from "./policy";
import {
  isSemanticallyDuplicateQuestion,
  updateCandidateReasoningState,
} from "./reasoning-state";
import type { CandidateReasoningState } from "@/lib/types/interview";
import type { ActionPolicyContext } from "./types";

function policyCtx(
  partial: Partial<ActionPolicyContext> & Pick<ActionPolicyContext, "stage">,
): ActionPolicyContext {
  return {
    hintsUsed: 0,
    candidateMessage: "",
    ...partial,
  };
}

function updateInput(
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

describe("adversarial reasoning behavior", () => {
  it("1) detects duplicate curr-update interviewer questions after two explanations", () => {
    let state: CandidateReasoningState = updateCandidateReasoningState(
      null,
      updateInput({
        candidateMessage:
          "When intervals overlap I update curr by extending the end to max(curr.end, next.end).",
        stage: "APPROACH_DISCUSSION",
      }),
    );

    state = updateCandidateReasoningState(
      state,
      updateInput({
        candidateMessage:
          "Again — curr gets updated to the max end whenever the next interval overlaps.",
        lastInterviewerMessage: {
          action: "PROBE",
          message: "How do you update curr?",
        },
      }),
    );

    expect(state.questionsAlreadyAsked.length).toBeGreaterThanOrEqual(1);

    // Second interviewer ask with same intent → semantic duplicate
    expect(
      isSemanticallyDuplicateQuestion(
        "Can you explain your curr update logic again?",
        state.questionsAlreadyAsked,
      ),
    ).toBe(true);

    const duplicateProbe = enforceInterviewerPolicy(
      {
        action: "PROBE",
        message: "Can you explain your curr update logic again?",
        suggestedStage: null,
      },
      policyCtx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage:
          "I already walked through how curr updates on overlap.",
        reasoningState: state,
        lastInterviewerMessages: state.questionsAlreadyAsked.map((q) => ({
          content: q.text,
          action: "PROBE",
        })),
      }),
    );

    // Policy should not keep a soft duplicate probe when no open important concern forces escalation,
    // OR should escalate/WAIT rather than repeat the same soft ask.
    const askedAgain = isSemanticallyDuplicateQuestion(
      duplicateProbe.message,
      state.questionsAlreadyAsked,
    );
    expect(
      duplicateProbe.action === "WAIT" ||
        duplicateProbe.message.length === 0 ||
        !askedAgain ||
        duplicateProbe.action === "CHALLENGE_ASSUMPTION" ||
        duplicateProbe.action === "REQUEST_EXPLANATION",
    ).toBe(true);
  });

  it("2) end-time sort claim opens merge-intervals ordering concern from metadata", () => {
    const question = getQuestionById("merge-intervals");
    expect(question?.interviewerConcerns?.some((c) => c.id === "ordering-invariant")).toBe(
      true,
    );

    const state = updateCandidateReasoningState(
      null,
      updateInput({
        candidateMessage:
          "I'll sort by end time so overlapping intervals are easy to merge.",
        question: question!,
        stage: "APPROACH_DISCUSSION",
      }),
    );

    const open = state.unresolvedConcerns.find(
      (c) => c.status === "unresolved" && c.templateId === "ordering-invariant",
    );
    expect(open).toBeTruthy();
    expect(open!.topic).toBeTruthy();
  });

  it("3) escalation attempts increase when the same concern stays unresolved", () => {
    const question = getQuestionById("merge-intervals")!;
    let state = updateCandidateReasoningState(
      null,
      updateInput({
        candidateMessage: "Sorting by end time is my plan.",
        question,
      }),
    );

    const first = state.unresolvedConcerns.find(
      (c) => c.templateId === "ordering-invariant" && c.status === "unresolved",
    );
    expect(first).toBeTruthy();
    const baselineAttempts = first!.attemptsToProbe;
    const baselineLevel = first!.escalationLevel;

    state = updateCandidateReasoningState(
      state,
      updateInput({
        candidateMessage: "Still going with sorted by end — end_time ordering.",
        question,
        lastInterviewerMessage: {
          action: "PROBE",
          message: "Why does that ordering guarantee adjacent comparisons are enough?",
        },
      }),
    );

    state = updateCandidateReasoningState(
      state,
      updateInput({
        candidateMessage: "End time sort still feels correct to me.",
        question,
        lastInterviewerMessage: {
          action: "PROBE",
          message: "What property must the ordering preserve while you scan?",
        },
      }),
    );

    const escalated = state.unresolvedConcerns.find(
      (c) => c.templateId === "ordering-invariant" && c.status === "unresolved",
    )!;
    expect(escalated.attemptsToProbe).toBeGreaterThan(baselineAttempts);
    expect(escalated.escalationLevel).toBeGreaterThanOrEqual(baselineLevel);
    expect(escalated.escalationLevel).toBeGreaterThanOrEqual(1);
  });

  it("4) O(n) claim with nested for-loops opens complexity / code-speech mismatch", () => {
    const question = getQuestionById("two-sum")!;
    expect(
      question.interviewerConcerns?.some((c) => c.id === "nested-loop-complexity"),
    ).toBe(true);

    const nestedCode = `
def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
`;

    const state = updateCandidateReasoningState(
      null,
      updateInput({
        candidateMessage:
          "This is O(n) because I scan once — the nested loops are still linear.",
        code: nestedCode,
        question,
        stage: "CODING",
      }),
    );

    const mismatch = state.unresolvedConcerns.find(
      (c) =>
        c.status === "unresolved" &&
        (c.type === "CODE_SPEECH_MISMATCH" ||
          c.templateId === "nested-loop-complexity"),
    );
    expect(mismatch).toBeTruthy();
  });

  it("5) policy strips leading 'You mentioned' filler style", () => {
    const out = enforceInterviewerPolicy(
      {
        action: "PROBE",
        message: "You mentioned sorting by start — why that ordering?",
        suggestedStage: null,
      },
      policyCtx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "I sort by start then merge.",
      }),
    );

    expect(out.message).not.toMatch(/^You mentioned/i);
    expect(out.message.toLowerCase()).toMatch(/sort|order/);
  });
});
