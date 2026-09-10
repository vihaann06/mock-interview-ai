import { describe, expect, it } from "vitest";
import {
  canAcceptEndOfTurn,
  canProbeInactivity,
  hasSpeakableInterviewerMessage,
  isUnintendedSilence,
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

describe("isUnintendedSilence", () => {
  it("separates a deliberate WAIT from a blanked non-WAIT message", () => {
    expect(isUnintendedSilence("WAIT", "")).toBe(false);
    expect(isUnintendedSilence("WAIT", " ")).toBe(false);
    expect(isUnintendedSilence("PROBE", "")).toBe(true);
    expect(isUnintendedSilence("PROBE", "   ")).toBe(true);
    expect(isUnintendedSilence("PROBE", "Why that bound?")).toBe(false);
  });
});

describe("turn-taking always recovers", () => {
  it("returns to a state that accepts the next candidate turn", () => {
    // WAIT (intended silence) and a spoken message must both land back in a
    // state where END_OF_TURN is accepted, otherwise the mic goes dead and the
    // interviewer looks silent for every following turn too.
    const afterWait = reduceVoiceConversation("PROCESSING_TURN", {
      type: "INTERVIEWER_WAIT",
    }).state;
    expect(canAcceptEndOfTurn(afterWait)).toBe(true);

    const speaking = reduceVoiceConversation("PROCESSING_TURN", {
      type: "INTERVIEWER_MESSAGE",
    }).state;
    const afterTts = reduceVoiceConversation(speaking, {
      type: "TTS_DONE",
    }).state;
    expect(canAcceptEndOfTurn(afterTts)).toBe(true);

    // Barge-in mid-speech also leaves a turn-accepting state.
    const bargedIn = reduceVoiceConversation(speaking, {
      type: "START_OF_TURN",
    }).state;
    expect(canAcceptEndOfTurn(bargedIn)).toBe(true);
  });
});
