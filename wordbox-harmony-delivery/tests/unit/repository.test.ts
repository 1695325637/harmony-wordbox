/**
 * repository.test.ts —— 双分区持久化仓储单测。
 * 覆盖：partition 规约 / 分区隔离 / 日期索引 / batchWrite 原子性 /
 * 跨分区 key 拒绝 / loadGuestSnapshot 只过滤不删除 / codec 容错 / Result 不抛异常。
 */
import { describe, it, expect } from 'vitest';
import {
  ErrorCode, DEFAULT_SETTINGS, GUEST_RETENTION_DAYS, Scene, WordSource,
  partitionOf, wordsKey, recordKey, checkInKey, datesIndexKey, settingsKey,
  sessionKey, createJsonCodec,
} from '@core';
import type { StorageEntry } from '@core';
import {
  createHarness, guestSessionOf, authSessionOf,
} from '../helpers/harness';
import { D1, d, makeWord, makeRecord, makeCheckIn, makeChatMessage } from '../helpers/fixtures';

const UID = 'qa-uid-001';
const GP = 'guest:';
const UP = 'user:' + UID + ':';

describe('仓储：分区与隔离（Q10 / Storage Key 规约）', () => {
  it('partitionOf 对游客 / 登录态分别返回 guest: 与 user:{uid}:', () => {
    expect(partitionOf(guestSessionOf())).toBe(GP);
    expect(partitionOf(authSessionOf(UID))).toBe(UP);
  });

  it('写入游客分区的 Word / Record / CheckIn → 登录态分区读取均为空（严格隔离）', async () => {
    const h = createHarness({ initialYMD: D1 });
    const guest = guestSessionOf();
    const auth = authSessionOf(UID);
    await h.services.repository.saveWord(guest, makeWord({ id: 'w-g' }));
    await h.services.repository.saveRecord(guest, makeRecord({ wordId: 'w-g' }));
    await h.services.repository.saveCheckIn(guest, makeCheckIn({ dateYMD: D1 }));
    expect((await h.services.repository.loadWords(guest)).value?.length).toBe(1);
    expect((await h.services.repository.loadRecords(guest)).value?.length).toBe(1);
    expect((await h.services.repository.loadCheckIns(guest, D1, D1)).value?.length).toBe(1);
    expect((await h.services.repository.loadWords(auth)).value?.length).toBe(0);
    expect((await h.services.repository.loadRecords(auth)).value?.length).toBe(0);
    expect((await h.services.repository.loadCheckIns(auth, D1, D1)).value?.length).toBe(0);
  });

  it('loadSettings 无持久化数据 → 返回 DEFAULT_SETTINGS；保存后可读回', async () => {
    const h = createHarness({ initialYMD: D1 });
    const s = guestSessionOf();
    expect((await h.services.repository.loadSettings(s)).value).toEqual(DEFAULT_SETTINGS);
    const custom = { ...DEFAULT_SETTINGS, dailyGoalSeconds: 900 };
    expect((await h.services.repository.saveSettings(s, custom)).ok).toBe(true);
    expect((await h.services.repository.loadSettings(s)).value?.dailyGoalSeconds).toBe(900);
  });

  it('saveWord 对 createdAtYMD=空串的内置种子词不写日期索引，对普通词写入日期索引', async () => {
    const h = createHarness({ initialYMD: D1 });
    const s = guestSessionOf();
    await h.services.repository.saveWord(s, makeWord({ id: 'w-seed', source: WordSource.Seed, createdAtYMD: '' }));
    expect((await h.services.repository.dateIndex(GP)).value ?? []).toEqual([]);
    await h.services.repository.saveWord(s, makeWord({ id: 'w-user', createdAtYMD: d(3) }));
    expect((await h.services.repository.dateIndex(GP)).value).toContain(d(3));
  });

  it('rebuildDateIndex 输入含重复与非法日期 → 去重、过滤非法、升序排列', async () => {
    const h = createHarness({ initialYMD: D1 });
    const r = await h.services.repository.rebuildDateIndex(GP, [d(5), d(2), d(5), 'bad', d(3)]);
    expect(r.ok).toBe(true);
    expect((await h.services.repository.dateIndex(GP)).value).toEqual([d(2), d(3), d(5)]);
  });

  it('loadCheckIns 按日期区间过滤并升序返回；loadChatMessages 按 createdAtMs 升序返回', async () => {
    const h = createHarness({ initialYMD: D1 });
    const s = guestSessionOf();
    for (const day of [5, 1, 3]) {
      await h.services.repository.saveCheckIn(s, makeCheckIn({ dateYMD: d(day) }));
    }
    const r = await h.services.repository.loadCheckIns(s, d(2), d(4));
    expect(r.value?.map((c) => c.dateYMD)).toEqual([d(3)]);
    await h.services.repository.saveChatMessage(s, makeChatMessage({ id: 'm-late', createdAtMs: 8_000 }));
    await h.services.repository.saveChatMessage(s, makeChatMessage({ id: 'm-early', createdAtMs: 1_000 }));
    const msgs = await h.services.repository.loadChatMessages(s, 's-1');
    expect(msgs.value?.map((m) => m.id)).toEqual(['m-early', 'm-late']);
  });
});

