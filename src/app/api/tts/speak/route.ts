import OpenAI from "openai";
import type { SpeechModel } from "openai/resources/audio/speech";
import {
  buildCartesiaRequest,
  CARTESIA_TTS_URL,
  cartesiaContentTypeFor,
  cartesiaHeaders,
  resolveCartesiaContainer,
  resolveCartesiaLanguage,
  resolveCartesiaModel,
  resolveCartesiaVoiceId,
  sanitizeCartesiaError,
} from "@/lib/voice/tts/cartesia";
import {
  buildSpeechRequest,
  contentTypeFor,
  FALLBACK_MODEL,
  fallbackVoiceFor,
  resolveFormat,
  resolveInstructions,
  resolveModel,
  resolveSpeed,
  resolveVoice,
} from "@/lib/voice/tts/delivery";
import { resolveTtsProvider } from "@/lib/voice/tts/provider";
import { toSpokenForm } from "@/lib/voice/tts/spokenForm";

export const runtime = "nodejs";

/** OpenAI's documented hard cap on `input`. */
const MAX_INPUT_CHARS = 4096;

interface SpeakRequestBody {
  text?: string;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Shared response headers; the audio body is always piped, never buffered. */
function audioHeaders(extra: Record<string, string>): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    // Keep intermediaries from buffering the whole clip before the browser sees byte one.
    "X-Accel-Buffering": "no",
    ...extra,
  };
}

/**
 * Cartesia Sonic — a conversational speech model, so naturalness comes from the model
 * rather than from a delivery-instructions string. There is no `instructions` analogue and
 * none is needed.
 *
 * On failure this returns null so the caller can fall through to OpenAI: losing some voice
 * quality is better than an interviewer that cannot speak. The fallback is always labelled.
 */
async function synthesizeCartesia(
  input: string,
): Promise<{ response: Response } | { error: string; status: number } | null> {
  const apiKey = process.env.CARTESIA_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        "TTS_PROVIDER=cartesia but CARTESIA_API_KEY is not set. Add it to .env.local, or unset TTS_PROVIDER to use OpenAI.",
      status: 500,
    };
  }

  const voiceId = resolveCartesiaVoiceId();
  if (!voiceId) {
    return {
      error:
        "CARTESIA_VOICE_ID is not set. Pick a voice at https://play.cartesia.ai/voices and set its id in .env.local.",
      status: 500,
    };
  }

  const model = resolveCartesiaModel();
  const container = resolveCartesiaContainer();

  let upstream: Response;
  try {
    upstream = await fetch(CARTESIA_TTS_URL, {
      method: "POST",
      headers: cartesiaHeaders(apiKey),
      body: JSON.stringify(
        buildCartesiaRequest({
          model,
          voiceId,
          transcript: input,
          container,
          language: resolveCartesiaLanguage(),
        }),
      ),
    });
  } catch (err) {
    console.warn(
      `[tts] Cartesia unreachable (${err instanceof Error ? err.message : String(err)}); falling back to OpenAI.`,
    );
    return null;
  }

  if (!upstream.ok) {
    const detail = sanitizeCartesiaError(await upstream.text(), upstream.status);
    // 401/403 are configuration problems the operator must fix — say so rather than
    // quietly serving a different voice on every request.
    if (upstream.status === 401 || upstream.status === 403) {
      return { error: `Cartesia rejected the API key: ${detail}`, status: 502 };
    }
    console.warn(`[tts] Cartesia failed (${upstream.status}: ${detail}); falling back to OpenAI.`);
    return null;
  }

  if (!upstream.body) return null;

  return {
    response: new Response(upstream.body, {
      status: 200,
      headers: audioHeaders({
        "Content-Type": cartesiaContentTypeFor(container),
        "X-TTS-Provider": "cartesia",
        "X-TTS-Model": model,
        "X-TTS-Voice": voiceId,
      }),
    }),
  };
}

/**
 * OpenAI TTS. Two things make this sound human rather than synthetic:
 *  - `instructions` (see `lib/voice/tts/delivery.ts`) steers pace, pitch range, and the
 *    question contour. Without it `gpt-4o-mini-tts` defaults to a bright reading voice.
 *  - `toSpokenForm` rewrites markdown and code notation into words (applied by the caller).
 */
