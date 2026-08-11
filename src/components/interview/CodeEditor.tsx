"use client";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
}

/** Placeholder editor — Monaco will replace this on Day 3. */
export function CodeEditor({ value, onChange }: CodeEditorProps) {
  return (
    <div className="code-editor">
      <div className="editor-toolbar">
        <span>Python</span>
        <span className="muted">Monaco coming Day 3</span>
      </div>
      <textarea
        className="code-textarea"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        spellCheck={false}
        aria-label="Code editor"
      />
    </div>
  );
}
