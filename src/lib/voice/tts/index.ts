export { createOpenAiTtsProvider } from "./openaiTtsProvider";
export type { OpenAiTtsProviderOptions } from "./openaiTtsProvider";
export { isSpeakableText } from "./text";
export { normalizeCodeSpan, toSpokenForm } from "./spokenForm";
export {
  DEFAULT_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_VOICE,
  INTERVIEWER_INSTRUCTIONS,
} from "./delivery";
export { resolveTtsProvider } from "./provider";
export type { TtsProviderName } from "./provider";
export {
  CARTESIA_VERSION,
  DEFAULT_CARTESIA_MODEL,
  buildCartesiaRequest,
} from "./cartesia";

/** Alias used by orchestration / callers that want a generic factory name. */
export { createOpenAiTtsProvider as createTTSProvider } from "./openaiTtsProvider";
