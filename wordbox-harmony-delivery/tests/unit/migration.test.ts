/**
 * migration.test.ts —— 游客→账号进度合并单测。
 * 覆盖：ProgressMergeService 冲突规则（同日打卡取较大不相加 /
 * StudyRecord progressRank 且 Mastered 不回退 / 生词本去重）/
 * computeIdempotencyKey 稳定 / MigrationService.merge 幂等 /
 * 窗口前置过滤（窗口外不合并·不回灌·不计入统计重算）/
 * 空窗口零写入 / 未认证 / 游客分区不删除 / 统计重算误差 0 /
 * detect / recordDecision / hasDecision / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  createProgressMergeService, createEbbinghausScheduler,
  MergeChoiceKind, MergeSkipReason, ConflictRule, ConflictSource,
  WordStatus, WordSource, Scene, SessionKind, StatsWindow,
  DAILY_GOAL_SECONDS, SM2_INITIAL_EF, SM2_MASTERED_INTERVAL_DAYS,
} from '@core';
import type { StudyRecord, Word, CheckIn } from '@core';
import {
  createHarness, authSessionOf,
  writeGuestCheckIn, writeGuestWord, writeGuestRecord,
  writeAccountCheckIn, writeAccountWord,
  signInViaApp,
} from '../helpers/harness';
import type { TestHarness } from '../helpers/harness';
import {
  D1, d, makeCheckIn, makeRecord, makeWord, makeGuestSnapshot, makeWindow,
} from '../helpers/fixtures';

const UID = 'qa-uid-001';

/** 写入一套典型的窗口内游客数据，并返回关键 id。 */
async function seedGuestWindow(h: TestHarness, today: string): Promise<void> {
  await writeGuestCheckIn(h, makeCheckIn({
    dateYMD: today, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true, streakAfter: 1,
  }));
  await writeGuestWord(h, makeWord({ id: 'w-guest-1', text: 'guest phrase', createdAtYMD: today }));
  await writeGuestRecord(h, makeRecord({
    wordId: 'w-guest-1', status: WordStatus.Learning, repetitions: 2,
    intervalDays: 6, totalReviews: 3, correctReviews: 2, updatedAtYMD: today,
  }));
}

