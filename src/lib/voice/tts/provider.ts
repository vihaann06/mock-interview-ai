/**
 * Which speech backend the TTS route uses.
 *
 * The seam is server-side on purpose: the browser posts `{ text }` and plays whatever
 * audio comes back, so switching providers touches no client code, no barge-in handling,
 * and no orchestrator state.
 */

export type TtsProviderName = "openai" | "cartesia";

export type EnvLike = Record<string, string | undefined>;

/**
 * Defaults to `openai` so an absent/misspelled value can never take voice offline. An
 * explicit `TTS_PROVIDER=cartesia` is required to switch.
 */
export function resolveTtsProvider(env: EnvLike = process.env): TtsProviderName {
  const raw = env.TTS_PROVIDER?.trim().toLowerCase();
  return raw === "cartesia" ? "cartesia" : "openai";
}
