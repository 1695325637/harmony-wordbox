/**
 * wordbook.test.ts —— 生词本服务单测。
 * 覆盖：内置种子词 + 用户词合并 / 场景过滤 / 大小写不敏感搜索 /
 * 自动 SM-2 建档 / 空输入校验 / 去重 id / 会话词归一化 / 删除 / byScene / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  SEED_WORDS, ALL_SCENES, Scene, WordSource, WordStatus,
  ErrorCode, SM2_INITIAL_EF,
} from '@core';
import type { WordFilter } from '@core';
import { createHarness, guestSessionOf } from '../helpers/harness';
import { D1, d, makeWord } from '../helpers/fixtures';

function filter(o: Partial<WordFilter> = {}): WordFilter {
  return { scene: o.scene ?? 'ALL', keyword: o.keyword ?? '', status: o.status ?? 'ALL' };
}

describe('生词本：查询与过滤', () => {
  it('list 默认过滤 → 返回 240 条内置种子词，8 个场景各 30 条', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.wordBook.list(guestSessionOf(), filter());
    expect(r.ok).toBe(true);
    expect(SEED_WORDS.length).toBe(240);
    expect(r.value?.length).toBe(SEED_WORDS.length);
    for (const scene of ALL_SCENES) {
      expect(SEED_WORDS.filter((w) => w.scene === scene).length).toBe(30);
    }
  });

  it('list 按 scene=AIRPORT 过滤 → 结果全部属于该场景且数量为 30', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.wordBook.list(guestSessionOf(), filter({ scene: Scene.AIRPORT }));
    expect(r.ok).toBe(true);
    expect(r.value?.length).toBe(30);
    for (const w of r.value ?? []) expect(w.scene).toBe(Scene.AIRPORT);
  });

  it('search 关键字大小写不敏感 → 命中 text / meaningZh / exampleInScene 任一字段', async () => {
    const h = createHarness({ initialYMD: D1 });
    const byText = await h.services.wordBook.search(guestSessionOf(), 'BOARDING PASS', filter());
    const byMeaning = await h.services.wordBook.search(guestSessionOf(), '登机牌', filter());
    expect(byText.value?.some((w) => w.text === 'boarding pass')).toBe(true);
    expect(byMeaning.value?.some((w) => w.text === 'boarding pass')).toBe(true);
  });

  it('byScene → 返回 ALL_SCENES 全部 8 项，每项 count 为该场景词数', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.wordBook.byScene(guestSessionOf());
    expect(r.ok).toBe(true);
    expect(r.value?.length).toBe(ALL_SCENES.length);
    expect(r.value?.map((x) => x.scene)).toEqual(ALL_SCENES);
    for (const x of r.value ?? []) expect(x.count).toBe(30);
  });
});

describe('生词本：新增、建档与校验', () => {
  it('add 有效输入 → 返回 WordEntry，source=User、createdAtYMD=today，并自动创建 SM-2 初始 StudyRecord', async () => {
    const h = createHarness({ initialYMD: d(3) });
    const session = guestSessionOf();
    const r = await h.services.wordBook.add(session, {
      text: '  boarding gate  ', meaningZh: ' 登机口 ', scene: Scene.AIRPORT,
      exampleInScene: ' Gate 12 is this way. ',
    }, h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.word.text).toBe('boarding gate');
    expect(r.value?.word.source).toBe(WordSource.User);
    expect(r.value?.word.createdAtYMD).toBe(d(3));
    expect(r.value?.record.wordId).toBe(r.value?.word.id);
    expect(r.value?.record.status).toBe(WordStatus.New);
    expect(r.value?.record.ef).toBe(SM2_INITIAL_EF);
    expect(r.value?.record.repetitions).toBe(0);
    expect(r.value?.record.dueYMD).toBe(d(3));
    const stored = await h.services.repository.loadRecords(session);
    expect(stored.value?.some((x) => x.wordId === r.value?.word.id)).toBe(true);
  });

  it('add 空文本 / 全空白 → fail(INVALID_ARGUMENT)，不抛异常且不写入任何数据', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.wordBook.add(guestSessionOf(), {
      text: '   ', meaningZh: 'x', scene: Scene.AIRPORT, exampleInScene: 'y',
    }, h.clock);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(h.storage.size()).toBe(0);
  });

  it('同一 text+scene 重复 add 两次 → 生成相同 wordId，不产生重复记录', async () => {
    const h = createHarness({ initialYMD: D1 });
    const input = { text: 'Boarding Gate', meaningZh: '登机口', scene: Scene.AIRPORT, exampleInScene: 'x' };
    const a = await h.services.wordBook.add(guestSessionOf(), input, h.clock);
    const b = await h.services.wordBook.add(guestSessionOf(), { ...input, text: 'boarding gate' }, h.clock);
    expect(a.value?.word.id).toBe(b.value?.word.id);
    const words = await h.services.repository.loadWords(guestSessionOf());
    expect(words.value?.filter((w) => w.id === a.value?.word.id).length).toBe(1);
  });

  it('addFromChat 输入无 id 的词 → 自动补 id、source=Chat、createdAtYMD=today，并建档', async () => {
    const h = createHarness({ initialYMD: d(4) });
    const r = await h.services.wordBook.addFromChat(guestSessionOf(), makeWord({
      id: '', text: 'gate change', source: WordSource.Seed, createdAtYMD: '2020-01-01',
    }), h.clock);
    expect(r.ok).toBe(true);
    expect(r.value?.word.id.length).toBeGreaterThan(0);
    expect(r.value?.word.source).toBe(WordSource.Chat);
    expect(r.value?.word.createdAtYMD).toBe(d(4));
    expect(r.value?.record.status).toBe(WordStatus.New);
  });

  it('remove 有效 wordId → 同时删除 word 与 record；空 wordId → fail(INVALID_ARGUMENT)', async () => {
    const h = createHarness({ initialYMD: D1 });
    const session = guestSessionOf();
    const added = await h.services.wordBook.add(session, {
      text: 'temporary word', meaningZh: '临时', scene: Scene.HOTEL, exampleInScene: 'x',
    }, h.clock);
    const id = added.value?.word.id ?? '';
    const removed = await h.services.wordBook.remove(session, id);
    expect(removed.ok).toBe(true);
    expect((await h.services.repository.loadWords(session)).value?.some((w) => w.id === id)).toBe(false);
    expect((await h.services.repository.loadRecords(session)).value?.some((r) => r.wordId === id)).toBe(false);
    const bad = await h.services.wordBook.remove(session, '');
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe(ErrorCode.INVALID_ARGUMENT);
  });

  it('存储强制写失败 → add 返回 fail(STORAGE_WRITE_FAILED)，全程不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    h.storage.setFailWrites(true);
    const r = await h.services.wordBook.add(guestSessionOf(), {
      text: 'word', meaningZh: '词', scene: Scene.DINING, exampleInScene: 'x',
    }, h.clock);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_WRITE_FAILED);
  });
});
