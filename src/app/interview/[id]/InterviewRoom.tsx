"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CodeEditor } from "@/components/interview/CodeEditor";
import { ConversationPanel } from "@/components/interview/ConversationPanel";
import { InterviewControls } from "@/components/interview/InterviewControls";
import { InterviewTimer } from "@/components/interview/InterviewTimer";
import { ProblemPanel } from "@/components/interview/ProblemPanel";
import { VoiceOrchestratorHost } from "@/components/interview/VoiceOrchestratorHost";
import { VoicePanel } from "@/components/interview/VoicePanel";
import type { UseVoiceOrchestratorResult } from "@/hooks/useVoiceOrchestrator";
import { useInterviewerSpeech } from "@/hooks/useInterviewerSpeech";
import { getQuestionById } from "@/lib/data/questions";
import {
  applyHintFromAction,
  applyStageAction,
  buildOpeningMessage,
  createSession,
  endInterview,
  getStageLabel,
  mergeActivityClocks,
  readSessionActivityClocks,
  recordCandidateTurn,
  recordExecutionRun,
  recordInterviewerTurn,
  snapshotCode,
  startInterview,
  touchCodeActivity,
} from "@/lib/interview";
import {
  toLatestExecution,
  type CodeRunResult,
} from "@/lib/execution";
import type {
  CandidateReasoningState,
  InterviewerAction,
  InterviewerResponse,
  InterviewSession,
} from "@/lib/types/interview";
import type { FinalSpeechTurn } from "@/lib/voice";
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

const OPENING_FETCH_TIMEOUT_MS = 8000;

