"use client";

import { useEffect, useState } from "react";

interface InterviewTimerProps {
  /** Preformatted label override (e.g. "00:00"). */
  label?: string;
  /** Session start epoch ms — when set, timer ticks from elapsed time. */
  startedAt?: number;
  /** Optional endedAt for frozen elapsed display. */
  endedAt?: number | null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Interview elapsed timer — ticks when `startedAt` is provided. */
export function InterviewTimer({
  label,
  startedAt = 0,
  endedAt = null,
}: InterviewTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || endedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, endedAt]);

  const display =
    label ??
    (startedAt
      ? formatElapsed((endedAt ?? now) - startedAt)
      : "00:00");

  return (
    <div className="interview-timer" aria-live="polite" aria-label="Interview timer">
      <span className="timer-dot" />
      <span>{display}</span>
    </div>
  );
}
