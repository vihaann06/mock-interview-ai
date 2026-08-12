"use client";

import { useState, type FormEvent } from "react";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
}

interface ConversationPanelProps {
  messages: Message[];
  stageLabel: string;
  onSend?: (message: string) => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
  disabled?: boolean;
}

/** Live conversation panel — candidate input wired to /api/interview/turn. */
export function ConversationPanel({
  messages,
  stageLabel,
  onSend,
  pending = false,
  error = null,
  disabled = false,
}: ConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const inputDisabled = disabled || pending || !onSend;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || inputDisabled) return;
    setDraft("");
    await onSend?.(text);
  }

  return (
    <section className="conversation-panel" aria-label="Interviewer conversation">
      <header className="conversation-header">
        <h2>Interviewer</h2>
        <span className="stage-badge">{stageLabel}</span>
      </header>
      <div className="conversation-thread">
        {messages.map((m, i) => (
          <div key={`${m.role}-${i}`} className={`msg msg-${m.role}`}>
            <span className="msg-role">
              {m.role === "interviewer" ? "Interviewer" : "You"}
            </span>
            <p>{m.content}</p>
          </div>
        ))}
        {pending ? (
          <p className="muted" aria-live="polite">
            Interviewer is thinking…
          </p>
        ) : null}
        {error ? (
          <p
            className="conversation-error"
            role="alert"
            style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}
          >
            {error}
          </p>
        ) : null}
      </div>
      <form className="conversation-compose" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            pending ? "Waiting for interviewer…" : "Type a reply…"
          }
          aria-label="Message the interviewer"
          disabled={inputDisabled}
        />
        <button type="submit" disabled={inputDisabled || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
