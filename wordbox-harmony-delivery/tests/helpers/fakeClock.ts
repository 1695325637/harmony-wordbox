/**
 * 测试专用确定性时钟 —— 实现内核 Clock 端口。
 * 所有日期由用例显式 setYMD / advanceDays 推进，绝不读取系统时间；
 * 时间戳换算使用 UTC 分量，免疫本地时区与 DST 漂移。
 */
import type { Clock } from '@core/ports/ports';

const MS_PER_DAY: number = 86_400_000;

function pad2(n: number): string { return n < 10 ? '0' + String(n) : String(n); }
function pad4(n: number): string { return String(n).padStart(4, '0'); }

function epochOf(ymd: string): number {
  const y: number = Number(ymd.slice(0, 4));
  const m: number = Number(ymd.slice(5, 7));
  const d: number = Number(ymd.slice(8, 10));
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

function ymdOfUtcMs(ms: number): string {
  const date: Date = new Date(ms);
  return pad4(date.getUTCFullYear()) + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
}

export class FakeClock implements Clock {
  private currentYMD: string;
  private currentMs: number;

  constructor(initialYMD: string = '2026-11-01') {
    this.currentYMD = initialYMD;
    this.currentMs = epochOf(initialYMD);
  }

  nowMs(): number { return this.currentMs; }
  todayYMD(): string { return this.currentYMD; }

  ymdFromMs(ms: number): string { return ymdOfUtcMs(ms); }
  msFromYMD(ymd: string): number { return epochOf(ymd); }

  /** 直接跳到某个自然日（本地 00:00 日切口径由 YMD 字符串承担）。 */
  setYMD(ymd: string): void {
    this.currentYMD = ymd;
    this.currentMs = epochOf(ymd);
  }

  /** 设定精确 epoch ms（用于 checkedInAtMs / decidedAtMs 断言）。 */
  setNowMs(ms: number): void {
    this.currentMs = ms;
    this.currentYMD = ymdOfUtcMs(ms);
  }

  /** 推进 delta 个自然日，跨月 / 跨年 / 闰年自动正确。 */
  advanceDays(delta: number): void {
    this.setYMD(ymdOfUtcMs(epochOf(this.currentYMD) + delta * MS_PER_DAY));
  }

  /** 在同一天内推进毫秒（不改变 todayYMD）。 */
  advanceMs(delta: number): void { this.currentMs = this.currentMs + delta; }

  /** 当前 YMD（便于用例书写）。 */
  ymd(): string { return this.currentYMD; }
}

/** 基于 D1 推导第 n 个自然日（n 从 1 开始），复用内核纯函数以保持一致。 */
export function dayAt(d1YMD: string, dayIndex: number): string {
  return ymdOfUtcMs(epochOf(d1YMD) + (dayIndex - 1) * MS_PER_DAY);
}

export function createFakeClock(initialYMD: string = '2026-11-01'): FakeClock {
  return new FakeClock(initialYMD);
}
