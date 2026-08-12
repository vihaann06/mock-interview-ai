"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { ConversationPanel } from "@/components/interview/ConversationPanel";
import { InterviewControls } from "@/components/interview/InterviewControls";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { getQuestionById } from "@/lib/data/questions";
import {
  appendCandidateMessage,
  appendInterviewerMessage,
  applyHintFromAction,
  applyStageAction,
  createSession,
  endInterview,
  getStageLabel,
  moveForward,
  snapshotCode,
  startInterview,
  updateCode,
} from "@/lib/interview";
import type {
  InterviewerAction,
  InterviewerResponse,
  InterviewSession,
} from "@/lib/types/interview";
import "../interview-room.css";

function isHintAction(
  action: InterviewerAction,
): action is "GIVE_HINT_1" | "GIVE_HINT_2" | "GIVE_HINT_3" {
  return (
    action === "GIVE_HINT_1" ||
    action === "GIVE_HINT_2" ||
    action === "GIVE_HINT_3"
  );
}

function applyInterviewerTurn(
  session: InterviewSession,
  reply: InterviewerResponse,
): InterviewSession {
  let next = appendInterviewerMessage(session, reply.message, reply.action);

  if (isHintAction(reply.action)) {
    try {
      next = applyHintFromAction(next, reply.action, reply.message);
    } catch {
      // Ladder already enforced server-side; ignore client-side races.
    }
  }

  try {
    next = applyStageAction(next, reply.action, reply.suggestedStage);
  } catch {
    // Never let a bad stage suggestion wipe the turn.
  }

  return next;
}

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
    let s = createSession({
      companyId,
      questionId: question.id,
      starterCode: question.starterCode,
      language: "python",
    });
    s = startInterview(s);
    // Move into clarification for the opening prompt.
    try {
      s = moveForward(s);
    } catch {
      // stay on INTRO if transition fails
    }
    s = appendInterviewerMessage(s, opening);
    return s;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = useCallback((code: string) => {
    setSession((prev) => {
      if (!prev || prev.endedAt) return prev;
      try {
        return updateCode(prev, code);
      } catch {
        return { ...prev, code };
      }
    });
  }, []);

  const handleStableSnapshot = useCallback((code: string) => {
    setSession((prev) => {
      if (!prev || prev.endedAt) return prev;
      try {
        const withCode = prev.code === code ? prev : updateCode(prev, code);
        return snapshotCode(withCode);
      } catch {
        return prev;
      }
    });
  }, []);

  const handleEnd = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      try {
        return endInterview(prev);
      } catch {
        return prev;
      }
    });
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (!session || !question || pending || session.endedAt) return;

      setError(null);
      let withCandidate: InterviewSession;
      try {
        withCandidate = appendCandidateMessage(session, message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record message");
        return;
      }
      setSession(withCandidate);
      setPending(true);

      try {
        const res = await fetch("/api/interview/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateMessage: message,
            questionId: question.id,
            companyId: withCandidate.companyId,
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
          try {
            return applyInterviewerTurn(base, reply);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to apply reply");
            return base;
          }
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
        <CodeEditor
          value={session.code}
          onChange={handleCodeChange}
          language="python"
          onStableSnapshot={handleStableSnapshot}
        />
        <InterviewControls
          resultsHref={`/results/${question.id}`}
          onEnd={handleEnd}
          code={session.code}
          language="python"
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
