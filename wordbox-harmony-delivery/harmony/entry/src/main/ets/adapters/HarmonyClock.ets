/**
 * Harmony Clock adapter. Day boundaries use LOCAL calendar components
 * (00:00 local day cut), exactly like the kernel's `SystemClock`; all
 * cross-day arithmetic stays inside the mirrored `utils/date` helpers.
 * This is the ONLY place on the Harmony track allowed to call `new Date()`.
 */
import { Clock, isYMD, parseYMD, YmdParts } from '../core/index';

function pad2(n: number): string {
  return n < 10 ? '0' + String(n) : String(n);
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

export class HarmonyClock implements Clock {
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
    const p: YmdParts = parseYMD(ymd);
    return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).getTime();
  }
}

export function createHarmonyClock(): HarmonyClock {
  return new HarmonyClock();
}
