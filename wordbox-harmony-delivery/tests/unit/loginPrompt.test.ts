/**
 * loginPrompt.test.ts —— 类型 A 登录引导状态机单测（8 短路分支全覆盖）。
 * 覆盖：D1~D4 不弹 / D5 弹 / D6 不弹 / D7 弹 / D8+ 每日弹 /
 * 每天最多 1 次 / 「暂不」次日继续 / 「不再提示」永久关闭 /
 * 已登录不弹 / 无游客数据不弹 / 空窗口不弹 /
 * 不再提示只关类型 A 不影响类型 B /
 * applyAction 纯函数不可变 / dayIndex / buildSummary / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  createLoginPromptPolicy, buildPromptSummary, emptyPromptSummary,
  DialogType, PromptActionKind, PromptSkipReason, MergeSkipReason,
  SessionKind, LOGIN_PROMPT_DAYS, PROMPT_DAILY_AFTER_DAY, windowFrom,
  GUEST_RETENTION_DAYS,
} from '@core';
import type {
  GuestPromptState, LoginPromptInput, AccountTransition, DateWindow,
} from '@core';
import {
  createHarness, guestSessionOf, authSessionOf, writeGuestCheckIn,
} from '../helpers/harness';
import {
  D1, d, makeLoginPromptInput, makePromptState, makeGuestSnapshot,
  makeAuthSession, makeCheckIn, makeWindow, makeRecord,
} from '../helpers/fixtures';

const UID = 'qa-uid-001';

function transitionOf(overrides: Partial<AccountTransition> = {}): AccountTransition {
  return {
    before: overrides.before ?? guestSessionOf(),
    after: overrides.after ?? authSessionOf(UID),
    guestProgressExists: overrides.guestProgressExists ?? true,
    shouldShowTypeB: overrides.shouldShowTypeB ?? true,
    decisionAlreadyMade: overrides.decisionAlreadyMade ?? false,
  };
}

describe('登录引导：shouldPromptLogin 八个短路分支', () => {
  const policy = createLoginPromptPolicy();

  it('分支 1 已登录（session.kind=Authenticated）→ 不弹，reason=AUTHENTICATED，dialogType 恒为 A', () => {
    const input = makeLoginPromptInput({ todayYMD: d(5), session: makeAuthSession() });
    const r = policy.shouldPromptLogin(input);
    expect(r.shouldPrompt).toBe(false);
    expect(r.reason).toBe(PromptSkipReason.AUTHENTICATED);
    expect(r.dialogType).toBe(DialogType.LoginGuide);
  });

  it('分支 2 无游客进度（hasGuestProgress=false 或 firstStudyYMD 为空）→ 不弹，reason=NO_GUEST_DATA', () => {
    const a = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(5), hasGuestProgress: false }));
    const b = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(5), firstStudyYMD: '', state: makePromptState({ firstStudyYMD: '' }) }));
    expect(a.shouldPrompt).toBe(false);
    expect(a.reason).toBe(PromptSkipReason.NO_GUEST_DATA);
    expect(a.dayIndex).toBe(0);
    expect(b.reason).toBe(PromptSkipReason.NO_GUEST_DATA);
  });

  it('分支 3 空/退化窗口（days<=0 或非法 YMD）→ 不弹，reason=EMPTY_WINDOW', () => {
    const bad: DateWindow = { fromYMD: '', toYMD: '', days: 0 };
    const r = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(5), window: bad }));
    expect(r.shouldPrompt).toBe(false);
    expect(r.reason).toBe(PromptSkipReason.EMPTY_WINDOW);
  });

  it('分支 4 用户已选「不再提示」（neverPrompt=true）→ 不弹，reason=NEVER_PROMPT', () => {
    const r = policy.shouldPromptLogin(makeLoginPromptInput({
      todayYMD: d(8), state: makePromptState({ neverPrompt: true }),
    }));
    expect(r.shouldPrompt).toBe(false);
    expect(r.reason).toBe(PromptSkipReason.NEVER_PROMPT);
  });

  it('分支 5 当天已弹过（lastPromptDate===todayYMD）→ 不弹，reason=ALREADY_PROMPTED_TODAY', () => {
    const r = policy.shouldPromptLogin(makeLoginPromptInput({
      todayYMD: d(8), state: makePromptState({ lastPromptDate: d(8) }),
    }));
    expect(r.shouldPrompt).toBe(false);
    expect(r.reason).toBe(PromptSkipReason.ALREADY_PROMPTED_TODAY);
  });

  it('分支 6 D5 / D7 命中 LOGIN_PROMPT_DAYS → 弹，reason=NONE，dayIndex 正确', () => {
    expect(LOGIN_PROMPT_DAYS).toEqual([5, 7]);
    for (const day of LOGIN_PROMPT_DAYS) {
      const r = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(day) }));
      expect(r.shouldPrompt).toBe(true);
      expect(r.reason).toBe(PromptSkipReason.NONE);
      expect(r.dayIndex).toBe(day);
    }
  });

  it('分支 7 D8 及以后（d>PROMPT_DAILY_AFTER_DAY）仍未登录 → 每天都弹一次', () => {
    expect(PROMPT_DAILY_AFTER_DAY).toBe(7);
    for (const day of [8, 9, 10, 15, 30]) {
      const r = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(day) }));
      expect(r.shouldPrompt).toBe(true);
      expect(r.reason).toBe(PromptSkipReason.NONE);
      expect(r.dayIndex).toBe(day);
    }
  });

  it('分支 8 D1~D4 / D6 / d=0（今天早于首学日）→ 不弹，reason=NOT_SCHEDULED_DAY', () => {
    for (const day of [1, 2, 3, 4, 6]) {
      const r = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(day) }));
      expect(r.shouldPrompt).toBe(false);
      expect(r.reason).toBe(PromptSkipReason.NOT_SCHEDULED_DAY);
    }
    const before = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: '2026-10-25' }));
    expect(before.shouldPrompt).toBe(false);
    expect(before.dayIndex).toBe(0);
  });

  it('D1..D12 完整序列断言（由 LOGIN_PROMPT_DAYS 与 PROMPT_DAILY_AFTER_DAY 推导，不硬编码弹窗日）', () => {
    const expected = (day: number): boolean =>
      LOGIN_PROMPT_DAYS.indexOf(day) >= 0 || day > PROMPT_DAILY_AFTER_DAY;
    const observed: boolean[] = [];
    for (let day = 1; day <= 12; day++) {
      observed.push(policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(day) })).shouldPrompt);
    }
    expect(observed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(expected));
  });
});

describe('登录引导：applyAction 纯函数与每日一次语义', () => {
  const policy = createLoginPromptPolicy();

  it('applyAction(「暂不」Later, today) → lastPromptDate=today、neverPrompt=false、firstStudyYMD 不变', () => {
    const state: GuestPromptState = Object.freeze(makePromptState({ lastPromptDate: '' }));
    const snapshot = JSON.stringify(state);
    const next = policy.applyAction(state, PromptActionKind.Later, d(5));
    expect(next.lastPromptDate).toBe(d(5));
    expect(next.neverPrompt).toBe(false);
    expect(next.firstStudyYMD).toBe(state.firstStudyYMD);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next).not.toBe(state);
  });

  it('applyAction(「不再提示」NeverPrompt) → neverPrompt=true 且后续所有日期都不弹；「去登录」仅记当天', () => {
    const never = policy.applyAction(makePromptState(), PromptActionKind.NeverPrompt, d(5));
    expect(never.neverPrompt).toBe(true);
    for (const day of [5, 6, 7, 8, 12, 30]) {
      const r = policy.shouldPromptLogin(makeLoginPromptInput({
        todayYMD: d(day), state: never,
      }));
      expect(r.shouldPrompt).toBe(false);
      expect(r.reason).toBe(PromptSkipReason.NEVER_PROMPT);
    }
    const go = policy.applyAction(makePromptState(), PromptActionKind.GoLogin, d(7));
    expect(go.neverPrompt).toBe(false);
    expect(go.lastPromptDate).toBe(d(7));
  });

  it('「暂不」次日继续：D5 弹后选 Later，D5 不再弹、D6 不弹、D7 再次弹（跨日重置）', () => {
    const afterLater = policy.applyAction(makePromptState(), PromptActionKind.Later, d(5));
    const sameDay = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(5), state: afterLater }));
    const d6 = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(6), state: afterLater }));
    const d7 = policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(7), state: afterLater }));
    expect(sameDay.reason).toBe(PromptSkipReason.ALREADY_PROMPTED_TODAY);
    expect(d6.shouldPrompt).toBe(false);
    expect(d6.reason).toBe(PromptSkipReason.NOT_SCHEDULED_DAY);
    expect(d7.shouldPrompt).toBe(true);
  });

  it('每天最多 1 次：同日重复 decide 不重弹；跨到下一个可弹日重新弹一次', () => {
    const shownD5 = policy.applyAction(makePromptState(), PromptActionKind.GoLogin, d(5));
    expect(policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(5), state: shownD5 })).shouldPrompt).toBe(false);
    expect(policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(7), state: shownD5 })).shouldPrompt).toBe(true);
    const shownD7 = policy.applyAction(shownD5, PromptActionKind.GoLogin, d(7));
    expect(policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(7), state: shownD7 })).shouldPrompt).toBe(false);
    expect(policy.shouldPromptLogin(makeLoginPromptInput({ todayYMD: d(8), state: shownD7 })).shouldPrompt).toBe(true);
  });

  it('Object.freeze 的 LoginPromptInput 调用 shouldPromptLogin → 不抛异常且不 mutate 入参', () => {
    const input: LoginPromptInput = Object.freeze(makeLoginPromptInput({ todayYMD: d(5) }));
    const snapshot = JSON.stringify(input);
    expect(() => policy.shouldPromptLogin(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('登录引导：dayIndex / buildSummary / 类型 B 分离', () => {
  const policy = createLoginPromptPolicy();

  it('dayIndex(firstStudyYMD=D1, todayYMD=D8) → 8；早于首学日 → 0', () => {
    expect(policy.dayIndex(D1, d(8))).toBe(8);
    expect(policy.dayIndex(D1, '2026-10-25')).toBe(0);
  });

  it('buildSummary 从窗口快照统计 studyDays / wordsLearned / totalMinutes / 窗口边界', () => {
    const window = makeWindow(d(8));
    const snap = makeGuestSnapshot({
      window: window,
      checkIns: [
        makeCheckIn({ dateYMD: d(5), activeSeconds: 600 }),
        makeCheckIn({ dateYMD: d(6), activeSeconds: 300 }),
      ],
      records: [
        makeRecord({ wordId: 'w-1', updatedAtYMD: d(5) }),
        makeRecord({ wordId: 'w-2', updatedAtYMD: d(6) }),
      ],
    });
    const summary = buildPromptSummary(snap);
    expect(summary.studyDays).toBeGreaterThanOrEqual(2);
    expect(summary.wordsLearned).toBeGreaterThanOrEqual(1);
    expect(summary.totalMinutes).toBe(Math.round(900 / 60));
    expect(summary.windowFromYMD).toBe(window.fromYMD);
    expect(summary.windowToYMD).toBe(window.toYMD);
    expect(policy.buildSummary(snap)).toEqual(summary);
  });

  it('emptyPromptSummary → 全 0 且窗口边界正确', () => {
    const w = windowFrom(d(8), GUEST_RETENTION_DAYS);
    const s = emptyPromptSummary(w);
    expect(s.studyDays).toBe(0);
    expect(s.wordsLearned).toBe(0);
    expect(s.totalMinutes).toBe(0);
    expect(s.windowFromYMD).toBe(w.fromYMD);
  });

  it('「不再提示」只关闭类型 A：neverPrompt=true 时 decide 不弹，但 onAuthSucceeded 仍产出类型 B', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8) }));
    await h.services.retention.savePromptState(makePromptState({
      firstStudyYMD: D1, neverPrompt: true, lastPromptDate: d(5),
    }));
    const typeA = await h.services.loginPrompt.decide(d(8));
    expect(typeA.ok).toBe(true);
    expect(typeA.value?.shouldPrompt).toBe(false);
    expect(typeA.value?.dialogType).toBe(DialogType.LoginGuide);
    expect(typeA.value?.reason).toBe(PromptSkipReason.NEVER_PROMPT);

    const typeB = await h.services.loginPrompt.onAuthSucceeded(transitionOf(), d(8));
    expect(typeB.ok).toBe(true);
    expect(typeB.value?.shouldShow).toBe(true);
    expect(typeB.value?.dialogType).toBe(DialogType.MergeChoice);
    expect(typeB.value?.guestSnapshot).toBeDefined();
  });

  it('onAuthSucceeded 在 shouldShowTypeB=false 时不弹类型 B，reason 依据 decisionAlreadyMade / guestProgressExists', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const decided = await h.services.loginPrompt.onAuthSucceeded(
      transitionOf({ shouldShowTypeB: false, decisionAlreadyMade: true, guestProgressExists: true }), d(8),
    );
    expect(decided.value?.shouldShow).toBe(false);
    expect(decided.value?.reason).toBe(MergeSkipReason.DECISION_KEEP_ACCOUNT);
    const noData = await h.services.loginPrompt.onAuthSucceeded(
      transitionOf({ shouldShowTypeB: false, decisionAlreadyMade: false, guestProgressExists: false }), d(8),
    );
    expect(noData.value?.reason).toBe(MergeSkipReason.NO_GUEST_DATA);
  });

  it('decide / onShown / onAuthSucceeded 全程返回 Result 不抛异常；onShown 持久化 lastPromptDate', async () => {
    const h = createHarness({ initialYMD: d(5) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(5) }));
    await h.services.retention.markFirstStudyDate(D1);
    const shown = await h.services.loginPrompt.onShown(d(5), PromptActionKind.Later);
    expect(shown.ok).toBe(true);
    expect(shown.value?.lastPromptDate).toBe(d(5));
    const state = await h.services.retention.promptState();
    expect(state.value?.lastPromptDate).toBe(d(5));
    const after = await h.services.loginPrompt.decide(d(5));
    expect(after.value?.reason).toBe(PromptSkipReason.ALREADY_PROMPTED_TODAY);
  });

  it('已登录会话调用 decide → reason=AUTHENTICATED、shouldPrompt=false（类型 A 恒关）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await h.services.account.signIn({ uid: UID, displayName: 'QA 旅客', expiresAtMs: 0 }, h.clock);
    const r = await h.services.loginPrompt.decide(d(8));
    expect(r.ok).toBe(true);
    expect(r.value?.shouldPrompt).toBe(false);
    expect(r.value?.reason).toBe(PromptSkipReason.AUTHENTICATED);
    expect(SessionKind.Authenticated).toBe('authenticated');
  });
});
