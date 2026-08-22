/**
 * OpenAI Realtime transcription session defaults.
 * gpt-live-transcribe does not support server turn_detection — end-of-turn
 * is committed from the browser after a patient silence window.
 */

export const REALTIME_TRANSCRIBE_MODEL = "gpt-live-transcribe";

/** Default silence before committing a spoken turn (ms). */
export const DEFAULT_SILENCE_DURATION_MS = 1400;

/** Local mic energy threshold (0–1 RMS) used for barge-in speech-start. */
export const DEFAULT_SPEECH_START_RMS = 0.02;

/** Latency/accuracy tradeoff for gpt-live-transcribe deltas. */
export const DEFAULT_TRANSCRIPTION_DELAY = "medium" as const;

/** Max time to wait for ICE candidates before posting the SDP offer. */
export const ICE_GATHERING_TIMEOUT_MS = 2500;

export interface RealtimeTranscriptionSessionConfig {
  type: "transcription";
  audio: {
    input: {
      transcription: {
        model: string;
        languages: string[];
        delay: "minimal" | "low" | "medium" | "high" | "xhigh";
        prompt?: string;
      };
      /** Required null — server VAD is unsupported for gpt-live-transcribe. */
      turn_detection: null;
    };
  };
}

export function resolveSilenceDurationMs(): number {
  const raw = process.env.OPENAI_REALTIME_SILENCE_MS?.trim();
  if (!raw) return DEFAULT_SILENCE_DURATION_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 200 || n > 10_000) {
    return DEFAULT_SILENCE_DURATION_MS;
  }
  return Math.floor(n);
}

/** Session object for transcription (used by /v1/realtime/calls FormData). */
export function buildRealtimeTranscriptionSession(): RealtimeTranscriptionSessionConfig {
  return {
    type: "transcription",
    audio: {
      input: {
        transcription: {
          model: REALTIME_TRANSCRIBE_MODEL,
          languages: ["en"],
          delay: DEFAULT_TRANSCRIPTION_DELAY,
          prompt:
            "Technical coding interview. The candidate discusses algorithms, data structures, complexity, and code aloud.",
        },
        turn_detection: null,
      },
    },
  };
}
