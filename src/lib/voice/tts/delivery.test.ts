import { describe, expect, it } from "vitest";
import {
  buildSpeechRequest,
  contentTypeFor,
  DEFAULT_FORMAT,
  DEFAULT_MODEL,
  DEFAULT_VOICE,
  fallbackVoiceFor,
  INTERVIEWER_INSTRUCTIONS,
  modelSupportsInstructions,
  resolveFormat,
  resolveInstructions,
  resolveModel,
  resolveSpeed,
  resolveVoice,
} from "./delivery";

describe("resolveVoice / resolveModel", () => {
  it("defaults to the interviewer voice and the steerable model", () => {
    expect(resolveVoice({})).toBe(DEFAULT_VOICE);
    expect(resolveModel({})).toBe(DEFAULT_MODEL);
    expect(DEFAULT_VOICE).not.toBe("alloy");
  });

  it("honours the env overrides, trimmed", () => {
    expect(resolveVoice({ OPENAI_TTS_VOICE: "  ash " })).toBe("ash");
    expect(resolveModel({ OPENAI_TTS_MODEL: " tts-1 " })).toBe("tts-1");
  });

  it("treats a blank override as unset", () => {
    expect(resolveVoice({ OPENAI_TTS_VOICE: "   " })).toBe(DEFAULT_VOICE);
    expect(resolveModel({ OPENAI_TTS_MODEL: "" })).toBe(DEFAULT_MODEL);
  });
});

describe("resolveInstructions", () => {
  it("defaults to the interviewer persona", () => {
    expect(resolveInstructions({})).toBe(INTERVIEWER_INSTRUCTIONS);
  });

  it("is overridable", () => {
    expect(resolveInstructions({ OPENAI_TTS_INSTRUCTIONS: "Whisper." })).toBe("Whisper.");
  });

  it("directs the delivery away from the three robot tells", () => {
    // Pace, pitch range, and question contour are what make TTS read as synthetic here.
    expect(INTERVIEWER_INSTRUCTIONS).toMatch(/Pacing:/);
    expect(INTERVIEWER_INSTRUCTIONS).toMatch(/Intonation:/);
    expect(INTERVIEWER_INSTRUCTIONS).toMatch(/downward inflection/);
    expect(INTERVIEWER_INSTRUCTIONS).toMatch(/announcer/);
  });
});

describe("resolveFormat", () => {
  it("defaults to mp3, the only universally playable option", () => {
    expect(resolveFormat({})).toBe("mp3");
    expect(DEFAULT_FORMAT).toBe("mp3");
  });

  it("accepts a supported format, case-insensitively", () => {
    expect(resolveFormat({ OPENAI_TTS_FORMAT: "OPUS" })).toBe("opus");
    expect(resolveFormat({ OPENAI_TTS_FORMAT: "wav" })).toBe("wav");
  });

  it("falls back to mp3 rather than sending an invalid format upstream", () => {
    expect(resolveFormat({ OPENAI_TTS_FORMAT: "ogg" })).toBe("mp3");
  });
});

describe("resolveSpeed", () => {
  it("is unset by default, so pacing comes from the instructions", () => {
    expect(resolveSpeed({})).toBeUndefined();
  });

  it("accepts a value inside the documented range", () => {
    expect(resolveSpeed({ OPENAI_TTS_SPEED: "0.95" })).toBe(0.95);
  });

  it("ignores out-of-range and non-numeric values", () => {
    expect(resolveSpeed({ OPENAI_TTS_SPEED: "0.1" })).toBeUndefined();
    expect(resolveSpeed({ OPENAI_TTS_SPEED: "5" })).toBeUndefined();
    expect(resolveSpeed({ OPENAI_TTS_SPEED: "slow" })).toBeUndefined();
  });
});

describe("modelSupportsInstructions", () => {
  it("is false for the legacy models that ignore the parameter", () => {
    expect(modelSupportsInstructions("tts-1")).toBe(false);
    expect(modelSupportsInstructions("tts-1-hd")).toBe(false);
  });

  it("is true for the gpt-4o-mini-tts family", () => {
    expect(modelSupportsInstructions("gpt-4o-mini-tts")).toBe(true);
    expect(modelSupportsInstructions("gpt-4o-mini-tts-2025-12-15")).toBe(true);
  });
});

describe("fallbackVoiceFor", () => {
  it("remaps the newest voices, which tts-1 rejects with a 400", () => {
    expect(fallbackVoiceFor("cedar")).toBe("onyx");
    expect(fallbackVoiceFor("marin")).toBe("nova");
    expect(fallbackVoiceFor("ballad")).toBe("onyx");
    expect(fallbackVoiceFor("verse")).toBe("onyx");
  });

  it("keeps a voice tts-1 already accepts", () => {
    for (const voice of ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]) {
      expect(fallbackVoiceFor(voice)).toBe(voice);
    }
  });

  it("remaps a custom voice id to a safe legacy voice", () => {
    expect(fallbackVoiceFor(" Voice_1234 ")).toBe("onyx");
  });
});

describe("buildSpeechRequest", () => {
  const base = {
    voice: "cedar",
    input: "How many comparisons?",
    format: "mp3" as const,
    instructions: INTERVIEWER_INSTRUCTIONS,
  };

  it("sends instructions to a model that honours them", () => {
    const req = buildSpeechRequest({ ...base, model: "gpt-4o-mini-tts" });
    expect(req.instructions).toBe(INTERVIEWER_INSTRUCTIONS);
    expect(req.response_format).toBe("mp3");
    expect(req.speed).toBeUndefined();
  });

  it("omits instructions for tts-1 instead of sending a parameter it ignores", () => {
    const req = buildSpeechRequest({ ...base, model: "tts-1", voice: "onyx" });
    expect(req).not.toHaveProperty("instructions");
  });

  it("omits speed unless explicitly configured", () => {
    expect(buildSpeechRequest({ ...base, model: "gpt-4o-mini-tts" })).not.toHaveProperty("speed");
    expect(buildSpeechRequest({ ...base, model: "gpt-4o-mini-tts", speed: 0.95 }).speed).toBe(0.95);
  });
});

describe("contentTypeFor", () => {
  it("maps each format to the type the browser needs", () => {
    expect(contentTypeFor("mp3")).toBe("audio/mpeg");
    expect(contentTypeFor("opus")).toBe("audio/ogg");
    expect(contentTypeFor("aac")).toBe("audio/aac");
    expect(contentTypeFor("wav")).toBe("audio/wav");
  });
});
