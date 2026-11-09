/**
 * guestLoginMerge.test.ts —— 游客 → 登录 → 类型 B → 合并 全流程集成测试。
 * 覆盖：登录成功后类型 B 出现且类型 A 抑制 / 选择合并执行且幂等 /
 * 保留账号与稍后不合并 / 「不再提示」不影响类型 B /
 * 合并冲突规则在集成层生效 / 游客分区不删除 / 统计解锁 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  DialogType, MergeChoiceKind, MergeSkipReason, PromptActionKind,
  PromptSkipReason, SessionKind, StatsWindow, Scene, WordStatus,
  DAILY_GOAL_SECONDS, SM2_MASTERED_INTERVAL_DAYS,
} from '@core';
import type { AccountAuthResult } from '@core';
import {
  createHarness, writeGuestCheckIn, writeGuestWord, writeGuestRecord,
  writeAccountCheckIn, writeAccountWord, writeAccountRecord, authSessionOf,
} from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';
import { d, makeCheckIn, makeWord, makeRecord } from '../helpers/fixtures';

const UID = 'qa-uid-001';
function authResult(uid: string = UID): AccountAuthResult {
  return { uid: uid, displayName: 'QA 旅客', expiresAtMs: 4_102_444_800_000 };
}

/** 在窗口内制造真实的游客学习数据（走 app 链路）。 */
async function buildGuestProgress(h: TestHarness): Promise<void> {
  await h.app.bootstrap(h.clock);
  await h.app.startLearning(Scene.AIRPORT, h.clock);
  const sid = h.app.activeSessionId();
  await h.app.sendMessage(sid, 'Here is my boarding pass', h.clock);
  await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
}

describe('游客登录合并：类型 A → 认证 → 类型 B 时序', () => {
  it('游客有进度时登录成功 → mergePrompt.shouldShow=true、dialogType=B、loginGuideSuppressed=true', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    const flow = await h.app.onHuaweiAuthResult(authResult(), h.clock);
    expect(flow.ok).toBe(true);
    expect(flow.value?.transition.before.kind).toBe(SessionKind.Guest);
    expect(flow.value?.transition.after.kind).toBe(SessionKind.Authenticated);
    expect(flow.value?.transition.guestProgressExists).toBe(true);
    expect(flow.value?.transition.shouldShowTypeB).toBe(true);
    expect(flow.value?.mergePrompt.shouldShow).toBe(true);
    expect(flow.value?.mergePrompt.dialogType).toBe(DialogType.MergeChoice);
    expect(flow.value?.mergePrompt.guestSnapshot).toBeDefined();
    expect(flow.value?.loginGuideSuppressed).toBe(true);
  });

  it('认证结果为空（用户取消）→ 不产生类型 B、会话保持游客、类型 A 不被抑制', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    const flow = await h.app.onHuaweiAuthResult(undefined, h.clock);
    expect(flow.ok).toBe(true);
    expect(flow.value?.mergePrompt.shouldShow).toBe(false);
    expect(flow.value?.mergePrompt.reason).toBe(MergeSkipReason.NO_GUEST_DATA);
    expect(flow.value?.transition.after.kind).toBe(SessionKind.Guest);
    expect(flow.value?.loginGuideSuppressed).toBe(false);
    expect((await h.services.account.current()).value?.kind).toBe(SessionKind.Guest);
  });

  it('无游客进度时登录 → 类型 B 不弹（reason=NO_GUEST_DATA）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const flow = await h.app.onHuaweiAuthResult(authResult(), h.clock);
    expect(flow.value?.transition.guestProgressExists).toBe(false);
    expect(flow.value?.mergePrompt.shouldShow).toBe(false);
    expect(flow.value?.mergePrompt.reason).toBe(MergeSkipReason.NO_GUEST_DATA);
  });

  it('「不再提示」只关闭类型 A：先选 NeverPrompt 再登录，类型 B 依然弹出', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    await h.app.onLoginGuideAction(PromptActionKind.NeverPrompt, h.clock);
    const typeA = await h.services.loginPrompt.decide(d(8));
    expect(typeA.value?.shouldPrompt).toBe(false);
    expect(typeA.value?.reason).toBe(PromptSkipReason.NEVER_PROMPT);
    const flow = await h.app.onHuaweiAuthResult(authResult(), h.clock);
    expect(flow.value?.mergePrompt.shouldShow).toBe(true);
    expect(flow.value?.mergePrompt.dialogType).toBe(DialogType.MergeChoice);
  });

  it('onLoginGuideAction(GoLogin) → launchAccountKit=true、dialogType=A、nextState.lastPromptDate=today', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    const r = await h.app.onLoginGuideAction(PromptActionKind.GoLogin, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.action).toBe(PromptActionKind.GoLogin);
    expect(r.value?.dialogType).toBe(DialogType.LoginGuide);
    expect(r.value?.launchAccountKit).toBe(true);
    expect(r.value?.nextState.lastPromptDate).toBe(d(8));
  });
});

