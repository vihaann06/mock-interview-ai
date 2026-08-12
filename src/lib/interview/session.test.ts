import { describe, expect, it } from "vitest";
import {
  applyHintFromAction,
  applyHintGiven,
  assertTransition,
  canTransition,
  createSession,
  endInterview,
  getElapsedMs,
  getNextStage,
  isHintActionAllowed,
  isTerminal,
  moveForward,
  requestHint,
  startInterview,
  transitionStage,
  updateCode,
  appendCandidateMessage,
  appendInterviewerMessage,
  snapshotCode,
} from "./index";

describe("stages", () => {
  it("advances one step via getNextStage", () => {
    expect(getNextStage("INTRO")).toBe("CLARIFICATION");
    expect(getNextStage("WRAP_UP")).toBeNull();
  });

  it("allows only forward adjacent transitions", () => {
    expect(canTransition("INTRO", "CLARIFICATION")).toBe(true);
    expect(canTransition("INTRO", "CODING")).toBe(false);
    expect(canTransition("INTRO", "INTRO")).toBe(false);
    expect(isTerminal("WRAP_UP")).toBe(true);
    expect(() => assertTransition("CODING", "WRAP_UP")).toThrow(/Invalid stage/);
  });
});

describe("session lifecycle", () => {
  it("creates, starts, and ends an interview immutably", () => {
    const created = createSession({
      companyId: "meta",
      questionId: "two-sum",
      starterCode: "def two_sum():\n  pass\n",
    });
    expect(created.startedAt).toBe(0);
    expect(created.stage).toBe("INTRO");
    expect(created.events).toHaveLength(0);

    const started = startInterview(created);
    expect(started.startedAt).toBeGreaterThan(0);
    expect(started.events.some((e) => e.type === "interview_started")).toBe(true);
    expect(created.events).toHaveLength(0); // immutable

    const ended = endInterview(started);
    expect(ended.endedAt).not.toBeNull();
    expect(ended.events.some((e) => e.type === "interview_ended")).toBe(true);
    expect(getElapsedMs(ended)).toBeGreaterThanOrEqual(0);
  });

  it("appends messages and stage moves only forward", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "",
      }),
    );
    s = appendCandidateMessage(s, "I'll use a hash map.");
    s = appendInterviewerMessage(s, "What is the time complexity?", "PROBE");
    expect(s.messages).toHaveLength(2);
    expect(s.events.filter((e) => e.type === "candidate_message")).toHaveLength(1);

    s = moveForward(s);
    expect(s.stage).toBe("CLARIFICATION");
    expect(() => transitionStage(s, "CODING")).toThrow();
    s = transitionStage(s, "APPROACH_DISCUSSION");
    expect(s.stage).toBe("APPROACH_DISCUSSION");
  });
});

describe("hints ladder", () => {
  it("enforces sequential hints and GIVE_HINT_n gating", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "",
      }),
    );
    expect(isHintActionAllowed("GIVE_HINT_1", 0)).toBe(true);
    expect(isHintActionAllowed("GIVE_HINT_2", 0)).toBe(false);

    s = requestHint(s);
    expect(s.hintsUsed).toBe(0);
    expect(s.events.some((e) => e.type === "hint_requested")).toBe(true);

    expect(() => applyHintGiven(s, 2)).toThrow(/Hint ladder/);
    s = applyHintGiven(s, 1, "Think about lookups.");
    expect(s.hintsUsed).toBe(1);

    s = applyHintFromAction(s, "GIVE_HINT_2", "Use a map.");
    expect(s.hintsUsed).toBe(2);
    expect(() => applyHintFromAction(s, "GIVE_HINT_1")).toThrow();
    s = applyHintFromAction(s, "GIVE_HINT_3");
    expect(s.hintsUsed).toBe(3);
    expect(() => requestHint(s)).toThrow(/All hints/);
  });
});

describe("code updates", () => {
  it("emits code_changed and substantial snapshots", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "x",
      }),
    );
    s = updateCode(s, "y");
    expect(s.code).toBe("y");
    expect(s.events.some((e) => e.type === "code_changed")).toBe(true);

    const big = "a".repeat(40);
    s = updateCode(s, big);
    expect(s.events.some((e) => e.type === "code_snapshot")).toBe(true);

    const before = s.events.length;
    s = snapshotCode(s);
    expect(s.events.length).toBe(before + 1);
    expect(s.events.at(-1)?.type).toBe("code_snapshot");
  });
});
