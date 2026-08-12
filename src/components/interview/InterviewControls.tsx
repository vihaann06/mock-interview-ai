import Link from "next/link";

interface InterviewControlsProps {
  resultsHref: string;
  /** Optional hook before navigating to results (e.g. mark session ended). */
  onEnd?: () => void;
}

export function InterviewControls({ resultsHref, onEnd }: InterviewControlsProps) {
  return (
    <div className="interview-controls">
      <button type="button" className="btn-secondary" disabled title="Day 3">
        Run Code
      </button>
      <Link
        href={resultsHref}
        className="btn-primary"
        onClick={() => onEnd?.()}
      >
        End Interview
      </Link>
    </div>
  );
}