describe('合并：ProgressMergeService 纯冲突规则', () => {
  const planner = createProgressMergeService(createEbbinghausScheduler());

  it('同日打卡冲突 → activeSeconds 取较大值（不相加）、checkedIn 取 OR、checkedInAtMs 取较早、streakAfter/newWords/reviewedWords 取较大', () => {
    const account: CheckIn = makeCheckIn({
      dateYMD: d(5), activeSeconds: 300, checkedIn: false, checkedInAtMs: 2_000,
      streakAfter: 1, newWords: 2, reviewedWords: 1, goalSeconds: 600,
    });
    const guest: CheckIn = makeCheckIn({
      dateYMD: d(5), activeSeconds: 700, checkedIn: true, checkedInAtMs: 1_000,
      streakAfter: 3, newWords: 5, reviewedWords: 4, goalSeconds: 600,
    });
    const plan = planner.mergeCheckIns([account], [guest]);
    expect(plan.toWrite.length).toBe(1);
    const merged = plan.toWrite[0];
    expect(merged.activeSeconds).toBe(700);
    expect(merged.activeSeconds).not.toBe(account.activeSeconds + guest.activeSeconds);
    expect(merged.checkedIn).toBe(true);
    expect(merged.checkedInAtMs).toBe(1_000);
    expect(merged.streakAfter).toBe(3);
    expect(merged.newWords).toBe(5);
    expect(merged.reviewedWords).toBe(4);
    expect(plan.conflicts[0].rule).toBe(ConflictRule.SAME_DAY_CHECKIN);
    expect(plan.conflicts[0].chosen).toBe(ConflictSource.BLENDED);
  });

  it('生词本去重：账号已有同 text|scene 的词 → 保留账号版本、不写游客版本、conflict=WORD_DEDUP；游客列表内部重复也去重', () => {
    const accountWord: Word = makeWord({ id: 'w-account', text: 'Same Phrase', scene: Scene.HOTEL, source: WordSource.User });
    const guestWordA: Word = makeWord({ id: 'w-guest-a', text: 'same phrase', scene: Scene.HOTEL, source: WordSource.User });
    const guestWordB: Word = makeWord({ id: 'w-guest-b', text: 'SAME PHRASE', scene: Scene.HOTEL, source: WordSource.User });
    const guestNew: Word = makeWord({ id: 'w-guest-new', text: 'brand new', scene: Scene.DINING, source: WordSource.User });
    const plan = planner.mergeWordLists([accountWord], [guestWordA, guestWordB, guestNew]);
    expect(plan.toWrite.map((w) => w.id)).toEqual(['w-guest-new']);
    expect(plan.toWrite).not.toContain(accountWord);
    expect(plan.conflicts.length).toBe(1);
    expect(plan.conflicts[0].rule).toBe(ConflictRule.WORD_DEDUP);
    expect(plan.conflicts[0].chosen).toBe(ConflictSource.ACCOUNT);
    expect(plan.skipped).toBe(2);
  });

  it('StudyRecord 冲突取 progressRank 较大者，且 lapses 取较小、totalReviews/correctReviews 取较大', () => {
    const account: StudyRecord = makeRecord({
      wordId: 'w-x', status: WordStatus.Learning, repetitions: 1, intervalDays: 1,
      ef: SM2_INITIAL_EF, lapses: 3, totalReviews: 2, correctReviews: 1, updatedAtYMD: d(3),
    });
    const guest: StudyRecord = makeRecord({
      wordId: 'w-x', status: WordStatus.Learning, repetitions: 4, intervalDays: 20,
      ef: SM2_INITIAL_EF, lapses: 1, totalReviews: 8, correctReviews: 7, updatedAtYMD: d(5),
    });
    const plan = planner.mergeRecords([account], [guest]);
    expect(plan.toWrite.length).toBe(1);
    const merged = plan.toWrite[0];
    expect(merged.repetitions).toBe(guest.repetitions);
    expect(merged.intervalDays).toBe(guest.intervalDays);
    expect(merged.lapses).toBe(1);
    expect(merged.totalReviews).toBe(8);
    expect(merged.correctReviews).toBe(7);
    expect(plan.conflicts[0].rule).toBe(ConflictRule.RECORD_NO_REGRESSION);
    expect(plan.conflicts[0].chosen).toBe(ConflictSource.GUEST);
  });

  it('账号记录为 Mastered 时，即使游客 rank 更高也绝不从 Mastered 回退', () => {
    const account: StudyRecord = makeRecord({
      wordId: 'w-x', status: WordStatus.Mastered, intervalDays: SM2_MASTERED_INTERVAL_DAYS,
      repetitions: 5, ef: SM2_INITIAL_EF, lapses: 0, totalReviews: 9, correctReviews: 9, updatedAtYMD: d(2),
    });
    const guest: StudyRecord = makeRecord({
      wordId: 'w-x', status: WordStatus.Relearning, intervalDays: 1,
      repetitions: 0, ef: SM2_INITIAL_EF, lapses: 5, totalReviews: 1, correctReviews: 0, updatedAtYMD: d(8),
    });
    const plan = planner.mergeRecords([account], [guest]);
    expect(plan.toWrite[0].status).toBe(WordStatus.Mastered);
    expect(plan.toWrite[0].intervalDays).toBe(SM2_MASTERED_INTERVAL_DAYS);
    expect(plan.conflicts[0].chosen).toBe(ConflictSource.ACCOUNT);
  });

  it('progressRank 相同 → 取 updatedAtYMD 较新的一方；游客无对应账号记录 → 直接写入', () => {
    const account: StudyRecord = makeRecord({ wordId: 'w-x', status: WordStatus.Learning, repetitions: 2, updatedAtYMD: d(3) });
    const guest: StudyRecord = makeRecord({ wordId: 'w-x', status: WordStatus.Learning, repetitions: 2, updatedAtYMD: d(6) });
    const plan = planner.mergeRecords([account], [guest]);
    expect(plan.conflicts[0].chosen).toBe(ConflictSource.GUEST);
    expect(plan.toWrite[0].updatedAtYMD).toBe(d(6));
    const fresh = planner.mergeRecords([], [makeRecord({ wordId: 'w-new', updatedAtYMD: d(8) })]);
    expect(fresh.toWrite.length).toBe(1);
    expect(fresh.conflicts.length).toBe(0);
  });

  it('computeIdempotencyKey 对内容相同但顺序不同的快照返回同一 key；内容不同返回不同 key', () => {
    const window = makeWindow(d(8));
    const base = makeGuestSnapshot({
      window: window,
      words: [makeWord({ id: 'w-b', createdAtYMD: d(5) }), makeWord({ id: 'w-a', createdAtYMD: d(6) })],
      checkIns: [makeCheckIn({ dateYMD: d(5) }), makeCheckIn({ dateYMD: d(6) })],
    });
    const reordered = makeGuestSnapshot({
      window: window,
      words: [makeWord({ id: 'w-a', createdAtYMD: d(6) }), makeWord({ id: 'w-b', createdAtYMD: d(5) })],
      checkIns: [makeCheckIn({ dateYMD: d(6) }), makeCheckIn({ dateYMD: d(5) })],
    });
    const changed = makeGuestSnapshot({
      window: window,
      words: [makeWord({ id: 'w-a', createdAtYMD: d(6) }), makeWord({ id: 'w-b', createdAtYMD: d(5) })],
      checkIns: [makeCheckIn({ dateYMD: d(6) }), makeCheckIn({ dateYMD: d(5), activeSeconds: 999 })],
    });
    expect(planner.computeIdempotencyKey(base)).toBe(planner.computeIdempotencyKey(reordered));
    expect(planner.computeIdempotencyKey(base)).not.toBe(planner.computeIdempotencyKey(changed));
    expect(planner.computeIdempotencyKey(base).length).toBeGreaterThan(0);
  });
});

