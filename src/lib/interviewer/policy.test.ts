import { describe, expect, it } from "vitest";
import type {
  AskedQuestion,
  CandidateReasoningState,
  InterviewConcern,
  InterviewerResponse,
} from "@/lib/types/interview";
import {
  assertActionAllowed,
  candidateNeedsSpokenReply,
  ensureSpeakableMessage,
  enforceInterviewerPolicy,
  intentKeyForQuestion,
  isSilenceCheckIn,
  isSpeakableInterviewerResponse,
  normalizeWaitMessage,
  sanitizeAction,
  stripFillerPrefixes,
  stripSolutionLeaks,
} from "./policy";
import { INACTIVITY_PROBE_MESSAGE } from "@/lib/voice/orchestration/constants";
import type { ActionPolicyContext } from "./types";

function ctx(
  partial: Partial<ActionPolicyContext> & Pick<ActionPolicyContext, "stage">,
): ActionPolicyContext {
  return {
    hintsUsed: 0,
    candidateMessage: "",
    ...partial,
  };
}

function reply(
  action: InterviewerResponse["action"],
  extras: Partial<InterviewerResponse> = {},
): InterviewerResponse {
  return {
    action,
    message: extras.message ?? "Got it — tell me more.",
    suggestedStage: extras.suggestedStage ?? null,
  };
}

function concern(
  partial: Partial<InterviewConcern> & Pick<InterviewConcern, "id" | "summary">,
): InterviewConcern {
  return {
    type: "EDGE_CASE",
    topic: "edge_cases",
    relatedClaimId: undefined,
    severity: "important",
    status: "unresolved",
    attemptsToProbe: 0,
    escalationLevel: 0,
    firstObservedAt: 1,
    ...partial,
  };
}

function asked(
  partial: Partial<AskedQuestion> & Pick<AskedQuestion, "id" | "text" | "intentKey">,
): AskedQuestion {
  return {
    topic: "edge_cases",
    askedAt: 1,
    resolved: false,
    ...partial,
  };
}

function reasoning(
  partial: Partial<CandidateReasoningState> = {},
): CandidateReasoningState {
  return {
    claims: [],
    approaches: [],
    resolvedTopics: [],
    unresolvedConcerns: [],
    questionsAlreadyAsked: [],
    hintsGiven: [],
    updatedAt: 1,
    ...partial,
  };
}

describe("hint ladder", () => {
  it("allows the next hint level only", () => {
    expect(() =>
      assertActionAllowed("GIVE_HINT_1", ctx({ stage: "CODING" })),
    ).not.toThrow();
    expect(() =>
      assertActionAllowed("GIVE_HINT_2", ctx({ stage: "CODING", hintsUsed: 1 })),
    ).not.toThrow();
    expect(() =>
      assertActionAllowed("GIVE_HINT_2", ctx({ stage: "CODING" })),
    ).toThrow(/hintsUsed=0/);
  });

  it("downgrades illegal hint levels to PROBE", () => {
    expect(sanitizeAction("GIVE_HINT_3", ctx({ stage: "CODING" }))).toBe("PROBE");
    expect(sanitizeAction("PROBE", ctx({ stage: "CODING" }))).toBe("PROBE");
  });
});

describe("stripSolutionLeaks / normalizeWaitMessage", () => {
  it("replaces solution dumps", () => {
    expect(stripSolutionLeaks("Here's the full solution: use two pointers.")).toBe(
      "Walk me through your current approach — what would you try next?",
    );
  });

  it("collapses whitespace-only WAIT messages except '' and ' '", () => {
    expect(normalizeWaitMessage("WAIT", "")).toBe("");
    expect(normalizeWaitMessage("WAIT", " ")).toBe(" ");
    expect(normalizeWaitMessage("WAIT", "   \n")).toBe("");
    expect(normalizeWaitMessage("PROBE", "   ")).toBe("   ");
  });
});

