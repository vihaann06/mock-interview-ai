import type { TTSProvider, TtsPlaybackState } from "@/lib/voice/types";
import { isSpeakableText } from "./text";

export interface OpenAiTtsProviderOptions {
  /** Browser endpoint; defaults to POST /api/tts/speak */
  endpoint?: string;
}

/**
 * Browser TTSProvider: fetches audio from the server TTS route and plays it.
 * Never holds or requests OPENAI_API_KEY — that stays server-side.
 */
export function createOpenAiTtsProvider(
  options: OpenAiTtsProviderOptions = {},
): TTSProvider & { dispose: () => void } {
  const endpoint = options.endpoint ?? "/api/tts/speak";

  let state: TtsPlaybackState = "idle";
  const listeners = new Set<(s: TtsPlaybackState) => void>();

  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let abortController: AbortController | null = null;
  /** Monotonic id so late fetch/play callbacks from a prior speak() are ignored. */
  let utteranceId = 0;
  let disposed = false;

  const setState = (next: TtsPlaybackState) => {
    if (disposed) return;
    if (state === next) return;
    state = next;
    for (const cb of listeners) cb(state);
  };

  const revokeObjectUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  const detachAudio = () => {
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.onplaying = null;
    try {
      audio.pause();
    } catch {
      // ignore
    }
    audio.removeAttribute("src");
    audio.load();
    audio = null;
  };

  const cancelInFlight = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    detachAudio();
    revokeObjectUrl();
  };

  const provider: TTSProvider & { dispose: () => void } = {
    async speak(text: string): Promise<void> {
      if (disposed) return;

      if (!isSpeakableText(text)) {
        // WAIT / empty → no audio, leave state alone.
        return;
      }

      const trimmed = text.trim();
      const id = ++utteranceId;
      cancelInFlight();
      setState("generating");

      const controller = new AbortController();
      abortController = controller;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
          signal: controller.signal,
        });

        if (id !== utteranceId || disposed) return;

        if (!res.ok) {
          let message = `TTS failed (${res.status})`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            // non-JSON error body
          }
          setState("error");
          throw new Error(message);
        }

        const blob = await res.blob();
        if (id !== utteranceId || disposed) return;

        revokeObjectUrl();
        objectUrl = URL.createObjectURL(blob);
        const el = new Audio(objectUrl);
        audio = el;

        await new Promise<void>((resolve, reject) => {
          if (id !== utteranceId || disposed) {
            resolve();
            return;
          }

          el.onplaying = () => {
            if (id === utteranceId && !disposed) setState("speaking");
          };
          el.onended = () => {
            if (id !== utteranceId || disposed) {
              resolve();
              return;
            }
            detachAudio();
            revokeObjectUrl();
            setState("idle");
            resolve();
          };
          el.onerror = () => {
            if (id !== utteranceId || disposed) {
              resolve();
              return;
            }
            detachAudio();
            revokeObjectUrl();
            setState("error");
            reject(new Error("Audio playback failed"));
          };

          void el.play().catch((err: unknown) => {
            if (id !== utteranceId || disposed) {
              resolve();
              return;
            }
            detachAudio();
            revokeObjectUrl();
            setState("error");
            reject(err instanceof Error ? err : new Error("Audio play rejected"));
          });
        });
      } catch (err) {
        if (controller.signal.aborted || id !== utteranceId || disposed) {
          return;
        }
        if (state !== "error") setState("error");
        throw err instanceof Error ? err : new Error("TTS request failed");
      } finally {
        if (abortController === controller) {
          abortController = null;
        }
      }
    },

    stop(): void {
      if (disposed) return;
      utteranceId += 1;
      cancelInFlight();
      if (state === "generating" || state === "speaking") {
        setState("stopped");
      }
    },

    isSpeaking(): boolean {
      return state === "speaking";
    },

    getState(): TtsPlaybackState {
      return state;
    },

    onStateChange(callback: (s: TtsPlaybackState) => void): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      utteranceId += 1;
      cancelInFlight();
      listeners.clear();
      state = "idle";
    },
  };

  return provider;
}
