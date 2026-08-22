import {
  buildRealtimeTranscriptionSession,
  resolveSilenceDurationMs,
} from "@/lib/voice/stt/realtime-config";

export const runtime = "nodejs";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

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

function requireApiKey(): string | Response {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "OPENAI_API_KEY is not configured. Set it in .env.local (see .env.example).",
      500,
    );
  }
  return apiKey;
}

/**
 * Unified WebRTC path: browser POSTs its SDP offer here; the server forwards
 * multipart (sdp + transcription session) to OpenAI with the permanent API key.
 * The key never reaches the browser.
 */
async function proxySdpOffer(sdpOffer: string): Promise<Response> {
  const apiKeyOrErr = requireApiKey();
  if (typeof apiKeyOrErr !== "string") return apiKeyOrErr;

  const offer = sdpOffer.trim();
  if (!offer.startsWith("v=")) {
    return jsonError("Invalid SDP offer", 400);
  }

  const fd = new FormData();
  fd.set("sdp", offer);
  fd.set("session", JSON.stringify(buildRealtimeTranscriptionSession()));

  let upstream: Response;
  try {
    upstream = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKeyOrErr}`,
        "OpenAI-Safety-Identifier": "probe-local-interview",
      },
      body: fd,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach OpenAI Realtime";
    return jsonError(message, 502);
  }

  const answer = await upstream.text();
  if (!upstream.ok) {
    return jsonError(
      sanitizeUpstreamError(answer, upstream.status),
      upstream.status === 401 ? 401 : 502,
    );
  }

  if (!answer.trim().startsWith("v=")) {
    return jsonError("OpenAI Realtime returned an invalid SDP answer", 502);
  }

  const headers = new Headers({
    "Content-Type": "application/sdp",
    "X-Silence-Duration-Ms": String(resolveSilenceDurationMs()),
  });
  const location = upstream.headers.get("Location");
  if (location) headers.set("X-Realtime-Call-Location", location);

  return new Response(answer, { status: 200, headers });
}

/** Lightweight config for the browser (silence window). No secrets. */
function configResponse(): Response {
  return Response.json({
    silenceDurationMs: resolveSilenceDurationMs(),
    mode: "sdp-proxy",
  });
}

export async function GET() {
  return configResponse();
}

export async function POST(req: Request) {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  // Unified interface: raw SDP offer from the browser.
  if (
    contentType.includes("application/sdp") ||
    contentType.includes("text/plain")
  ) {
    const sdp = await req.text();
    return proxySdpOffer(sdp);
  }

  // Optional JSON body with { sdp } for clients that prefer JSON.
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const sdp =
      body &&
      typeof body === "object" &&
      typeof (body as { sdp?: unknown }).sdp === "string"
        ? (body as { sdp: string }).sdp
        : null;
    if (sdp) return proxySdpOffer(sdp);
    // Empty / config-only JSON → return silence config (compat with older clients).
    return configResponse();
  }

  // No content-type / empty POST → config.
  return configResponse();
}