describe("enforceInterviewerPolicy — early stages", () => {
  it("converts MOVE_FORWARD without readiness in CLARIFICATION", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "APPROACH_DISCUSSION" }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Can there be duplicates?",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
    expect(out.suggestedStage).toBeNull();
  });

  it("converts MOVE_FORWARD without a question to ACKNOWLEDGE", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "APPROACH_DISCUSSION" }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Okay, thanks.",
      }),
    );
    expect(out.action).toBe("ACKNOWLEDGE");
    expect(out.suggestedStage).toBeNull();
  });

  it("keeps MOVE_FORWARD when the candidate cues readiness", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "APPROACH_DISCUSSION" }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "I'll start with a hash map.",
      }),
    );
    expect(out.action).toBe("MOVE_FORWARD");
    expect(out.suggestedStage).toBe("APPROACH_DISCUSSION");
  });

  it("does not treat a clarifying question as readiness just because they said they understand", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "APPROACH_DISCUSSION" }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "I think I understand. Can there be duplicates?",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
    expect(out.suggestedStage).toBeNull();
  });

  it("does not jump past CLARIFICATION from INTRO", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "APPROACH_DISCUSSION" }),
      ctx({
        stage: "INTRO",
        candidateMessage: "Can there be duplicates?",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
    expect(out.suggestedStage).toBe("CLARIFICATION");
  });

  it("keeps MOVE_FORWARD in INTRO when they are ready", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "CODING" }),
      ctx({
        stage: "INTRO",
        candidateMessage: "I think I understand — let me start.",
      }),
    );
    expect(out.action).toBe("MOVE_FORWARD");
    expect(out.suggestedStage).toBe("CLARIFICATION");
  });

  it("downgrades REQUEST_COMPLEXITY as too early", () => {
    const out = enforceInterviewerPolicy(
      reply("REQUEST_COMPLEXITY"),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "What about empty arrays?",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
  });

  it("converts unsolicited hints to PROBE", () => {
    const out = enforceInterviewerPolicy(
      reply("GIVE_HINT_1"),
      ctx({
        stage: "INTRO",
        candidateMessage: "Hi, can the input be empty?",
      }),
    );
    expect(out.action).toBe("PROBE");
  });

  it("keeps a legal hint when the candidate asked for one", () => {
    const out = enforceInterviewerPolicy(
      reply("GIVE_HINT_1"),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Can you give me a hint?",
      }),
    );
    expect(out.action).toBe("GIVE_HINT_1");
  });

  it("downgrades CHALLENGE_ASSUMPTION in INTRO", () => {
    const out = enforceInterviewerPolicy(
      reply("CHALLENGE_ASSUMPTION"),
      ctx({
        stage: "INTRO",
        candidateMessage: "I assume the array is sorted.",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
  });

  it("allows CHALLENGE_ASSUMPTION in CLARIFICATION", () => {
    const out = enforceInterviewerPolicy(
      reply("CHALLENGE_ASSUMPTION"),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "I assume the array is sorted.",
      }),
    );
    expect(out.action).toBe("CHALLENGE_ASSUMPTION");
  });

  it("allows REQUEST_EXPLANATION only while they are explaining", () => {
    const explaining = enforceInterviewerPolicy(
      reply("REQUEST_EXPLANATION"),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "I'm thinking of a map because lookups are O(1).",
      }),
    );
    expect(explaining.action).toBe("REQUEST_EXPLANATION");

    const notExplaining = enforceInterviewerPolicy(
      reply("REQUEST_EXPLANATION"),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Can there be duplicates?",
      }),
    );
    expect(notExplaining.action).toBe("ASK_CLARIFICATION");
  });

  it("leaves later-stage actions alone", () => {
    const out = enforceInterviewerPolicy(
      reply("MOVE_FORWARD", { suggestedStage: "TESTING" }),
      ctx({
        stage: "CODING",
        candidateMessage: "I finished the implementation.",
      }),
    );
    expect(out.action).toBe("MOVE_FORWARD");
    expect(out.suggestedStage).toBe("TESTING");
  });
});

