import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LONG_INACTIVITY_MS,
  getLastActivityAt,
  isLongInactive,
  mergeActivityClocks,
  suggestInactivityFollowUp,
} from "./inactivity";

describe("getLastActivityAt", () => {
  it("returns null when interview has not started", () => {
    expect(getLastActivityAt({ startedAt: 0 })).toBeNull();
  });

  it("uses startedAt as baseline", () => {
    expect(getLastActivityAt({ startedAt: 1000 })).toBe(1000);
  });

  it("takes the max of all activity clocks", () => {
    expect(
      getLastActivityAt({
        startedAt: 1000,
        lastCandidateTurnAt: 2000,
        lastCodeActivityAt: 4000,
        lastExecutionAt: 3000,
      }),
    ).toBe(4000);
  });
});

describe("isLongInactive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false while coding updates lastCodeActivityAt", () => {
    const startedAt = 1_000_000;
    expect(
      isLongInactive(
        {
          startedAt,
          lastCodeActivityAt: startedAt + LONG_INACTIVITY_MS - 1_000,
        },
        startedAt + LONG_INACTIVITY_MS + 10_000,
      ),
    ).toBe(false);
  });

  it("is true after threshold with no activity beyond startedAt", () => {
    const startedAt = 1_000_000;
    expect(
      isLongInactive(
        { startedAt },
        startedAt + LONG_INACTIVITY_MS + 1,
      ),
    ).toBe(true);
  });

  it("is false when interview has ended", () => {
    const startedAt = 1_000_000;
    expect(
      isLongInactive(
        { startedAt, endedAt: startedAt + 60_000 },
        startedAt + LONG_INACTIVITY_MS + 1,
      ),
    ).toBe(false);
  });
});

describe("mergeActivityClocks", () => {
  it("prefers fresher local code activity", () => {
    const merged = mergeActivityClocks(
      { startedAt: 1, lastCodeActivityAt: 10 },
      { lastCodeActivityAt: 20 },
    );
    expect(merged.lastCodeActivityAt).toBe(20);
  });
});

describe("suggestInactivityFollowUp", () => {
  it("defaults to PROBE for later interviewer wire-up", () => {
    expect(suggestInactivityFollowUp({ reason: "LONG_INACTIVITY" })).toBe(
      "PROBE",
    );
  });
});
