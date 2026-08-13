/**
 * Provider-agnostic code execution.
 * Browser runs use Pyodide (WASM); mock remains available for tests / fallback.
 * Never eval candidate code on the Next.js server.
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

export { PyodideCodeExecutionProvider } from "./pyodide-provider";

export { setEditorBuffer, getEditorBuffer } from "./editor-buffer";

export { toLatestExecution } from "./to-latest-execution";

import type { CodeRunRequest, CodeRunResult } from "./types";
import {
  executeCode as execute,
  getCodeExecutionProvider,
  setCodeExecutionProvider,
} from "./types";
import { PyodideCodeExecutionProvider } from "./pyodide-provider";

let pyodideBootstrapStarted = false;

/** Prefer Pyodide in the browser; keep mock as the SSR / default fallback. */
function ensureBrowserProvider(): void {
  if (typeof window === "undefined") return;
  if (getCodeExecutionProvider().id === "pyodide") return;
  if (pyodideBootstrapStarted) return;
  pyodideBootstrapStarted = true;
  setCodeExecutionProvider(new PyodideCodeExecutionProvider());
}

/** Convenience alias used by interview UI “Run Code”. */
export async function runCode(
  request: CodeRunRequest,
): Promise<CodeRunResult> {
  ensureBrowserProvider();
  return execute(request);
}
