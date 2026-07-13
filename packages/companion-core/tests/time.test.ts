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

  it.each(["July 13, 2026", "2026-07-13"])(
    "rejects a non-ISO date-time: %s",
    (input) => {
      expect(() => createInstant(input, "device")).toThrow(
        "Instant must be a valid ISO-8601 date-time",
      );
    },
  );

  it.each(["2026-02-29T00:00:00Z", "2026-02-30T00:00:00Z"])(
    "rejects an impossible calendar date: %s",
    (input) => {
      expect(() => createInstant(input, "device")).toThrow(
        "Instant must be a valid ISO-8601 date-time",
      );
    },
  );

  it.each([
    "2026-13-01T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+08:60",
  ])("rejects an out-of-range date-time component: %s", (input) => {
    expect(() => createInstant(input, "device")).toThrow(
      "Instant must be a valid ISO-8601 date-time",
    );
  });

  it("accepts and normalizes a real leap day", () => {
    expect(
      createInstant("2028-02-29T23:59:59.123+08:00", "device").iso,
    ).toBe("2028-02-29T15:59:59.123Z");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a non-finite numeric instant: %s",
    (input) => {
      expect(() => createInstant(input, "device")).toThrow(
        "Instant must be a valid ISO-8601 date-time",
      );
    },
  );

  it("keeps monotonic time stable when wall time moves backwards", () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");

    clock.advance(5000);

    expect(clock.now().iso).toBe("2026-07-13T00:00:05.000Z");
    expect(clock.monotonicMs()).toBe(5000);

    clock.setWallTime("2026-07-12T23:59:00.000Z");

    expect(clock.now().iso).toBe("2026-07-12T23:59:00.000Z");
    expect(clock.monotonicMs()).toBe(5000);
  });

  it("treats a zero-length advance as a no-op", () => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const initialWallTime = clock.now();

    clock.advance(0);

    expect(clock.now()).toEqual(initialWallTime);
    expect(clock.monotonicMs()).toBe(0);
  });

  it.each([
    ["negative", -1],
    ["non-finite", Number.NaN],
    ["wall-time overflow", 8_640_000_000_000_000],
  ])("rejects a %s clock advance without changing state", (_, milliseconds) => {
    const clock = new ManualClock("2026-07-13T00:00:00.000Z");
    const initialWallTime = clock.now();

    expect(() => clock.advance(milliseconds)).toThrow(
      "Clock advance must be a non-negative number",
    );
    expect(clock.now()).toEqual(initialWallTime);
    expect(clock.monotonicMs()).toBe(0);
  });

  it("compares instants and measures non-negative durations", () => {
    const start = createInstant("2026-07-13T00:00:00.000Z", "test");
    const end = createInstant("2026-07-13T00:00:10.000Z", "test");

    expect(compareInstants(start, end)).toBe(-1);
    expect(compareInstants(start, start)).toBe(0);
    expect(compareInstants(end, start)).toBe(1);
    expect(durationBetween(start, end)).toBe(10000);
    expect(() => durationBetween(end, start)).toThrow(
      "Duration cannot end before it starts",
    );
  });
});
