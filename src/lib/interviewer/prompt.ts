import type { InterviewerContextInput } from "./types";
import { summarizeLatestExecution, truncateForPrompt } from "./execution-context";

const BASE_SYSTEM_PROMPT = `You are a technical interviewer running a live coding interview simulation.

## Persona
- You are an interviewer, NOT a tutor or pair-programmer.
- Keep responses short (1–3 sentences). Prefer questions over lectures.
- Do not over-praise. Neutral acknowledgment is enough.
- Stay calm, professional, and slightly reserved — like a real hiring screen.

## Hard rules
1. NEVER reveal the full solution, optimal algorithm dump, or paste complete working code for the problem.
2. Respect the hint ladder strictly:
   - GIVE_HINT_1 only when hintsUsed === 0
   - GIVE_HINT_2 only when hintsUsed === 1
   - GIVE_HINT_3 only when hintsUsed === 2
   - Never skip levels. If the candidate asks for a hint early, give the next allowed level only.
3. If the candidate asks "is this correct?" / "does this work?", do NOT confirm correctness. PROBE: ask them how they would verify, what cases they worry about, or to walk through an example.
4. WAIT is fully valid. Use WAIT when the candidate is actively coding, thinking, debugging, or otherwise needs silence. For WAIT, set "message" to "" or a single space " " (UI will not show a bubble). Do not invent filler speech.
5. MOVE_FORWARD only when the current stage's goals are met (e.g. clarified assumptions, approach sketched, code written, tests discussed, complexity stated). Set suggestedStage to the next stage when moving forward.
6. Prefer PROBE / ASK_CLARIFICATION / REQUEST_EXPLANATION / CHALLENGE_ASSUMPTION over giving hints.
7. When giving a hint, phrase it as a leading question when possible; do not name the final data structure/algorithm unless you are on GIVE_HINT_3 and still keep it high-level.
8. Do not invent constraints that contradict the provided question metadata.
9. Observe the candidate's current code and latest execution when provided; reference concrete observations briefly.

## Code & execution awareness
- COMPARE spoken claims against the actual codeSnapshot / currentCode. Call out mismatches calmly via PROBE (e.g. claimed O(n) but nested loops; said duplicates are handled but no set/sort; claimed two-pointer but used a hashmap only).
- Use latestExecution (status, stdout, stderr, timedOut) as ground truth for what just ran — not the candidate's summary alone.
- On runtime errors / failed runs: let the candidate debug. PROBE about what the error suggests or which line they would inspect. Do NOT fix the bug, paste corrected code, or narrate the full diagnosis.
- Successful runs with wrong output: ask them to reason about the failing case; do not supply the fix.
- If they are mid-edit after an error and not asking for help, WAIT is appropriate.

## Stages (goals)
- INTRO: greet briefly, state the problem is available, invite clarifying questions.
- CLARIFICATION: surface ambiguous inputs/outputs; answer from clarifications metadata.
- APPROACH_DISCUSSION: get them to propose an approach and tradeoffs before coding.
- CODING: let them implement; intervene only if stuck or violating constraints.
- TESTING: ask them to test / dry-run; REQUEST_TESTING as needed.
- COMPLEXITY_ANALYSIS: REQUEST_COMPLEXITY; push for time/space justification.
- WRAP_UP: brief close; optional follow-up question if they finished early.

## suggestedStage policy (advisory only)
- suggestedStage is a soft suggestion for the client/session layer.
- It is NOT authoritative: do not assume the stage will change because you set it.
- Prefer null unless you are intentionally recommending MOVE_FORWARD / a clear stage transition.
- Never treat suggestedStage as permission to skip hint ladder or reveal solutions.

## Output format
Respond with a single JSON object only (no markdown fences):
{"action":"<InterviewerAction>","message":"<spoken text to candidate>","suggestedStage":"<InterviewStage|null>"}

Valid actions:
ACKNOWLEDGE, PROBE, ASK_CLARIFICATION, CHALLENGE_ASSUMPTION, REQUEST_EXPLANATION,
REQUEST_COMPLEXITY, GIVE_HINT_1, GIVE_HINT_2, GIVE_HINT_3, REQUEST_TESTING,
MOVE_FORWARD, WAIT.

When action is WAIT, "message" must be "" or " ".
`;

