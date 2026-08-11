import Link from "next/link";

interface InterviewControlsProps {
  resultsHref: string;
}

export function InterviewControls({ resultsHref }: InterviewControlsProps) {
  return (
    <div className="interview-controls">
      <button type="button" className="btn-secondary" disabled title="Day 3">
        Run Code
      </button>
      <Link href={resultsHref} className="btn-primary">
        End Interview
      </Link>
    </div>
  );
}
