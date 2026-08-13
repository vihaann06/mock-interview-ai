import type { DeepgramTokenResponse } from "@/lib/voice/types";

export const runtime = "nodejs";

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Mint a short-lived Deepgram JWT for browser Flux WebSocket auth.
 * The permanent DEEPGRAM_API_KEY never leaves the server.
 */
async function mintDeepgramToken(): Promise<Response> {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "DEEPGRAM_API_KEY is not configured. Set it in .env.local (see .env.example).",
      500,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach Deepgram auth";
    return jsonError(message, 502);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError("Invalid response from Deepgram auth", 502);
  }

  if (!upstream.ok) {
    const record =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null;
    const message =
      (typeof record?.err_msg === "string" && record.err_msg) ||
      (typeof record?.message === "string" && record.message) ||
      `Deepgram auth failed (${upstream.status})`;
    return jsonError(message, upstream.status === 401 ? 401 : 502);
  }

  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const accessToken =
    typeof record?.access_token === "string" ? record.access_token : null;
  const expiresInRaw = record?.expires_in;
  const expiresIn =
    typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)
      ? expiresInRaw
      : 30;

  if (!accessToken) {
    return jsonError("Deepgram auth response missing access_token", 502);
  }

  const body: DeepgramTokenResponse = {
    accessToken,
    expiresIn,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return Response.json(body);
}

export async function GET() {
  return mintDeepgramToken();
}

export async function POST() {
  return mintDeepgramToken();
}
