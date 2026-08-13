/**
 * Returns true when text should be sent to TTS.
 * WAIT / empty / whitespace-only interviewer messages produce no audio.
 */
export function isSpeakableText(text: string | null | undefined): boolean {
  if (typeof text !== "string") return false;
  return text.trim().length > 0;
}
