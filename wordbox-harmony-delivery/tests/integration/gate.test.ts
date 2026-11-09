/**
 * gate.test.ts —— F-20 读取层门禁集成测试。
 * 核心口径：门禁只拦「读进度」，不拦「写学习数据」。
 * 覆盖：游客态 statistics/calendar 返回 Gated{allowed:false} /
 * 游客态 CheckIn / StudyRecord / Word / ChatMessage 照常落盘 /
 * todayOverview 的 streakVisible=false / 登录后解锁 /
 * ProgressGate.require 不抛异常 / gate.check 与 gate.guard 口径一致。
 */
import { describe, it, expect } from 'vitest';
import {
  GateReason, SessionKind, StatsWindow, DayState, Scene, WordStatus,
  ErrorCode, GATE_UNLOCK_HINT, DAILY_GOAL_SECONDS,
} from '@core';
import {
  createHarness, guestSessionOf, authSessionOf,
  writeGuestCheckIn, writeGuestWord, writeGuestRecord, writeGuestChat, msOf,
} from '../helpers/harness';
import { D1, d, makeCheckIn, makeRecord, makeWord, makeChatMessage } from '../helpers/fixtures';

const UID = 'qa-uid-001';

describe('F-20 门禁：只拦读取，不拦写入', () => {
  it('游客态写入 Word / StudyRecord / CheckIn / ChatMessage → 全部落盘成功且能通过 Repository 读回', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const guest = guestSessionOf();
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await writeGuestWord(h, makeWord({ id: 'w-guest', createdAtYMD: d(8) }));
    await writeGuestRecord(h, makeRecord({
      wordId: 'w-guest', status: WordStatus.Learning, updatedAtYMD: d(8),
    }));
    await writeGuestChat(h, makeChatMessage({ id: 'm-1', createdAtMs: msOf(h, d(8)) }));

    expect((await h.services.repository.loadWords(guest)).value?.map((w) => w.id)).toEqual(['w-guest']);
    expect((await h.services.repository.loadRecords(guest)).value?.map((r) => r.wordId)).toEqual(['w-guest']);
    expect((await h.services.repository.loadCheckIns(guest, d(8), d(8))).value?.length).toBe(1);
    const chats = await h.services.repository.loadChatMessages(guest, 's-1');
    expect(chats.value?.map((m) => m.id)).toEqual(['m-1']);
    expect((await h.services.checkIn.snapshot(d(8))).value?.checkedIn).toBe(true);
  });

  it('游客态即便已有大量学习数据，statistics(D7/D30) 仍返回 Gated{allowed:false, reason:Guest, data:undefined}', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await writeGuestRecord(h, makeRecord({
      wordId: 'w-guest', status: WordStatus.Mastered, updatedAtYMD: d(8),
      totalReviews: 10, correctReviews: 9,
    }));
    for (const window of [StatsWindow.D7, StatsWindow.D30, StatsWindow.D90]) {
      const r = await h.app.statistics(window, h.clock);
      expect(r.ok).toBe(true);
      expect(r.value?.allowed).toBe(false);
      expect(r.value?.reason).toBe(GateReason.Guest);
      expect(r.value?.data).toBeUndefined();
      expect(r.value?.unlockHint).toBe(GATE_UNLOCK_HINT);
    }
  });

  it('游客态 calendar 被拦截；登录后门禁放行，且账号分区独立（游客分区数据不串到账号日历）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const blocked = await h.app.calendar('2026-11', h.clock);
    expect(blocked.value?.allowed).toBe(false);
    expect(blocked.value?.data).toBeUndefined();

    // 游客数据留在 guest: 分区；登录后 calendar 读 user:{uid}: 分区，门禁放行但该日为 Missed
    await h.services.account.signIn({ uid: UID, displayName: 'QA 旅客', expiresAtMs: 0 }, h.clock);
    const unlocked = await h.app.calendar('2026-11', h.clock);
    expect(unlocked.ok).toBe(true);
    expect(unlocked.value?.allowed).toBe(true);
    expect(unlocked.value?.data).toBeDefined();
    expect(unlocked.value?.data?.days.length).toBe(30);
    expect(unlocked.value?.data?.days[7].state).toBe(DayState.Missed);
    expect((await h.storage.get('guest:checkins:' + d(8))).value).toBeDefined();
  });

  it('游客态 todayOverview → streakVisible=false、streak=0、gateHint 非空，但 remainingSeconds 反映真实计时', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: 200, checkedIn: false }));
    const r = await h.app.todayOverview(h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.streakVisible).toBe(false);
    expect(r.value?.streak).toBe(0);
    expect(r.value?.gateHint).toBe(GATE_UNLOCK_HINT);
    expect(r.value?.remainingSeconds).toBe(DAILY_GOAL_SECONDS - 200);
    expect(r.value?.accountLabel).toBe('游客');
  });

  it('登录态 statistics / calendar / todayOverview 全部解锁，streakVisible=true、gateHint 为空', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await h.services.account.signIn({ uid: UID, displayName: '旅行者', expiresAtMs: 0 }, h.clock);
    const stats = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(stats.value?.allowed).toBe(true);
    expect(stats.value?.reason).toBe(GateReason.Ok);
    expect(stats.value?.data).toBeDefined();
    const overview = await h.app.todayOverview(h.clock);
    expect(overview.value?.streakVisible).toBe(true);
    expect(overview.value?.gateHint).toBe('');
    expect(overview.value?.accountLabel).toBe('旅行者');
    expect(SessionKind.Authenticated).toBe('authenticated');
  });

  it('ProgressGate.require 游客返回 fail(NOT_AUTHENTICATED) 不抛异常；guard 对游客隐藏 data 对登录态透传', () => {
    const h = createHarness({ initialYMD: d(8) });
    const guest = guestSessionOf();
    const auth = authSessionOf(UID);
    const blocked = h.services.gate.require(guest);
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe(ErrorCode.NOT_AUTHENTICATED);
    expect(h.services.gate.require(auth).ok).toBe(true);
    const checkGuest = h.services.gate.check(guest);
    expect(checkGuest.allowed).toBe(false);
    expect(checkGuest.reason).toBe(GateReason.Guest);
    expect(h.services.gate.guard<number>(guest, 99).data).toBeUndefined();
    expect(h.services.gate.guard<number>(auth, 99).data).toBe(99);
  });

  it('门禁读取不产生任何写入副作用：反复调用 statistics/calendar 后 storage.size 不变', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: 60 }));
    const before = h.storage.size();
    for (let i = 0; i < 5; i++) {
      await h.app.statistics(StatsWindow.D7, h.clock);
      await h.app.calendar('2026-11', h.clock);
    }
    expect(h.storage.size()).toBe(before);
  });

  it('游客通过 app 完整学习（sendMessage + tick 600s）→ 打卡与调度照常落盘，仅统计页被门禁拦截', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.app.bootstrap(h.clock);
    await h.app.startLearning(Scene.AIRPORT, h.clock);
    const sid = h.app.activeSessionId();
    await h.app.sendMessage(sid, 'Here is my passport', h.clock);
    const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    expect(ci.value?.checkedIn).toBe(true);
    const sessionR = await h.services.account.current();
    expect(sessionR.value).toBeDefined();
    if (sessionR.value !== undefined) {
      const records = await h.services.repository.loadRecords(sessionR.value);
      expect(records.value?.length).toBeGreaterThan(0);
    }
    const gated = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(gated.value?.allowed).toBe(false);
  });
});
