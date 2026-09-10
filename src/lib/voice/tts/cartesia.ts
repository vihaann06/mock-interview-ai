/**
 * Cartesia Sonic delivery configuration.
 *
 * Pure env → request resolution, mirroring `delivery.ts`. No I/O in this module.
 *
 * Why Cartesia sits alongside the OpenAI path rather than replacing it: `gpt-4o-mini-tts`
 * is a read-aloud model steered by an `instructions` string, and that steering is the
 * ceiling of how conversational it gets. Sonic is a conversational model — its prosody
 * comes from the model, so there is no instructions analogue here, and none is needed.
 */

/** Minimal env shape, so tests pass a plain object instead of mutating process.env. */
export type EnvLike = Record<string, string | undefined>;

export const CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes";

/**
 * Required by every Cartesia request; the API is date-versioned and rejects calls without
 * it. Bump deliberately — a new version can change response shape.
 */
export const CARTESIA_VERSION = "2026-08-14";

export const DEFAULT_CARTESIA_MODEL = "sonic-3.6";

/** `mp3` is the only container every target browser plays from a blob URL. */
export type CartesiaContainer = "mp3" | "wav";

export const DEFAULT_CARTESIA_CONTAINER: CartesiaContainer = "mp3";

const CONTAINER_CONTENT_TYPES: Record<CartesiaContainer, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export function resolveCartesiaModel(env: EnvLike = process.env): string {
  return env.CARTESIA_MODEL?.trim() || DEFAULT_CARTESIA_MODEL;
}

/**
 * Deliberately has no default. Cartesia voices are opaque UUIDs from an account-specific
 * library, and picking an arbitrary one would give a first impression of the wrong
 * persona — worse than a clear error telling the operator to choose.
 */
export function resolveCartesiaVoiceId(env: EnvLike = process.env): string | null {
  return env.CARTESIA_VOICE_ID?.trim() || null;
}

export function resolveCartesiaContainer(
  env: EnvLike = process.env,
): CartesiaContainer {
  const raw = env.CARTESIA_FORMAT?.trim().toLowerCase();
  return raw === "wav" ? "wav" : DEFAULT_CARTESIA_CONTAINER;
}

export function resolveCartesiaLanguage(env: EnvLike = process.env): string {
  return env.CARTESIA_LANGUAGE?.trim() || "en";
}

export function cartesiaContentTypeFor(container: CartesiaContainer): string {
  return CONTAINER_CONTENT_TYPES[container] ?? "application/octet-stream";
}

export interface CartesiaOutputFormat {
  container: CartesiaContainer;
  sample_rate: number;
  /** mp3 only — wav carries `encoding` instead. */
  bit_rate?: number;
  encoding?: string;
}

export interface CartesiaSpeechRequest {
  model_id: string;
  transcript: string;
  voice: { id: string };
  output_format: CartesiaOutputFormat;
  language: string;
}

export function buildCartesiaRequest(params: {
  model: string;
  voiceId: string;
  transcript: string;
  container: CartesiaContainer;
  language: string;
}): CartesiaSpeechRequest {
  const output_format: CartesiaOutputFormat =
    params.container === "wav"
      ? { container: "wav", sample_rate: 44100, encoding: "pcm_s16le" }
      : { container: "mp3", sample_rate: 44100, bit_rate: 128000 };

  return {
    model_id: params.model,
    transcript: params.transcript,
    voice: { id: params.voiceId },
    output_format,
    language: params.language,
  };
}

export function cartesiaHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Cartesia-Version": CARTESIA_VERSION,
    "Content-Type": "application/json",
  };
}

/** Cartesia returns JSON errors; surface the message without leaking a whole HTML page. */
export function sanitizeCartesiaError(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return `Cartesia TTS failed (${status})`;
  if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
    return `Cartesia TTS temporarily unavailable (${status}).`;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    return (
      parsed.error?.message || parsed.message || `Cartesia TTS failed (${status})`
    );
  } catch {
    return trimmed.slice(0, 240);
  }
}
