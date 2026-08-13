"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { ConversationPanel } from "@/components/interview/ConversationPanel";
import { InactivityWatcher } from "@/components/interview/InactivityWatcher";
import { InterviewControls } from "@/components/interview/InterviewControls";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { VoicePanel } from "@/components/interview/VoicePanel";
import { getQuestionById } from "@/lib/data/questions";
import {
  applyHintFromAction,
  applyStageAction,
  createSession,
  endInterview,
  getStageLabel,
  mergeActivityClocks,
  moveForward,
  readSessionActivityClocks,
  recordCandidateTurn,
  recordExecutionRun,
  recordInterviewerTurn,
  snapshotCode,
  startInterview,
  touchCodeActivity,
  type LongInactivityPayload,
} from "@/lib/interview";
import {
  toLatestExecution,
  type CodeRunResult,
} from "@/lib/execution";
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
  // WAIT: records interviewer_turn with no chat bubble.
  let next = recordInterviewerTurn(session, reply.message, reply.action);

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
    s = recordInterviewerTurn(s, opening, "ASK_CLARIFICATION");
    return s;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Local mirrors until session clocks are fully wired by other agents. */
  const [localActivity, setLocalActivity] = useState<{
    lastCandidateTurnAt: number | null;
    lastCodeActivityAt: number | null;
    lastExecutionAt: number | null;
  }>({
    lastCandidateTurnAt: null,
    lastCodeActivityAt: null,
    lastExecutionAt: null,
  });

  const handleLongInactivity = useCallback((payload: LongInactivityPayload) => {
    void payload;
    // Later: wire to interviewer PROBE vs WAIT via suggestInactivityFollowUp.
    // Do not speak or call /api/interview/turn automatically from here.
  }, []);

  const handleCodeChange = useCallback((code: string) => {
    setLocalActivity((prev) => ({
      ...prev,
      lastCodeActivityAt: Date.now(),
    }));
    setSession((prev) => {
      if (!prev || prev.endedAt) return prev;
      try {
        return touchCodeActivity(prev, code);
      } catch {
        return { ...prev, code, lastCodeActivityAt: Date.now() };
      }
    });
  }, []);
  const handleStableSnapshot = useCallback((code: string) => {
    setSession((prev) => {
      if (!prev || prev.endedAt) return prev;
      try {
        const withCode =
          prev.code === code ? prev : touchCodeActivity(prev, code);
        return snapshotCode(withCode);
      } catch {
        return prev;
      }
    });
  }, []);

  const handleExecutionResult = useCallback((result: CodeRunResult) => {
    setSession((prev) => {
      if (!prev || prev.endedAt) return prev;
      try {
        return recordExecutionRun(prev, toLatestExecution(result));
      } catch {
        return {
          ...prev,
          latestExecution: toLatestExecution(result),
          lastExecutionAt: Date.now(),
        };
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

  /**
   * Shared candidate turn path for typed chat and voice EndOfTurn.
   * Exactly one recordCandidateTurn + /api/interview/turn per non-empty transcript.
   */
  const submitCandidateTranscript = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !session || !question || pending || session.endedAt) return;

      setError(null);
      let withCandidate: InterviewSession;
      try {
        withCandidate = recordCandidateTurn(session, {
          transcript: message,
          codeSnapshot: session.code,
          latestExecution: session.latestExecution,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record message");
        return;
      }
      setSession(withCandidate);
      setLocalActivity((prev) => ({
        ...prev,
        lastCandidateTurnAt: Date.now(),
      }));
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
              latestExecution: withCandidate.latestExecution,
              lastCandidateTurnAt: withCandidate.lastCandidateTurnAt,
              lastCodeActivityAt: withCandidate.lastCodeActivityAt,
              lastExecutionAt: withCandidate.lastExecutionAt,
            },
          }),
        });

        const data = (await res.json()) as {
          response?: InterviewerResponse;
          error?: string;
        };

        if (!res.ok || !data.response) {
          // Keep candidate turn; do not wipe session on API failure.
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

  const handleSend = useCallback(
    (message: string) => submitCandidateTranscript(message),
    [submitCandidateTranscript],
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
      action: m.action,
    }));

  const activityClocks = mergeActivityClocks(
    readSessionActivityClocks(session),
    localActivity,
  );

  return (
    <main className="interview-room">
      <InactivityWatcher
        startedAt={activityClocks.startedAt}
        endedAt={activityClocks.endedAt}
        lastCandidateTurnAt={activityClocks.lastCandidateTurnAt}
        lastCodeActivityAt={activityClocks.lastCodeActivityAt}
        lastExecutionAt={activityClocks.lastExecutionAt}
        enabled={!session.endedAt}
        onLongInactivity={handleLongInactivity}
      />
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
          onExecutionResult={handleExecutionResult}
        />
      </div>

      <div className="conversation-column">
        <ConversationPanel
          messages={panelMessages}
          stageLabel={getStageLabel(session.stage)}
          onSend={handleSend}
          pending={pending}
          error={error}
          disabled={Boolean(session.endedAt)}
        />
        <VoicePanel
          onSubmitTranscript={submitCandidateTranscript}
          pending={pending}
          disabled={Boolean(session.endedAt)}
        />
      </div>
    </main>
  );
}
