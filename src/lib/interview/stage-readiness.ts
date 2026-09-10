/**
 * Evidence-based stage advancement.
 *
 * Stage gating used to exist only for INTRO and CLARIFICATION. From
 * APPROACH_DISCUSSION onward, any MOVE_FORWARD advanced immediately, so an
 * eager model could walk APPROACH_DISCUSSION → CODING → TESTING →
 * COMPLEXITY_ANALYSIS → WRAP_UP on four consecutive turns with no code ever
 * written — which is exactly the "one turn on the algorithm, then straight to
 * a dry run" failure.
 *
 * A stage may now only be left once the work that defines it has actually
 * happened. Every check has a turn-count escape hatch so a candidate who
 * works differently (talks through tests instead of clicking Run, say) can
 * still reach WRAP_UP — the gate slows the interview down, it never wedges it.
 */
import type { InterviewSession, InterviewStage } from "@/lib/types/interview";

/** A stage is never left on the strength of a single candidate turn. */
export const MIN_CANDIDATE_TURNS_PER_STAGE = 2;

/** Turns after which a verbal-only equivalent counts as the stage's evidence. */
export const VERBAL_EVIDENCE_TURNS = 3;

export function candidateTurnsInStage(
  session: InterviewSession,
  stage: InterviewStage = session.stage,
): number {
  return session.events.filter(
    (e) => e.type === "candidate_turn" && e.stage === stage,
  ).length;
}

/**
 * True once the editor holds something the candidate wrote, as opposed to the
 * generated scaffold. The original starter is not retained on the session, so
 * this looks for a substantive body line rather than diffing against it.
 */
export function hasRealCode(code: string): boolean {
  return code
    .split("\n")
    .map((line) => line.trim())
    .some(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        line !== "pass" &&
        !/^(?:def|class)\b/.test(line) &&
        !/^(?:'''|""")/.test(line) &&
        !/^(?:from|import)\b/.test(line),
    );
}

export function hasExecutedCode(session: InterviewSession): boolean {
  if (session.latestExecution && session.latestExecution.status !== "not_run") {
    return true;
  }
  return session.events.some((e) => e.type === "execution_run");
}

/**
 * Big-O / cost language in the candidate's own words.
 *
 * Readiness deliberately does not depend only on the reasoning engine's claim
 * detector: that detector misses ordinary phrasings such as "O(n) time and
 * O(n) space" or "time is O(n), space is O(n)", and a candidate who has plainly
 * answered the complexity question should not be held in the stage by a
 * heuristic's blind spot.
 */
const COMPLEXITY_SPEECH_RE =
  /\bo\s*\(|\bbig[-\s]?o\b|\bcomplexit(?:y|ies)\b|\b(?:linear|constant|logarithmic|quadratic|exponential|amortized)\b|\bn\s*log\s*n\b/i;

function candidateSaidInStage(
  session: InterviewSession,
  stage: InterviewStage,
  pattern: RegExp,
): boolean {
  return session.events.some(
    (e) =>
      e.type === "candidate_turn" &&
      e.stage === stage &&
      typeof e.content === "string" &&
      pattern.test(e.content),
  );
}

/** A complexity claim on record, or the candidate simply saying it out loud. */
export function hasDiscussedComplexity(session: InterviewSession): boolean {
  const state = session.reasoningState;
  if (
    state &&
    (state.claims.some((c) => c.topic === "complexity") ||
      state.resolvedTopics.includes("complexity"))
  ) {
    return true;
  }
  return candidateSaidInStage(session, "COMPLEXITY_ANALYSIS", COMPLEXITY_SPEECH_RE);
}

function hasArticulatedApproach(session: InterviewSession): boolean {
  return Boolean(session.reasoningState?.approaches.some((a) => a.active));
}

/**
 * Why the interview may not leave its current stage yet. Empty means clear.
 * Strings are human-readable so they can be surfaced to the model and asserted
 * against in tests.
 */
export function stageAdvanceBlockers(session: InterviewSession): string[] {
  const turns = candidateTurnsInStage(session);
  const blockers: string[] = [];

  switch (session.stage) {
    case "INTRO":
    case "CLARIFICATION":
      // Handled by the existing early-stage hold in applyStageAction.
      return [];

    case "APPROACH_DISCUSSION":
      if (!hasArticulatedApproach(session) && turns < MIN_CANDIDATE_TURNS_PER_STAGE) {
        blockers.push("the candidate has not described an approach yet");
      }
      break;

    case "CODING":
      if (!hasRealCode(session.code)) {
        blockers.push("no candidate-written code in the editor yet");
      }
      if (turns < MIN_CANDIDATE_TURNS_PER_STAGE) {
        blockers.push("only one candidate turn spent implementing");
      }
      break;

    case "TESTING":
      if (!hasExecutedCode(session) && turns < VERBAL_EVIDENCE_TURNS) {
        blockers.push("the solution has not been run or traced yet");
      }
      break;

    case "COMPLEXITY_ANALYSIS":
      if (!hasDiscussedComplexity(session) && turns < VERBAL_EVIDENCE_TURNS) {
        blockers.push("complexity has not been discussed yet");
      }
      break;

    case "WRAP_UP":
      return [];
  }

  return blockers;
}

export function canAdvanceStage(session: InterviewSession): boolean {
  return stageAdvanceBlockers(session).length === 0;
}
