import OpenAI from "openai";
import type { SpeechModel } from "openai/resources/audio/speech";

export const runtime = "nodejs";

interface SpeakRequestBody {
  text?: string;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

const DEFAULT_MODEL: SpeechModel = "gpt-4o-mini-tts";
const FALLBACK_MODEL: SpeechModel = "tts-1";

function resolveModel(): SpeechModel {
  const raw = process.env.OPENAI_TTS_MODEL?.trim();
  if (!raw) return DEFAULT_MODEL;
  return raw as SpeechModel;
}

function resolveVoice(): string {
  return process.env.OPENAI_TTS_VOICE?.trim() || "alloy";
}

/**
 * Server-only OpenAI TTS. Browser posts `{ text }`; response is audio/mpeg.
 * OPENAI_API_KEY never leaves the server.
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

  if (text.length > 4096) {
    return jsonError("text exceeds 4096 character TTS limit", 400);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError(
      "OPENAI_API_KEY is not configured. Set it in .env.local (see .env.example).",
      500,
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  const voice = resolveVoice();
  let model = resolveModel();

  try {
    let speech: Response;
    try {
      speech = await client.audio.speech.create({
        model,
        voice,
        input: text,
        response_format: "mp3",
      });
    } catch (primaryErr) {
      // Prefer gpt-4o-mini-tts; fall back to tts-1 if the primary model is unavailable.
      if (model !== FALLBACK_MODEL) {
        model = FALLBACK_MODEL;
        speech = await client.audio.speech.create({
          model,
          voice,
          input: text,
          response_format: "mp3",
        });
      } else {
        throw primaryErr;
      }
    }

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-TTS-Model": model,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI TTS failed";
    return jsonError(message, 502);
  }
}