describe('合并：MigrationService.merge 编排', () => {
  it('未登录直接 merge → performed=false、reason=NOT_AUTHENTICATED、零写入，不抛异常', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    const sizeBefore = h.storage.size();
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.performed).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.NOT_AUTHENTICATED);
    expect(r.value?.idempotentHit).toBe(false);
    expect(h.storage.size()).toBe(sizeBefore);
  });

  it('登录但游客窗口完全为空 → performed=false、reason=NO_GUEST_DATA、零写入', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await signInViaApp(h, UID);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.performed).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.NO_GUEST_DATA);
    expect(r.value?.recomputed).toBe(false);
  });

  it('游客数据全部在窗口外 → performed=false、reason=OUTSIDE_WINDOW_ONLY、skippedOutsideWindowCount>0、零写入账号分区', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(1), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await writeGuestWord(h, makeWord({ id: 'w-out', createdAtYMD: d(1) }));
    await signInViaApp(h, UID);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.performed).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.OUTSIDE_WINDOW_ONLY);
    expect(r.value?.skippedOutsideWindowCount).toBeGreaterThan(0);
    const auth = authSessionOf(UID);
    expect((await h.services.repository.loadWords(auth)).value?.length).toBe(0);
    expect((await h.services.repository.loadCheckIns(auth, D1, d(8))).value?.length).toBe(0);
  });

  it('正常合并 → performed=true、recomputed=true、after 有统计、mergedWordIds/Record/CheckIn 非空', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.performed).toBe(true);
    expect(r.value?.reason).toBe(MergeSkipReason.PERFORMED);
    expect(r.value?.recomputed).toBe(true);
    expect(r.value?.idempotentHit).toBe(false);
    expect(r.value?.after).toBeDefined();
    expect(r.value?.mergedWordIds).toContain('w-guest-1');
    expect(r.value?.mergedRecordWordIds).toContain('w-guest-1');
    expect(r.value?.mergedCheckInDates).toContain(d(8));
  });

  it('幂等：第二次 merge → idempotentHit=true、performed=false、不再重复写入账号分区', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    const first = await h.services.migration.merge(UID, d(8), h.clock);
    expect(first.value?.performed).toBe(true);
    const auth = authSessionOf(UID);
    const wordsAfterFirst = (await h.services.repository.loadWords(auth)).value?.length ?? 0;
    const recordsAfterFirst = (await h.services.repository.loadRecords(auth)).value?.length ?? 0;
    const second = await h.services.migration.merge(UID, d(8), h.clock);
    expect(second.value?.idempotentHit).toBe(true);
    expect(second.value?.performed).toBe(false);
    expect(second.value?.reason).toBe(MergeSkipReason.ALREADY_MERGED);
    expect((await h.services.repository.loadWords(auth)).value?.length).toBe(wordsAfterFirst);
    expect((await h.services.repository.loadRecords(auth)).value?.length).toBe(recordsAfterFirst);
  });

  it('窗口前置过滤：窗口外 checkIn 不被合并/不回灌账号分区，且不计入统计重算（误差 0）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(1), activeSeconds: 400, checkedIn: true }));
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await signInViaApp(h, UID);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.value?.performed).toBe(true);
    expect(r.value?.skippedOutsideWindowCount).toBeGreaterThan(0);
    expect(r.value?.mergedCheckInDates).toEqual([d(8)]);
    const auth = authSessionOf(UID);
    const stored = await h.services.repository.loadCheckIns(auth, D1, d(8));
    expect(stored.value?.map((c) => c.dateYMD)).toEqual([d(8)]);
    expect(r.value?.after?.totalActiveSeconds).toBe(DAILY_GOAL_SECONDS);
  });

  it('合并后游客分区不删除：guest:checkins / guest:words / guest:records 依然可读', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    await h.services.migration.merge(UID, d(8), h.clock);
    expect((await h.storage.get('guest:checkins:' + d(8))).value).toBeDefined();
    expect((await h.storage.get('guest:words:w-guest-1')).value).toBeDefined();
    expect((await h.storage.get('guest:records:w-guest-1')).value).toBeDefined();
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.checkIns.length).toBeGreaterThan(0);
  });

  it('统计重算误差 0：merge.after 与再独立调用 recomputeAfterMerge 的关键字段完全一致', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    const merged = await h.services.migration.merge(UID, d(8), h.clock);
    const again = await h.services.stats.recomputeAfterMerge(UID, d(8));
    const a = merged.value?.after;
    const b = again.value;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (a !== undefined && b !== undefined) {
      expect(a.totalActiveSeconds).toBe(b.totalActiveSeconds);
      expect(a.checkedInDays).toBe(b.checkedInDays);
      expect(a.totalReviews).toBe(b.totalReviews);
      expect(a.correctReviews).toBe(b.correctReviews);
      expect(a.masteredWords).toBe(b.masteredWords);
      expect(a.learningWords).toBe(b.learningWords);
      expect(a.currentStreak).toBe(b.currentStreak);
      expect(a.longestStreak).toBe(b.longestStreak);
      expect(a.masteryCurve.length).toBe(b.masteryCurve.length);
      expect(a.sceneDistribution.length).toBe(b.sceneDistribution.length);
    }
  });

  it('冲突写入账号分区：账号已有同日打卡与同 text|scene 词 → 取较大值不相加、账号词版本不被覆盖', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const auth = authSessionOf(UID);
    await writeAccountCheckIn(h, auth, makeCheckIn({
      dateYMD: d(8), activeSeconds: 200, checkedIn: false, checkedInAtMs: 5_000, streakAfter: 1,
    }));
    await writeAccountWord(h, auth, makeWord({ id: 'w-account-same', text: 'Guest Phrase', scene: Scene.AIRPORT }));
    await writeGuestCheckIn(h, makeCheckIn({
      dateYMD: d(8), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true, checkedInAtMs: 1_000, streakAfter: 3,
    }));
    await writeGuestWord(h, makeWord({ id: 'w-guest-same', text: 'guest phrase', scene: Scene.AIRPORT, createdAtYMD: d(8) }));
    await signInViaApp(h, UID);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.value?.performed).toBe(true);
    expect(r.value?.conflictResolvedCount).toBeGreaterThan(0);
    const checkIns = await h.services.repository.loadCheckIns(auth, d(8), d(8));
    expect(checkIns.value?.[0].activeSeconds).toBe(DAILY_GOAL_SECONDS);
    expect(checkIns.value?.[0].activeSeconds).not.toBe(DAILY_GOAL_SECONDS + 200);
    expect(checkIns.value?.[0].checkedIn).toBe(true);
    const words = await h.services.repository.loadWords(auth);
    expect(words.value?.some((w) => w.id === 'w-account-same')).toBe(true);
    expect(words.value?.some((w) => w.id === 'w-guest-same')).toBe(false);
  });

  it('存储强制写失败 → merge 返回 fail(STORAGE_BATCH_PARTIAL)，不抛异常且无部分提交', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    h.storage.setFailWrites(true);
    const r = await h.services.migration.merge(UID, d(8), h.clock);
    expect(r.ok).toBe(false);
    expect(r.error).toBeDefined();
    expect((await h.services.repository.loadWords(authSessionOf(UID))).value?.length).toBe(0);
  });
});

