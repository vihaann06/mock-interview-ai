interface InterviewTimerProps {
  label?: string;
}

/** Placeholder timer — wire to session clock later. */
export function InterviewTimer({ label = "00:00" }: InterviewTimerProps) {
  return (
    <div className="interview-timer" aria-live="polite" aria-label="Interview timer">
      <span className="timer-dot" />
      <span>{label}</span>
    </div>
  );
}
