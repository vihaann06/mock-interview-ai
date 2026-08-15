import OpenAI from "openai";
import { getCompanyById } from "@/lib/data/companies";
import { getQuestionById } from "@/lib/data/questions";
import {
  buildInterviewerContext,
  buildSystemPrompt,
  tryParseInterviewerResponse,
} from "@/lib/interviewer";
import type { InterviewerResponse } from "@/lib/types/interview";

export const runtime = "nodejs";

interface OpeningRequestBody {
  questionId: string;
  companyId: string;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: OpeningRequestBody;
  try {
    body = (await req.json()) as OpeningRequestBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const questionId = body.questionId?.trim();
  const companyId = body.companyId?.trim();

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
  const starter = question.starterCode ?? "";

  const system = buildSystemPrompt(company?.behaviors);
  const user = buildInterviewerContext({
    question,
    stage: "INTRO",
    transcript: [],
    hintsUsed: 0,
    currentCode: starter,
    companyBehaviors: company?.behaviors,
    language: "python",
    isOpeningTurn: true,
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
      temperature: 0.8,
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

  const message = parsed.value.message.trim();
  if (!message) {
    return jsonError("Empty model response", 502);
  }

  const response: InterviewerResponse = {
    action: "ASK_CLARIFICATION",
    message,
    suggestedStage: null,
  };

  return Response.json({ response });
}
