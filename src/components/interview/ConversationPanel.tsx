"use client";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
}

interface ConversationPanelProps {
  messages: Message[];
  stageLabel: string;
}

/** Placeholder conversation panel — AI interviewer on Day 2, voice on Day 4. */
export function ConversationPanel({ messages, stageLabel }: ConversationPanelProps) {
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
      </div>
      <form
        className="conversation-compose"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <input
          type="text"
          placeholder="Type a reply (AI mocked for now)…"
          aria-label="Message the interviewer"
          disabled
        />
        <button type="submit" disabled>
          Send
        </button>
      </form>
    </section>
  );
}
