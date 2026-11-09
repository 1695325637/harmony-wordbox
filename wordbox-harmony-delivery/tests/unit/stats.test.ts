/**
 * stats.test.ts —— 统计服务与 F-20 读取层门禁单测。
 * 覆盖：游客态 summary/calendar 返回 Gated{allowed:false}、登录态解锁 /
 * recomputeAfterMerge 不受门禁 / 各聚合字段 / 日历月 / 统计重算误差 0 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  StatsWindow, GateReason, SessionKind, WordStatus, DayState,
  ALL_SCENES, DAILY_GOAL_SECONDS, GATE_UNLOCK_HINT, SM2_MASTERED_INTERVAL_DAYS,
} from '@core';
import type { StatsSummary } from '@core';
import {
  createHarness, guestSessionOf, authSessionOf,
  writeAccountRecord, writeAccountCheckIn,
} from '../helpers/harness';
import { D1, d, makeRecord, makeCheckIn } from '../helpers/fixtures';

const UID = 'qa-uid-001';

describe('统计服务：F-20 门禁落在读取层', () => {
  it('游客态调用 summary(D7) → ok=true 但 Gated.allowed=false、reason=Guest、data=undefined、unlockHint 非空', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const r = await h.services.stats.summary(StatsWindow.D7, d(8), guestSessionOf());
    expect(r.ok).toBe(true);
    expect(r.value?.allowed).toBe(false);
    expect(r.value?.reason).toBe(GateReason.Guest);
    expect(r.value?.data).toBeUndefined();
    expect(r.value?.unlockHint).toBe(GATE_UNLOCK_HINT);
  });

  it('游客态调用 calendar → 同样返回 Gated{allowed:false} 且不计算任何进度数字', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const r = await h.services.stats.calendar('2026-11', d(8), guestSessionOf());
    expect(r.ok).toBe(true);
    expect(r.value?.allowed).toBe(false);
    expect(r.value?.data).toBeUndefined();
  });

  it('登录态调用 summary(D30) → Gated.allowed=true、reason=Ok、data 定义且 asOfYMD 正确', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const r = await h.services.stats.summary(StatsWindow.D30, d(8), authSessionOf(UID));
    expect(r.ok).toBe(true);
    expect(r.value?.allowed).toBe(true);
    expect(r.value?.reason).toBe(GateReason.Ok);
    expect(r.value?.data).toBeDefined();
    expect(r.value?.data?.asOfYMD).toBe(d(8));
    expect(r.value?.data?.windowDays).toBe(StatsWindow.D30);
  });

  it('recomputeAfterMerge 在游客态也直接返回 StatsSummary（内部合并后重算不经门禁）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const r = await h.services.stats.recomputeAfterMerge(UID, d(8));
    expect(r.ok).toBe(true);
    expect(r.value).toBeDefined();
    expect(r.value?.windowDays).toBe(StatsWindow.D30);
    expect(r.value?.masteryCurve.length).toBe(StatsWindow.D30);
  });

  it('ProgressGate.require 对游客返回 fail(NOT_AUTHENTICATED)，对登录态返回 ok，全程不抛异常', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const guest = guestSessionOf();
    const auth = authSessionOf(UID);
    expect(guest.kind).toBe(SessionKind.Guest);
    expect(auth.kind).toBe(SessionKind.Authenticated);
    expect(h.services.gate.require(guest).ok).toBe(false);
    expect(h.services.gate.require(auth).ok).toBe(true);
    expect(h.services.gate.guard<number>(guest, 42).data).toBeUndefined();
    expect(h.services.gate.guard<number>(auth, 42).data).toBe(42);
  });
});

describe('统计服务：聚合字段正确性', () => {
  it('写入 1 条 Mastered + 1 条 Learning 记录 → masteredWords=1、learningWords=1、totalReviews/correctReviews 求和正确', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const session = authSessionOf(UID);
    await writeAccountRecord(h, session, makeRecord({
      wordId: 'w-mastered', status: WordStatus.Mastered,
      intervalDays: SM2_MASTERED_INTERVAL_DAYS, totalReviews: 5, correctReviews: 4, updatedAtYMD: d(5),
    }));
    await writeAccountRecord(h, session, makeRecord({
      wordId: 'w-learning', status: WordStatus.Learning, totalReviews: 3, correctReviews: 2, updatedAtYMD: d(6),
    }));
    const r = await h.services.stats.summary(StatsWindow.D30, d(8), session);
    expect(r.value?.data?.masteredWords).toBe(1);
    expect(r.value?.data?.learningWords).toBe(1);
    expect(r.value?.data?.totalReviews).toBe(8);
    expect(r.value?.data?.correctReviews).toBe(6);
  });

  it('写入 3 天打卡（其中 2 天已达标）→ totalActiveSeconds 求和、checkedInDays=2、masteryCurve 长度=windowDays', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const session = authSessionOf(UID);
    await writeAccountCheckIn(h, session, makeCheckIn({ dateYMD: d(6), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await writeAccountCheckIn(h, session, makeCheckIn({ dateYMD: d(7), activeSeconds: 100, checkedIn: false }));
    await writeAccountCheckIn(h, session, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const r = await h.services.stats.summary(StatsWindow.D7, d(8), session);
    expect(r.value?.data?.totalActiveSeconds).toBe(DAILY_GOAL_SECONDS * 2 + 100);
    expect(r.value?.data?.checkedInDays).toBe(2);
    expect(r.value?.data?.masteryCurve.length).toBe(StatsWindow.D7);
    expect(r.value?.data?.sceneDistribution.length).toBe(ALL_SCENES.length);
  });

  it('calendar 输入 2026-11 且 asOfYMD=D8 → days 长度=30、已打卡日 Checked、未来日 Future、过去未打卡 Missed', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const session = authSessionOf(UID);
    await writeAccountCheckIn(h, session, makeCheckIn({ dateYMD: '2026-11-01', activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const r = await h.services.stats.calendar('2026-11', d(8), session);
    expect(r.value?.allowed).toBe(true);
    const days = r.value?.data?.days ?? [];
    expect(r.value?.data?.daysInMonth).toBe(30);
    expect(days.length).toBe(30);
    expect(days[0].state).toBe(DayState.Checked);
    expect(days[1].state).toBe(DayState.Missed);
    expect(days[8].state).toBe(DayState.Future);
    expect(r.value?.data?.checkedInDays).toBe(1);
    expect(r.value?.data?.totalActiveSeconds).toBe(DAILY_GOAL_SECONDS);
  });

  it('统计重算误差 0：同一数据集下 recomputeAfterMerge 与登录态 summary(D30) 的关键字段完全一致', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const session = authSessionOf(UID);
    await writeAccountRecord(h, session, makeRecord({
      wordId: 'w-m', status: WordStatus.Mastered, intervalDays: SM2_MASTERED_INTERVAL_DAYS,
      totalReviews: 4, correctReviews: 3, updatedAtYMD: d(4),
    }));
    await writeAccountCheckIn(h, session, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const recomputed: StatsSummary | undefined = (await h.services.stats.recomputeAfterMerge(UID, d(8))).value;
    const summary: StatsSummary | undefined = (await h.services.stats.summary(StatsWindow.D30, d(8), session)).value?.data;
    expect(recomputed).toBeDefined();
    expect(summary).toBeDefined();
    if (recomputed !== undefined && summary !== undefined) {
      expect(recomputed.masteredWords).toBe(summary.masteredWords);
      expect(recomputed.learningWords).toBe(summary.learningWords);
      expect(recomputed.totalReviews).toBe(summary.totalReviews);
      expect(recomputed.correctReviews).toBe(summary.correctReviews);
      expect(recomputed.totalActiveSeconds).toBe(summary.totalActiveSeconds);
      expect(recomputed.checkedInDays).toBe(summary.checkedInDays);
      expect(recomputed.sceneDistribution.length).toBe(summary.sceneDistribution.length);
    }
  });
});