describe("enforceInterviewerPolicy — adaptive probing", () => {
  it("sanitizes duplicate questions into a different probe focus", () => {
    const priorText = "What happens with duplicate values?";
    const prior = asked({
      id: "q1",
      text: priorText,
      intentKey: intentKeyForQuestion(priorText),
      topic: "edge_cases",
      resolved: false,
    });
    const out = enforceInterviewerPolicy(
      reply("PROBE", {
        message: "What happens with duplicate values in the array?",
      }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "I'll use a hash map.",
        reasoningState: reasoning({
          questionsAlreadyAsked: [prior],
          unresolvedConcerns: [
            concern({
              id: "c1",
              summary: "Ignores duplicates",
              attemptsToProbe: 2,
              escalationLevel: 2,
            }),
          ],
        }),
      }),
    );
    expect(out.action).toBe("REQUEST_EXPLANATION");
    expect(out.message).toBe(
      "Walk through your approach on a small example that stresses your assumption.",
    );
  });

  it("strips leading You mentioned / I see you're fillers", () => {
    expect(stripFillerPrefixes("You mentioned that the array is sorted.")).toBe(
      "The array is sorted.",
    );
    expect(stripFillerPrefixes("I see you're using a hash map.")).toBe(
      "Using a hash map.",
    );
    expect(
      stripFillerPrefixes("I see that you're assuming unique keys."),
    ).toBe("Assuming unique keys.");

    const out = enforceInterviewerPolicy(
      reply("PROBE", {
        message: "You mentioned hashing — why that structure?",
      }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "I'm thinking of a hash map.",
      }),
    );
    expect(out.message).not.toMatch(/^You mentioned/i);
    expect(out.message.toLowerCase()).toContain("hash");
  });

  it("blocks ACKNOWLEDGE confirmation when validation-seeking with open concern", () => {
    const out = enforceInterviewerPolicy(
      reply("ACKNOWLEDGE", { message: "Yes, that looks correct." }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "Does this make sense? Is this okay?",
        reasoningState: reasoning({
          unresolvedConcerns: [
            concern({
              id: "c1",
              summary: "Missing empty-input handling",
              severity: "important",
              attemptsToProbe: 1,
            }),
          ],
        }),
      }),
    );
    expect(out.action).not.toBe("ACKNOWLEDGE");
    expect(["PROBE", "CHALLENGE_ASSUMPTION"]).toContain(out.action);
  });

  it("prefers WAIT over PROBE while coding with no important concerns", () => {
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "Why did you choose that loop bound?" }),
      ctx({
        stage: "CODING",
        candidateMessage: "Okay, writing the loop now.",
        reasoningState: reasoning({
          unresolvedConcerns: [
            concern({
              id: "c-minor",
              summary: "Naming nit",
              severity: "minor",
            }),
          ],
        }),
      }),
    );
    expect(out.action).toBe("WAIT");
    expect(out.message).toBe("");
  });

  it("escalates vague duplicates at attempts >= 3 to CHALLENGE_ASSUMPTION", () => {
    const priorText = "Can you explain your assumption about sorted input?";
    const prior = asked({
      id: "q1",
      text: priorText,
      intentKey: intentKeyForQuestion(priorText),
      topic: "ordering",
    });
    const out = enforceInterviewerPolicy(
      reply("PROBE", {
        message: "Can you explain your assumption about the sorted input?",
      }),
      ctx({
        stage: "CODING",
        candidateMessage: "Still coding the merge step.",
        reasoningState: reasoning({
          questionsAlreadyAsked: [prior],
          unresolvedConcerns: [
            concern({
              id: "c1",
              summary: "Assumes sorted input",
              type: "INVARIANT",
              topic: "ordering",
              severity: "critical",
              attemptsToProbe: 3,
              escalationLevel: 3,
            }),
          ],
        }),
      }),
    );
    expect(out.action).toBe("CHALLENGE_ASSUMPTION");
    expect(out.message).toBe(
      "Take another look at that assumption before continuing.",
    );
  });

  it("WAITS on duplicate when there is no open concern", () => {
    const prior = asked({
      id: "q1",
      text: "What is the time complexity?",
      intentKey: intentKeyForQuestion("What is the time complexity?"),
      topic: "complexity",
      resolved: true,
    });
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "What is the time complexity of that?" }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "Hash map gives O(n).",
        reasoningState: reasoning({
          questionsAlreadyAsked: [prior],
          unresolvedConcerns: [],
        }),
      }),
    );
    expect(out.action).toBe("WAIT");
    expect(out.message).toBe("");
  });
});

