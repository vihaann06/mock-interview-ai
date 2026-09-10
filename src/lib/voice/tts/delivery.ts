import type { SpeechModel } from "openai/resources/audio/speech";

/**
 * Delivery configuration for the interviewer's voice.
 *
 * Pure resolution of env → OpenAI speech parameters, so the route stays thin and every
 * decision here is unit-testable. Nothing in this module performs I/O.
 */

export type SpeechFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

/** Minimal env shape, so tests can pass a plain object instead of mutating process.env. */
export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_MODEL: SpeechModel = "gpt-4o-mini-tts";

/**
 * `cedar` (and its counterpart `marin`) is the newest OpenAI voice generation — male,
 * low-pitched, and the pair OpenAI positions as its most natural. `alloy`, the previous
 * default here, is the flattest and most synthetic of the set.
 *
 * It is also the most *steerable* option measured: on an identical interviewer line,
 * adding the delivery instructions below took cedar from 4.66s to 5.30s (168 → 147 wpm),
 * where `ash` moved only 6.05s → 6.26s because it already reads slowly. `ash` is the
 * obvious `OPENAI_TTS_VOICE` alternative for a deeper, slower read.
 */
export const DEFAULT_VOICE = "cedar";

/**
 * `tts-1` is the only fallback that is reliably available, and it predates both the newest
 * voices and `instructions`.
 *
 * Verified against the live API: `tts-1` + `cedar` returns 400 with the voice enum below,
 * and `tts-1` with `instructions` returns a byte-identical response to the same request
 * without them — it accepts the parameter and ignores it. So the fallback both remaps the
 * voice (or it would fail outright) and drops the delivery direction (which is why the
 * route labels the response instead of downgrading quietly).
 */
export const FALLBACK_MODEL: SpeechModel = "tts-1";
const LEGACY_VOICES = new Set([
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
]);
const LEGACY_VOICE_DEFAULT = "onyx";

/** `mp3` is the only format every target browser can play from a blob URL (see README). */
export const DEFAULT_FORMAT: SpeechFormat = "mp3";

const FORMATS: readonly SpeechFormat[] = ["mp3", "opus", "aac", "flac", "wav", "pcm"];

const FORMAT_CONTENT_TYPES: Record<SpeechFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/L16",
};

/**
 * Delivery direction for `gpt-4o-mini-tts`.
 *
 * The `instructions` parameter is the single largest lever on how synthetic the output
 * sounds — without it the model defaults to a bright, evenly-stressed reading voice. The
 * structure below (voice / tone / pacing / intonation / delivery / pronunciation) follows
 * the shape OpenAI's text-to-speech guide recommends for steering delivery.
 *
 * Goal: a calm senior engineer across the table. Specifically countering the three things
 * that make TTS read as a robot in this product — presenter brightness, uniform stress on
 * every word, and an exaggerated rising contour on questions.
 */
export const INTERVIEWER_INSTRUCTIONS = [
  "Voice: a calm, experienced senior software engineer running a technical interview in a quiet room. Grounded, low-pitched, and understated.",
  "Tone: neutral and matter-of-fact, with a little warmth underneath. Curious rather than impressed. No encouragement, no praise, no presenter or radio-announcer brightness, no smile in the voice.",
  "Pacing: measured and unhurried — a touch slower than casual conversation. Let commas and dashes land as real pauses, and take a short beat before asking a question. Do not rush or clip the ends of sentences.",
  "Intonation: keep the pitch range narrow and low. End questions with a slight downward inflection, the way a colleague asks something across a table — never a bright rising lilt, and never upspeak on statements.",
  "Delivery: sound like you are thinking about the candidate's answer, not reading a script. Natural breath and a little vocal fry are welcome. Avoid emphatic stress; if a word matters, lengthen it slightly instead of raising pitch.",
  "Pronunciation: read code identifiers, variable names, and complexity terms plainly and clearly at the same unhurried pace as the surrounding sentence.",
].join("\n");

/**
 * `instructions` is documented as having no effect on `tts-1` / `tts-1-hd`, and the live
 * API confirms it: the parameter is accepted and the audio comes back byte-identical.
 */
export function modelSupportsInstructions(model: string): boolean {
  return !/^tts-1(-hd)?$/.test(model.trim());
}

export function resolveModel(env: EnvLike = process.env): SpeechModel {
  const raw = env.OPENAI_TTS_MODEL?.trim();
  if (!raw) return DEFAULT_MODEL;
  return raw as SpeechModel;
}

export function resolveVoice(env: EnvLike = process.env): string {
  return env.OPENAI_TTS_VOICE?.trim() || DEFAULT_VOICE;
}

export function resolveInstructions(env: EnvLike = process.env): string {
  return env.OPENAI_TTS_INSTRUCTIONS?.trim() || INTERVIEWER_INSTRUCTIONS;
}

export function resolveFormat(env: EnvLike = process.env): SpeechFormat {
  const raw = env.OPENAI_TTS_FORMAT?.trim().toLowerCase();
  if (!raw) return DEFAULT_FORMAT;
  return (FORMATS as readonly string[]).includes(raw) ? (raw as SpeechFormat) : DEFAULT_FORMAT;
}

/**
 * Pace is steered through `instructions`, not `speed`: the `speed` parameter time-scales
 * the rendered audio, which flattens prosody and is exactly the artificial quality we are
 * trying to remove. Left unset unless an operator explicitly asks for it.
 */
export function resolveSpeed(env: EnvLike = process.env): number | undefined {
  const raw = env.OPENAI_TTS_SPEED?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0.25 || value > 4) return undefined;
  return value;
}

export function contentTypeFor(format: SpeechFormat): string {
  return FORMAT_CONTENT_TYPES[format] ?? "application/octet-stream";
}

/** The newest voices do not exist on `tts-1`; remap rather than let the fallback 400. */
export function fallbackVoiceFor(voice: string): string {
  const normalized = voice.trim().toLowerCase();
  if (LEGACY_VOICES.has(normalized)) return normalized;
  // `marin` is the higher-pitched half of the newest pair; `nova` is its closest legacy
  // match. Everything else (including `cedar`, `ballad`, `verse`, custom voice ids) falls
  // back to the low, level male voice, which is nearest the interviewer persona.
  if (normalized === "marin") return "nova";
  return LEGACY_VOICE_DEFAULT;
}

export interface SpeechRequest {
  model: SpeechModel;
  voice: string;
  input: string;
  response_format: SpeechFormat;
  instructions?: string;
  speed?: number;
}

/** Builds the request body, omitting parameters the chosen model would ignore or reject. */
export function buildSpeechRequest(params: {
  model: SpeechModel;
  voice: string;
  input: string;
  format: SpeechFormat;
  instructions: string;
  speed?: number;
}): SpeechRequest {
  const request: SpeechRequest = {
    model: params.model,
    voice: params.voice,
    input: params.input,
    response_format: params.format,
  };
  if (modelSupportsInstructions(params.model) && params.instructions) {
    request.instructions = params.instructions;
  }
  if (params.speed !== undefined) {
    request.speed = params.speed;
  }
  return request;
}
