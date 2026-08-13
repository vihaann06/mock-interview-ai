import { describe, expect, it } from "vitest";
import {
  canProbeInactivity,
  hasSpeakableInterviewerMessage,
  reduceVoiceConversation,
  shouldBargeIn,
} from "./state-machine";

describe("reduceVoiceConversation", () => {
  it("barge-in: StartOfTurn during INTERVIEWER_SPEAKING → CANDIDATE_SPEAKING", () => {
    const result = reduceVoiceConversation("INTERVIEWER_SPEAKING", {
      type: "START_OF_TURN",
    });
    expect(result).toEqual({ state: "CANDIDATE_SPEAKING", bargeIn: true });
    expect(shouldBargeIn("INTERVIEWER_SPEAKING")).toBe(true);
  });

  it("EndOfTurn → PROCESSING_TURN from CANDIDATE_SPEAKING", () => {
    const result = reduceVoiceConversation("CANDIDATE_SPEAKING", {
      type: "END_OF_TURN",
    });
    expect(result.state).toBe("PROCESSING_TURN");
  });

  it("WAIT returns to LISTENING without TTS path", () => {
    const afterWait = reduceVoiceConversation("PROCESSING_TURN", {
      type: "INTERVIEWER_WAIT",
    });
    expect(afterWait.state).toBe("LISTENING");
  });

  it("message → INTERVIEWER_SPEAKING → TTS_DONE → LISTENING", () => {
    const speaking = reduceVoiceConversation("PROCESSING_TURN", {
      type: "INTERVIEWER_MESSAGE",
    });
    expect(speaking.state).toBe("INTERVIEWER_SPEAKING");
    const done = reduceVoiceConversation(speaking.state, { type: "TTS_DONE" });
    expect(done.state).toBe("LISTENING");
  });

  it("ignores EndOfTurn while PROCESSING_TURN", () => {
    const result = reduceVoiceConversation("PROCESSING_TURN", {
      type: "END_OF_TURN",
    });
    expect(result.state).toBe("PROCESSING_TURN");
  });
});

describe("canProbeInactivity", () => {
  it("allows probe only when listening/idle", () => {
    expect(canProbeInactivity("LISTENING")).toBe(true);
    expect(canProbeInactivity("IDLE")).toBe(true);
    expect(canProbeInactivity("PROCESSING_TURN")).toBe(false);
    expect(canProbeInactivity("INTERVIEWER_SPEAKING")).toBe(false);
    expect(canProbeInactivity("CANDIDATE_SPEAKING")).toBe(false);
  });
});

describe("hasSpeakableInterviewerMessage", () => {
  it("treats WAIT and blank as non-speakable", () => {
    expect(hasSpeakableInterviewerMessage("WAIT", "anything")).toBe(false);
    expect(hasSpeakableInterviewerMessage("PROBE", "  ")).toBe(false);
    expect(hasSpeakableInterviewerMessage("PROBE", "Hello")).toBe(true);
  });
});
