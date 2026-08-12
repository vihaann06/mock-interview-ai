/**
 * TEMP — Agent 3 compile stub. Replace with Agent 2 `src/lib/interviewer` merge.
 */
import type { InterviewerAction, InterviewStage } from "@/lib/types/interview";

export interface ActionPolicyContext {
  hintsUsed: number;
  stage: InterviewStage;
}

/** Throws if the action violates hint ladder / basic stage policy. */
export function assertActionAllowed(
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): void {
  const { hintsUsed } = ctx;

  if (action === "GIVE_HINT_1" && hintsUsed !== 0) {
    throw new Error(`GIVE_HINT_1 not allowed when hintsUsed=${hintsUsed}`);
  }
  if (action === "GIVE_HINT_2" && hintsUsed !== 1) {
    throw new Error(`GIVE_HINT_2 not allowed when hintsUsed=${hintsUsed}`);
  }
  if (action === "GIVE_HINT_3" && hintsUsed !== 2) {
    throw new Error(`GIVE_HINT_3 not allowed when hintsUsed=${hintsUsed}`);
  }
}
