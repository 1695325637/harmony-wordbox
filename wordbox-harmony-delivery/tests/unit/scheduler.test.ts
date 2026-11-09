/**
 * scheduler.test.ts —— 艾宾浩斯 SM-2 纯函数单测。
 * 严格按 OAQ-1 裁决：所有间隔断言由 constants.ts 常量 + review 公式推导，
 * 不硬编码 15 / 38 等序列字面量。
 * 覆盖：createRecord / review 各级 / 非法 quality / 纯函数不可变性 /
 * isDue / rebaseAfterGap / statusOf / progressRank / buildDailyQueue。
 */
import { describe, it, expect } from 'vitest';
import {
  createEbbinghausScheduler, addDays, WordStatus, Scene,
  SM2_INITIAL_EF, SM2_MIN_EF, SM2_QUALITY_PASS, SM2_FIRST_INTERVAL_DAYS,
  SM2_SECOND_INTERVAL_DAYS, SM2_MASTERED_INTERVAL_DAYS, SM2_RELEARN_GAP_DAYS,
  SM2_GAP_EF_PENALTY, DEFAULT_NEW_CAP,
} from '@core';
import type { EbbinghausScheduler, StudyRecord, DailyQueue } from '@core';
import { D1, d, makeRecord, makeWordSet } from '../helpers/fixtures';

/** q=4 时 EF 增量 delta = 0，EF 恒为 SM2_INITIAL_EF，故后续间隔可由常量精确推导。 */
const STABLE_QUALITY: number = 4;

/** 由常量推导期望间隔序列：1 → 6 → round(6*EF) → round(prev*EF)。 */
function derivedIntervals(count: number): number[] {
  const out: number[] = [SM2_FIRST_INTERVAL_DAYS, SM2_SECOND_INTERVAL_DAYS];
  for (let i = 2; i < count; i++) {
    out.push(Math.max(1, Math.round(out[i - 1] * SM2_INITIAL_EF)));
  }
  return out.slice(0, count);
}

function reviewTimes(s: EbbinghausScheduler, n: number, quality: number): StudyRecord {
  let r: StudyRecord = s.createRecord('w-sm2', D1);
  for (let i = 0; i < n; i++) {
    r = s.review(r, quality, addDays(D1, i));
  }
  return r;
}

describe('SM-2 调度：createRecord 初始状态', () => {
  it('createRecord 输入 (wordId, today) → EF=SM2_INITIAL_EF、status=New、repetitions=0、intervalDays=0、dueYMD=today、lastReviewedYMD 为空', () => {
    const s = createEbbinghausScheduler();
    const r = s.createRecord('w-1', D1);
    expect(r.wordId).toBe('w-1');
    expect(r.ef).toBe(SM2_INITIAL_EF);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(0);
    expect(r.dueYMD).toBe(D1);
    expect(r.lastReviewedYMD).toBe('');
    expect(r.lapses).toBe(0);
    expect(r.status).toBe(WordStatus.New);
    expect(r.totalReviews).toBe(0);
    expect(r.correctReviews).toBe(0);
    expect(r.createdAtYMD).toBe(D1);
    expect(r.updatedAtYMD).toBe(D1);
  });
});

