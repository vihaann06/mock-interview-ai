import type { InterviewerAction, InterviewerResponse } from "@/lib/types/interview";
import type { ActionPolicyContext } from "./types";

const HINT_ACTIONS: Record<string, number> = {
  GIVE_HINT_1: 1,
  GIVE_HINT_2: 2,
  GIVE_HINT_3: 3,
};

/**
 * Hint ladder: next hint level must equal hintsUsed + 1.
 * Cannot GIVE_HINT_2 if hintsUsed < 1, etc.
 */
export function assertActionAllowed(
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): void {
  const required = HINT_ACTIONS[action];
  if (required === undefined) return;

  const expectedNext = ctx.hintsUsed + 1;
  if (required !== expectedNext) {
    throw new Error(
      `Action ${action} not allowed: hintsUsed=${ctx.hintsUsed}, expected next hint level ${expectedNext}`,
    );
  }
}

export function isActionAllowed(
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): boolean {
  try {
    assertActionAllowed(action, ctx);
    return true;
  } catch {
    return false;
  }
}

/** Fallback when the model requests an illegal hint level. */
export function sanitizeAction(
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): InterviewerAction {
  if (isActionAllowed(action, ctx)) return action;
  if (HINT_ACTIONS[action] !== undefined) {
    // Downgrade illegal hints to a probe instead of skipping the ladder.
    return "PROBE";
  }
  return action;
}

/**
 * Heuristic strip of solution-like dumps from interviewer messages.
 * Prefer short probes; never paste full algorithms.
 */
const LEAK_PATTERNS: RegExp[] = [
  /\bhere(?:'s| is) (?:the|a) (?:full )?solution\b/i,
  /\bcopy[- ]paste this code\b/i,
  /\bthe answer is to use\b/i,
  /\bimplement it like this\s*[:：]/i,
  /\boptimal code\s*[:：]\s*```/i,
];

export function stripSolutionLeaks(message: string): string {
  let out = message.trim();
  for (const re of LEAK_PATTERNS) {
    if (re.test(out)) {
      out =
        "Walk me through your current approach — what would you try next?";
      break;
    }
  }
  // Collapse huge fenced code blocks that look like full solutions.
  out = out.replace(/```[\s\S]{400,}?```/g, "[code omitted — please keep reasoning in your own words]");
  return out;
}

export function enforceInterviewerPolicy(
  response: InterviewerResponse,
  ctx: ActionPolicyContext,
): InterviewerResponse {
  const action = sanitizeAction(response.action, ctx);
  const message = stripSolutionLeaks(response.message);
  return {
    action,
    message,
    suggestedStage: response.suggestedStage ?? null,
  };
}
