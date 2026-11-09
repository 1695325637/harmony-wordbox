/**
 * `SystemClock` is the ONLY kernel file permitted to call `new Date()`.
 * Day boundaries use local calendar components (A8: local 00:00 day cut),
 * while all cross-day arithmetic lives in `utils/date.ts` (UTC day ordinal).
 */
import { Clock } from '../ports/ports';
import { isYMD, parseYMD } from '../utils/date';

function pad2(n: number): string { return n < 10 ? '0' + String(n) : String(n); }
function pad4(n: number): string { return String(n).padStart(4, '0'); }

export class SystemClock implements Clock {
  nowMs(): number {
    return new Date().getTime();
  }

  todayYMD(): string {
    return this.ymdFromMs(this.nowMs());
  }

  ymdFromMs(ms: number): string {
    const d: Date = new Date(ms);
    return pad4(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  msFromYMD(ymd: string): number {
    if (!isYMD(ymd)) return 0;
    const p = parseYMD(ymd);
    return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).getTime();
  }
}

/** Factory for the system clock. */
export function createSystemClock(): SystemClock {
  return new SystemClock();
}
