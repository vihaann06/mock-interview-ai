import { describe, expect, it } from "vitest";
import { looksLikeSdp, normalizeSdpBody } from "./realtime-config";

const OFFER = ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0"].join("\r\n");

describe("normalizeSdpBody", () => {
  /**
   * Regression: the proxy used to forward `sdp.trim()`, and the upstream Go
   * parser rejected it with "failed to unmarshal SDP: EOF" because the final
   * line had no terminator.
   */
  it("terminates an offer whose trailing newline was stripped", () => {
    expect(normalizeSdpBody(OFFER)).toBe(`${OFFER}\r\n`);
    expect(normalizeSdpBody(OFFER).endsWith("\r\n")).toBe(true);
  });

  it("leaves an already-terminated offer byte-identical", () => {
    const terminated = `${OFFER}\r\n`;
    expect(normalizeSdpBody(terminated)).toBe(terminated);
  });

  it("collapses a ragged tail to exactly one CRLF", () => {
    expect(normalizeSdpBody(`${OFFER}\r\n\r\n\n  `)).toBe(`${OFFER}\r\n`);
    expect(normalizeSdpBody(`${OFFER}\n`)).toBe(`${OFFER}\r\n`);
  });

  it("preserves interior line endings", () => {
    const body = normalizeSdpBody(OFFER);
    expect(body.split("\r\n").filter(Boolean)).toEqual([
      "v=0",
      "o=- 1 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
    ]);
  });
});

describe("looksLikeSdp", () => {
  it("accepts a version line, with or without leading whitespace", () => {
    expect(looksLikeSdp(OFFER)).toBe(true);
    expect(looksLikeSdp(`\r\n${OFFER}`)).toBe(true);
  });

  it("rejects empty and non-SDP bodies", () => {
    expect(looksLikeSdp("")).toBe(false);
    expect(looksLikeSdp("   ")).toBe(false);
    expect(looksLikeSdp('{"error":"nope"}')).toBe(false);
  });
});