describe('SM-2 调度：review 间隔序列（OAQ-1 常量推导）', () => {
  it('第 1 次 q=4 复习 → intervalDays=SM2_FIRST_INTERVAL_DAYS、repetitions=1、status=Learning、dueYMD=today+间隔', () => {
    const s = createEbbinghausScheduler();
    const r = s.review(s.createRecord('w-sm2', D1), STABLE_QUALITY, D1);
    expect(r.intervalDays).toBe(SM2_FIRST_INTERVAL_DAYS);
    expect(r.repetitions).toBe(1);
    expect(r.status).toBe(WordStatus.Learning);
    expect(r.dueYMD).toBe(addDays(D1, SM2_FIRST_INTERVAL_DAYS));
    expect(r.totalReviews).toBe(1);
    expect(r.correctReviews).toBe(1);
    expect(r.lastReviewedYMD).toBe(D1);
    expect(r.ef).toBe(SM2_INITIAL_EF);
  });

  it('第 2 次 q=4 复习 → intervalDays=SM2_SECOND_INTERVAL_DAYS（裁决值 6）、repetitions=2', () => {
    const s = createEbbinghausScheduler();
    const expected = derivedIntervals(2);
    expect(expected[1]).toBe(SM2_SECOND_INTERVAL_DAYS);
    expect(SM2_SECOND_INTERVAL_DAYS).toBe(6);
    const r = reviewTimes(s, 2, STABLE_QUALITY);
    expect(r.intervalDays).toBe(expected[1]);
    expect(r.repetitions).toBe(2);
  });

  it('第 3 次 q=4 复习 → intervalDays=round(第2次间隔 × SM2_INITIAL_EF)，由常量推导而非硬编码', () => {
    const s = createEbbinghausScheduler();
    const expected = derivedIntervals(3);
    const r = reviewTimes(s, 3, STABLE_QUALITY);
    expect(r.intervalDays).toBe(expected[2]);
    expect(r.intervalDays).toBe(Math.max(1, Math.round(SM2_SECOND_INTERVAL_DAYS * SM2_INITIAL_EF)));
    expect(r.repetitions).toBe(3);
  });

  it('第 4 次 q=4 复习 → 间隔 ≥ SM2_MASTERED_INTERVAL_DAYS，status=Mastered，序列完整为常量推导值', () => {
    const s = createEbbinghausScheduler();
    const expected = derivedIntervals(4);
    const observed: number[] = [];
    let r: StudyRecord = s.createRecord('w-sm2', D1);
    for (let i = 0; i < 4; i++) {
      r = s.review(r, STABLE_QUALITY, addDays(D1, i));
      observed.push(r.intervalDays);
    }
    expect(observed).toEqual(expected);
    expect(expected[0]).toBe(SM2_FIRST_INTERVAL_DAYS);
    expect(expected[1]).toBe(SM2_SECOND_INTERVAL_DAYS);
    expect(expected[3]).toBeGreaterThanOrEqual(SM2_MASTERED_INTERVAL_DAYS);
    expect(r.status).toBe(WordStatus.Mastered);
    expect(r.ef).toBe(SM2_INITIAL_EF);
  });

  it('q=5 复习 → EF 按公式递增且不低于 SM2_MIN_EF；第 3 次间隔由当轮 EF 推导，不写死数字', () => {
    const s = createEbbinghausScheduler();
    const r1 = s.review(s.createRecord('w-sm2', D1), 5, D1);
    const delta = 0.1 - (5 - 5) * (0.08 + (5 - 5) * 0.02);
    expect(r1.ef).toBe(Math.max(SM2_MIN_EF, SM2_INITIAL_EF + delta));
    const r2 = s.review(r1, 5, addDays(D1, 1));
    expect(r2.intervalDays).toBe(SM2_SECOND_INTERVAL_DAYS);
    const r3 = s.review(r2, 5, addDays(D1, 2));
    expect(r3.intervalDays).toBe(Math.max(1, Math.round(SM2_SECOND_INTERVAL_DAYS * r3.ef)));
  });

  it('quality < SM2_QUALITY_PASS 复习 → repetitions 归 0、intervalDays 回到 SM2_FIRST_INTERVAL_DAYS、lapses+1、status=Relearning、correctReviews 不增加', () => {
    const s = createEbbinghausScheduler();
    const base = reviewTimes(s, 3, STABLE_QUALITY);
    const r = s.review(base, SM2_QUALITY_PASS - 1, d(4));
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(SM2_FIRST_INTERVAL_DAYS);
    expect(r.lapses).toBe(base.lapses + 1);
    expect(r.status).toBe(WordStatus.Relearning);
    expect(r.totalReviews).toBe(base.totalReviews + 1);
    expect(r.correctReviews).toBe(base.correctReviews);
  });
});

