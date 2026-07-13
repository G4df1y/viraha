export type ClockSource = "device" | "server" | "test";

export interface Instant {
  readonly iso: string;
  readonly epochMs: number;
  readonly source: ClockSource;
}

export interface Clock {
  now(): Instant;
  monotonicMs(): number;
}

export function createInstant(
  input: string | number,
  source: ClockSource,
): Instant {
  if (
    typeof input === "string" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      input,
    )
  ) {
    throw new Error("Instant must be a valid ISO-8601 date-time");
  }

  const epochMs = new Date(input).getTime();

  if (!Number.isFinite(epochMs)) {
    throw new Error("Instant must be a valid ISO-8601 date-time");
  }

  return {
    iso: new Date(epochMs).toISOString(),
    epochMs,
    source,
  };
}

export function compareInstants(left: Instant, right: Instant): -1 | 0 | 1 {
  if (left.epochMs < right.epochMs) {
    return -1;
  }

  if (left.epochMs > right.epochMs) {
    return 1;
  }

  return 0;
}

export function durationBetween(start: Instant, end: Instant): number {
  const duration = end.epochMs - start.epochMs;

  if (duration < 0) {
    throw new Error("Duration cannot end before it starts");
  }

  return duration;
}

export class ManualClock implements Clock {
  private wallEpochMs: number;
  private elapsedMs = 0;

  constructor(initial: string) {
    this.wallEpochMs = createInstant(initial, "test").epochMs;
  }

  now(): Instant {
    return createInstant(this.wallEpochMs, "test");
  }

  monotonicMs(): number {
    return this.elapsedMs;
  }

  advance(milliseconds: number): void {
    const candidateWallEpochMs = this.wallEpochMs + milliseconds;
    const candidateElapsedMs = this.elapsedMs + milliseconds;

    if (
      !Number.isFinite(milliseconds) ||
      milliseconds < 0 ||
      !Number.isFinite(candidateWallEpochMs) ||
      !Number.isFinite(candidateElapsedMs) ||
      !Number.isFinite(new Date(candidateWallEpochMs).getTime())
    ) {
      throw new Error("Clock advance must be a non-negative number");
    }

    this.wallEpochMs = candidateWallEpochMs;
    this.elapsedMs = candidateElapsedMs;
  }

  setWallTime(value: string | number): void {
    this.wallEpochMs = createInstant(value, "test").epochMs;
  }
}
