"use client";

import { useState } from "react";
import Link from "next/link";
import {
  getEditorBuffer,
  runCode,
  type CodeRunResult,
} from "@/lib/execution";

interface InterviewControlsProps {
  resultsHref: string;
  /** Optional hook before navigating to results (e.g. mark session ended). */
  onEnd?: () => void;
  /** Optional override; falls back to live editor buffer. */
  code?: string;
  language?: "python";
}

export function InterviewControls({
  resultsHref,
  onEnd,
  code,
  language,
}: InterviewControlsProps) {
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CodeRunResult | null>(null);

  const handleRun = async () => {
    setRunning(true);
    try {
      const buffer = getEditorBuffer();
      const result = await runCode({
        language: language ?? buffer.language,
        code: code ?? buffer.code,
      });
      setLastResult(result);
    } catch (err) {
      setLastResult({
        ok: false,
        stdout: "",
        stderr: err instanceof Error ? err.message : "Run failed",
        exitCode: null,
        provider: "mock",
      });
    } finally {
      setRunning(false);
    }
  };

  const output =
    lastResult == null
      ? null
      : [lastResult.stdout, lastResult.stderr].filter(Boolean).join("\n") ||
        "(no output)";

  return (
    <div className="interview-controls-wrap">
      <div className="interview-controls">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRun}
          disabled={running}
          aria-busy={running}
        >
          {running ? "Running…" : "Run Code"}
        </button>
        <Link
          href={resultsHref}
          className="btn-primary"
          onClick={() => onEnd?.()}
        >
          End Interview
        </Link>
      </div>
      {output != null && (
        <pre
          className="run-output"
          role="status"
          aria-live="polite"
          style={{
            margin: "0.5rem 0 0",
            padding: "0.65rem 0.75rem",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: "0.75rem",
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
            color: "var(--ink-muted)",
            background: "transparent",
            borderTop: "1px solid var(--line)",
            maxHeight: "6rem",
            overflow: "auto",
          }}
        >
          {output}
        </pre>
      )}
    </div>
  );
}