describe('仓储：batch 原子性与跨分区拒绝', () => {
  it('batchWrite 全部为同分区合法 entry → 一次性提交成功，storage 可读取全部值', async () => {
    const h = createHarness({ initialYMD: D1 });
    const entries: readonly StorageEntry[] = [
      { key: wordsKey(GP, 'w-a'), value: h.services.codec.encode(makeWord({ id: 'w-a' })) },
      { key: wordsKey(GP, 'w-b'), value: h.services.codec.encode(makeWord({ id: 'w-b' })) },
    ];
    const r = await h.services.repository.batchWrite(GP, entries);
    expect(r.ok).toBe(true);
    expect((await h.services.repository.loadWords(guestSessionOf())).value?.length).toBe(2);
  });

  it('batchWrite 含跨分区 key → fail(STORAGE_BATCH_PARTIAL)，且同批合法 entry 一个都不提交', async () => {
    const h = createHarness({ initialYMD: D1 });
    const entries: readonly StorageEntry[] = [
      { key: wordsKey(GP, 'w-a'), value: '{}' },
      { key: wordsKey(UP, 'w-cross'), value: '{}' },
    ];
    const r = await h.services.repository.batchWrite(GP, entries);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_BATCH_PARTIAL);
    expect((await h.storage.get(wordsKey(GP, 'w-a'))).value).toBeUndefined();
  });

  it('batchRemove 含跨分区 key → fail(STORAGE_BATCH_PARTIAL)，且已有数据不被误删', async () => {
    const h = createHarness({ initialYMD: D1 });
    await h.services.repository.saveWord(guestSessionOf(), makeWord({ id: 'w-keep' }));
    const r = await h.services.repository.batchRemove(GP, [checkInKey(GP, D1), checkInKey(UP, D1)]);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_BATCH_PARTIAL);
    expect((await h.services.repository.loadWords(guestSessionOf())).value?.length).toBe(1);
  });

  it('底层 batchSet 含非法 entry（空 key）→ 整批不提交（原子性），不抛异常', async () => {
    const h = createHarness({ initialYMD: D1 });
    const entries: readonly StorageEntry[] = [
      { key: wordsKey(GP, 'w-a'), value: '{}' },
      { key: '', value: '{}' },
    ];
    const r = await h.storage.batchSet(entries);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe(ErrorCode.STORAGE_BATCH_PARTIAL);
    expect((await h.storage.get(wordsKey(GP, 'w-a'))).value).toBeUndefined();
  });
});

describe('仓储：loadGuestSnapshot 只过滤不删除', () => {
  it('写入窗口内 D3 与窗口外 D1 数据，在 D8 取快照 → 窗口为 [D2,D8]，快照仅含 D3，窗口外 D1 仍留在 storage', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const s = guestSessionOf();
    await h.services.repository.saveCheckIn(s, makeCheckIn({ dateYMD: d(1) }));
    await h.services.repository.saveCheckIn(s, makeCheckIn({ dateYMD: d(3) }));
    const snap = await h.services.repository.loadGuestSnapshot(d(8));
    expect(snap.ok).toBe(true);
    expect(snap.value?.window.fromYMD).toBe(d(2));
    expect(snap.value?.window.toYMD).toBe(d(8));
    expect(snap.value?.window.days).toBe(GUEST_RETENTION_DAYS);
    expect(snap.value?.checkIns.map((c) => c.dateYMD)).toEqual([d(3)]);
    expect((await h.storage.get(checkInKey(GP, d(1)))).value).toBeDefined();
  });

  it('快照中窗口外的 Word / StudyRecord / ChatMessage 被过滤，但底层 key 依然存在', async () => {
    const h = createHarness({ initialYMD: d(8) });
    const s = guestSessionOf();
    await h.services.repository.saveWord(s, makeWord({ id: 'w-old', createdAtYMD: d(1) }));
    await h.services.repository.saveRecord(s, makeRecord({ wordId: 'w-old', updatedAtYMD: d(1) }));
    const chatMs = h.clock.msFromYMD(d(1));
    const chat = makeChatMessage({ id: 'm-old', createdAtMs: chatMs });
    const chatKeyStored = GP + 'chat:' + chat.sessionId + ':' + chat.id;
    await h.services.repository.saveChatMessage(s, chat);
    const snap = await h.services.repository.loadGuestSnapshot(d(8));
    expect(snap.value?.words.length).toBe(0);
    expect(snap.value?.records.length).toBe(0);
    expect(snap.value?.chatMessages.length).toBe(0);
    expect((await h.storage.get(wordsKey(GP, 'w-old'))).value).toBeDefined();
    expect((await h.storage.get(recordKey(GP, 'w-old'))).value).toBeDefined();
    expect((await h.storage.get(chatKeyStored)).value).toBeDefined();
  });

  it('codec.decode 遇到非法 JSON payload → 返回 fail(STORAGE_READ_FAILED) 且不抛异常；readList 安全跳过坏记录', async () => {
    const h = createHarness({ initialYMD: D1 });
    const codec = createJsonCodec();
    const bad = codec.decode<{ a: number }>('not-json', (v) => typeof v.a === 'number');
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe(ErrorCode.STORAGE_READ_FAILED);
    await h.storage.set(wordsKey(GP, 'w-broken'), 'not-json');
    await h.services.repository.saveWord(guestSessionOf(), makeWord({ id: 'w-good', scene: Scene.HOTEL }));
    const words = await h.services.repository.loadWords(guestSessionOf());
    expect(words.ok).toBe(true);
    expect(words.value?.map((w) => w.id)).toEqual(['w-good']);
  });

  it('sessionKey / datesIndexKey / settingsKey 均按规约生成，不含硬编码分区前缀泄漏', () => {
    expect(sessionKey()).toBe('global:account:session');
    expect(datesIndexKey(GP)).toBe('guest:index:dates');
    expect(settingsKey(UP)).toBe('user:' + UID + ':meta:settings');
  });
});