async function synthesizeOpenAi(
  input: string,
  fallbackFrom?: string,
): Promise<{ response: Response } | { error: string; status: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      error:
        "OPENAI_API_KEY is not configured. Set it in .env.local (see .env.example).",
      status: 500,
    };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const voice = resolveVoice();
  const format = resolveFormat();
  const instructions = resolveInstructions();
  const speed = resolveSpeed();
  const primaryModel = resolveModel();

  let model: SpeechModel = primaryModel;
  let usedVoice = voice;
  let degraded = false;

  try {
    let speech: Response;
    try {
      speech = await client.audio.speech.create(
        buildSpeechRequest({ model, voice, input, format, instructions, speed }),
      );
    } catch (primaryErr) {
      if (model === FALLBACK_MODEL) throw primaryErr;
      // Degraded path: `tts-1` ignores `instructions` and rejects the newer voices, so the
      // voice is remapped and the response is labelled. Never downgrade silently — the
      // X-TTS-Fallback header is the signal that delivery direction was lost.
      model = FALLBACK_MODEL;
      usedVoice = fallbackVoiceFor(voice);
      degraded = true;
      const reason = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn(
        `[tts] ${primaryModel} failed (${reason}); falling back to ${FALLBACK_MODEL}/${usedVoice}, which ignores delivery instructions.`,
      );
      speech = await client.audio.speech.create(
        buildSpeechRequest({ model, voice: usedVoice, input, format, instructions, speed }),
      );
    }

    const extra: Record<string, string> = {
      "Content-Type": contentTypeFor(format),
      "X-TTS-Provider": "openai",
      "X-TTS-Model": model,
      "X-TTS-Voice": usedVoice,
    };
    const chain = [fallbackFrom, degraded ? `${primaryModel}->${model}` : null]
      .filter(Boolean)
      .join(",");
    if (chain) extra["X-TTS-Fallback"] = chain;

    const headers = audioHeaders(extra);
    if (speech.body) {
      return { response: new Response(speech.body, { status: 200, headers }) };
    }
    const buffer = Buffer.from(await speech.arrayBuffer());
    return { response: new Response(buffer, { status: 200, headers }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI TTS failed";
    return { error: message, status: 502 };
  }
}

/**
 * Server-only TTS. Browser posts `{ text }`; response is streamed audio.
 * No provider key ever leaves the server.
 *
 * Provider is chosen by `TTS_PROVIDER` (see `lib/voice/tts/provider.ts`). Text
 * normalization is provider-independent and applies to both paths.
 */
export async function POST(req: Request) {
  let body: SpeakRequestBody;
  try {
    body = (await req.json()) as SpeakRequestBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    // WAIT / empty — no audio
    return jsonError("text is required (empty/WAIT produces no speech)", 400);
  }

  if (text.length > MAX_INPUT_CHARS) {
    return jsonError(`text exceeds ${MAX_INPUT_CHARS} character TTS limit`, 400);
  }

  // Normalization can lengthen the text ("O(n^2)" → "big O of n squared"); if that pushes
  // it past the cap, speak the original rather than failing the utterance.
  const spoken = toSpokenForm(text);
  const input = spoken && spoken.length <= MAX_INPUT_CHARS ? spoken : text;
  if (!input) {
    return jsonError("text is required (empty/WAIT produces no speech)", 400);
  }

  if (resolveTtsProvider() === "cartesia") {
    const result = await synthesizeCartesia(input);
    if (result && "response" in result) return result.response;
    if (result) return jsonError(result.error, result.status);
    // null → transient Cartesia failure; degrade to OpenAI rather than go mute.
    const fallback = await synthesizeOpenAi(input, "cartesia->openai");
    return "response" in fallback
      ? fallback.response
      : jsonError(fallback.error, fallback.status);
  }

  const result = await synthesizeOpenAi(input);
  return "response" in result ? result.response : jsonError(result.error, result.status);
}
