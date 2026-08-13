/**
 * Normalize free-form CodeRunResult → LatestExecution for session / interviewer context.
 * No question test harness — status reflects the candidate's raw run only.
 */

import type {
  ExecutionStatus,
  LatestExecution,
} from "@/lib/types/interview";
import type { CodeRunResult } from "./types";

export function toLatestExecution(
  result: CodeRunResult,
  ranAt: number = Date.now(),
): LatestExecution {
  const status: ExecutionStatus = result.timedOut
    ? "timeout"
    : result.ok
      ? "success"
      : "error";

  return {
    status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    exitCode: result.exitCode,
    provider: result.provider,
    ranAt,
  };
}