describe("enforceInterviewerPolicy — dead air (unintended silence)", () => {
  it("never returns a non-WAIT action with an empty message", () => {
    // "You mentioned that" is entirely a filler prefix: stripFillerPrefixes
    // used to reduce it to "", leaving a PROBE that renders no bubble.
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "You mentioned that" }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "I'll use a hash map.",
      }),
    );
    expect(out.action).toBe("PROBE");
    expect(out.message.trim().length).toBeGreaterThan(0);
    expect(isSpeakableInterviewerResponse(out)).toBe(true);
  });

  it("falls back to spoken text when the model sends whitespace-only content", () => {
    const out = enforceInterviewerPolicy(
      reply("ASK_CLARIFICATION", { message: " " }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Can there be duplicates?",
      }),
    );
    expect(out.action).toBe("ASK_CLARIFICATION");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("does not go silent after a direct question flagged as a duplicate", () => {
    const answer = "Yes, assume the array is sorted ascending.";
    const prior = asked({
      id: "q1",
      text: "Should I assume the array is sorted?",
      intentKey: intentKeyForQuestion(answer),
      topic: "ordering",
    });
    const out = enforceInterviewerPolicy(
      reply("ASK_CLARIFICATION", { message: answer }),
      ctx({
        stage: "CLARIFICATION",
        candidateMessage: "Should I assume the array is sorted?",
        reasoningState: reasoning({
          questionsAlreadyAsked: [prior],
          unresolvedConcerns: [],
        }),
      }),
    );
    expect(out.action).not.toBe("WAIT");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("does not go silent when the answer repeats a recent interviewer message", () => {
    const out = enforceInterviewerPolicy(
      reply("ASK_CLARIFICATION", {
        message: "Yes, the array is sorted ascending.",
      }),
      ctx({
        stage: "CODING",
        candidateMessage: "Should I assume the array is sorted?",
        lastInterviewerMessages: [
          {
            content: "Is the array sorted ascending?",
            action: "ASK_CLARIFICATION",
          },
        ],
      }),
    );
    expect(out.action).not.toBe("WAIT");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("does not WAIT while coding when the candidate asked for a hint", () => {
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "What have you tried so far?" }),
      ctx({
        stage: "CODING",
        candidateMessage: "I'm stuck",
        reasoningState: reasoning(),
      }),
    );
    expect(out.action).toBe("PROBE");
    expect(out.message).toBe("What have you tried so far?");
  });

  it("does not WAIT while coding on a validation-seeking turn with no concerns", () => {
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "What does that return on an empty list?" }),
      ctx({
        stage: "CODING",
        candidateMessage: "Am I on the right track",
        reasoningState: reasoning(),
      }),
    );
    expect(out.action).not.toBe("WAIT");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("never silences the long-silence check-in turn", () => {
    expect(isSilenceCheckIn(INACTIVITY_PROBE_MESSAGE)).toBe(true);
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "How's it going — where are you at?" }),
      ctx({
        stage: "CODING",
        candidateMessage: INACTIVITY_PROBE_MESSAGE,
        reasoningState: reasoning(),
      }),
    );
    expect(out.action).not.toBe("WAIT");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("still WAITs on productive coding narration (intended silence)", () => {
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "Why that loop bound?" }),
      ctx({
        stage: "CODING",
        candidateMessage: "Okay, writing the loop now.",
        reasoningState: reasoning(),
      }),
    );
    expect(out.action).toBe("WAIT");
    expect(out.message).toBe("");
  });

  it("still WAITs on a duplicate re-ask with no open concern (intended silence)", () => {
    const prior = asked({
      id: "q1",
      text: "What is the time complexity?",
      intentKey: intentKeyForQuestion("What is the time complexity?"),
      topic: "complexity",
      resolved: true,
    });
    const out = enforceInterviewerPolicy(
      reply("PROBE", { message: "What is the time complexity of that?" }),
      ctx({
        stage: "APPROACH_DISCUSSION",
        candidateMessage: "Hash map gives O(n).",
        reasoningState: reasoning({ questionsAlreadyAsked: [prior] }),
      }),
    );
    expect(out.action).toBe("WAIT");
    expect(out.message).toBe("");
  });

  it("does not silence the welcome/clarify phase on a dedupe rewrite", () => {
    const out = enforceInterviewerPolicy(
      reply("ASK_CLARIFICATION", {
        message: "Any questions about the problem before you start?",
      }),
      ctx({
        stage: "INTRO",
        candidateMessage: "Sounds good, nothing for now.",
        lastInterviewerMessages: [
          {
            content: "Any questions about the problem before you start?",
            action: "ASK_CLARIFICATION",
          },
        ],
        reasoningState: reasoning({ unresolvedConcerns: [] }),
      }),
    );
    expect(out.action).not.toBe("WAIT");
    expect(out.message.trim().length).toBeGreaterThan(0);
  });

  it("keeps a model-issued WAIT silent", () => {
    const out = enforceInterviewerPolicy(
      reply("WAIT", { message: "" }),
      ctx({
        stage: "CODING",
        candidateMessage: "Typing the helper function.",
        reasoningState: reasoning(),
      }),
    );
    expect(out.action).toBe("WAIT");
    expect(out.message).toBe("");
    expect(isSpeakableInterviewerResponse(out)).toBe(true);
  });
});

