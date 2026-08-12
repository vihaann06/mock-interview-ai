"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { ConversationPanel } from "@/components/interview/ConversationPanel";
import { InterviewControls } from "@/components/interview/InterviewControls";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { getQuestionById } from "@/lib/data/questions";
import { getStageLabel } from "@/lib/interview/stages";
import type {
  InterviewerResponse,
  InterviewSession,
} from "@/lib/types/interview";
import {
  appendCandidateMessage,
  appendInterviewerMessage,
  applyHintFromAction,
  applySuggestedStageIfSafe,
  createSession,
  endInterview,
  moveForwardIfSafe,
  startInterview,
  updateSessionCode,
} from "./session-client";

export function InterviewRoom() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company") ?? "google";
  const question = getQuestionById(params.id);

  const opening = useMemo(() => {
    if (!question) return "Problem not found.";
    return `Let's work through "${question.title}". Take a moment to read the problem. What clarifying questions do you have before we discuss an approach?`;
  }, [question]);

  const [session, setSession] = useState<InterviewSession | null>(() => {
    if (!question) return null;
    const created = createSession({
      companyId,
      questionId: question.id,
      starterCode: question.starterCode,
    });
    return startInterview(created, opening);
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = useCallback((code: string) => {
    setSession((prev) => (prev ? updateSessionCode(prev, code) : prev));
  }, []);

  const handleEnd = useCallback(() => {
    setSession((prev) => (prev ? endInterview(prev) : prev));
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (!session || !question || pending) return;

      setError(null);
      const withCandidate = appendCandidateMessage(session, message);
      setSession(withCandidate);
      setPending(true);

      try {
        const res = await fetch("/api/interview/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateMessage: message,
            questionId: question.id,
            companyId: session.companyId,
            session: {
              id: withCandidate.id,
              stage: withCandidate.stage,
              hintsUsed: withCandidate.hintsUsed,
              code: withCandidate.code,
              messages: withCandidate.messages,
              language: withCandidate.language,
            },
          }),
        });

        const data = (await res.json()) as {
          response?: InterviewerResponse;
          error?: string;
        };

        if (!res.ok || !data.response) {
          setError(data.error || `Turn failed (${res.status})`);
          return;
        }

        const reply = data.response;
        setSession((prev) => {
          const base = prev ?? withCandidate;
          let next = appendInterviewerMessage(base, reply.message, reply.action);
          next = applyHintFromAction(next, reply.action);
          if (reply.action === "MOVE_FORWARD") {
            next = moveForwardIfSafe(next);
          } else {
            // Optional: honor suggestedStage only when it is the immediate next stage.
            next = applySuggestedStageIfSafe(next, reply.suggestedStage);
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setPending(false);
      }
    },
    [session, question, pending],
  );

  if (!question || !session) {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Question not found</h1>
          <p>Pick another problem from setup.</p>
        </header>
      </main>
    );
  }

  const panelMessages = session.messages
    .filter((m) => m.role === "interviewer" || m.role === "candidate")
    .map((m) => ({
      role: m.role as "interviewer" | "candidate",
      content: m.content,
    }));

  return (
    <main className="interview-room">
      <div className="interview-topbar">
        <h1>
          {companyId.charAt(0).toUpperCase() + companyId.slice(1)}-style ·{" "}
          {question.title}
        </h1>
        <InterviewTimer
          startedAt={session.startedAt}
          endedAt={session.endedAt}
        />
      </div>

      <ProblemPanel
        title={question.title}
        difficulty={question.difficulty}
        statement={question.statement}
        constraints={question.constraints}
      />

      <div className="editor-stack">
        <CodeEditor value={session.code} onChange={handleCodeChange} />
        <InterviewControls
          resultsHref={`/results/${question.id}`}
          onEnd={handleEnd}
        />
      </div>

      <ConversationPanel
        messages={panelMessages}
        stageLabel={getStageLabel(session.stage)}
        onSend={handleSend}
        pending={pending}
        error={error}
        disabled={Boolean(session.endedAt)}
      />
    </main>
  );
}
