import type { InterviewerResponse } from "@/lib/types/interview";
import { interviewerResponseSchema } from "./schema";
import type { ParseResult } from "./types";

/**
 * Extract a JSON object from raw model output (plain JSON or fenced).
 */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // try fenced block
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim());
    }
    // try first {...} slice
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No JSON object found in model output");
  }
}

/**
 * Parse and validate unknown LLM output into InterviewerResponse.
 */
export function parseAndValidateInterviewerResponse(
  raw: unknown,
): InterviewerResponse {
  let candidate: unknown = raw;

  if (typeof raw === "string") {
    candidate = extractJsonObject(raw);
  }

  const parsed = interviewerResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid InterviewerResponse: ${detail}`);
  }

  return {
    action: parsed.data.action,
    message: parsed.data.message,
    suggestedStage: parsed.data.suggestedStage ?? null,
  };
}

/** Soft variant that returns a result object instead of throwing. */
export function tryParseInterviewerResponse(raw: unknown): ParseResult {
  try {
    return { ok: true, value: parseAndValidateInterviewerResponse(raw) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