describe("speakability helpers", () => {
  it("ensureSpeakableMessage backfills every non-WAIT action", () => {
    const actions: InterviewerResponse["action"][] = [
      "ACKNOWLEDGE",
      "PROBE",
      "ASK_CLARIFICATION",
      "CHALLENGE_ASSUMPTION",
      "REQUEST_EXPLANATION",
      "REQUEST_COMPLEXITY",
      "GIVE_HINT_1",
      "GIVE_HINT_2",
      "GIVE_HINT_3",
      "REQUEST_TESTING",
      "MOVE_FORWARD",
    ];
    for (const action of actions) {
      expect(ensureSpeakableMessage(action, "   ").trim().length).toBeGreaterThan(
        0,
      );
    }
    expect(ensureSpeakableMessage("WAIT", "")).toBe("");
    expect(ensureSpeakableMessage("PROBE", "Keep going.")).toBe("Keep going.");
  });

  it("isSpeakableInterviewerResponse allows silence only for WAIT", () => {
    expect(
      isSpeakableInterviewerResponse({ action: "WAIT", message: "" }),
    ).toBe(true);
    expect(
      isSpeakableInterviewerResponse({ action: "PROBE", message: " " }),
    ).toBe(false);
    expect(
      isSpeakableInterviewerResponse({ action: "PROBE", message: "Why?" }),
    ).toBe(true);
  });

  it("candidateNeedsSpokenReply covers questions, hints, validation, check-ins", () => {
    expect(
      candidateNeedsSpokenReply(
        ctx({ stage: "CODING", candidateMessage: "Is it okay to sort first?" }),
      ),
    ).toBe(true);
    expect(
      candidateNeedsSpokenReply(
        ctx({ stage: "CODING", candidateMessage: "Can I get a hint" }),
      ),
    ).toBe(true);
    expect(
      candidateNeedsSpokenReply(
        ctx({ stage: "CODING", candidateMessage: "Is this correct" }),
      ),
    ).toBe(true);
    expect(
      candidateNeedsSpokenReply(
        ctx({ stage: "CODING", candidateMessage: INACTIVITY_PROBE_MESSAGE }),
      ),
    ).toBe(true);
    expect(
      candidateNeedsSpokenReply(
        ctx({ stage: "CODING", candidateMessage: "Writing the loop now." }),
      ),
    ).toBe(false);
  });
});
