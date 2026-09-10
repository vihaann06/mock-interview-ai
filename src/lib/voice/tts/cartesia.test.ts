import { describe, expect, it } from "vitest";
import {
  buildCartesiaRequest,
  CARTESIA_VERSION,
  cartesiaContentTypeFor,
  cartesiaHeaders,
  DEFAULT_CARTESIA_MODEL,
  resolveCartesiaContainer,
  resolveCartesiaLanguage,
  resolveCartesiaModel,
  resolveCartesiaVoiceId,
  sanitizeCartesiaError,
} from "./cartesia";
import { resolveTtsProvider } from "./provider";

describe("resolveTtsProvider", () => {
  it("defaults to openai so a bad value cannot take voice offline", () => {
    expect(resolveTtsProvider({})).toBe("openai");
    expect(resolveTtsProvider({ TTS_PROVIDER: "" })).toBe("openai");
    expect(resolveTtsProvider({ TTS_PROVIDER: "cartesía" })).toBe("openai");
    expect(resolveTtsProvider({ TTS_PROVIDER: "elevenlabs" })).toBe("openai");
  });

  it("switches only on an explicit, case-insensitive cartesia", () => {
    expect(resolveTtsProvider({ TTS_PROVIDER: "cartesia" })).toBe("cartesia");
    expect(resolveTtsProvider({ TTS_PROVIDER: " Cartesia " })).toBe("cartesia");
  });
});

describe("cartesia env resolution", () => {
  it("defaults the model and honours an override", () => {
    expect(resolveCartesiaModel({})).toBe(DEFAULT_CARTESIA_MODEL);
    expect(resolveCartesiaModel({ CARTESIA_MODEL: "sonic-turbo" })).toBe("sonic-turbo");
  });

  /**
   * No default voice on purpose: Cartesia voices are account-specific UUIDs, and picking an
   * arbitrary one would present the wrong interviewer persona.
   */
  it("returns null when no voice id is configured", () => {
    expect(resolveCartesiaVoiceId({})).toBeNull();
    expect(resolveCartesiaVoiceId({ CARTESIA_VOICE_ID: "  " })).toBeNull();
    expect(resolveCartesiaVoiceId({ CARTESIA_VOICE_ID: " abc-123 " })).toBe("abc-123");
  });

  it("only allows browser-playable containers", () => {
    expect(resolveCartesiaContainer({})).toBe("mp3");
    expect(resolveCartesiaContainer({ CARTESIA_FORMAT: "wav" })).toBe("wav");
    // Ogg/Opus is not reliably playable from a blob URL, so it must not be selectable.
    expect(resolveCartesiaContainer({ CARTESIA_FORMAT: "opus" })).toBe("mp3");
  });

  it("defaults language to en", () => {
    expect(resolveCartesiaLanguage({})).toBe("en");
    expect(resolveCartesiaLanguage({ CARTESIA_LANGUAGE: "fr" })).toBe("fr");
  });
});

describe("buildCartesiaRequest", () => {
  const base = {
    model: "sonic-3.6",
    voiceId: "voice-uuid",
    transcript: "Why is that linear?",
    language: "en",
  };

  it("builds an mp3 request with bit_rate and no encoding", () => {
    const req = buildCartesiaRequest({ ...base, container: "mp3" });
    expect(req).toEqual({
      model_id: "sonic-3.6",
      transcript: "Why is that linear?",
      voice: { id: "voice-uuid" },
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      language: "en",
    });
    expect(req.output_format.encoding).toBeUndefined();
  });

  it("builds a wav request with encoding and no bit_rate", () => {
    const req = buildCartesiaRequest({ ...base, container: "wav" });
    expect(req.output_format).toEqual({
      container: "wav",
      sample_rate: 44100,
      encoding: "pcm_s16le",
    });
    expect(req.output_format.bit_rate).toBeUndefined();
  });
});

describe("cartesiaHeaders", () => {
  it("sends bearer auth plus the required version header", () => {
    expect(cartesiaHeaders("sk-test")).toEqual({
      Authorization: "Bearer sk-test",
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    });
  });
});

describe("cartesiaContentTypeFor", () => {
  it("maps containers to the type the browser needs", () => {
    expect(cartesiaContentTypeFor("mp3")).toBe("audio/mpeg");
    expect(cartesiaContentTypeFor("wav")).toBe("audio/wav");
  });
});

describe("sanitizeCartesiaError", () => {
  it("extracts a message from either JSON error shape", () => {
    expect(sanitizeCartesiaError('{"error":"bad voice"}', 400)).toBe("bad voice");
    expect(sanitizeCartesiaError('{"error":{"message":"nope"}}', 400)).toBe("nope");
    expect(sanitizeCartesiaError('{"message":"flat"}', 400)).toBe("flat");
  });

  it("never forwards an HTML error page", () => {
    expect(sanitizeCartesiaError("<!DOCTYPE html><html>...", 503)).toMatch(
      /temporarily unavailable \(503\)/,
    );
  });

  it("falls back to a status message when the body is empty", () => {
    expect(sanitizeCartesiaError("   ", 500)).toBe("Cartesia TTS failed (500)");
  });
});
