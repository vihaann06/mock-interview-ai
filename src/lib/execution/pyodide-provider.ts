/**
 * Client-side Python execution via Pyodide (WebAssembly).
 * Loads once per page, captures stdout/stderr, and enforces a soft timeout.
 * Does not eval candidate code on the Next.js server.
 */

import type {
  CodeExecutionProvider,
  CodeRunRequest,
  CodeRunResult,
} from "./types";

type PyodideInterface = {
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  setStdin?: (options: { stdin: () => string | undefined }) => void;
  runPythonAsync: (code: string) => Promise<unknown>;
};

const DEFAULT_TIMEOUT_MS = 5_000;

/** Keep indexURL aligned with the installed `pyodide` package version. */
const PYODIDE_INDEX_URL =
  "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

function joinChunks(chunks: string[]): string {
  if (chunks.length === 0) return "";
  return chunks.join("\n").replace(/\n+$/, "");
}

export class PyodideCodeExecutionProvider implements CodeExecutionProvider {
  readonly id = "pyodide";

  private loadPromise: Promise<PyodideInterface> | null = null;

  private load(): Promise<PyodideInterface> {
    if (typeof window === "undefined") {
      return Promise.reject(
        new Error("Pyodide code execution is only available in the browser."),
      );
    }
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const { loadPyodide } = await import("pyodide");
        return (await loadPyodide({
          indexURL: PYODIDE_INDEX_URL,
        })) as PyodideInterface;
      })().catch((err) => {
        this.loadPromise = null;
        throw err;
      });
    }
    return this.loadPromise;
  }

  async run(request: CodeRunRequest): Promise<CodeRunResult> {
    if (request.language !== "python") {
      return {
        ok: false,
        stdout: "",
        stderr: `Unsupported language: ${String(request.language)}`,
        exitCode: null,
        provider: this.id,
      };
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    try {
      const pyodide = await this.load();

      pyodide.setStdout({
        batched: (text) => {
          stdoutChunks.push(text);
        },
      });
      pyodide.setStderr({
        batched: (text) => {
          stderrChunks.push(text);
        },
      });

      if (request.stdin != null && pyodide.setStdin) {
        const lines = request.stdin.split("\n");
        let i = 0;
        pyodide.setStdin({
          stdin: () => (i < lines.length ? lines[i++] : undefined),
        });
      }

      const runPromise = pyodide.runPythonAsync(request.code);
      const outcome = await Promise.race([
        runPromise.then(
          (value) => ({ kind: "ok" as const, value }),
          (error: unknown) => ({ kind: "err" as const, error }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) => {
          setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
        }),
      ]);

      if (outcome.kind === "timeout") {
        // Soft timeout: the WASM run may continue in the background.
        void runPromise.catch(() => undefined);
        return {
          ok: false,
          stdout: joinChunks(stdoutChunks),
          stderr:
            joinChunks(stderrChunks) ||
            `Execution timed out after ${timeoutMs}ms.`,
          exitCode: null,
          timedOut: true,
          provider: this.id,
        };
      }

      if (outcome.kind === "err") {
        const message =
          outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error);
        const stderr = [joinChunks(stderrChunks), message]
          .filter(Boolean)
          .join("\n");
        return {
          ok: false,
          stdout: joinChunks(stdoutChunks),
          stderr,
          exitCode: 1,
          provider: this.id,
        };
      }

      return {
        ok: true,
        stdout: joinChunks(stdoutChunks),
        stderr: joinChunks(stderrChunks),
        exitCode: 0,
        provider: this.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        stdout: joinChunks(stdoutChunks),
        stderr: message,
        exitCode: null,
        provider: this.id,
      };
    }
  }
}
