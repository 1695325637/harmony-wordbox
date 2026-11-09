/**
 * checkin.test.ts —— 600 秒打卡服务单测。
 * 覆盖：达标自动打卡 / 每日仅一次 / 同日继续累加但不重复打卡 /
 * 非法日期与非正 delta 返回 Result.fail 且不抛异常 /
 * snapshot / remainingSeconds / rebuildStreak / listRange / 存储写失败。
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_GOAL_SECONDS, ErrorCode, WordStatus,
} from '@core';
import type { Result, CheckIn } from '@core';
import { createHarness, guestSessionOf } from '../helpers/harness';
import { D1, d, makeCheckIn, makeRecord } from '../helpers/fixtures';

describe('打卡服务：600 秒达标闭环', () => {
  it('首次累计 DAILY_GOAL_SECONDS(600) 秒 → checkedIn=true、activeSeconds=600、checkedInAtMs=clock.nowMs()、streakAfter=1', async () => {
    expect(DAILY_GOAL_SECONDS).toBe(600);
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.checkIn.accumulate(D1, DAILY_GOAL_SECONDS, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.checkedIn).toBe(true);
    expect(r.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);
    expect(r.value?.checkedInAtMs).toBe(h.clock.nowMs());
    expect(r.value?.streakAfter).toBe(1);
  });

  it('累计未达 600 秒 → checkedIn=false、checkedInAtMs=0、remainingSeconds 正确', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.checkIn.accumulate(D1, 200, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.checkedIn).toBe(false);
    expect(r.value?.checkedInAtMs).toBe(0);
    const remain = await h.services.checkIn.remainingSeconds(D1);
    expect(remain.value).toBe(DAILY_GOAL_SECONDS - 200);
  });

  it('多次分段累计到 600 秒 → 达标当日仅记一次打卡，activeSeconds 为各段之和', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.checkIn.accumulate(D1, 250, h.clock);
    await h.services.checkIn.accumulate(D1, 250, h.clock);
    const r = await h.services.checkIn.accumulate(D1, 100, h.clock);
    expect(r.value?.checkedIn).toBe(true);
    expect(r.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);
  });

  it('同日已打卡后继续累计 → activeSeconds 继续增长，但 checkedInAtMs 不变、streakAfter 不再 +1', async () => {
    const h = createHarness({ initialYMD: D1 });
    const first = await h.services.checkIn.accumulate(D1, DAILY_GOAL_SECONDS, h.clock);
    const firstAtMs = first.value?.checkedInAtMs ?? 0;
    const firstStreak = first.value?.streakAfter ?? 0;
    h.clock.advanceMs(5_000);
    const again = await h.services.checkIn.accumulate(D1, 120, h.clock);
    expect(again.value?.checkedIn).toBe(true);
    expect(again.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS + 120);
    expect(again.value?.checkedInAtMs).toBe(firstAtMs);
    expect(again.value?.streakAfter).toBe(firstStreak);
  });

  it('次日再打卡 → streakAfter 递增为 2，连续天数由 rebuildStreak 从同一 CheckIn 数据源计算', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.checkIn.accumulate(D1, DAILY_GOAL_SECONDS, h.clock);
    h.clock.setYMD(d(2));
    const r = await h.services.checkIn.accumulate(d(2), DAILY_GOAL_SECONDS, h.clock);
    expect(r.value?.checkedIn).toBe(true);
    expect(r.value?.streakAfter).toBe(2);
    const streak = await h.services.checkIn.streak();
    expect(streak.value?.current).toBe(2);
    expect(streak.value?.longest).toBe(2);
    expect(streak.value?.checkedInDates).toEqual([D1, d(2)]);
  });

  it('连续打卡中断一天 → longest 保留历史最长，current 归零（以 clock.todayYMD 为准）', async () => {
    const h = createHarness({ initialYMD: D1 });
    for (const day of [1, 2, 3]) {
      h.clock.setYMD(d(day));
      await h.services.checkIn.accumulate(d(day), DAILY_GOAL_SECONDS, h.clock);
    }
    const before = await h.services.checkIn.streak();
    expect(before.value?.longest).toBe(3);
    expect(before.value?.current).toBe(3);
    h.clock.setYMD(d(5));
    const after = await h.services.checkIn.streak();
    expect(after.value?.longest).toBe(3);
    expect(after.value?.current).toBe(0);
  });
});

describe('打卡服务：参数校验与 Result<T> 不抛异常', () => {
  it('accumulate 传入非法日期「2026-13-40」→ fail(INVALID_DATE)，不抛异常且未写入任何数据', async () => {
    const h = createHarness({ initialYMD: D1 });
    const awaited: Result<CheckIn> = await h.services.checkIn.accumulate('2026-13-40', 100, h.clock);
    expect(awaited.ok).toBe(false);
    expect(awaited.error?.code).toBe(ErrorCode.INVALID_DATE);
    expect(awaited.value).toBeUndefined();
    expect(h.storage.size()).toBe(0);
  });

  it('accumulate 传入 deltaSeconds=0 / -1 / NaN → fail(INVALID_ARGUMENT)，不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    for (const delta of [0, -1, Number.NaN]) {
      const r = await h.services.checkIn.accumulate(D1, delta, h.clock);
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe(ErrorCode.INVALID_ARGUMENT);
    }
  });

  it('snapshot 查询无数据的日期 → 返回 emptyCheckIn（activeSeconds=0、goalSeconds=600、checkedIn=false）', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.checkIn.snapshot(d(3));
    expect(r.ok).toBe(true);
    expect(r.value?.activeSeconds).toBe(0);
    expect(r.value?.goalSeconds).toBe(DAILY_GOAL_SECONDS);
    expect(r.value?.checkedIn).toBe(false);
  });

  it('snapshot 传入非法日期 → fail(INVALID_DATE)，不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.checkIn.snapshot('bad');
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.INVALID_DATE);
  });

  it('writeCheckIn + listRange → 仅返回区间内记录并按日期升序排列', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.checkIn.writeCheckIn(makeCheckIn({ dateYMD: d(3) }));
    await h.services.checkIn.writeCheckIn(makeCheckIn({ dateYMD: d(1) }));
    await h.services.checkIn.writeCheckIn(makeCheckIn({ dateYMD: d(5) }));
    const r = await h.services.checkIn.listRange(d(2), d(4));
    expect(r.ok).toBe(true);
    expect(r.value?.map((c) => c.dateYMD)).toEqual([d(3)]);
  });

  it('存储强制写失败 → accumulate 返回 fail(STORAGE_WRITE_FAILED)，全程不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    h.storage.setFailWrites(true);
    const r = await h.services.checkIn.accumulate(D1, DAILY_GOAL_SECONDS, h.clock);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_WRITE_FAILED);
  });

  it('游客态写入 StudyRecord 与 CheckIn 不被门禁拦截（Q10 口径 A）', async () => {
    const h = createHarness({ initialYMD: D1 });
    const s = guestSessionOf();
    const w = await h.services.repository.saveRecord(s, makeRecord({ status: WordStatus.Learning }));
    const c = await h.services.checkIn.accumulate(D1, 60, h.clock);
    expect(w.ok).toBe(true);
    expect(c.ok).toBe(true);
    const loaded = await h.services.repository.loadRecords(s);
    expect(loaded.value?.length).toBe(1);
  });
});
