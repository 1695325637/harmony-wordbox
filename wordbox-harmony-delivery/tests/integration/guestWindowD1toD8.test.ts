/**
 * guestWindowD1toD8.test.ts —— D1→D8 游客窗口与登录引导集成测试。
 * 覆盖：逐日弹窗序列（D1~D4 静默 / D5 弹 / D6 静默 / D7 弹 / D8+ 每日弹）/
 * 每天最多一次 / 「暂不」次日继续 / 「不再提示」永久关闭 /
 * 7 天滑动窗口滚动 / 窗口外数据被清理且清理幂等 /
 * 类型 A 与类型 B 分离 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  PromptActionKind, PromptSkipReason, DialogType, MergeSkipReason,
  GUEST_RETENTION_DAYS, DAILY_GOAL_SECONDS, LOGIN_PROMPT_DAYS,
  PROMPT_DAILY_AFTER_DAY,
} from '@core';
import {
  createHarness, writeGuestCheckIn, msOf,
} from '../helpers/harness';
import { D1, d, makeCheckIn, makeChatMessage } from '../helpers/fixtures';

/** 期望弹窗日由常量推导，避免硬编码 5 / 7 / 8。 */
function expectedPrompt(day: number): boolean {
  return LOGIN_PROMPT_DAYS.indexOf(day) >= 0 || day > PROMPT_DAILY_AFTER_DAY;
}

describe('D1→D8：登录引导逐日序列', () => {
  it('D1~D10 每日有学习数据时，bootstrap 的 dayIndex 与 shouldPrompt 完全符合常量推导序列', async () => {
    const h = createHarness({ initialYMD: D1 });
    const observed: boolean[] = [];
    for (let day = 1; day <= 10; day++) {
      const ymd = d(day);
      h.clock.setYMD(ymd);
      await writeGuestCheckIn(h, makeCheckIn({
        dateYMD: ymd, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true,
        checkedInAtMs: msOf(h, ymd), streakAfter: day,
      }));
      const boot = await h.app.bootstrap(h.clock);
      expect(boot.ok).toBe(true);
      expect(boot.value?.loginGuide.dayIndex).toBe(day);
      const should = boot.value?.loginGuide.shouldPrompt ?? false;
      expect(should).toBe(expectedPrompt(day));
      observed.push(should);
      if (should) {
        const shown = await h.services.loginPrompt.onShown(ymd, PromptActionKind.Later);
        expect(shown.ok).toBe(true);
        const again = await h.services.loginPrompt.decide(ymd);
        expect(again.value?.shouldPrompt).toBe(false);
        expect(again.value?.reason).toBe(PromptSkipReason.ALREADY_PROMPTED_TODAY);
      }
    }
    expect(observed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(expectedPrompt));
  });

  it('D5 弹窗选「暂不」→ D5 不再弹、D6 不弹（未排期）、D7 跨日后重新弹一次', async () => {
    const h = createHarness({ initialYMD: d(5) });
    await h.services.retention.markFirstStudyDate(D1);
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(5), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const d5 = await h.services.loginPrompt.decide(d(5));
    expect(d5.value?.shouldPrompt).toBe(true);
    await h.services.loginPrompt.onShown(d(5), PromptActionKind.Later);
    expect((await h.services.loginPrompt.decide(d(5))).value?.shouldPrompt).toBe(false);

    h.clock.setYMD(d(6));
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(6), activeSeconds: 60 }));
    const d6 = await h.services.loginPrompt.decide(d(6));
    expect(d6.value?.shouldPrompt).toBe(false);
    expect(d6.value?.reason).toBe(PromptSkipReason.NOT_SCHEDULED_DAY);

    h.clock.setYMD(d(7));
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(7), activeSeconds: 60 }));
    const d7 = await h.services.loginPrompt.decide(d(7));
    expect(d7.value?.shouldPrompt).toBe(true);
    expect(d7.value?.dayIndex).toBe(7);
  });

  it('「不再提示」后 D8/D9/D12 全部不弹（reason=NEVER_PROMPT），但类型 B 仍可弹出', async () => {
    const h = createHarness({ initialYMD: d(5) });
    await h.services.retention.markFirstStudyDate(D1);
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(5), activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    await h.app.onLoginGuideAction(PromptActionKind.NeverPrompt, h.clock);
    for (const day of [8, 9, 12]) {
      const ymd = d(day);
      h.clock.setYMD(ymd);
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: ymd, activeSeconds: 60 }));
      const dec = await h.services.loginPrompt.decide(ymd);
      expect(dec.value?.shouldPrompt).toBe(false);
      expect(dec.value?.reason).toBe(PromptSkipReason.NEVER_PROMPT);
    }
    h.clock.setYMD(d(12));
    const typeB = await h.services.migration.detect('qa-uid-001', d(12));
    expect(typeB.value?.shouldShow).toBe(true);
    expect(typeB.value?.dialogType).toBe(DialogType.MergeChoice);
  });

  it('已登录状态下 D5/D8 都不弹类型 A（reason=AUTHENTICATED）', async () => {
    const h = createHarness({ initialYMD: d(5) });
    await h.services.retention.markFirstStudyDate(D1);
    await h.services.account.signIn({ uid: 'qa-uid-001', displayName: 'QA 旅客', expiresAtMs: 0 }, h.clock);
    for (const day of [5, 8]) {
      const dec = await h.services.loginPrompt.decide(d(day));
      expect(dec.value?.shouldPrompt).toBe(false);
      expect(dec.value?.reason).toBe(PromptSkipReason.AUTHENTICATED);
    }
  });
});

