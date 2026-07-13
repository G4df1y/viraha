import { describe, expect, it } from "vitest";

import {
  ManualClock,
  compareInstants,
  createInstant,
  durationBetween,
} from "../src/index.js";

describe("time", () => {
  it("normalizes an ISO-8601 date-time", () => {
    expect(createInstant("2026-07-13T08:00:00+08:00", "device")).toEqual({
      iso: "2026-07-13T00:00:00.000Z",
      epochMs: 1783900800000,
      source: "device",
    });
  });

  it("rejects an invalid date-time", () => {
    expect(() => createInstant("not-a-time", "device")).toThrow(
      "Instant must be a valid ISO-8601 date-time",
    );
  });

  it("keeps monotonic time stable when wall time moves backwards", () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");

    clock.advance(5000);

    expect(clock.now().iso).toBe("2026-07-13T00:00:05.000Z");
    expect(clock.monotonicMs()).toBe(5000);

    clock.setWallTime("2026-07-12T23:59:00.000Z");

    expect(clock.now().iso).toBe("2026-07-12T23:59:00.000Z");
    expect(clock.monotonicMs()).toBe(5000);
  });

  it("compares instants and measures non-negative durations", () => {
    const start = createInstant("2026-07-13T00:00:00.000Z", "test");
    const end = createInstant("2026-07-13T00:00:10.000Z", "test");

    expect(compareInstants(start, end)).toBe(-1);
    expect(durationBetween(start, end)).toBe(10000);
    expect(() => durationBetween(end, start)).toThrow(
      "Duration cannot end before it starts",
    );
  });
});
