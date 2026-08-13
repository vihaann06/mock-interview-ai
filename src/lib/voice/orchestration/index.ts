/**
 * Voice conversation orchestration — state machine + probe constants.
 * Does not own STT/TTS providers; Agent2 glues UI events into the hook.
 */

export { INACTIVITY_PROBE_MESSAGE } from "./constants";

export {
  canAcceptEndOfTurn,
  canProbeInactivity,
  hasSpeakableInterviewerMessage,
  initialVoiceConversationState,
  reduceVoiceConversation,
  shouldBargeIn,
  type OrchestratorEvent,
  type TransitionResult,
} from "./state-machine";
