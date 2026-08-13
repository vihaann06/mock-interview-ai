import type { LatestExecution } from "@/lib/types/interview";

const DEFAULT_IO_MAX = 1500;

/** Truncate long stdout/stderr for model-visible context. */
export function truncateForPrompt(text: string, max = DEFAULT_IO_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

/**
 * Normalize execution for interviewer prompts.
 * Returns null when there is no useful run to show.
 */
export function summarizeLatestExecution(
  execution: LatestExecution | null | undefined,
  ioMax = DEFAULT_IO_MAX,
): {
  status: LatestExecution["status"];
  timedOut: boolean;
  exitCode: number | null;
  provider?: string;
  ranAt: number;
  stdout: string;
  stderr: string;
} | null {
  if (!execution) return null;

  return {
    status: execution.status,
    timedOut: Boolean(execution.timedOut) || execution.status === "timeout",
    exitCode: execution.exitCode ?? null,
    provider: execution.provider,
    ranAt: execution.ranAt,
    stdout: truncateForPrompt(execution.stdout ?? "", ioMax),
    stderr: truncateForPrompt(execution.stderr ?? "", ioMax),
  };
}
