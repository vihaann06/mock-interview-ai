import type { InterviewerContextInput } from "./types";

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
4. Use WAIT when the candidate is actively coding or thinking and no intervention is needed (message can be empty-ish acknowledgment or a brief "take your time" — prefer a short note).
5. MOVE_FORWARD only when the current stage's goals are met (e.g. clarified assumptions, approach sketched, code written, tests discussed, complexity stated). Set suggestedStage to the next stage when moving forward.
6. Prefer PROBE / ASK_CLARIFICATION / REQUEST_EXPLANATION / CHALLENGE_ASSUMPTION over giving hints.
7. When giving a hint, phrase it as a leading question when possible; do not name the final data structure/algorithm unless you are on GIVE_HINT_3 and still keep it high-level.
8. Do not invent constraints that contradict the provided question metadata.
9. Observe the candidate's current code when provided; reference concrete observations briefly.

## Stages (goals)
- INTRO: greet briefly, state the problem is available, invite clarifying questions.
- CLARIFICATION: surface ambiguous inputs/outputs; answer from clarifications metadata.
- APPROACH_DISCUSSION: get them to propose an approach and tradeoffs before coding.
- CODING: let them implement; intervene only if stuck or violating constraints.
- TESTING: ask them to test / dry-run; REQUEST_TESTING as needed.
- COMPLEXITY_ANALYSIS: REQUEST_COMPLEXITY; push for time/space justification.
- WRAP_UP: brief close; optional follow-up question if they finished early.

## Output format
Respond with a single JSON object only (no markdown fences):
{"action":"<InterviewerAction>","message":"<spoken text to candidate>","suggestedStage":"<InterviewStage|null>"}

Valid actions:
ACKNOWLEDGE, PROBE, ASK_CLARIFICATION, CHALLENGE_ASSUMPTION, REQUEST_EXPLANATION,
REQUEST_COMPLEXITY, GIVE_HINT_1, GIVE_HINT_2, GIVE_HINT_3, REQUEST_TESTING,
MOVE_FORWARD, WAIT.
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
    content: m.content.slice(0, 1500),
  }));

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
    currentCode: currentCode.slice(0, 8000),
    instructions:
      "Choose one action. Do not include solutions. Prefer questions. Obey hint ladder using hintsUsed.",
  };

  return JSON.stringify(payload, null, 2);
}