describe('SM-2 调度：非法 quality 与纯函数不可变性', () => {
  it('quality 为 -1 / 6 / 3.5 / NaN → 返回输入对象本身（同一引用），不产生状态漂移', () => {
    const s = createEbbinghausScheduler();
    const base = makeRecord();
    for (const q of [-1, 6, 3.5, Number.NaN]) {
      expect(s.review(base, q, D1)).toBe(base);
    }
  });

  it('Object.freeze 入参调用 review → 不抛异常、返回全新对象、原对象所有字段保持不变', () => {
    const s = createEbbinghausScheduler();
    const frozen: StudyRecord = Object.freeze(makeRecord({ wordId: 'w-frozen' }));
    const snapshot = JSON.stringify(frozen);
    let next: StudyRecord = frozen;
    expect(() => { next = s.review(frozen, STABLE_QUALITY, D1); }).not.toThrow();
    expect(next).not.toBe(frozen);
    expect(JSON.stringify(frozen)).toBe(snapshot);
    expect(next.status).toBe(WordStatus.Learning);
  });

  it('Object.freeze 入参调用 createRecord / isDue / rebaseAfterGap / progressRank / statusOf → 均不抛异常', () => {
    const s = createEbbinghausScheduler();
    const frozen: StudyRecord = Object.freeze(makeRecord({ lastReviewedYMD: d(1) }));
    expect(() => {
      s.createRecord('w-x', D1);
      s.isDue(frozen, d(8));
      s.rebaseAfterGap(frozen, d(8));
      s.progressRank(frozen);
      s.statusOf(1, 0, false);
    }).not.toThrow();
  });
});

describe('SM-2 调度：isDue / rebaseAfterGap / statusOf / progressRank', () => {
  it('isDue：dueYMD<=today 且非 Mastered → true；Mastered 或到期日在未来 → false', () => {
    const s = createEbbinghausScheduler();
    expect(s.isDue(makeRecord({ dueYMD: d(3) }), d(8))).toBe(true);
    expect(s.isDue(makeRecord({ dueYMD: d(8) }), d(8))).toBe(true);
    expect(s.isDue(makeRecord({ dueYMD: d(9) }), d(8))).toBe(false);
    expect(s.isDue(makeRecord({ dueYMD: d(3), status: WordStatus.Mastered }), d(8))).toBe(false);
  });

  it('rebaseAfterGap：断更 > SM2_RELEARN_GAP_DAYS → Relearning、EF 减 SM2_GAP_EF_PENALTY、repetitions=0、interval=SM2_FIRST_INTERVAL_DAYS、dueYMD=today', () => {
    const s = createEbbinghausScheduler();
    const base = makeRecord({
      lastReviewedYMD: d(1), repetitions: 3, intervalDays: 15,
      ef: SM2_INITIAL_EF, status: WordStatus.Learning,
    });
    const r = s.rebaseAfterGap(base, addDays(d(1), SM2_RELEARN_GAP_DAYS + 1));
    expect(r.status).toBe(WordStatus.Relearning);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(SM2_FIRST_INTERVAL_DAYS);
    expect(r.ef).toBe(Math.max(SM2_MIN_EF, SM2_INITIAL_EF - SM2_GAP_EF_PENALTY));
    expect(r.dueYMD).toBe(addDays(d(1), SM2_RELEARN_GAP_DAYS + 1));
    expect(r.lastReviewedYMD).toBe(d(1));
  });

  it('rebaseAfterGap：从未复习（lastReviewedYMD 为空）或断更 ≤ 阈值 → 返回输入对象本身', () => {
    const s = createEbbinghausScheduler();
    const never = makeRecord({ lastReviewedYMD: '' });
    expect(s.rebaseAfterGap(never, d(30))).toBe(never);
    const recent = makeRecord({ lastReviewedYMD: d(1) });
    expect(s.rebaseAfterGap(recent, addDays(d(1), SM2_RELEARN_GAP_DAYS))).toBe(recent);
  });

  it('statusOf 五分支：relearn → Relearning；interval≥阈值 → Mastered；interval≤0 → New；lapses<0 → Relearning；其余 → Learning', () => {
    const s = createEbbinghausScheduler();
    expect(s.statusOf(5, 0, true)).toBe(WordStatus.Relearning);
    expect(s.statusOf(SM2_MASTERED_INTERVAL_DAYS, 0, false)).toBe(WordStatus.Mastered);
    expect(s.statusOf(0, 0, false)).toBe(WordStatus.New);
    expect(s.statusOf(3, -1, false)).toBe(WordStatus.Relearning);
    expect(s.statusOf(3, 0, false)).toBe(WordStatus.Learning);
  });

  it('progressRank：Mastered > Learning > Relearning > New；同状态下 repetitions/interval 更大者 rank 更大', () => {
    const s = createEbbinghausScheduler();
    const rank = (o: Partial<StudyRecord>): number => s.progressRank(makeRecord(o));
    expect(rank({ status: WordStatus.Mastered })).toBeGreaterThan(rank({ status: WordStatus.Learning }));
    expect(rank({ status: WordStatus.Learning })).toBeGreaterThan(rank({ status: WordStatus.Relearning }));
    expect(rank({ status: WordStatus.Relearning })).toBeGreaterThan(rank({ status: WordStatus.New }));
    expect(rank({ status: WordStatus.Learning, repetitions: 3 })).toBeGreaterThan(rank({ status: WordStatus.Learning, repetitions: 1 }));
    expect(rank({ status: WordStatus.Learning, intervalDays: 10 })).toBeGreaterThan(rank({ status: WordStatus.Learning, intervalDays: 2 }));
  });
});

