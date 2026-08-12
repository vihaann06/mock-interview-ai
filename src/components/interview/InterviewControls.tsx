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

function formatOutput(result: CodeRunResult): string {
  const parts: string[] = [];
  if (result.timedOut) {
    parts.push("[timed out]");
  }
  if (result.stdout) {
    parts.push(result.stdout);
  }
  if (result.stderr) {
    parts.push(result.stderr);
  }
  if (parts.length === 0) {
    return result.ok ? "(no output)" : "(failed with no output)";
  }
  return parts.join("\n");
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
        provider: "pyodide",
      });
    } finally {
      setRunning(false);
    }
  };

  const output = lastResult == null ? null : formatOutput(lastResult);
  const statusLabel =
    lastResult == null
      ? null
      : lastResult.timedOut
        ? "Timed out"
        : lastResult.ok
          ? "Success"
          : "Error";

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
      {output != null && lastResult != null && (
        <div
          className={
            lastResult.ok && !lastResult.timedOut
              ? "run-output run-output--ok"
              : "run-output run-output--error"
          }
          role="status"
          aria-live="polite"
        >
          <div className="run-output-meta">
            <span>{statusLabel}</span>
            <span>
              {lastResult.provider}
              {lastResult.exitCode != null ? ` · exit ${lastResult.exitCode}` : ""}
            </span>
          </div>
          <pre>{output}</pre>
        </div>
      )}
    </div>
  );
}