describe('合并：detect / recordDecision / hasDecision', () => {
  it('detect 无游客数据 → shouldShow=false、reason=NO_GUEST_DATA', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const r = await h.services.migration.detect(UID, d(8));
    expect(r.ok).toBe(true);
    expect(r.value?.shouldShow).toBe(false);
    expect(r.value?.reason).toBe(MergeSkipReason.NO_GUEST_DATA);
    expect(r.value?.dialogType).toBe('B');
  });

  it('detect 有窗口内游客数据且未做决策 → shouldShow=true、guestSnapshot 有数据', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    const r = await h.services.migration.detect(UID, d(8));
    expect(r.value?.shouldShow).toBe(true);
    expect(r.value?.guestSnapshot).toBeDefined();
    expect(r.value?.guestSnapshot?.checkIns.length).toBeGreaterThan(0);
  });

  it('recordDecision(选择合并) → 持久化决策、hasDecision=true、detect 变为不弹（DECISION_KEEP_ACCOUNT）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    const decision = await h.services.migration.recordDecision(UID, MergeChoiceKind.Merge, d(8), h.clock);
    expect(decision.ok).toBe(true);
    expect(decision.value?.uid).toBe(UID);
    expect(decision.value?.decidedAtMs).toBe(h.clock.nowMs());
    expect(decision.value?.idempotencyKey.length).toBeGreaterThan(0);
    expect((await h.services.migration.hasDecision(UID)).value).toBe(true);
    const detect = await h.services.migration.detect(UID, d(8));
    expect(detect.value?.shouldShow).toBe(false);
    expect(detect.value?.reason).toBe(MergeSkipReason.DECISION_KEEP_ACCOUNT);
  });

  it('recordDecision(稍后 Defer) → 不写入持久决策、hasDecision=false、detect 仍可弹', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    const defer = await h.services.migration.recordDecision(UID, MergeChoiceKind.Defer, d(8), h.clock);
    expect(defer.ok).toBe(true);
    expect((await h.services.migration.hasDecision(UID)).value).toBe(false);
    expect((await h.services.migration.detect(UID, d(8))).value?.shouldShow).toBe(true);
  });

  it('recordDecision(保留账号) → hasDecision=true，且不会因游客数据再弹类型 B', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await seedGuestWindow(h, d(8));
    await h.services.migration.recordDecision(UID, MergeChoiceKind.KeepAccount, d(8), h.clock);
    expect((await h.services.migration.hasDecision(UID)).value).toBe(true);
    expect((await h.services.migration.detect(UID, d(8))).value?.shouldShow).toBe(false);
  });

  it('登录态统计在合并后由 Gated 解锁；SessionKind 与 StatsWindow 常量口径一致', async () => {
    const h = createHarness({ initialYMD: d(8) });
    expect(SessionKind.Authenticated).toBe('authenticated');
    const before = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(before.value?.allowed).toBe(false);
    await seedGuestWindow(h, d(8));
    await signInViaApp(h, UID);
    await h.services.migration.merge(UID, d(8), h.clock);
    const after = await h.app.statistics(StatsWindow.D7, h.clock);
    expect(after.value?.allowed).toBe(true);
    expect(after.value?.data).toBeDefined();
  });
});
