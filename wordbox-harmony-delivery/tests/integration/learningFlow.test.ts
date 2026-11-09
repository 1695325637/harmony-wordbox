/**
 * learningFlow.test.ts —— 学习闭环集成测试（真实 app facade + 真实内核服务）。
 * 覆盖：bootstrap → startLearning → 多轮 AI 对话 → 调度回写 → 600s 打卡 →
 * finishLearning / 今日概览；以及 QUALITY 缺失时不回写调度但不中断计时。
 */
import { describe, it, expect } from 'vitest';
import {
  Scene, SessionKind, StatsWindow, DAILY_GOAL_SECONDS, DEFAULT_NEW_CAP,
  createMockAI, createScriptedAI,
} from '@core';
import { createHarness } from '../helpers/harness';
import { D1, d } from '../helpers/fixtures';

describe('学习闭环：从冷启动到 600 秒打卡', () => {
  it('完整闭环：bootstrap → startLearning → 6 轮对话 → tick 600s → checkedIn=true、aiRounds=6、目标词全覆盖', async () => {
    const h = createHarness({ initialYMD: D1 });
    const boot = await h.app.bootstrap(h.clock);
    expect(boot.ok).toBe(true);
    expect(boot.value?.session.kind).toBe(SessionKind.Guest);
    expect(boot.value?.pruneReport.removedCount).toBe(0);
    expect(boot.value?.window.days).toBe(7);

    const q = await h.app.startLearning(Scene.AIRPORT, h.clock);
    expect(q.ok).toBe(true);
    expect(q.value?.newWordIds.length).toBe(DEFAULT_NEW_CAP);
    const sid = h.app.activeSessionId();
    expect(sid.length).toBeGreaterThan(0);

    for (let turn = 0; turn < 6; turn++) {
      const r = await h.app.sendMessage(sid, 'May I see your boarding pass?', h.clock);
      expect(r.ok).toBe(true);
      expect(r.value?.parsed.quality).toBeGreaterThanOrEqual(0);
      expect(r.value?.degraded).toBe(false);
      expect(r.value?.updatedRecords.length).toBeGreaterThan(0);
      expect(r.value?.message.content).not.toContain('[[QUALITY:');
    }

    const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    expect(ci.ok).toBe(true);
    expect(ci.value?.checkedIn).toBe(true);
    expect(ci.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);

    const summary = await h.app.finishLearning(sid, h.clock);
    expect(summary.ok).toBe(true);
    expect(summary.value?.checkedIn).toBe(true);
    expect(summary.value?.aiRounds).toBe(6);
    expect(summary.value?.totalActiveSeconds).toBe(DAILY_GOAL_SECONDS);
    expect(summary.value?.allTargetWordsCovered).toBe(true);

    const overview = await h.app.todayOverview(h.clock);
    expect(overview.ok).toBe(true);
    expect(overview.value?.checkIn.checkedIn).toBe(true);
    expect(overview.value?.remainingSeconds).toBe(0);
  });

  it('分段累计 600 秒达标：3 次 tick 后当日仅打卡一次，重复 tick 不增加连续天数', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.app.bootstrap(h.clock);
    const q = await h.app.startLearning(Scene.HOTEL, h.clock);
    expect(q.ok).toBe(true);
    const sid = h.app.activeSessionId();
    await h.app.tickActiveSeconds(sid, 200, h.clock);
    await h.app.tickActiveSeconds(sid, 200, h.clock);
    const ci = await h.app.tickActiveSeconds(sid, 200, h.clock);
    expect(ci.value?.checkedIn).toBe(true);
    expect(ci.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);
    const again = await h.app.tickActiveSeconds(sid, 100, h.clock);
    expect(again.value?.checkedIn).toBe(true);
    expect(again.value?.streakAfter).toBe(ci.value?.streakAfter);
    const summary = await h.app.finishLearning(sid, h.clock);
    expect(summary.value?.totalActiveSeconds).toBe(DAILY_GOAL_SECONDS + 100);
  });

  it('QUALITY 缺失（quality=-1）→ 不回写 StudyRecord、不抛异常、不中断 600s 计时打卡闭环', async () => {
    const primary = createMockAI();
    primary.setTags('这是一句没有质量标签的回复');
    const h = createHarness({ initialYMD: D1, primaryAI: primary, fallbackAI: createScriptedAI() });
    await h.app.bootstrap(h.clock);
    await h.app.startLearning(Scene.DINING, h.clock);
    const sid = h.app.activeSessionId();
    const turn = await h.app.sendMessage(sid, 'A table for two please', h.clock);
    expect(turn.ok).toBe(true);
    expect(turn.value?.parsed.quality).toBe(-1);
    expect(turn.value?.updatedRecords.length).toBe(0);
    expect(turn.value?.message.quality).toBe(-1);

    const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    expect(ci.ok).toBe(true);
    expect(ci.value?.checkedIn).toBe(true);
    const sessionR = await h.services.account.current();
    expect(sessionR.value).toBeDefined();
    if (sessionR.value !== undefined) {
      const records = await h.services.repository.loadRecords(sessionR.value);
      expect(records.value?.length).toBe(0);
    }
  });

  it('所有 facade 方法均返回 Result<T> 不抛异常；游客态 statistics 被门禁拦截但学习照常落盘', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.app.bootstrap(h.clock);
    await h.app.startLearning(Scene.CUSTOMS, h.clock);
    const sid = h.app.activeSessionId();
    await h.app.sendMessage(sid, 'Here is my passport', h.clock);
    await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    const gated = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(gated.ok).toBe(true);
    expect(gated.value?.allowed).toBe(false);
    const checkIn = await h.services.checkIn.snapshot(D1);
    expect(checkIn.value?.checkedIn).toBe(true);
    const sessionR = await h.services.account.current();
    expect(sessionR.value).toBeDefined();
    if (sessionR.value !== undefined) {
      const records = await h.services.repository.loadRecords(sessionR.value);
      expect(records.value?.length).toBeGreaterThan(0);
    }
  });

  it('多日连续学习：D1 / D2 各达标 → 连续天数为 2，日历显示两日 Checked', async () => {
    const h = createHarness({ initialYMD: D1 });
    const sidRef: string[] = [];
    for (const day of [1, 2]) {
      h.clock.setYMD(d(day));
      await h.app.bootstrap(h.clock);
      await h.app.startLearning(Scene.TRANSPORT, h.clock);
      const sid = h.app.activeSessionId();
      sidRef.push(sid);
      await h.app.sendMessage(sid, 'One ticket please', h.clock);
      await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    }
    const streak = await h.services.checkIn.streak();
    expect(streak.value?.current).toBe(2);
    expect(streak.value?.checkedInDates).toEqual([D1, d(2)]);
    expect(sidRef[0].length).toBeGreaterThan(0);
  });
});
