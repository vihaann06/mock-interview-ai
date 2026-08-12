/**
 * Code execution adapter (provider-agnostic).
 * Do NOT execute untrusted candidate code on the Next.js server.
 * Wire a real sandbox provider later; keep a mock for local UX.
 */

export interface CodeRunRequest {
  language: "python";
  code: string;
  /** Optional stdin */
  stdin?: string;
  /** Soft timeout hint in ms */
  timeoutMs?: number;
}

export interface CodeRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  /** Provider identifier, e.g. "mock" | "piston" | "judge0" */
  provider: string;
}

export interface CodeExecutionProvider {
  readonly id: string;
  run(request: CodeRunRequest): Promise<CodeRunResult>;
}

export class MockCodeExecutionProvider implements CodeExecutionProvider {
  readonly id = "mock";

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    return {
      ok: false,
      stdout: "",
      stderr:
        "Code execution is not configured. This is a mock provider — wire a sandbox later.",
      exitCode: null,
      provider: this.id,
    };
  }
}

let activeProvider: CodeExecutionProvider = new MockCodeExecutionProvider();

export function setCodeExecutionProvider(provider: CodeExecutionProvider): void {
  activeProvider = provider;
}

export function getCodeExecutionProvider(): CodeExecutionProvider {
  return activeProvider;
}

export async function executeCode(
  request: CodeRunRequest,
): Promise<CodeRunResult> {
  return activeProvider.run(request);
}
