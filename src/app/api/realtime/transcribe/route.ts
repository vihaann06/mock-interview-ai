import {
  buildClientSecretRequestBody,
  resolveSilenceDurationMs,
} from "@/lib/voice/stt/realtime-config";

export const runtime = "nodejs";

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function sanitizeUpstreamError(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return `OpenAI Realtime session failed (${status})`;
  }
  if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed) || /error code:\s*\d+/i.test(trimmed)) {
    return `OpenAI Realtime temporarily unavailable (${status}). Retry in a moment.`;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string };
      message?: string;
    };
    return (
      parsed.error?.message ||
      parsed.message ||
      `OpenAI Realtime session failed (${status})`
    );
  } catch {
    return trimmed.slice(0, 240);
  }
}

/**
 * Mint a short-lived OpenAI Realtime client secret for browser WebRTC.
 * The permanent OPENAI_API_KEY never leaves the server. The browser uses the
 * ephemeral secret to POST its SDP directly to OpenAI (/v1/realtime/calls).
 */
async function mintClientSecret(): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "OPENAI_API_KEY is not configured. Set it in .env.local (see .env.example).",
      500,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "probe-local-interview",
      },
      body: JSON.stringify(buildClientSecretRequestBody()),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach OpenAI Realtime";
    return jsonError(message, 502);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return jsonError(
      sanitizeUpstreamError(raw, upstream.status),
      upstream.status === 401 ? 401 : 502,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError("Invalid response from OpenAI client_secrets", 502);
  }

  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;
  const value = typeof record?.value === "string" ? record.value : null;
  const expiresAt =
    typeof record?.expires_at === "number" ? record.expires_at : undefined;

  if (!value) {
    return jsonError("OpenAI client_secrets response missing value", 502);
  }

  return Response.json({
    clientSecret: value,
    expiresAt,
    /** Patient silence window (ms) for browser end-of-turn commit. */
    silenceDurationMs: resolveSilenceDurationMs(),
  });
}

export async function GET() {
  return mintClientSecret();
}

export async function POST() {
  return mintClientSecret();
}
