/**
 * Pure YMD ('YYYY-MM-DD') date helpers.
 *
 * Two distinct time conventions are honoured (ARCHITECTURE §11.2):
 *  - local day boundary belongs to `Clock.todayYMD()` (see adapters/systemClock.ts);
 *  - all cross-day arithmetic here uses a UTC-style *day ordinal*, which in this
 *    kernel is computed with a pure proleptic-Gregorian integer algorithm
 *    (days-from-civil / civil-from-days). No `Date`, no `Date.now()`, no DOM or
 *    Node API is used, so results are immune to DST and local timezone offsets.
 */
import { DateWindow, DayState } from '../models/types';

/** Parsed calendar components. */
export interface YmdParts { readonly y: number; readonly m: number; readonly d: number; }

const DEFAULT_PARTS: YmdParts = { y: 1970, m: 1, d: 1 };

function pad2(n: number): string {
  return n < 10 ? '0' + String(n) : String(n);
}

function pad4(n: number): string {
  const s: string = String(n);
  if (s.length >= 4) return s;
  return '0000'.slice(0, 4 - s.length) + s;
}

/**
 * Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's
 * civil calendar algorithm). Pure integer math, valid for any YMD we accept.
 */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy: number = y - (m <= 2 ? 1 : 0);
  const era: number = Math.floor(yy / 400);
  const yoe: number = yy - era * 400;
  const mp: number = m + (m > 2 ? -3 : 9);
  const doy: number = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe: number = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of `daysFromCivil`. */
function civilFromDays(z: number): YmdParts {
  const zz: number = z + 719468;
  const era: number = Math.floor(zz / 146097);
  const doe: number = zz - era * 146097;
  const yoe: number = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  let y: number = yoe + era * 400;
  const doy: number = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp: number = Math.floor((5 * doy + 2) / 153);
  const d: number = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m: number = mp + (mp < 10 ? 3 : -9);
  y = y + (m <= 2 ? 1 : 0);
  const parts: YmdParts = { y: y, m: m, d: d };
  return parts;
}

/** Number of days in a given month (pure, handles leap years). */
function daysInMonthOf(y: number, m: number): number {
  if (m >= 1 && m <= 11) {
    return daysFromCivil(y, m + 1, 1) - daysFromCivil(y, m, 1);
  }
  if (m === 12) {
    return daysFromCivil(y + 1, 1, 1) - daysFromCivil(y, 12, 1);
  }
  return 0;
}

/** Strict `'YYYY-MM-DD'` validation, including real calendar day ranges. */
export function isYMD(s: string): boolean {
  if (s.length !== 10) return false;
  if (s.charAt(4) !== '-' || s.charAt(7) !== '-') return false;
  for (let i: number = 0; i < 10; i++) {
    if (i === 4 || i === 7) continue;
    const c: string = s.charAt(i);
    if (c < '0' || c > '9') return false;
  }
  const y: number = Number(s.slice(0, 4));
  const m: number = Number(s.slice(5, 7));
  const d: number = Number(s.slice(8, 10));
  if (m < 1 || m > 12) return false;
  const dim: number = daysInMonthOf(y, m);
  return d >= 1 && d <= dim;
}

/** Parse a YMD into components; returns a safe default for invalid input (never throws). */
export function parseYMD(ymd: string): YmdParts {
  if (!isYMD(ymd)) return DEFAULT_PARTS;
  const parts: YmdParts = {
    y: Number(ymd.slice(0, 4)),
    m: Number(ymd.slice(5, 7)),
    d: Number(ymd.slice(8, 10)),
  };
  return parts;
}

/** Format calendar components back into a YMD string. */
export function formatYMD(y: number, m: number, d: number): string {
  return pad4(y) + '-' + pad2(m) + '-' + pad2(d);
}

/** Add `delta` days to a YMD (delta may be negative). Invalid input is returned unchanged. */
export function addDays(ymd: string, delta: number): string {
  if (!isYMD(ymd)) return ymd;
  const p: YmdParts = parseYMD(ymd);
  const step: number = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const q: YmdParts = civilFromDays(daysFromCivil(p.y, p.m, p.d) + step);
  return formatYMD(q.y, q.m, q.d);
}

/** Whole-day difference `toYMD - fromYMD`. Invalid input yields 0. */
export function diffDays(fromYMD: string, toYMD: string): number {
  if (!isYMD(fromYMD) || !isYMD(toYMD)) return 0;
  const a: YmdParts = parseYMD(fromYMD);
  const b: YmdParts = parseYMD(toYMD);
  return daysFromCivil(b.y, b.m, b.d) - daysFromCivil(a.y, a.m, a.d);
}

/** Lexicographic YMD comparison (fixed-width format makes this correct). */
export function compareYMD(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** D1 = 1; returns 0 when `todayYMD < firstYMD` or input is invalid. */
export function dayIndexOf(firstYMD: string, todayYMD: string): number {
  const diff: number = diffDays(firstYMD, todayYMD);
  if (!isYMD(firstYMD) || !isYMD(todayYMD)) return 0;
  return diff < 0 ? 0 : diff + 1;
}

/** `[today-(days-1), today]` inclusive window. */
export function windowFrom(todayYMD: string, days: number): DateWindow {
  const n: number = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const window: DateWindow = {
    fromYMD: addDays(todayYMD, -(n - 1)),
    toYMD: todayYMD,
    days: n,
  };
  return window;
}

/** Seven `DayState` cells starting at `fromYMD` (Checked when present in `checked`). */
export function weekGrid(fromYMD: string, checked: readonly string[]): readonly DayState[] {
  const cells: DayState[] = [];
  for (let i: number = 0; i < 7; i++) {
    const ymd: string = addDays(fromYMD, i);
    const state: DayState = checked.indexOf(ymd) >= 0 ? DayState.Checked : DayState.Missed;
    cells.push(state);
  }
  return cells;
}

/** Normalize `'YYYY-MM'` or `'YYYY-MM-DD'` to `'YYYY-MM'`. */
export function monthOf(ymdOrMonth: string): string {
  return ymdOrMonth.slice(0, 7);
}

/** Days in the month of a `'YYYY-MM'` / `'YYYY-MM-DD'` string. */
export function daysInMonth(ymdOrMonth: string): number {
  const month: string = monthOf(ymdOrMonth);
  const y: number = Number(month.slice(0, 4));
  const m: number = Number(month.slice(5, 7));
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 0;
  return daysInMonthOf(y, m);
}

/** First day of a month as a YMD. */
export function monthStartYMD(ymdOrMonth: string): string {
  return monthOf(ymdOrMonth) + '-01';
}

/** A specific day of a month as a YMD string. */
export function ymdOfMonthDay(ymdOrMonth: string, day: number): string {
  return monthOf(ymdOrMonth) + '-' + pad2(day);
}
