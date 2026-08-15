import type { VoiceConversationState } from "@/lib/voice/types";

/**
 * Pure VoiceConversationState transitions.
 * Voice remains I/O around the interview engine — this never calls STT/TTS/LLM.
 */

export type OrchestratorEvent =
  | { type: "START_LISTENING" }
  | { type: "STOP" }
  /** Candidate speech started — barge-in if interviewer is speaking. */
  | { type: "START_OF_TURN" }
  /** Confirmed spoken-turn completion only — never partial deltas. */
  | { type: "END_OF_TURN" }
  /** Interviewer returned WAIT (or empty speakable text). */
  | { type: "INTERVIEWER_WAIT" }
  /** Interviewer returned speakable message; TTS about to start. */
  | { type: "INTERVIEWER_MESSAGE" }
  /** TTS finished (or failed after stop). */
  | { type: "TTS_DONE" }
  | { type: "RESET" };

export interface TransitionResult {
  state: VoiceConversationState;
  /** True when StartOfTurn arrives during INTERVIEWER_SPEAKING. */
  bargeIn: boolean;
}

export function initialVoiceConversationState(): VoiceConversationState {
  return "IDLE";
}

/** Whether TTS should be stopped immediately (barge-in). */
export function shouldBargeIn(state: VoiceConversationState): boolean {
  return state === "INTERVIEWER_SPEAKING";
}

/** Confirmed EndOfTurn may submit a candidate turn. */
export function canAcceptEndOfTurn(state: VoiceConversationState): boolean {
  return (
    state === "LISTENING" ||
    state === "CANDIDATE_SPEAKING" ||
    state === "IDLE"
  );
}

/**
 * Inactivity probe is allowed only while listening (not mid-turn / mid-TTS).
 * InterviewRoom / host must also ensure interview is still active.
 */
export function canProbeInactivity(state: VoiceConversationState): boolean {
  return state === "LISTENING" || state === "IDLE";
}

export function reduceVoiceConversation(
  state: VoiceConversationState,
  event: OrchestratorEvent,
): TransitionResult {
  switch (event.type) {
    case "RESET":
    case "STOP":
      return { state: "IDLE", bargeIn: false };

    case "START_LISTENING":
      if (state === "PROCESSING_TURN" || state === "INTERVIEWER_SPEAKING") {
        return { state, bargeIn: false };
      }
      return { state: "LISTENING", bargeIn: false };

    case "START_OF_TURN": {
      if (state === "PROCESSING_TURN") {
        // Ignore overlapping speech while a turn is in flight.
        return { state, bargeIn: false };
      }
      if (state === "INTERVIEWER_SPEAKING") {
        return { state: "CANDIDATE_SPEAKING", bargeIn: true };
      }
      return { state: "CANDIDATE_SPEAKING", bargeIn: false };
    }

    case "END_OF_TURN": {
      if (!canAcceptEndOfTurn(state)) {
        return { state, bargeIn: false };
      }
      return { state: "PROCESSING_TURN", bargeIn: false };
    }

    case "INTERVIEWER_WAIT":
      if (state !== "PROCESSING_TURN") {
        return { state, bargeIn: false };
      }
      return { state: "LISTENING", bargeIn: false };

    case "INTERVIEWER_MESSAGE":
      if (state !== "PROCESSING_TURN") {
        return { state, bargeIn: false };
      }
      return { state: "INTERVIEWER_SPEAKING", bargeIn: false };

    case "TTS_DONE":
      if (state !== "INTERVIEWER_SPEAKING") {
        return { state, bargeIn: false };
      }
      return { state: "LISTENING", bargeIn: false };

    default:
      return { state, bargeIn: false };
  }
}

/** Speakable interviewer text (WAIT / blank → no TTS). */
export function hasSpeakableInterviewerMessage(
  action: string | undefined,
  message: string | null | undefined,
): boolean {
  if (action === "WAIT") return false;
  return Boolean(message?.trim());
}
