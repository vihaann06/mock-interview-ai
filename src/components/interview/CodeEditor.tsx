"use client";

import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { setEditorBuffer } from "@/lib/execution";

const SNAPSHOT_DEBOUNCE_MS = 1200;

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** MVP supports Python only. */
  language?: "python";
  readOnly?: boolean;
  /** Fired after ~1.2s pause following edits. */
  onStableSnapshot?: (code: string) => void;
  /** Optional blur hook; kept for parent compatibility. */
  onBlurSnapshot?: (code: string) => void;
}

/**
 * Monaco-backed Python editor. Backward compatible with value/onChange-only parents.
 */
export function CodeEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  onStableSnapshot,
  onBlurSnapshot,
}: CodeEditorProps) {
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCode = useRef(value);

  useEffect(() => {
    latestCode.current = value;
  }, [value]);

  useEffect(() => {
    setEditorBuffer(value, language);
  }, [value, language]);

  useEffect(() => {
    return () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    };
  }, []);

  const scheduleStableSnapshot = (code: string) => {
    if (!onStableSnapshot) return;
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => {
      onStableSnapshot(code);
    }, SNAPSHOT_DEBOUNCE_MS);
  };

  const handleChange = (next?: string) => {
    const code = next ?? "";
    latestCode.current = code;
    setEditorBuffer(code, language);
    onChange?.(code);
    scheduleStableSnapshot(code);
  };

  const handleMount: OnMount = (editor) => {
    editor.updateOptions({
      ariaLabel: "Python code editor",
      accessibilitySupport: "on",
    });

    editor.onDidBlurEditorText(() => {
      onBlurSnapshot?.(latestCode.current);
    });
  };

  return (
    <div className="code-editor" role="region" aria-label="Code editor">
      <div className="editor-toolbar pane-header">
        <span>Code</span>
        <span className="muted">{readOnly ? "Read-only · Python" : "Python · Monaco"}</span>
      </div>
      <div className="monaco-editor-host">
        <Editor
          height="100%"
          defaultLanguage="python"
          language={language}
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          theme="vs-dark"
          loading={
            <p className="muted" style={{ padding: "1rem" }}>
              Loading editor…
            </p>
          }
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 4,
            renderLineHighlight: "line",
            padding: { top: 12, bottom: 12 },
            ariaLabel: "Python code editor",
          }}
        />
      </div>
    </div>
  );
}
