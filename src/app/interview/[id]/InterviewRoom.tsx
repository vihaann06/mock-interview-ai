"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { ConversationPanel } from "@/components/interview/ConversationPanel";
import { InterviewControls } from "@/components/interview/InterviewControls";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { getQuestionById } from "@/lib/data/questions";
import { getStageLabel } from "@/lib/interview/stages";
import type { InterviewStage } from "@/lib/types/interview";

export function InterviewRoom() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company") ?? "google";
  const question = getQuestionById(params.id);

  const [code, setCode] = useState(question?.starterCode ?? "");
  const stage: InterviewStage = "CLARIFICATION";

  const messages = useMemo(
    () => [
      {
        role: "interviewer" as const,
        content: question
          ? `Let's work through "${question.title}". Take a moment to read the problem. What clarifying questions do you have before we discuss an approach?`
          : "Problem not found.",
      },
    ],
    [question],
  );

  if (!question) {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Question not found</h1>
          <p>Pick another problem from setup.</p>
        </header>
      </main>
    );
  }

  return (
    <main className="interview-room">
      <div className="interview-topbar">
        <h1>
          {companyId.charAt(0).toUpperCase() + companyId.slice(1)}-style ·{" "}
          {question.title}
        </h1>
        <InterviewTimer label="00:00" />
      </div>

      <ProblemPanel
        title={question.title}
        difficulty={question.difficulty}
        statement={question.statement}
        constraints={question.constraints}
      />

      <div className="editor-stack">
        <CodeEditor value={code} onChange={setCode} />
        <InterviewControls resultsHref={`/results/${question.id}`} />
      </div>

      <ConversationPanel messages={messages} stageLabel={getStageLabel(stage)} />
    </main>
  );
}
