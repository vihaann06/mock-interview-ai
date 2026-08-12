/**
 * TEMP — Agent 3 compile stub. Replace with Agent 2 `src/lib/interviewer` merge.
 */
import type { InterviewMessage, InterviewStage } from "@/lib/types/interview";
import type { Question } from "@/lib/types/question";

export interface InterviewerContextInput {
  question: Question;
  stage: InterviewStage;
  messages: InterviewMessage[];
  hintsUsed: number;
  code: string;
  companyBehaviors?: string[];
  candidateMessage: string;
}

const DEFAULT_BEHAVIORS = [
  "Encourage reasoning before implementation",
  "Probe algorithmic complexity",
  "Prefer hints framed as questions",
  "Do not confirm correctness outright — probe instead",
];

export function buildSystemPrompt(companyBehaviors?: string[]): string {
  const behaviors = companyBehaviors?.length ? companyBehaviors : DEFAULT_BEHAVIORS;
  return [
    "You are a technical interviewer running a live coding interview.",
    "You are NOT a tutor. Keep responses short. Prefer questions over lectures.",
    "Never dump full solutions, complete algorithms, or copy-pasteable code that solves the problem.",
    "Respect the hint ladder: only give the next allowed hint level when choosing GIVE_HINT_n.",
    "Do not over-praise. If asked whether an answer is correct, probe instead of confirming.",
    "Use WAIT when the candidate needs space. Use MOVE_FORWARD only when stage goals are met.",
    "Company-style behaviors:",
    ...behaviors.map((b) => `- ${b}`),
    "",
    "Respond with a single JSON object only, matching:",
    '{"action":"<InterviewerAction>","message":"<short interviewer utterance>","suggestedStage":"<InterviewStage>|null"}',
    "suggestedStage is optional and may be ignored by the client — never assume it will be applied.",
  ].join("\n");
}

export function buildInterviewerContext(input: InterviewerContextInput): string {
  const {
    question,
    stage,
    messages,
    hintsUsed,
    code,
    candidateMessage,
  } = input;

  const transcript = messages
    .filter((m) => m.role !== "system")
    .slice(-20)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const hints = question.hintLadder
    .map((h) => `Level ${h.level}: ${h.text}`)
    .join("\n");

  return [
    `Current stage: ${stage}`,
    `Hints already used: ${hintsUsed} (next allowed hint level is ${hintsUsed + 1} if ≤ 3)`,
    "",
    `Problem title: ${question.title}`,
    `Difficulty: ${question.difficulty}`,
    `Statement: ${question.statement}`,
    `Constraints: ${question.constraints.join("; ")}`,
    `Clarifications interviewer may use: ${question.clarifications.join("; ")}`,
    `Expected approaches (high-level, do not reveal verbatim solutions): ${question.expectedApproaches.join("; ")}`,
    `Common mistakes to watch for: ${question.commonMistakes.join("; ")}`,
    `Edge cases: ${question.edgeCases.join("; ")}`,
    `Expected complexity: time ${question.expectedComplexity.time}, space ${question.expectedComplexity.space}`,
    "",
    "Hint ladder (use only the next unused level when giving a hint):",
    hints || "(none)",
    "",
    "Recent transcript:",
    transcript || "(empty)",
    "",
    "Candidate current code:",
    "```",
    code || "(empty)",
    "```",
    "",
    `Latest candidate message: ${candidateMessage}`,
    "",
    "Choose exactly one action and reply as JSON.",
  ].join("\n");
}
