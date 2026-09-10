import type {
  AskedQuestion,
  CandidateReasoningState,
  InterviewConcern,
  InterviewerAction,
  InterviewerResponse,
  InterviewStage,
} from "@/lib/types/interview";
import {
  intentKeyForQuestion,
  isSemanticallyDuplicateQuestion,
  primaryUnresolvedConcern as primaryUnresolvedConcernFromState,
} from "@/lib/interviewer/reasoning-state";
import { INACTIVITY_PROBE_MESSAGE } from "@/lib/voice/orchestration/constants";
import type { ActionPolicyContext } from "./types";

const HINT_ACTIONS: Record<string, number> = {
  GIVE_HINT_1: 1,
  GIVE_HINT_2: 2,
  GIVE_HINT_3: 3,
};

const EARLY_STAGES = new Set<InterviewStage>(["INTRO", "CLARIFICATION"]);

/** Candidate is proposing an approach or saying they are ready to leave welcome/clarify. */
const READINESS_RE =
  /\b(i'll (start|begin|use|try)|my approach|brute force|i (think i )?understand|let me (code|implement|start)|ready to (start|code))/i;

const HINT_REQUEST_RE =
  /\b((can|could) (i|you) )?(get|give|need|want) (me )?(a )?hint\b|\bi(?:'m| am) stuck\b|\bhint please\b/i;

const CLARIFYING_QUESTION_RE =
  /\?|\b(?:can there be|are there|what about|what if|is (?:it |that )?(?:ok|okay|allowed)|do we (?:need|assume|consider)|should i assume|duplicates?)\b/i;

const EXPLAINING_RE =
  /\b(?:because|i (?:would|will|am going to)|i'm thinking|my (?:idea|plan|thought|approach)|first i|then i)\b/i;

const VALIDATION_SEEKING_RE =
  /\b(?:is (?:this|that|it) (?:correct|right|ok|okay|fine|good|valid)|does (?:this|that|it) make sense|am i (?:right|correct|on the right track)|does that sound (?:right|ok|okay|good))\b/i;

const FILLER_PREFIX_RE =
  /^(?:you mentioned(?:\s+that)?|i see (?:that )?you(?:'re| are))\b[,:\s-]*/i;

const WALKTHROUGH_CUE_RE =
  /\b(?:walk(?:\s+me)?\s+through|small example|counter(?:-|\s)?example|stress(?:es)? your assumption|concrete example)\b/i;

const ESCALATION_WALKTHROUGH =
  "Walk through your approach on a small example that stresses your assumption.";
const ESCALATION_ASSUMPTION =
  "Take another look at that assumption before continuing.";

/**
 * Last-resort text per action. WAIT is the *only* action allowed to be silent;
 * every other action must leave this module with something the UI can render
 * and TTS can speak, otherwise the turn disappears as dead air.
 */
const FALLBACK_MESSAGE_BY_ACTION: Record<InterviewerAction, string> = {
  ACKNOWLEDGE: "Got it — keep going.",
  PROBE: "Say more about how that part works.",
  ASK_CLARIFICATION: "Can you say a bit more about what you mean there?",
  CHALLENGE_ASSUMPTION: ESCALATION_ASSUMPTION,
  REQUEST_EXPLANATION: "Walk me through your reasoning step by step.",
  REQUEST_COMPLEXITY: "What's the time and space complexity of that?",
  GIVE_HINT_1: "What's the most expensive step in that approach right now?",
  GIVE_HINT_2: "Think about what you could precompute to avoid that repeated work.",
  GIVE_HINT_3: "Consider which data structure makes that lookup constant time.",
  REQUEST_TESTING: "Try that on a small example and tell me what you get.",
  MOVE_FORWARD: "Good — let's move on.",
  WAIT: "",
};

const ANSWER_DIRECT_QUESTION_FALLBACK =
  "Good question — what would you assume, and how would that change your approach?";

/**
 * Hint ladder: next hint level must equal hintsUsed + 1.
 * Cannot GIVE_HINT_2 if hintsUsed < 1, etc.
 * (Unchanged — stage suggestions remain advisory and do not affect this.)
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

function candidateText(ctx: ActionPolicyContext): string {
  return ctx.candidateMessage ?? "";
}

export function hasReadinessCue(message: string): boolean {
  return READINESS_RE.test(message);
}

export function askedForHint(message: string): boolean {
  return HINT_REQUEST_RE.test(message);
}

export function askedClarifyingQuestion(message: string): boolean {
  return CLARIFYING_QUESTION_RE.test(message);
}

function isAlreadyExplaining(message: string): boolean {
  return EXPLAINING_RE.test(message);
}

export function isValidationSeeking(message: string): boolean {
  return VALIDATION_SEEKING_RE.test(message);
}

/**
 * Keep INTRO/CLARIFICATION conversational. Convert checklist-y actions
 * unless the candidate clearly cues readiness or asks for a hint.
 */
export function sanitizeEarlyStageAction(
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): InterviewerAction {
  if (!EARLY_STAGES.has(ctx.stage)) return action;

  const message = candidateText(ctx);
  const clarifying = askedClarifyingQuestion(message);
  // A question like "I understand — can there be duplicates?" is still clarification.
  const ready = hasReadinessCue(message) && !clarifying;

  if (action === "MOVE_FORWARD") {
    if (ready) return action;
    // INTRO → CLARIFICATION is still the welcome/clarify phase.
    if (ctx.stage === "INTRO" && clarifying) return "ASK_CLARIFICATION";
    return clarifying ? "ASK_CLARIFICATION" : "ACKNOWLEDGE";
  }

  if (action === "REQUEST_COMPLEXITY") {
    return clarifying ? "ASK_CLARIFICATION" : "PROBE";
  }

  if (HINT_ACTIONS[action] !== undefined) {
    return askedForHint(message) ? action : "PROBE";
  }

  if (action === "CHALLENGE_ASSUMPTION" && ctx.stage === "INTRO") {
    return "ASK_CLARIFICATION";
  }

  if (action === "REQUEST_EXPLANATION" && !isAlreadyExplaining(message)) {
    return "ASK_CLARIFICATION";
  }

  if (action === "REQUEST_TESTING") {
    return "PROBE";
  }

  return action;
}

function sanitizeSuggestedStage(
  suggestedStage: InterviewStage | null | undefined,
  action: InterviewerAction,
  ctx: ActionPolicyContext,
): InterviewStage | null {
  const suggested = suggestedStage ?? null;
  const message = candidateText(ctx);

  if (ctx.stage === "INTRO") {
    const mayLeaveIntro =
      action === "MOVE_FORWARD" ||
      hasReadinessCue(message) ||
      askedClarifyingQuestion(message);
    if (!mayLeaveIntro) return null;
    // Never jump past CLARIFICATION from INTRO.
    if (suggested && suggested !== "INTRO" && suggested !== "CLARIFICATION") {
      return "CLARIFICATION";
    }
    return suggested === "CLARIFICATION" ? "CLARIFICATION" : null;
  }

  if (ctx.stage === "CLARIFICATION") {
    if (action === "MOVE_FORWARD" && suggested === "APPROACH_DISCUSSION") {
      return "APPROACH_DISCUSSION";
    }
    return null;
  }

  return suggested;
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

/**
 * WAIT may use "" or a single space. Collapse other whitespace-only WAIT
 * messages to "" so the UI can skip bubbles consistently.
 */
export function normalizeWaitMessage(
  action: InterviewerAction,
  message: string,
): string {
  if (action !== "WAIT") return message;
  if (message === "" || message === " ") return message;
  if (message.trim().length === 0) return "";
  return message;
}

// Re-export shared helpers for callers / tests.
export {
  intentKeyForQuestion,
  isSemanticallyDuplicateQuestion,
} from "@/lib/interviewer/reasoning-state";

/** Null-safe wrapper around shared primaryUnresolvedConcern. */
export function primaryUnresolvedConcern(
  state: CandidateReasoningState | null | undefined,
): InterviewConcern | null {
  if (!state) return null;
  return primaryUnresolvedConcernFromState(state);
}

export function stripFillerPrefixes(message: string): string {
  let out = message.trim();
  // Strip repeatedly in case stacked fillers appear.
  for (let i = 0; i < 3; i++) {
    const next = out.replace(FILLER_PREFIX_RE, "").trim();
    if (next === out) break;
    out = next;
  }
  // Capitalize first letter if we stripped a prefix.
  if (out.length > 0 && /^[a-z]/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

/**
 * The voice layer submits a synthetic transcript after a long silence. Its
 * whole purpose is to break dead air, so this turn must never resolve to WAIT.
 */
export function isSilenceCheckIn(message: string): boolean {
  const trimmed = message.trim();
  return trimmed === INACTIVITY_PROBE_MESSAGE || /^\(long silence/i.test(trimmed);
}

/**
 * Turns the interviewer is not allowed to answer with silence: the candidate
 * asked something, asked for a hint, asked for validation, or the interview
 * itself asked us to check in after a quiet period. WAIT here reads as the
 * interviewer ignoring the candidate.
 */
export function candidateNeedsSpokenReply(ctx: ActionPolicyContext): boolean {
  const message = candidateText(ctx);
  return (
    askedClarifyingQuestion(message) ||
    askedForHint(message) ||
    isValidationSeeking(message) ||
    isSilenceCheckIn(message)
  );
}

/** WAIT may be silent; every other action must carry speakable text. */
export function isSpeakableInterviewerResponse(
  response: Pick<InterviewerResponse, "action" | "message">,
): boolean {
  if (response.action === "WAIT") return true;
  return response.message.trim().length > 0;
}

/**
 * Guarantees a non-WAIT action keeps something to say. Empty text here means
 * post-processing (filler strip / leak strip / escalation rewrite) ate the
 * whole message — render nothing and the interviewer goes silently dead.
 */
export function ensureSpeakableMessage(
  action: InterviewerAction,
  message: string,
): string {
  if (action === "WAIT") return message;
  const trimmed = message.trim();
  if (trimmed.length > 0) return trimmed;
  return FALLBACK_MESSAGE_BY_ACTION[action] || FALLBACK_MESSAGE_BY_ACTION.PROBE;
}

function hasOpenImportantConcern(
  state: CandidateReasoningState | null | undefined,
): boolean {
  return (
    state?.unresolvedConcerns?.some(
      (c) =>
        c.status === "unresolved" &&
        (c.severity === "important" || c.severity === "critical"),
    ) ?? false
  );
}

function isShortNonQuestion(message: string): boolean {
  const t = message.trim();
  if (!t) return true;
  if (t.includes("?")) return false;
  // Short narration / coding progress without a question.
  return t.split(/\s+/).length <= 18 && !CLARIFYING_QUESTION_RE.test(t);
}

function recentAskedForDedupe(
  state: CandidateReasoningState | null | undefined,
): AskedQuestion[] {
  const asked = state?.questionsAlreadyAsked ?? [];
  // Prefer unresolved (resolved === false) and any recent same-intent entries.
  const unresolved = asked.filter((q) => !q.resolved);
  const recent = asked.slice(-8);
  const byId = new Map<string, AskedQuestion>();
  for (const q of [...unresolved, ...recent]) {
    byId.set(q.id, q);
  }
  return [...byId.values()];
}

function isDuplicateAgainstHistory(
  message: string,
  ctx: ActionPolicyContext,
): boolean {
  const asked = recentAskedForDedupe(ctx.reasoningState);
  if (isSemanticallyDuplicateQuestion(message, asked)) return true;

  const recent = ctx.lastInterviewerMessages ?? [];
  if (recent.length === 0) return false;
  const key = intentKeyForQuestion(message);
  if (!key) return false;
  return recent.some((m) => {
    const other = intentKeyForQuestion(m.content);
    return (
      other === key ||
      (key.length >= 8 && (other.includes(key) || key.includes(other)))
    );
  });
}

function escalationAction(attempts: number): InterviewerAction {
  if (attempts >= 3) return "CHALLENGE_ASSUMPTION";
  if (attempts >= 2) return "REQUEST_EXPLANATION";
  return "PROBE";
}

function escalationMessage(
  attempts: number,
  currentMessage: string,
  isDuplicate: boolean,
): string {
  if (attempts >= 3 && isDuplicate) return ESCALATION_ASSUMPTION;
  if (attempts >= 2 && isDuplicate) return ESCALATION_WALKTHROUGH;
  if (attempts >= 2 && !WALKTHROUGH_CUE_RE.test(currentMessage)) {
    return ESCALATION_WALKTHROUGH;
  }
  // attempts === 1 (or non-duplicate): keep model message after filler strip.
  return stripFillerPrefixes(currentMessage);
}

type AdaptiveResult = { action: InterviewerAction; message: string };

/**
 * Adaptive probing: duplicates, escalation, validation-seeking, coding WAIT.
 */
function applyAdaptivePolicy(
  action: InterviewerAction,
  message: string,
  ctx: ActionPolicyContext,
): AdaptiveResult {
  let nextAction = action;
  let nextMessage = message;
  const primary = primaryUnresolvedConcern(ctx.reasoningState);
  const duplicate = isDuplicateAgainstHistory(nextMessage, ctx);
  const candidate = candidateText(ctx);
  const owesReply = candidateNeedsSpokenReply(ctx);

  // 1) Validation-seeking: do not confirm when an open concern exists.
  if (
    isValidationSeeking(candidate) &&
    primary &&
    (nextAction === "ACKNOWLEDGE" || nextAction === "WAIT" || nextAction === "MOVE_FORWARD")
  ) {
    nextAction =
      primary.attemptsToProbe >= 2 ? "CHALLENGE_ASSUMPTION" : "PROBE";
    if (!nextMessage.trim() || nextAction === "PROBE") {
      nextMessage =
        stripFillerPrefixes(nextMessage) ||
        "What happens on the edge case you're least sure about?";
    }
  }

  // 2) Duplicate prevention + escalation on vague repeats.
  if (duplicate && nextAction !== "WAIT") {
    if (!primary) {
      if (owesReply || EARLY_STAGES.has(ctx.stage)) {
        // Answering a direct question is not a duplicate re-ask: the dedupe
        // index only tracks interviewer *questions*. Staying silent here would
        // drop the answer the candidate is waiting on. WAIT is for a candidate
        // coding productively, so it is never right in INTRO/CLARIFICATION
        // either — the candidate is talking, not typing.
        nextMessage =
          stripFillerPrefixes(nextMessage) || ANSWER_DIRECT_QUESTION_FALLBACK;
      } else {
        nextAction = "WAIT";
        nextMessage = "";
      }
    } else {
      const attempts = Math.max(primary.attemptsToProbe, primary.escalationLevel);
      if (attempts >= 1) {
        nextAction = escalationAction(attempts);
        nextMessage = escalationMessage(attempts, nextMessage, true);
      } else {
        // First-seen concern but wording already asked → re-focus probe.
        nextAction = "PROBE";
        nextMessage =
          stripFillerPrefixes(nextMessage) ||
          "What's the part of that claim you're least sure about?";
      }
    }
  } else if (primary && primary.attemptsToProbe >= 1) {
    // Escalate style even when not an exact duplicate if still probing softly.
    const attempts = Math.max(primary.attemptsToProbe, primary.escalationLevel);
    if (
      attempts >= 1 &&
      (nextAction === "PROBE" ||
        nextAction === "ASK_CLARIFICATION" ||
        nextAction === "ACKNOWLEDGE")
    ) {
      if (attempts === 1) {
        nextAction = "PROBE";
        nextMessage = stripFillerPrefixes(nextMessage);
      } else {
        nextAction = escalationAction(attempts);
        nextMessage = escalationMessage(attempts, nextMessage, false);
      }
    }
  }

  // 3) Productive coding WAIT: don't interrupt short non-question progress.
  // Never applies when the candidate is owed an answer (question, hint
  // request, validation check) or when this turn is the long-silence check-in.
  if (
    ctx.stage === "CODING" &&
    nextAction === "PROBE" &&
    isShortNonQuestion(candidate) &&
    !hasOpenImportantConcern(ctx.reasoningState) &&
    !owesReply
  ) {
    nextAction = "WAIT";
    nextMessage = "";
  }

  // 4) Always strip filler prefixes from spoken messages (except WAIT).
  if (nextAction !== "WAIT") {
    nextMessage = stripFillerPrefixes(nextMessage);
  }

  return { action: nextAction, message: nextMessage };
}

export function enforceInterviewerPolicy(
  response: InterviewerResponse,
  ctx: ActionPolicyContext,
): InterviewerResponse {
  const actionAfterBasics = sanitizeAction(
    sanitizeEarlyStageAction(response.action, ctx),
    ctx,
  );

  const adaptive = applyAdaptivePolicy(
    actionAfterBasics,
    response.message,
    ctx,
  );

  // Early-stage clamp can fight adaptive PROBE/CHALLENGE — re-apply early
  // sanitize only when still in INTRO/CLARIFICATION so we keep those rules.
  const action = EARLY_STAGES.has(ctx.stage)
    ? sanitizeAction(sanitizeEarlyStageAction(adaptive.action, ctx), ctx)
    : adaptive.action;

  // Only WAIT is allowed to be silent. Any other action whose text was eaten
  // by filler/leak stripping or an escalation rewrite gets a spoken fallback —
  // an empty non-WAIT message renders no bubble and speaks nothing.
  const message =
    action === "WAIT"
      ? normalizeWaitMessage(action, adaptive.message)
      : ensureSpeakableMessage(action, stripSolutionLeaks(adaptive.message));

  return {
    action,
    message,
    suggestedStage: sanitizeSuggestedStage(
      response.suggestedStage,
      action,
      ctx,
    ),
  };
}
