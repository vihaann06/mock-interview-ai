import type { InterviewStage } from "@/lib/types/interview";
import { INTERVIEW_STAGE_ORDER } from "@/lib/types/interview";

/** Returns the next stage, or null if already at WRAP_UP. */
export function getNextStage(current: InterviewStage): InterviewStage | null {
  const index = INTERVIEW_STAGE_ORDER.indexOf(current);
  if (index < 0 || index >= INTERVIEW_STAGE_ORDER.length - 1) {
    return null;
  }
  return INTERVIEW_STAGE_ORDER[index + 1];
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
