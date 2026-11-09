/**
 * date.test.ts —— YMD 纯日期工具单测。
 * 覆盖：校验 / 解析 / 格式化 / 加减天数 / 日差 / 比较 / D1→D8 序号 /
 * 7 天滑动窗口 / 周网格 / 月份工具 / 跨月 / 跨年 / 闰年 / 非法输入不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  isYMD, parseYMD, formatYMD, addDays, diffDays, compareYMD, dayIndexOf,
  windowFrom, weekGrid, monthOf, daysInMonth, monthStartYMD, ymdOfMonthDay,
  GUEST_RETENTION_DAYS, SM2_SECOND_INTERVAL_DAYS, DayState,
} from '@core';
import { D1, CROSS_MONTH_D1, LEAP_D1, d } from '../helpers/fixtures';

describe('日期工具：isYMD / parseYMD / formatYMD', () => {
  it('输入合法 YMD「2026-11-01」→ 返回 true，且能解析为 2026/11/1', () => {
    expect(isYMD(D1)).toBe(true);
    expect(parseYMD(D1)).toEqual({ y: 2026, m: 11, d: 1 });
  });

  it('输入闰年合法日「2028-02-29」→ 返回 true；平年非法日「2026-02-29」→ 返回 false', () => {
    expect(isYMD('2028-02-29')).toBe(true);
    expect(isYMD('2026-02-29')).toBe(false);
  });

  it('输入长度错误 / 分隔符错误 / 含非数字 / 月份 13 / 日期 32 → 全部返回 false', () => {
    expect(isYMD('2026-1-01')).toBe(false);
    expect(isYMD('2026/11/01')).toBe(false);
    expect(isYMD('2026-1x-01')).toBe(false);
    expect(isYMD('2026-13-01')).toBe(false);
    expect(isYMD('2026-11-32')).toBe(false);
  });

  it('输入非法 YMD 给 parseYMD → 安全返回 1970-01-01，不抛异常', () => {
    expect(() => parseYMD('bad')).not.toThrow();
    expect(parseYMD('bad')).toEqual({ y: 1970, m: 1, d: 1 });
  });

  it('输入 (2026, 3, 7) 给 formatYMD → 补零得到「2026-03-07」', () => {
    expect(formatYMD(2026, 3, 7)).toBe('2026-03-07');
  });
});

describe('日期工具：addDays / diffDays / compareYMD', () => {
  it('输入「2026-10-31」+1 天 → 跨月得到「2026-11-01」', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('输入「2026-12-31」+1 天 → 跨年得到「2027-01-01」', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('输入闰年「2028-02-28」+1 天 → 得到「2028-02-29」，再 +1 天 →「2028-03-01」', () => {
    expect(addDays(LEAP_D1, 1)).toBe('2028-02-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('输入负 delta 与非法 YMD → 负数正确回退，非法字符串原样返回不抛异常', () => {
    expect(addDays('2026-11-03', -3)).toBe('2026-10-31');
    expect(addDays('not-a-date', 5)).toBe('not-a-date');
  });

  it('跨月基准 D1=2026-10-28 连续推进 7 天 → D8=2026-11-04（覆盖 10→11 月切换）', () => {
    expect(d(1, CROSS_MONTH_D1)).toBe('2026-10-28');
    expect(d(8, CROSS_MONTH_D1)).toBe('2026-11-04');
  });

  it('diffDays 输入合法正序 / 逆序 → 6 / -6；任一非法 → 0 且不抛异常', () => {
    expect(diffDays('2026-11-03', '2026-11-09')).toBe(6);
    expect(diffDays('2026-11-09', '2026-11-03')).toBe(-6);
    expect(diffDays('bad', '2026-11-09')).toBe(0);
  });

  it('compareYMD 输入 a<b / a>b / a=b → -1 / 1 / 0', () => {
    expect(compareYMD('2026-11-01', '2026-11-08')).toBe(-1);
    expect(compareYMD('2026-11-08', '2026-11-01')).toBe(1);
    expect(compareYMD(D1, D1)).toBe(0);
  });
});

describe('日期工具：dayIndexOf / windowFrom / weekGrid / 月份工具', () => {
  it('dayIndexOf 输入 D1 当天 → 1；输入 D8 → 8；今天早于首学日 → 0；非法 → 0', () => {
    expect(dayIndexOf(D1, d(1))).toBe(1);
    expect(dayIndexOf(D1, d(8))).toBe(8);
    expect(dayIndexOf(D1, '2026-10-01')).toBe(0);
    expect(dayIndexOf('bad', d(8))).toBe(0);
  });

  it('windowFrom(today, GUEST_RETENTION_DAYS) → 闭区间 [today-6, today]，days 恒为 7', () => {
    const w = windowFrom(d(8), GUEST_RETENTION_DAYS);
    expect(w.fromYMD).toBe(d(2));
    expect(w.toYMD).toBe(d(8));
    expect(w.days).toBe(GUEST_RETENTION_DAYS);
    expect(GUEST_RETENTION_DAYS).toBe(7);
  });

  it('windowFrom 输入 days<=0 → 退化为 1 天窗口 [today, today]，不抛异常', () => {
    const w = windowFrom(D1, 0);
    expect(w.fromYMD).toBe(D1);
    expect(w.toYMD).toBe(D1);
    expect(w.days).toBe(1);
  });

  it('weekGrid 输入 7 天起点与已打卡日期集合 → 恰好 7 格，命中为 Checked 其余为 Missed', () => {
    const cells = weekGrid(D1, [d(1), d(3)]);
    expect(cells.length).toBe(7);
    expect(cells[0]).toBe(DayState.Checked);
    expect(cells[1]).toBe(DayState.Missed);
    expect(cells[2]).toBe(DayState.Checked);
  });

  it('月份工具：monthOf 归一化、闰年 2 月 29 天、monthStartYMD、ymdOfMonthDay 补零', () => {
    expect(monthOf('2026-11-08')).toBe('2026-11');
    expect(daysInMonth('2028-02-29')).toBe(29);
    expect(daysInMonth('2026-02-01')).toBe(28);
    expect(monthStartYMD('2026-11-08')).toBe('2026-11-01');
    expect(ymdOfMonthDay('2026-11', 7)).toBe('2026-11-07');
    expect(daysInMonth('bad')).toBe(0);
  });

  it('OAQ-1 裁决落地：SM2_SECOND_INTERVAL_DAYS 常量取经典 SM-2 值 6', () => {
    expect(SM2_SECOND_INTERVAL_DAYS).toBe(6);
  });
});
