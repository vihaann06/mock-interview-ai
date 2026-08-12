import type { InterviewStage } from "@/lib/types/interview";
import { INTERVIEW_STAGE_ORDER } from "@/lib/types/interview";

/** Returns the next stage, or null if already at WRAP_UP. */
export function getNextStage(current: InterviewStage): InterviewStage | null {
  const index = INTERVIEW_STAGE_ORDER.indexOf(current);
  if (index < 0 || index >= INTERVIEW_STAGE_ORDER.length - 1) {
    return null;
  }
  return INTERVIEW_STAGE_ORDER[index + 1]!;
}

export function getStageLabel(stage: InterviewStage): string {
  const labels: Record<InterviewStage, string> = {
    INTRO: "Introduction",
    CLARIFICATION: "Clarification",
    APPROACH_DISCUSSION: "Approach",
    CODING: "Coding",
    TESTING: "Testing",
    COMPLEXITY_ANALYSIS: "Complexity",
    WRAP_UP: "Wrap-up",
  };
  return labels[stage];
}

/** Terminal stage — interview flow complete (still may need endInterview). */
export function isTerminal(stage: InterviewStage): boolean {
  return stage === "WRAP_UP";
}

/**
 * Safe transitions: only forward by exactly one step along INTERVIEW_STAGE_ORDER.
 * Same-stage is not a transition.
 */
export function canTransition(from: InterviewStage, to: InterviewStage): boolean {
  if (from === to) return false;
  const next = getNextStage(from);
  return next === to;
}

export function assertTransition(from: InterviewStage, to: InterviewStage): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid stage transition: ${from} → ${to}. Only forward to the next stage is allowed.`,
    );
  }
}
