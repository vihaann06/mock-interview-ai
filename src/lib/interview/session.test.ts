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
  recordCandidateTurn,
  recordInterviewerTurn,
  recordExecutionRun,
  touchCodeActivity,
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
    expect(created.latestExecution).toBeNull();
    expect(created.lastCandidateTurnAt).toBeNull();
    expect(created.lastCodeActivityAt).toBeNull();
    expect(created.lastExecutionAt).toBeNull();

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
    expect(s.events.filter((e) => e.type === "candidate_turn")).toHaveLength(1);
    expect(s.events.filter((e) => e.type === "candidate_message")).toHaveLength(0);
    expect(s.events.filter((e) => e.type === "interviewer_turn")).toHaveLength(1);

    s = moveForward(s);
    expect(s.stage).toBe("CLARIFICATION");
    expect(() => transitionStage(s, "CODING")).toThrow();
    s = transitionStage(s, "APPROACH_DISCUSSION");
    expect(s.stage).toBe("APPROACH_DISCUSSION");
  });
});

describe("candidate_turn", () => {
  it("records one candidate_turn with metadata and no candidate_message", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "def f():\n  pass\n",
      }),
    );
    const snapshot = "def f():\n  return 1\n";
    s = recordCandidateTurn(s, {
      transcript: "I'll start with a map.",
      codeSnapshot: snapshot,
    });

    expect(s.code).toBe(snapshot);
    expect(s.lastCandidateTurnAt).toBeGreaterThan(0);
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.role).toBe("candidate");
    expect(s.messages[0]?.content).toBe("I'll start with a map.");

    const turns = s.events.filter((e) => e.type === "candidate_turn");
    expect(turns).toHaveLength(1);
    expect(s.events.some((e) => e.type === "candidate_message")).toBe(false);
    expect(turns[0]?.metadata?.codeSnapshot).toBe(snapshot);
    expect(turns[0]?.metadata?.stage).toBe("INTRO");
    expect(typeof turns[0]?.metadata?.elapsedSeconds).toBe("number");
    expect(turns[0]?.metadata?.latestExecution).toBeNull();
  });
});

describe("interviewer_turn WAIT", () => {
  it("adds no chat bubble for WAIT but may log interviewer_turn", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "",
      }),
    );
    const beforeMessages = s.messages.length;
    s = recordInterviewerTurn(s, "", "WAIT");
    expect(s.messages).toHaveLength(beforeMessages);
    expect(s.messages.every((m) => m.role !== "interviewer")).toBe(true);

    const waits = s.events.filter(
      (e) => e.type === "interviewer_turn" && e.metadata?.action === "WAIT",
    );
    expect(waits).toHaveLength(1);
    expect(waits[0]?.content).toBe("");
  });

  it("appends a bubble for non-WAIT actions", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "",
      }),
    );
    s = recordInterviewerTurn(s, "Tell me more.", "PROBE");
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.role).toBe("interviewer");
    expect(s.messages[0]?.action).toBe("PROBE");
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

describe("code activity — no code_changed flood", () => {
  it("touchCodeActivity / updateCode update clocks without code_changed", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "x",
      }),
    );
    s = updateCode(s, "y");
    expect(s.code).toBe("y");
    expect(s.lastCodeActivityAt).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === "code_changed")).toBe(false);
    expect(s.events.some((e) => e.type === "code_snapshot")).toBe(false);

    const before = s.events.length;
    s = touchCodeActivity(s, "a".repeat(40));
    expect(s.events.length).toBe(before);
    expect(s.events.some((e) => e.type === "code_changed")).toBe(false);

    s = snapshotCode(s);
    expect(s.events.length).toBe(before + 1);
    expect(s.events.at(-1)?.type).toBe("code_snapshot");
  });
});

describe("execution_run", () => {
  it("sets latestExecution and emits execution_run", () => {
    let s = startInterview(
      createSession({
        companyId: "meta",
        questionId: "two-sum",
        starterCode: "",
      }),
    );
    const result = {
      status: "success" as const,
      stdout: "ok\n",
      exitCode: 0,
      ranAt: Date.now(),
      provider: "piston",
    };
    s = recordExecutionRun(s, result);
    expect(s.latestExecution).toEqual(result);
    expect(s.lastExecutionAt).toBe(result.ranAt);

    const runs = s.events.filter((e) => e.type === "execution_run");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.metadata?.execution).toEqual(result);
  });
});
