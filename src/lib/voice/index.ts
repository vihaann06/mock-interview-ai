export type {
  VoiceConnectionState,
  TtsPlaybackState,
  VoiceConversationState,
  TranscriptUpdate,
  FinalSpeechTurn,
  FluxTurnEventType,
  StreamingSTTProvider,
  TTSProvider,
  DeepgramTokenResponse,
} from "./types";

/** TEMP re-export — Agent1 replaces `./stt` internals; keep this factory name. */
export { createDeepgramFluxSTT } from "./stt";
