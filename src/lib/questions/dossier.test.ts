import { describe, expect, it } from "vitest";
import { dossiers } from "@/lib/data/dossiers";
import { questions } from "@/lib/data/questions";
import { updateCandidateReasoningState } from "@/lib/interviewer/reasoning-state";
import { TOPIC_KEYS } from "@/lib/types/interview";
import { parseDossier } from "./dossier";
import { missingKnowledgeFields } from "./resolve";

const entries = Object.entries(dossiers);

describe("committed dossiers", () => {
  it("covers every question in the bank", () => {
    const missing = questions.map((q) => q.id).filter((id) => !dossiers[id]);
    expect(missing).toEqual([]);
  });

  // The barrel casts imported JSON to QuestionDossier, so a stale or
  // hand-edited file would typecheck. This is the only thing that catches it.
  it.each(entries)("%s validates against the schema", (id, dossier) => {
    const parsed = parseDossier(dossier);
    expect(parsed.ok ? null : parsed.error).toBeNull();
    expect(dossier.questionId).toBe(id);
  });

  it.each(entries)("%s uses canonical, distinct concern topics", (_id, dossier) => {
    for (const concern of dossier.interviewerConcerns) {
      expect(TOPIC_KEYS).toContain(concern.topic);
      expect(concern.topic).not.toBe("other");
    }
    const ids = dossier.interviewerConcerns.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * `incorrectPatterns` are matched mechanically against lowercased speech+code.
   * A pattern that cannot even match its own text is dead weight, and the
   * generator has no way to know that without running the real matcher.
   */
  it.each(entries)("%s patterns fire in the real matcher", (_id, dossier) => {
    for (const concern of dossier.interviewerConcerns) {
      for (const pattern of concern.incorrectPatterns) {
        const state = updateCandidateReasoningState(null, {
          transcript: [],
          candidateMessage: pattern,
          code: "",
          question: { interviewerConcerns: [concern] },
          stage: "CODING",
          latestExecution: null,
        });
        const opened = state.unresolvedConcerns.find(
          (c) => c.templateId === concern.id,
        );
        expect(opened, `pattern "${pattern}" never matches itself`).toBeDefined();
        expect(opened?.topic).not.toBe("other");
      }
    }
  });
});

describe("resolved question bank", () => {
  it("leaves no knowledge field unpopulated", () => {
    const gaps = questions
      .map((q) => ({ id: q.id, missing: missingKnowledgeFields(q) }))
      .filter((g) => g.missing.length > 0);
    expect(gaps).toEqual([]);
  });

  it("keeps hand-authored knowledge ahead of the dossier", () => {
    // two-sum authors its own concerns inline; the dossier must not shadow them.
    const twoSum = questions.find((q) => q.id === "two-sum");
    const authoredIds = twoSum?.interviewerConcerns?.map((c) => c.id) ?? [];
    const dossierIds = dossiers["two-sum"]?.interviewerConcerns.map((c) => c.id) ?? [];

    expect(authoredIds).toContain("nested-loop-complexity");
    expect(authoredIds).not.toEqual(dossierIds);
  });

  it("fills concerns from the dossier where none were authored", () => {
    // lru-cache is richly authored everywhere except interviewerConcerns.
    const lru = questions.find((q) => q.id === "lru-cache");
    expect(lru?.interviewerConcerns?.length ?? 0).toBeGreaterThan(0);
    expect(lru?.interviewerConcerns?.map((c) => c.id)).toEqual(
      dossiers["lru-cache"]?.interviewerConcerns.map((c) => c.id),
    );
  });
});
