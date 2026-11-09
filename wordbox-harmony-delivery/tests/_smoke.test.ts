import { describe, it, expect } from 'vitest';
import {
  createKernel, createMemoryStorageService, createScriptedAI, createQualityTagParser,
  createEbbinghausScheduler, SEED_WORDS, ALL_SCENES, Scene, WordStatus,
  SM2_SECOND_INTERVAL_DAYS, DAILY_GOAL_SECONDS, addDays, diffDays, windowFrom,
  dayIndexOf, StatsWindow, SessionKind, PromptActionKind, MergeChoiceKind,
  AIProviderKind, GUEST_RETENTION_DAYS,
} from '@core';
import { FakeClock } from '@adapters/preview/fakeClock';

describe('kernel smoke', () => {
  it('seed words: 240 total, 30 per scene', () => {
    expect(SEED_WORDS.length).toBe(240);
    for (const scene of ALL_SCENES) {
      expect(SEED_WORDS.filter((w) => w.scene === scene).length).toBe(30);
      for (const w of SEED_WORDS.filter((x) => x.scene === scene)) {
        expect(w.exampleInScene.length).toBeGreaterThan(0);
        expect(w.aiRolePrompt.length).toBeGreaterThan(0);
        expect(w.locale).toBe('en-US');
      }
    }
  });

  it('SM-2 interval sequence derived from constants (EF stays 2.5 at q=4)', () => {
    const s = createEbbinghausScheduler();
    let r = s.createRecord('w-x', '2026-11-01');
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      r = s.review(Object.freeze({ ...r }), 4, addDays('2026-11-01', i));
      intervals.push(r.intervalDays);
    }
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(SM2_SECOND_INTERVAL_DAYS);
    expect(intervals[2]).toBe(15);
    expect(intervals[3]).toBe(38);
    expect(r.status).toBe(WordStatus.Mastered);
  });

  it('date helpers: cross-month, cross-year, leap year, window', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2026-11-03', '2026-11-09')).toBe(6);
    expect(dayIndexOf('2026-11-03', '2026-11-03')).toBe(1);
    const w = windowFrom('2026-11-09', GUEST_RETENTION_DAYS);
    expect(w.fromYMD).toBe('2026-11-03');
    expect(w.toYMD).toBe('2026-11-09');
  });

  it('quality parser: last valid tag, missing -> -1', () => {
    const p = createQualityTagParser();
    expect(p.parse('hello [[QUALITY:5]]').quality).toBe(5);
    expect(p.parse('a [[QUALITY:2]] b [[QUALITY:4]]').quality).toBe(4);
    expect(p.parse('no tag').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:6]]').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:3]]').displayText).toBe('x');
  });

  it('full guest flow: 6 rounds, 600s check-in, gate blocks stats, login + merge', async () => {
    const storage = createMemoryStorageService();
    const clock = new FakeClock('2026-11-03');
    const scripted = createScriptedAI();
    const kernel = createKernel({
      storage, clock,
      accountProvider: { signIn: async () => ({ ok: true, value: { uid: 'u1', displayName: 'X', expiresAtMs: 0 }, error: undefined }),
        signOut: async () => ({ ok: true, value: true, error: undefined }),
        refreshToken: async () => ({ ok: true, value: { uid: 'u1', displayName: 'X', expiresAtMs: 0 }, error: undefined }) },
      primaryAI: scripted,
      fallbackAI: createScriptedAI(),
    });
    const app = kernel.app;

    const boot = await app.bootstrap(clock);
    expect(boot.ok).toBe(true);
    expect(boot.value?.session.kind).toBe(SessionKind.Guest);
    expect(boot.value?.loginGuide.shouldPrompt).toBe(false);

    const q = await app.startLearning(Scene.AIRPORT, clock);
    expect(q.ok).toBe(true);
    expect(q.value?.newWordIds.length).toBeGreaterThan(0);
    const sid = app.activeSessionId();
    expect(sid.length).toBeGreaterThan(0);

    let lastQuality = -1;
    for (let i = 0; i < 6; i++) {
      const turn = await app.sendMessage(sid, 'I would like a window seat please', clock);
      expect(turn.ok).toBe(true);
      lastQuality = turn.value?.parsed.quality ?? -1;
      expect(lastQuality).toBeGreaterThanOrEqual(0);
    }
    expect(lastQuality).toBeGreaterThanOrEqual(0);

    const ci = await app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, clock);
    expect(ci.ok).toBe(true);
    expect(ci.value?.checkedIn).toBe(true);
    expect(ci.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);

    // F-20 gate: guest sees no numbers
    const gated = await app.statistics(StatsWindow.D7, clock);
    expect(gated.ok).toBe(true);
    expect(gated.value?.allowed).toBe(false);
    expect(gated.value?.data).toBeUndefined();

    // D1→D8 with daily study data (the documented sliding-window flow)
    const dayPlan: readonly (readonly [string, number, boolean])[] = [
      ['2026-11-03', 1, false], ['2026-11-04', 2, false], ['2026-11-05', 3, false],
      ['2026-11-06', 4, false], ['2026-11-07', 5, true], ['2026-11-08', 6, false],
      ['2026-11-09', 7, true], ['2026-11-10', 8, true],
    ];
    for (const [ymd, day, expected] of dayPlan) {
      clock.setYMD(ymd);
      await app.sendMessage(sid, 'I would like a window seat please', clock);
      await app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, clock);
      const bootDay = await app.bootstrap(clock);
      expect(bootDay.ok).toBe(true);
      expect(bootDay.value?.loginGuide.dayIndex).toBe(day);
      expect(bootDay.value?.loginGuide.shouldPrompt).toBe(expected);
      if (expected) {
        // UI shows the dialog → onShown persists lastPromptDate (max once/day)
        const shown = await kernel.services.loginPrompt.onShown(ymd, PromptActionKind.Later);
        expect(shown.ok).toBe(true);
        const again = await kernel.services.loginPrompt.decide(ymd);
        expect(again.value?.shouldPrompt).toBe(false);
      }
    }
    // At D8 the D1 data has scrolled out of the 7-day window but D2..D8 remain
    const snap = await kernel.services.retention.loadGuestSnapshot('2026-11-10');
    expect(snap.ok).toBe(true);
    for (const c of snap.value?.checkIns ?? []) expect(c.dateYMD >= '2026-11-04').toBe(true);

    // Type A action -> auth success -> Type B
    const guide = await app.onLoginGuideAction(PromptActionKind.GoLogin, clock);
    expect(guide.value?.launchAccountKit).toBe(true);
    const auth = await app.onHuaweiAuthResult(
      { uid: 'u1', displayName: '旅行者', expiresAtMs: 4102444800000 }, clock,
    );
    expect(auth.ok).toBe(true);
    expect(auth.value?.transition.after.kind).toBe(SessionKind.Authenticated);
    expect(auth.value?.mergePrompt.shouldShow).toBe(true);
    expect(auth.value?.mergePrompt.dialogType).toBe('B');

    // Merge
    const merged = await app.onMergeChoice(MergeChoiceKind.Merge, clock);
    expect(merged.ok).toBe(true);
    expect(merged.value?.performed).toBe(true);
    expect(merged.value?.recomputed).toBe(true);

    // Stats now unlocked
    const unlocked = await app.statistics(StatsWindow.D7, clock);
    expect(unlocked.value?.allowed).toBe(true);
    expect(unlocked.value?.data).toBeDefined();

    // Idempotent second merge
    const again = await kernel.services.migration.merge('u1', clock.todayYMD(), clock);
    expect(again.value?.idempotentHit).toBe(true);
    expect(again.value?.performed).toBe(false);
  });

  it('AI router degrades when primary fails, still yields a legal quality tag', async () => {
    const { createAIProviderRouter, createMockAI, createQualityTagParser, ErrorCode, Scene } = await import('@core');
    const primary = createMockAI([], [ErrorCode.AI_MODEL_NOT_READY, ErrorCode.AI_MODEL_NOT_READY]);
    const router = createAIProviderRouter(primary, createScriptedAI(), createQualityTagParser());
    const clock = new FakeClock('2026-11-03');
    const env = await router.reply({
      scene: Scene.HOTEL, dateYMD: '2026-11-03', targetWordIds: ['w-hotel-reservation'],
      words: SEED_WORDS.filter((w) => w.id === 'w-hotel-reservation'),
      history: [], sessionId: 's1', turnIndex: 0,
    }, clock);
    expect(env.degraded).toBe(true);
    expect(env.attempts).toBeLessThanOrEqual(2);
    expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
    expect(env.errorChain.length).toBeGreaterThan(0);
    expect(env.reply.provider).toBe(AIProviderKind.Scripted);
  });
});