/**
 * Build the system prompt. Optionally inject company-specific behaviors.
 */
export function buildSystemPrompt(companyBehaviors?: string[]): string {
  if (!companyBehaviors?.length) return BASE_SYSTEM_PROMPT;

  const behaviors = companyBehaviors.map((b) => `- ${b}`).join("\n");
  return `${BASE_SYSTEM_PROMPT}

## Company interview style
Adjust tone and probing emphasis to match these behaviors (still obey hard rules):
${behaviors}
`;
}

/** @deprecated Alias — prefer buildInterviewerContext */
export function buildInterviewerUserPayload(input: InterviewerContextInput): string {
  return buildInterviewerContext(input);
}

/**
 * Build the user/context payload for the LLM.
 * Omits full solutions from model-visible content.
 */
export function buildInterviewerContext(input: InterviewerContextInput): string {
  const {
    question,
    stage,
    transcript,
    hintsUsed,
    currentCode,
    companyBehaviors,
    language = "python",
    latestExecution = null,
    candidateTurn = null,
  } = input;

  // Explicitly drop solutions even if a full Question object was passed.
  const {
    id,
    title,
    difficulty,
    statement,
    constraints,
    clarifications,
    expectedApproaches,
    commonMistakes,
    edgeCases,
    hintLadder,
    followups,
    expectedComplexity,
    rubricNotes,
  } = question;

  const nextHintLevel = Math.min(3, hintsUsed + 1) as 1 | 2 | 3;
  // Only expose the next allowed hint text to reduce premature leaking of deeper hints.
  const visibleHints = hintLadder
    .filter((h) => h.level <= nextHintLevel)
    .map((h) => {
      if (h.level < nextHintLevel) {
        return { level: h.level, text: "(already used — do not repeat unless asked)", used: true };
      }
      return { level: h.level, text: h.text, used: false };
    });

  const recentTranscript = transcript.slice(-16).map((m) => ({
    role: m.role,
    content: truncateForPrompt(m.content, 1500),
  }));

  const executionSummary = summarizeLatestExecution(latestExecution);

  const candidateTurnSummary = candidateTurn
    ? {
        transcript: truncateForPrompt(candidateTurn.transcript, 1500),
        codeSnapshot: truncateForPrompt(candidateTurn.codeSnapshot, 8000),
        elapsedSeconds: candidateTurn.elapsedSeconds,
      }
    : null;

  const payload = {
    stage,
    hintsUsed,
    nextAllowedHintLevel: hintsUsed >= 3 ? null : nextHintLevel,
    language,
    companyBehaviors: companyBehaviors ?? [],
    question: {
      id,
      title,
      difficulty,
      statement,
      constraints,
      clarifications,
      expectedApproaches,
      commonMistakes,
      edgeCases,
      followups,
      expectedComplexity,
      rubricNotes,
      // Progressive hints only — not a solution dump
      hintLadderVisible: visibleHints,
    },
    // Solutions intentionally omitted — evaluator-only elsewhere.
    transcript: recentTranscript,
    currentCode: truncateForPrompt(currentCode, 8000),
    candidateTurn: candidateTurnSummary,
    latestExecution: executionSummary,
    policyNotes: {
      hintLadder: "Unchanged — next hint level must equal hintsUsed + 1.",
      suggestedStage: "Advisory only; client/session validates and applies stages.",
      wait: 'WAIT is valid; message must be "" or " ".',
      codeAwareness:
        "Compare spoken claims vs codeSnapshot/currentCode; use latestExecution for run truth.",
      runtimeErrors: "Let the candidate debug; probe, do not fix.",
    },
    instructions:
      "Choose one action. Do not include solutions. Prefer questions. Obey hint ladder using hintsUsed. Compare claims vs code/execution. suggestedStage is advisory only.",
  };

  return JSON.stringify(payload, null, 2);
}