describe('SM-2 调度：buildDailyQueue', () => {
  it('无复习记录时按 ALL_SCENES 顺序取新词，newCap 生效，已有 StudyRecord 的词不再作为新词', () => {
    const s = createEbbinghausScheduler();
    const airport = makeWordSet(3, Scene.AIRPORT);
    const dining = makeWordSet(2, Scene.DINING);
    const words = [...dining, ...airport];
    const known = makeRecord({ wordId: airport[0].id });
    const q = s.buildDailyQueue(words, [known], D1, 2);
    expect(q.dateYMD).toBe(D1);
    expect(q.newWordIds.length).toBe(2);
    expect(q.newWordIds[0]).toBe(airport[1].id);
    expect(q.newWordIds).not.toContain(airport[0].id);
    expect(q.reviewWordIds).toContain(airport[0].id);
    expect(q.total).toBe(q.newWordIds.length + q.reviewWordIds.length + q.relearnWordIds.length);
  });

  it('newCap 默认为 DEFAULT_NEW_CAP=8；传入 <=0 → 不出新词', () => {
    const s = createEbbinghausScheduler();
    const words = makeWordSet(10, Scene.AIRPORT);
    expect(DEFAULT_NEW_CAP).toBe(8);
    expect(s.buildDailyQueue(words, [], D1, DEFAULT_NEW_CAP).newWordIds.length).toBe(DEFAULT_NEW_CAP);
    expect(s.buildDailyQueue(words, [], D1, 0).newWordIds.length).toBe(0);
    expect(s.buildDailyQueue(words, [], D1, -1).newWordIds.length).toBe(0);
  });

  it('到期复习词按 dueYMD 升序排列，Mastered 记录不进入复习队列', () => {
    const s = createEbbinghausScheduler();
    const records = [
      makeRecord({ wordId: 'w-late', dueYMD: d(6) }),
      makeRecord({ wordId: 'w-early', dueYMD: d(2) }),
      makeRecord({ wordId: 'w-mastered', dueYMD: d(1), status: WordStatus.Mastered }),
    ];
    const q = s.buildDailyQueue([], records, d(8), 8);
    expect(q.reviewWordIds).toEqual(['w-early', 'w-late']);
    expect(q.reviewWordIds).not.toContain('w-mastered');
  });

  it('断更 > SM2_RELEARN_GAP_DAYS 的记录进入 relearnWordIds 且不再重复进入 reviewWordIds（优先出队）', () => {
    const s = createEbbinghausScheduler();
    const gapDay = addDays(d(1), SM2_RELEARN_GAP_DAYS + 1);
    const records = [
      makeRecord({ wordId: 'w-gap', lastReviewedYMD: d(1), dueYMD: d(1) }),
      makeRecord({ wordId: 'w-normal', lastReviewedYMD: d(7), dueYMD: d(7) }),
    ];
    const q = s.buildDailyQueue([], records, gapDay, 8);
    expect(q.relearnWordIds).toEqual(['w-gap']);
    expect(q.reviewWordIds).toEqual(['w-normal']);
    expect(q.relearnWordIds).not.toContain('w-normal');
    expect(q.total).toBe(2);
  });

  it('Object.freeze 的 words / records 入参调用 buildDailyQueue → 不抛异常且不改变入参数组', () => {
    const s = createEbbinghausScheduler();
    const words = Object.freeze(makeWordSet(3, Scene.AIRPORT));
    const records = Object.freeze([makeRecord({ wordId: words[0].id })]);
    let q: DailyQueue | undefined = undefined;
    expect(() => { q = s.buildDailyQueue(words, records, D1, 5); }).not.toThrow();
    expect(words.length).toBe(3);
    expect(records.length).toBe(1);
    expect(q).toBeDefined();
    if (q !== undefined) expect(q.total).toBeGreaterThanOrEqual(0);
  });
});
