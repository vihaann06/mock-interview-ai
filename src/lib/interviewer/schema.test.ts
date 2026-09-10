import { describe, expect, it } from "vitest";
import { interviewerResponseSchema } from "./schema";

const parse = (action: string, message: string) =>
  interviewerResponseSchema.safeParse({ action, message, suggestedStage: null });

describe("interviewerResponseSchema", () => {
  it("accepts a spoken non-WAIT message", () => {
    expect(parse("PROBE", "Why is that linear?").success).toBe(true);
  });

  it("allows WAIT to be empty or whitespace", () => {
    expect(parse("WAIT", "").success).toBe(true);
    expect(parse("WAIT", " ").success).toBe(true);
  });

  /**
   * Regression: the check used raw `.length`, so a whitespace-only message
   * validated, then rendered no bubble and spoke nothing — silence with extra
   * steps, and indistinguishable from a designed WAIT.
   */
  it("rejects a whitespace-only message for non-WAIT actions", () => {
    for (const blank of ["", " ", "   ", "\n", "\t "]) {
      const result = parse("ASK_CLARIFICATION", blank);
      expect(result.success, `"${blank.replace(/\n/g, "\\n")}" should be rejected`).toBe(
        false,
      );
    }
  });
});