describe('游客登录合并：选择分支与幂等', () => {
  it('选择「合并」→ performed=true、recomputed=true、after 有统计；再次合并 idempotentHit=true', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    const merged = await h.app.onMergeChoice(MergeChoiceKind.Merge, h.clock);
    expect(merged.ok).toBe(true);
    expect(merged.value?.performed).toBe(true);
    expect(merged.value?.recomputed).toBe(true);
    expect(merged.value?.after).toBeDefined();
    expect(merged.value?.reason).toBe(MergeSkipReason.PERFORMED);

    const again = await h.services.migration.merge(UID, d(8), h.clock);
    expect(again.value?.idempotentHit).toBe(true);
    expect(again.value?.performed).toBe(false);
    expect(again.value?.reason).toBe(MergeSkipReason.ALREADY_MERGED);
  });

  it('选择「稍后」→ performed=false、reason=DECISION_DEFER，游客数据保留且可再次弹出类型 B', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    const r = await h.app.onMergeChoice(MergeChoiceKind.Defer, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.performed).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.DECISION_DEFER);
    expect((await h.services.migration.hasDecision(UID)).value).toBe(false);
    expect((await h.services.migration.detect(UID, d(8))).value?.shouldShow).toBe(true);
  });

  it('选择「保留账号」→ performed=false、reason=DECISION_KEEP_ACCOUNT，账号分区零写入', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    const r = await h.app.onMergeChoice(MergeChoiceKind.KeepAccount, h.clock);
    expect(r.value?.performed).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.DECISION_KEEP_ACCOUNT);
    expect((await h.services.migration.hasDecision(UID)).value).toBe(true);
    expect((await h.services.repository.loadWords(authSessionOf(UID))).value?.length).toBe(0);
  });

  it('合并后游客分区不删除，且 statistics 由 Gated 拒绝变为解锁', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await buildGuestProgress(h);
    const before = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(before.value?.allowed).toBe(false);
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    await h.app.onMergeChoice(MergeChoiceKind.Merge, h.clock);
    const after = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(after.value?.allowed).toBe(true);
    expect(after.value?.data).toBeDefined();
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.checkIns.length).toBeGreaterThan(0);
    expect((await h.storage.get('guest:checkins:' + d(8))).value).toBeDefined();
  });
});

describe('游客登录合并：冲突规则在集成层生效', () => {
  it('账号已有同日打卡与同 text|scene 词 → 合并后 activeSeconds 取较大不相加、账号词版本保留', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const auth = authSessionOf(UID);
    await writeAccountCheckIn(h, auth, makeCheckIn({
      dateYMD: d(8), activeSeconds: 150, checkedIn: false, checkedInAtMs: 9_000, streakAfter: 1,
    }));
    await writeAccountWord(h, auth, makeWord({ id: 'w-account', text: 'Guest Phrase', scene: Scene.AIRPORT }));
    await writeGuestCheckIn(h, makeCheckIn({
      dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true, checkedInAtMs: 1_000, streakAfter: 2,
    }));
    await writeGuestWord(h, makeWord({ id: 'w-guest', text: 'guest phrase', scene: Scene.AIRPORT, createdAtYMD: d(8) }));
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    const merged = await h.app.onMergeChoice(MergeChoiceKind.Merge, h.clock);
    expect(merged.value?.performed).toBe(true);
    expect(merged.value?.conflictResolvedCount).toBeGreaterThan(0);
    const stored = await h.services.repository.loadCheckIns(auth, d(8), d(8));
    expect(stored.value?.[0].activeSeconds).toBe(DAILY_GOAL_SECONDS);
    expect(stored.value?.[0].activeSeconds).not.toBe(DAILY_GOAL_SECONDS + 150);
    expect(stored.value?.[0].checkedIn).toBe(true);
    const words = await h.services.repository.loadWords(auth);
    expect(words.value?.some((w) => w.id === 'w-account')).toBe(true);
    expect(words.value?.some((w) => w.id === 'w-guest')).toBe(false);
  });

  it('账号 StudyRecord 为 Mastered 时合并不得回退，游客较低进度被丢弃', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const auth = authSessionOf(UID);
    await writeAccountRecord(h, auth, makeRecord({
      wordId: 'w-shared', status: WordStatus.Mastered,
      intervalDays: SM2_MASTERED_INTERVAL_DAYS, repetitions: 5, updatedAtYMD: d(7),
    }));
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8) }));
    await writeGuestWord(h, makeWord({ id: 'w-shared', text: 'shared', createdAtYMD: d(8) }));
    await writeGuestRecord(h, makeRecord({
      wordId: 'w-shared', status: WordStatus.Relearning, repetitions: 0,
      intervalDays: 1, updatedAtYMD: d(8),
    }));
    await writeAccountWord(h, auth, makeWord({ id: 'w-shared', text: 'shared', createdAtYMD: d(6) }));
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    await h.app.onMergeChoice(MergeChoiceKind.Merge, h.clock);
    const records = await h.services.repository.loadRecords(auth);
    expect(records.value?.find((r) => r.wordId === 'w-shared')?.status).toBe(WordStatus.Mastered);
  });

  it('合并全流程所有 facade 方法返回 Result 不抛异常；窗口外游客数据被跳过且不回灌', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(1), activeSeconds: 400, checkedIn: true }));
    await buildGuestProgress(h);
    await h.app.onHuaweiAuthResult(authResult(), h.clock);
    const merged = await h.app.onMergeChoice(MergeChoiceKind.Merge, h.clock);
    expect(merged.ok).toBe(true);
    expect(merged.value?.skippedOutsideWindowCount).toBeGreaterThan(0);
    expect(merged.value?.mergedCheckInDates).not.toContain(d(1));
    const auth = authSessionOf(UID);
    expect((await h.services.repository.loadCheckIns(auth, d(1), d(1))).value?.length).toBe(0);
    expect((await h.storage.get('guest:checkins:' + d(1))).value).toBeDefined();
  });
});
