import { z } from "zod";

export const interviewStageSchema = z.enum([
  "INTRO",
  "CLARIFICATION",
  "APPROACH_DISCUSSION",
  "CODING",
  "TESTING",
  "COMPLEXITY_ANALYSIS",
  "WRAP_UP",
]);

export const interviewerActionSchema = z.enum([
  "ACKNOWLEDGE",
  "PROBE",
  "ASK_CLARIFICATION",
  "CHALLENGE_ASSUMPTION",
  "REQUEST_EXPLANATION",
  "REQUEST_COMPLEXITY",
  "GIVE_HINT_1",
  "GIVE_HINT_2",
  "GIVE_HINT_3",
  "REQUEST_TESTING",
  "MOVE_FORWARD",
  "WAIT",
]);

/**
 * Zod schema for InterviewerResponse.
 * Models must return JSON matching this shape.
 */
export const interviewerResponseSchema = z.object({
  action: interviewerActionSchema,
  message: z.string().min(1).max(2000),
  suggestedStage: interviewStageSchema.nullable().optional(),
});

export type InterviewerResponseParsed = z.infer<typeof interviewerResponseSchema>;
