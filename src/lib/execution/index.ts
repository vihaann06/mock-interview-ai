/**
 * Provider-agnostic code execution.
 * Never eval candidate code on the Next.js server — use a sandbox provider.
 */

export type {
  CodeRunRequest,
  CodeRunResult,
  CodeExecutionProvider,
} from "./types";

export {
  MockCodeExecutionProvider,
  setCodeExecutionProvider,
  getCodeExecutionProvider,
  executeCode,
} from "./types";

export { setEditorBuffer, getEditorBuffer } from "./editor-buffer";

import type { CodeRunRequest, CodeRunResult } from "./types";
import { executeCode as execute } from "./types";

/** Convenience alias used by interview UI “Run Code”. */
export function runCode(request: CodeRunRequest): Promise<CodeRunResult> {
  return execute(request);
}
