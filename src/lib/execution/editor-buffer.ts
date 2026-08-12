/**
 * Lightweight in-memory buffer so Run Code can read the live editor
 * without requiring InterviewRoom to thread props yet.
 */

let editorBuffer = "";
let editorLanguage = "python" as const;

export function setEditorBuffer(
  code: string,
  language: "python" = "python",
): void {
  editorBuffer = code;
  editorLanguage = language;
}

export function getEditorBuffer(): { code: string; language: "python" } {
  return { code: editorBuffer, language: editorLanguage };
}
