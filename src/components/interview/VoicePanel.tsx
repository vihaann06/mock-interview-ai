"use client";

import type { FinalSpeechTurn } from "@/lib/voice";
import {
  useVoiceInput,
  type VoiceUiStatus,
} from "@/hooks/useVoiceInput";

export interface VoicePanelProps {
  /** Shared submit path — identical to typed ConversationPanel send. */
  onSubmitTranscript: (text: string) => void | Promise<void>;
  disabled?: boolean;
  /** When true, voice EndOfTurn still queues UI as processing. */
  pending?: boolean;
  onVoiceTurnStart?: () => void;
  onVoiceTurnEnd?: (turn: FinalSpeechTurn) => void;
}

function statusLabel(status: VoiceUiStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "listening":
      return "Listening";
    case "candidate_speaking":
      return "Candidate speaking";
    case "processing":
      return "Processing";
    case "muted":
      return "Muted";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

/**
 * Mic controls + live draft transcript. Does not emit interview events for partials.
 * Confirmed STT EndOfTurn → onSubmitTranscript (one candidate_turn).
 */
export function VoicePanel({
  onSubmitTranscript,
  disabled = false,
  pending = false,
  onVoiceTurnStart,
  onVoiceTurnEnd,
}: VoicePanelProps) {
  const handleFinalTurn = async (turn: FinalSpeechTurn) => {
    const text = turn.transcript.trim();
    if (!text || disabled || pending) return;
    await onSubmitTranscript(text);
  };

  const { status, draftTranscript, error, muted, mute, unmute, retry } =
    useVoiceInput({
      enabled: !disabled,
      onFinalTurn: handleFinalTurn,
      onVoiceTurnStart,
      onVoiceTurnEnd,
    });

  const displayStatus: VoiceUiStatus =
    pending && status !== "error" && status !== "muted" && status !== "idle"
      ? "processing"
      : status;

  return (
    <section
      className="voice-panel"
      aria-label="Voice input"
      data-status={displayStatus}
    >
      <div className="voice-panel-controls">
        <button
          type="button"
          className="voice-mic-btn"
          aria-pressed={muted}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          disabled={disabled || displayStatus === "connecting"}
          onClick={() => {
            if (muted) unmute();
            else mute();
          }}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <span className="voice-status" aria-live="polite">
          {statusLabel(displayStatus)}
        </span>
        {displayStatus === "error" ? (
          <button
            type="button"
            className="voice-retry-btn"
            onClick={retry}
            disabled={disabled}
          >
            Retry
          </button>
        ) : null}
      </div>
      <p className="voice-draft" aria-live="polite">
        {draftTranscript.trim()
          ? draftTranscript
          : displayStatus === "listening"
            ? "Speak when ready…"
            : displayStatus === "muted"
              ? "Mic muted"
              : ""}
      </p>
      {error ? (
        <p className="voice-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
