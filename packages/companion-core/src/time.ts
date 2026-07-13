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

const ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }

  return 31;
}

function isValidIsoDateTime(input: string): boolean {
  const match = ISO_DATE_TIME_PATTERN.exec(input);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

export function createInstant(
  input: string | number,
  source: ClockSource,
): Instant {
  if (typeof input === "string" && !isValidIsoDateTime(input)) {
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