/** Replace the seeded INTRO interviewer bubble; do not append a second opening. */
function replaceOpeningInterviewerMessage(
  session: InterviewSession,
  message: string,
): InterviewSession {
  if (session.messages.some((m) => m.role === "candidate")) {
    return session;
  }

  const idx = session.messages.findIndex((m) => m.role === "interviewer");
  if (idx < 0) {
    return recordInterviewerTurn(session, message, "ASK_CLARIFICATION");
  }

  let replacedEvent = false;
  const events = session.events.map((event) => {
    if (
      !replacedEvent &&
      event.type === "interviewer_turn" &&
      event.metadata?.action === "ASK_CLARIFICATION"
    ) {
      replacedEvent = true;
      return { ...event, content: message };
    }
    return event;
  });

  return {
    ...session,
    stage: "INTRO",
    messages: session.messages.map((m, i) =>
      i === idx ? { ...m, content: message, action: "ASK_CLARIFICATION" as const } : m,
    ),
    events,
  };
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
  const { speakInterviewer, stopSpeaking } = useInterviewerSpeech();
  const orchestratorRef = useRef<UseVoiceOrchestratorResult | null>(null);
  const spokenOpeningRef = useRef(false);
  const [orchestratorReady, setOrchestratorReady] = useState(false);
  const [openingSettled, setOpeningSettled] = useState(() => !question);

  const fallbackOpening = useMemo(() => {
    if (!question) return "Problem not found.";
    return buildOpeningMessage(question);
  }, [question]);
  const openingToSpeakRef = useRef(fallbackOpening);

  const [session, setSession] = useState<InterviewSession | null>(() => {
    if (!question) return null;
    let s = createSession({
      companyId,
      questionId: question.id,
      starterCode: question.starterCode,
      language: "python",
    });
    s = startInterview(s);
    // Seed fallback immediately so the UI isn't empty; stay on INTRO.
    s = recordInterviewerTurn(s, fallbackOpening, "ASK_CLARIFICATION");
    return s;
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch an LLM opening after mount. Seeded fallback stays if the request
   * fails or times out (~8s). TTS waits until this settles so we speak once.
   */
  useEffect(() => {
    if (!question) {
      return;
    }

    openingToSpeakRef.current = fallbackOpening;

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      OPENING_FETCH_TIMEOUT_MS,
    );

    void (async () => {
      try {
        const res = await fetch("/api/interview/opening", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            companyId,
          }),
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          response?: InterviewerResponse;
          error?: string;
        };
        const message = data.response?.message?.trim();
        if (!cancelled && res.ok && message) {
          setSession((prev) => {
            if (!prev || prev.messages.some((m) => m.role === "candidate")) {
              return prev;
            }
            openingToSpeakRef.current = message;
            return replaceOpeningInterviewerMessage(prev, message);
          });
        }
      } catch {
        // Timeout / network — keep seeded fallback.
      } finally {
        window.clearTimeout(timer);
        if (!cancelled) setOpeningSettled(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [question, companyId, fallbackOpening]);

  /** Speak the opening once: after fetch settles AND voice/TTS is ready. */
  useEffect(() => {
    if (!orchestratorReady || !openingSettled || spokenOpeningRef.current) {
      return;
    }
    if (session?.messages.some((m) => m.role === "candidate")) {
      spokenOpeningRef.current = true;
      return;
    }
    const text = openingToSpeakRef.current.trim();
    if (!text) return;
    spokenOpeningRef.current = true;
    void speakInterviewer(text);
  }, [orchestratorReady, openingSettled, speakInterviewer, session]);
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
    stopSpeaking();
    setSession((prev) => {
      if (!prev) return prev;
      try {
        return endInterview(prev);
      } catch {
        return prev;
      }
    });
  }, [stopSpeaking]);

  const onOrchestratorReady = useCallback((api: UseVoiceOrchestratorResult) => {
    orchestratorRef.current = api;
    setOrchestratorReady(true);
  }, []);

  /**
   * Shared submit for typed chat, voice EndOfTurn, and inactivity probe.
   * Returns interviewer response for the voice orchestrator (TTS / WAIT).
   */
  const submitCandidateTranscript = useCallback(
    async (message: string): Promise<InterviewerResponse | null> => {
      const text = message.trim();
      if (!text || !session || !question || pending || session.endedAt) {
        return null;
      }

      setError(null);
      let withCandidate: InterviewSession;
      try {
        withCandidate = recordCandidateTurn(session, {
          transcript: text,
          codeSnapshot: session.code,
          latestExecution: session.latestExecution,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record message");
        return null;
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
            candidateMessage: text,
            questionId: question.id,
            companyId: withCandidate.companyId,
            session: {
              id: withCandidate.id,
              stage: withCandidate.stage,
              startedAt: withCandidate.startedAt,
              hintsUsed: withCandidate.hintsUsed,
              code: withCandidate.code,
              messages: withCandidate.messages,
              language: withCandidate.language,
              latestExecution: withCandidate.latestExecution,
              lastCandidateTurnAt: withCandidate.lastCandidateTurnAt,
              lastCodeActivityAt: withCandidate.lastCodeActivityAt,
              lastExecutionAt: withCandidate.lastExecutionAt,
              reasoningState: withCandidate.reasoningState ?? null,
            },
          }),
        });

        const data = (await res.json()) as {
          response?: InterviewerResponse;
          reasoningState?: CandidateReasoningState | null;
          error?: string;
        };

        if (!res.ok || !data.response) {
          // Keep candidate turn; do not wipe session on API failure.
          setError(data.error || `Turn failed (${res.status})`);
          return null;
        }

        const reply = data.response;
        const nextReasoning = data.reasoningState;
        setSession((prev) => {
          const base = prev ?? withCandidate;
          try {
            const applied = applyInterviewerTurn(base, reply);
            if (nextReasoning === undefined) return applied;
            return { ...applied, reasoningState: nextReasoning };
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to apply reply");
            return base;
          }
        });
        return reply;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        return null;
      } finally {
        setPending(false);
      }
    },
    [session, question, pending],
  );

  /** Typed chat: submit once, then let orchestrator speak (if any). */
  const handleSend = useCallback(
    async (message: string) => {
      const reply = await submitCandidateTranscript(message);
      if (reply) {
        await orchestratorRef.current?.handleInterviewerResponse(reply);
      }
    },
    [submitCandidateTranscript],
  );

  /**
   * Spoken turn complete → orchestrator only (barge-in state + one submit + TTS).
   * Do not also call submitCandidateTranscript here — handleSpeechEnded owns that.
   */
  const handleVoiceSubmit = useCallback(async (text: string) => {
    const turn: FinalSpeechTurn = {
      transcript: text,
      endedAt: Date.now(),
    };
    await orchestratorRef.current?.handleSpeechEnded(turn);
  }, []);

  const handleVoiceTurnStart = useCallback(() => {
    orchestratorRef.current?.handleSpeechStarted();
  }, []);

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
      <VoiceOrchestratorHost
        startedAt={activityClocks.startedAt}
        endedAt={activityClocks.endedAt}
        lastCandidateTurnAt={activityClocks.lastCandidateTurnAt}
        lastCodeActivityAt={activityClocks.lastCodeActivityAt}
        lastExecutionAt={activityClocks.lastExecutionAt}
        enabled={!session.endedAt}
        interviewActive={!session.endedAt}
        submitCandidateTurn={submitCandidateTranscript}
        speakInterviewer={speakInterviewer}
        stopSpeaking={stopSpeaking}
        onOrchestratorReady={onOrchestratorReady}
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
          onSubmitTranscript={handleVoiceSubmit}
          onVoiceTurnStart={handleVoiceTurnStart}
          pending={pending}
          disabled={!orchestratorReady || Boolean(session.endedAt)}
        />
      </div>
    </main>
  );
}
