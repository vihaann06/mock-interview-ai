import OpenAI from "openai";
import { getCompanyById } from "@/lib/data/companies";
import { getQuestionById } from "@/lib/data/questions";
import {
  assertActionAllowed,
  buildInterviewerContext,
  buildSystemPrompt,
  enforceInterviewerPolicy,
  tryParseInterviewerResponse,
} from "@/lib/interviewer";
import { updateCandidateReasoningState } from "@/lib/interviewer/reasoning-state";
import type {
  CandidateReasoningState,
  InterviewMessage,
  InterviewSession,
  InterviewStage,
  LatestExecution,
} from "@/lib/types/interview";

export const runtime = "nodejs";

interface TurnRequestBody {
  candidateMessage: string;
  questionId: string;
  companyId: string;
  /** Full or partial session snapshot — never trusted for auth; used for context only. */
  session?: Partial<InterviewSession> & {
    stage?: InterviewStage;
    hintsUsed?: number;
    code?: string;
    messages?: InterviewMessage[];
    latestExecution?: LatestExecution | null;
    reasoningState?: CandidateReasoningState | null;
  };
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isLatestExecution(value: unknown): value is LatestExecution {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.status === "string" &&
    typeof v.ranAt === "number" &&
    ["success", "error", "timeout", "not_run"].includes(v.status)
  );
}

function isReasoningState(value: unknown): value is CandidateReasoningState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.claims) &&
    Array.isArray(v.approaches) &&
    Array.isArray(v.resolvedTopics) &&
    Array.isArray(v.unresolvedConcerns) &&
    Array.isArray(v.questionsAlreadyAsked) &&
    Array.isArray(v.hintsGiven) &&
    typeof v.updatedAt === "number"
  );
}

export async function POST(req: Request) {
  let body: TurnRequestBody;
  try {
    body = (await req.json()) as TurnRequestBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const candidateMessage = body.candidateMessage?.trim();
  const questionId = body.questionId?.trim();
  const companyId = body.companyId?.trim();

  if (!candidateMessage) {
    return jsonError("candidateMessage is required", 400);
  }
  if (!questionId) {
    return jsonError("questionId is required", 400);
  }
  if (!companyId) {
    return jsonError("companyId is required", 400);
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return jsonError(`Unknown questionId: ${questionId}`, 404);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError(
      "OPENAI_API_KEY is not configured. Set it in .env.local (see .env.example).",
      500,
    );
  }

  const company = getCompanyById(companyId);
  const session = body.session ?? {};
  const stage: InterviewStage = session.stage ?? "INTRO";
  const hintsUsed = typeof session.hintsUsed === "number" ? session.hintsUsed : 0;
  const code = session.code ?? question.starterCode ?? "";
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const latestExecution = isLatestExecution(session.latestExecution)
    ? session.latestExecution
    : null;
  const priorReasoningState = isReasoningState(session.reasoningState)
    ? session.reasoningState
    : null;

  const transcript = messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.action ? { action: m.action } : {}),
  }));

  // Ensure the latest candidate turn is present even if the client omitted it.
  const last = transcript[transcript.length - 1];
  if (!last || last.role !== "candidate" || last.content !== candidateMessage) {
    transcript.push({ role: "candidate", content: candidateMessage });
  }

  const reasoningUpdateBase = {
    transcript,
    candidateMessage,
    code,
    question,
    stage,
    latestExecution,
  };

  let reasoningState = updateCandidateReasoningState(
    priorReasoningState,
    reasoningUpdateBase,
  );

  const startedAt =
    typeof session.startedAt === "number" && session.startedAt > 0
      ? session.startedAt
      : null;
  const elapsedSeconds = startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    : 0;

  const lastInterviewerMessages = messages
    .filter((m) => m.role === "interviewer")
    .slice(-8)
    .map((m) => ({
      content: m.content,
      ...(m.action ? { action: m.action } : {}),
    }));

  const system = buildSystemPrompt(company?.behaviors);
  const user = buildInterviewerContext({
    question,
    stage,
    transcript,
    hintsUsed,
    currentCode: code,
    companyBehaviors: company?.behaviors,
    language: session.language ?? "python",
    latestExecution,
    candidateTurn: {
      transcript: candidateMessage,
      codeSnapshot: code,
      elapsedSeconds,
    },
    reasoningState,
  });

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  let content: string | null | undefined;
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.65,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    content = completion.choices[0]?.message?.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OpenAI request failed";
    return jsonError(message, 502);
  }

  if (!content) {
    return jsonError("Empty model response", 502);
  }

  const parsed = tryParseInterviewerResponse(content);
  if (!parsed.ok) {
    return jsonError(`Invalid interviewer JSON: ${parsed.error}`, 502);
  }

  const sanitized = enforceInterviewerPolicy(parsed.value, {
    hintsUsed,
    stage,
    candidateMessage,
    reasoningState,
    lastInterviewerMessages,
  });

  try {
    assertActionAllowed(sanitized.action, {
      hintsUsed,
      stage,
      candidateMessage,
      reasoningState,
      lastInterviewerMessages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action not allowed";
    return jsonError(message, 422);
  }

  // Record asked questions after policy sanitization (final spoken text).
  reasoningState = updateCandidateReasoningState(reasoningState, {
    ...reasoningUpdateBase,
    lastInterviewerMessage: sanitized,
  });

  // suggestedStage is returned for the client — advisory only; do not apply server-side.
  return Response.json({ response: sanitized, reasoningState });
}