describe('D1→D8：7 天滑动窗口', () => {
  it('D1~D8 逐日写入数据，在 D8 取快照 → 窗口 [D2,D8]，D1 数据已滚出且不计入快照', async () => {
    const h = createHarness({ initialYMD: D1 });
    for (let day = 1; day <= 8; day++) {
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(day), activeSeconds: 60 }));
    }
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.ok).toBe(true);
    expect(snap.value?.window.fromYMD).toBe(d(2));
    expect(snap.value?.window.toYMD).toBe(d(8));
    expect(snap.value?.window.days).toBe(GUEST_RETENTION_DAYS);
    expect(snap.value?.checkIns.map((c) => c.dateYMD)).toEqual([d(2), d(3), d(4), d(5), d(6), d(7), d(8)]);
    expect(snap.value?.checkIns.some((c) => c.dateYMD === d(1))).toBe(false);
  });

  it('D8 执行窗口清理 → 移除窗口外 key、重建日期索引，二次执行 removedCount=0（幂等）', async () => {
    const h = createHarness({ initialYMD: D1 });
    for (let day = 1; day <= 8; day++) {
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(day), activeSeconds: 60 }));
    }
    const first = await h.services.retention.pruneGuestPartition(d(8));
    expect(first.ok).toBe(true);
    expect(first.value?.removedCount).toBeGreaterThan(0);
    expect(first.value?.idempotent).toBe(false);
    expect(first.value?.rebuiltIndex).toBe(true);
    const idx = await h.services.repository.dateIndex('guest:');
    expect(idx.value).not.toContain(d(1));
    expect(idx.value).toContain(d(8));
    const second = await h.services.retention.pruneGuestPartition(d(8));
    expect(second.value?.removedCount).toBe(0);
    expect(second.value?.idempotent).toBe(true);
  });

  it('bootstrap 同日重复 3 次 → 首次清理有删除，后两次 removedCount=0（幂等）且窗口内 7 天数据完整保留', async () => {
    const h = createHarness({ initialYMD: d(8) });
    h.clock.setYMD(d(8));
    for (let day = 1; day <= 8; day++) {
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(day), activeSeconds: 60 }));
    }
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const boot = await h.app.bootstrap(h.clock);
      expect(boot.ok).toBe(true);
      counts.push(boot.value?.pruneReport.removedCount ?? -1);
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBe(0);
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.window.fromYMD).toBe(d(2));
    expect(snap.value?.checkIns.map((c) => c.dateYMD)).toEqual([d(2), d(3), d(4), d(5), d(6), d(7), d(8)]);
  });

  it('聊天消息按 createdAtMs 换算的自然日参与窗口过滤，窗口外消息不进快照但不被快照删除', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const guest = (await h.services.account.current()).value;
    expect(guest).toBeDefined();
    if (guest !== undefined) {
      await h.services.repository.saveChatMessage(guest, makeChatMessage({
        id: 'm-old', createdAtMs: msOf(h, d(1)),
      }));
      await h.services.repository.saveChatMessage(guest, makeChatMessage({
        id: 'm-new', createdAtMs: msOf(h, d(8)),
      }));
    }
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.chatMessages.map((m) => m.id)).toEqual(['m-new']);
    expect((await h.storage.get('guest:chat:s-1:m-old')).value).toBeDefined();
  });

  it('全流程不抛异常：bootstrap / decide / onShown / detect 均返回 ok=true 的 Result', async () => {
    const h = createHarness({ initialYMD: D1 });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: D1, activeSeconds: DAILY_GOAL_SECONDS, checkedIn: true }));
    const boot = await h.app.bootstrap(h.clock);
    const dec = await h.services.loginPrompt.decide(D1);
    const shown = await h.services.loginPrompt.onShown(D1, PromptActionKind.Later);
    const det = await h.services.migration.detect('qa-uid-001', D1);
    expect(boot.ok).toBe(true);
    expect(dec.ok).toBe(true);
    expect(shown.ok).toBe(true);
    expect(det.ok).toBe(true);
    expect(MergeSkipReason.PERFORMED).toBe('performed');
  });
});
