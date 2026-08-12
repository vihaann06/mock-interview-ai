/**
 * TEMP — Agent 3 compile stub. Replace with Agent 2 `src/lib/interviewer` merge.
 */
import type { InterviewerResponse } from "@/lib/types/interview";
import { interviewerResponseSchema } from "./schema";

export type ParseInterviewerResult =
  | { ok: true; data: InterviewerResponse }
  | { ok: false; error: string };

export function parseAndValidateInterviewerResponse(
  raw: unknown,
): ParseInterviewerResult {
  let value: unknown = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Interviewer response is not valid JSON" };
    }
  }

  const parsed = interviewerResponseSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid InterviewerResponse",
    };
  }

  return {
    ok: true,
    data: {
      action: parsed.data.action,
      message: parsed.data.message.trim(),
      suggestedStage: parsed.data.suggestedStage ?? null,
    },
  };
}
