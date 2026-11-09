/**
 * retention.test.ts —— 游客 7 天滑动窗口单测。
 * 覆盖：windowOf / isWithinWindow 边界 / filter 不 mutate /
 * pruneOutsideWindow 幂等·不误删窗口内·跨月·闰年 / isIdempotent /
 * RetentionService.pruneGuestPartition 幂等与索引重建 /
 * loadGuestSnapshot 只过滤不删除 / hasGuestProgress /
 * markFirstStudyDate 只写一次 / promptState 读写 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  GUEST_RETENTION_DAYS, ErrorCode, addDays,
  createGuestRetentionPolicy,
} from '@core';
import type { DatedEntity } from '@core';
import {
  createHarness, writeGuestCheckIn, writeGuestWord,
} from '../helpers/harness';
import {
  D1, d, CROSS_MONTH_D1, LEAP_D1, makeDatedDays, makeCheckIn, makeWord,
} from '../helpers/fixtures';

describe('游客窗口：纯策略 windowOf / isWithinWindow / filterWithinWindow', () => {
  it('windowOf(D8) → [D2, D8] 且 days=GUEST_RETENTION_DAYS=7', () => {
    const policy = createGuestRetentionPolicy();
    const w = policy.windowOf(d(8));
    expect(GUEST_RETENTION_DAYS).toBe(7);
    expect(w.fromYMD).toBe(d(2));
    expect(w.toYMD).toBe(d(8));
    expect(w.days).toBe(GUEST_RETENTION_DAYS);
    expect(w.fromYMD).toBe(addDays(d(8), -(GUEST_RETENTION_DAYS - 1)));
  });

  it('isWithinWindow 边界：fromYMD 与 toYMD 当天均命中，前一天与后一天均不命中，非法日期不命中', () => {
    const policy = createGuestRetentionPolicy();
    expect(policy.isWithinWindow(d(1), d(8))).toBe(false);
    expect(policy.isWithinWindow(d(2), d(8))).toBe(true);
    expect(policy.isWithinWindow(d(8), d(8))).toBe(true);
    expect(policy.isWithinWindow(d(9), d(8))).toBe(false);
    expect(policy.isWithinWindow('bad', d(8))).toBe(false);
  });

  it('filterWithinWindow 输入 Object.freeze 的数组 → 返回新数组、不 mutate 入参、只保留窗口内项', () => {
    const policy = createGuestRetentionPolicy();
    const frozen: readonly DatedEntity<number>[] = Object.freeze(makeDatedDays([1, 2, 5, 8, 9]));
    const snapshot = JSON.stringify(frozen);
    const kept = policy.filterWithinWindow<number>(frozen, d(8));
    expect(kept.map((x) => x.payload)).toEqual([2, 5, 8]);
    expect(kept).not.toBe(frozen);
    expect(JSON.stringify(frozen)).toBe(snapshot);
  });
});

describe('游客窗口：pruneOutsideWindow 幂等 / 不误删 / 跨月 / 闰年', () => {
  it('输入 D1..D9 实体在 D8 清理 → 仅移除 D1 与 D9，changed=true，kept 全部在窗口内', () => {
    const policy = createGuestRetentionPolicy();
    const items = makeDatedDays([1, 2, 3, 5, 8, 9]);
    const r = policy.pruneOutsideWindow<number>(items, d(8));
    expect(r.changed).toBe(true);
    expect(r.removed.map((x) => x.payload)).toEqual([1, 9]);
    expect(r.kept.map((x) => x.payload)).toEqual([2, 3, 5, 8]);
    for (const k of r.kept) expect(policy.isWithinWindow(k.dateYMD, d(8))).toBe(true);
  });

  it('幂等：对第一次清理后的 kept 再次清理 → removed 为空、changed=false、isIdempotent=true', () => {
    const policy = createGuestRetentionPolicy();
    const first = policy.pruneOutsideWindow<number>(makeDatedDays([1, 2, 3, 5, 8, 9]), d(8));
    const second = policy.pruneOutsideWindow<number>(first.kept, d(8));
    expect(second.changed).toBe(false);
    expect(second.removed.length).toBe(0);
    expect(second.kept.length).toBe(first.kept.length);
    expect(policy.isIdempotent(first.kept, second.kept, d(8))).toBe(true);
  });

  it('全部实体都在窗口内时清理 → changed=false、removed 为空、kept 与输入完全一致（不误删）', () => {
    const policy = createGuestRetentionPolicy();
    const items = makeDatedDays([2, 3, 4, 5, 6, 7, 8]);
    const r = policy.pruneOutsideWindow<number>(items, d(8));
    expect(r.changed).toBe(false);
    expect(r.removed.length).toBe(0);
    expect(r.kept.map((x) => x.payload)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('跨月：基准 2026-10-28 的 D1..D8 覆盖 10→11 月切换，窗口 [D2,D8] 内数据不误删', () => {
    const policy = createGuestRetentionPolicy();
    const last = d(8, CROSS_MONTH_D1);
    const w = policy.windowOf(last);
    expect(w.fromYMD).toBe(d(2, CROSS_MONTH_D1));
    expect(w.toYMD).toBe('2026-11-04');
    const items = makeDatedDays([1, 2, 3, 4, 5, 6, 7, 8], CROSS_MONTH_D1);
    const r = policy.pruneOutsideWindow<number>(items, last);
    expect(r.removed.map((x) => x.payload)).toEqual([1]);
    expect(r.kept.length).toBe(7);
    expect(policy.isWithinWindow(d(8, CROSS_MONTH_D1), last)).toBe(true);
  });

  it('闰年：覆盖 2028-02-29 的窗口清理正确，02-29 在窗口内不被误删', () => {
    const policy = createGuestRetentionPolicy();
    const last = addDays(LEAP_D1, 7);
    const w = policy.windowOf(last);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(policy.isWithinWindow('2028-02-29', last)).toBe(true);
    const from = w.fromYMD;
    const items: readonly DatedEntity<number>[] = [
      { dateYMD: addDays(from, -1), payload: 0 },
      { dateYMD: from, payload: 1 },
      { dateYMD: '2028-02-29', payload: 2 },
      { dateYMD: last, payload: 3 },
      { dateYMD: addDays(last, 1), payload: 4 },
    ];
    const r = policy.pruneOutsideWindow<number>(items, last);
    expect(r.removed.map((x) => x.payload)).toEqual([0, 4]);
    expect(r.kept.map((x) => x.payload)).toEqual([1, 2, 3]);
    expect(r.kept.some((x) => x.dateYMD === '2028-02-29')).toBe(true);
  });

  it('isIdempotent 输入仍含窗口外实体 → 返回 false（能识别尚未清理干净的状态）', () => {
    const policy = createGuestRetentionPolicy();
    const dirty = makeDatedDays([1, 3, 5], D1);
    expect(policy.isIdempotent(dirty, dirty, d(8))).toBe(false);
  });
});

describe('游客窗口：RetentionService 落盘清理', () => {
  it('pruneGuestPartition 在 D8 清理 D1..D8 数据 → 删除窗口外 key、重建日期索引仅保留 D2..D8', async () => {
    const h = createHarness({ initialYMD: d(8) });
    for (let day = 1; day <= 8; day++) {
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(day) }));
    }
    const r = await h.services.retention.pruneGuestPartition(d(8));
    expect(r.ok).toBe(true);
    expect(r.value?.window.fromYMD).toBe(d(2));
    expect(r.value?.removedCount).toBeGreaterThan(0);
    expect(r.value?.idempotent).toBe(false);
    expect(r.value?.rebuiltIndex).toBe(true);
    const idx = await h.services.repository.dateIndex('guest:');
    expect(idx.value).not.toContain(d(1));
    expect(idx.value).toContain(d(8));
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.checkIns.every((c) => c.dateYMD >= d(2))).toBe(true);
  });

  it('pruneGuestPartition 重复执行 → removedCount=0、idempotent=true（幂等，不误删窗口内）', async () => {
    const h = createHarness({ initialYMD: d(8) });
    for (let day = 1; day <= 8; day++) {
      await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(day) }));
    }
    await h.services.retention.pruneGuestPartition(d(8));
    const second = await h.services.retention.pruneGuestPartition(d(8));
    expect(second.ok).toBe(true);
    expect(second.value?.removedCount).toBe(0);
    expect(second.value?.idempotent).toBe(true);
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.checkIns.length).toBe(7);
  });

  it('loadGuestSnapshot 只过滤不删除：窗口外游客数据仍在底层 storage，可被 Migration 统计跳过数', async () => {
    const h = createHarness({ initialYMD: d(8) });
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(1) }));
    await writeGuestWord(h, makeWord({ id: 'w-out', createdAtYMD: d(1) }));
    const snap = await h.services.retention.loadGuestSnapshot(d(8));
    expect(snap.value?.checkIns.length).toBe(0);
    expect(snap.value?.words.length).toBe(0);
    expect((await h.storage.get('guest:checkins:' + d(1))).value).toBeDefined();
    expect((await h.storage.get('guest:words:w-out')).value).toBeDefined();
  });

  it('hasGuestProgress：窗口内无数据 → false；写入窗口内打卡 → true', async () => {
    const h = createHarness({ initialYMD: d(8) });
    expect((await h.services.retention.hasGuestProgress(d(8))).value).toBe(false);
    await writeGuestCheckIn(h, makeCheckIn({ dateYMD: d(8) }));
    expect((await h.services.retention.hasGuestProgress(d(8))).value).toBe(true);
  });

  it('markFirstStudyDate 重复调用 → 首次写入后保持不变（只写一次），非法日期返回 fail(INVALID_DATE)', async () => {
    const h = createHarness({ initialYMD: D1 });
    const first = await h.services.retention.markFirstStudyDate(d(3));
    expect(first.ok).toBe(true);
    expect(first.value?.firstStudyYMD).toBe(d(3));
    const again = await h.services.retention.markFirstStudyDate(d(5));
    expect(again.value?.firstStudyYMD).toBe(d(3));
    const bad = await createHarness({ initialYMD: D1 }).services.retention.markFirstStudyDate('bad');
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe(ErrorCode.INVALID_DATE);
  });

  it('promptState 保存 / 读取 → 字段完整往返；存储写失败时 savePromptState 返回 fail 不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    const state = {
      firstStudyYMD: D1, neverPrompt: true, lastPromptDate: d(5), lastDecisionYMD: d(5),
    };
    expect((await h.services.retention.savePromptState(state)).ok).toBe(true);
    const read = await h.services.retention.promptState();
    expect(read.ok).toBe(true);
    expect(read.value).toEqual(state);
    h.storage.setFailWrites(true);
    const failed = await h.services.retention.savePromptState(state);
    expect(failed.ok).toBe(false);
    expect(failed.error?.code).toBe(ErrorCode.STORAGE_WRITE_FAILED);
  });

  it('pruneGuestPartition 在跨月与闰年基准下均正确，且二次执行 removedCount=0', async () => {
    for (const base of [CROSS_MONTH_D1, LEAP_D1]) {
      const last = addDays(base, 7);
      const h = createHarness({ initialYMD: last });
      for (let day = 1; day <= 8; day++) {
        await writeGuestCheckIn(h, makeCheckIn({ dateYMD: addDays(base, day - 1) }));
      }
      const first = await h.services.retention.pruneGuestPartition(last);
      expect(first.ok).toBe(true);
      expect(first.value?.window.toYMD).toBe(last);
      const second = await h.services.retention.pruneGuestPartition(last);
      expect(second.value?.removedCount).toBe(0);
      expect(second.value?.idempotent).toBe(true);
    }
  });
});
