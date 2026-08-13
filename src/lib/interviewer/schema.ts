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
 *
 * `message` may be empty (or a single space) when action is WAIT;
 * otherwise it must be non-empty (min 1).
 */
export const interviewerResponseSchema = z
  .object({
    action: interviewerActionSchema,
    message: z.string().max(2000),
    suggestedStage: interviewStageSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "WAIT") return;
    if (value.message.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["message"],
        message: 'message must be non-empty unless action is "WAIT"',
      });
    }
  });

export type InterviewerResponseParsed = z.infer<typeof interviewerResponseSchema>;
