/**
 * Track C / test `FakeClock`. Time is represented as a UTC-style day ordinal
 * times `MS_PER_DAY`, so `todayYMD` / `ymdFromMs` / `msFromYMD` are perfectly
 * consistent and DST-immune. `advanceDays` drives the D1→D8 demo.
 */
import { Clock, MS_PER_DAY, addDays, diffDays } from '@core';

const EPOCH_YMD: string = '1970-01-01';
const DEFAULT_YMD: string = '2026-11-03';

export class FakeClock implements Clock {
  private nowMsValue: number;

  constructor(initialYMD: string = DEFAULT_YMD) {
    this.nowMsValue = diffDays(EPOCH_YMD, initialYMD) * MS_PER_DAY;
  }

  nowMs(): number {
    return this.nowMsValue;
  }

  todayYMD(): string {
    return addDays(EPOCH_YMD, Math.floor(this.nowMsValue / MS_PER_DAY));
  }

  ymdFromMs(ms: number): string {
    return addDays(EPOCH_YMD, Math.floor(ms / MS_PER_DAY));
  }

  msFromYMD(ymd: string): number {
    return diffDays(EPOCH_YMD, ymd) * MS_PER_DAY;
  }

  /** Jump to an absolute YMD. */
  setYMD(ymd: string): void {
    this.nowMsValue = diffDays(EPOCH_YMD, ymd) * MS_PER_DAY;
  }

  /** Advance (or rewind) by N days. */
  advanceDays(days: number): void {
    this.nowMsValue = this.nowMsValue + Math.trunc(days) * MS_PER_DAY;
  }

  /** Set an exact epoch-ms value. */
  setNowMs(ms: number): void {
    this.nowMsValue = ms;
  }

  /** Human-readable day index label for the demo panel. */
  dayLabel(firstStudyYMD: string): string {
    if (firstStudyYMD.length === 0) return 'D—';
    const d: number = diffDays(firstStudyYMD, this.todayYMD()) + 1;
    return d <= 0 ? 'D0' : 'D' + String(d);
  }
}

/** Factory for the preview FakeClock. */
export function createFakeClock(initialYMD: string = DEFAULT_YMD): FakeClock {
  return new FakeClock(initialYMD);
}
