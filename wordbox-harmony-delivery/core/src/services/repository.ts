/**
 * `ScopedRepository` — dual-partition persistence (`guest:` / `user:{uid}:`)
 * with a date index, read-layer gate exposure and window-filtered guest
 * snapshots. Every key is built via `ports/keys.ts`; no key literal appears
 * in this file. All multi-key writes go through a single atomic batch.
 */
import {
  Word, StudyRecord, CheckIn, ChatMessage, Settings, AccountSession,
  StorageEntry, GuestSnapshot, GuestPromptState, DateWindow,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { StorageService, Clock } from '../ports/ports';
import {
  JsonCodec, isWordLike, isRecordLike, isCheckInLike, isChatMessageLike,
  isSettingsLike, isPromptStateLike, isStringArrayLike,
} from '../ports/codec';
import {
  partitionOf, wordsKey, recordKey, checkInKey, chatKey, datesIndexKey,
  settingsKey, promptStateKey, wordsPrefix, recordsPrefix, checkInsPrefix,
  chatPrefix,
} from '../ports/keys';
import {
  DEFAULT_SETTINGS, GUEST_RETENTION_DAYS, DEFAULT_GUEST_SESSION,
  FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD,
} from '../models/constants';
import { windowFrom, compareYMD, isYMD } from '../utils/date';
import { ProgressGate } from './progressGate';

export interface ScopedRepositoryDeps {
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly gate: ProgressGate;
  readonly clock: Clock;
}

export interface ScopedRepository {
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly gate: ProgressGate;
  partition(session: AccountSession): string;
  loadWords(session: AccountSession): Promise<Result<readonly Word[]>>;
  loadRecords(session: AccountSession): Promise<Result<readonly StudyRecord[]>>;
  loadCheckIns(session: AccountSession, fromYMD: string, toYMD: string): Promise<Result<readonly CheckIn[]>>;
  loadChatMessages(session: AccountSession, sessionId: string): Promise<Result<readonly ChatMessage[]>>;
  loadSettings(session: AccountSession): Promise<Result<Settings>>;
  saveWord(session: AccountSession, word: Word): Promise<Result<boolean>>;
  saveRecord(session: AccountSession, record: StudyRecord): Promise<Result<boolean>>;
  saveCheckIn(session: AccountSession, checkIn: CheckIn): Promise<Result<boolean>>;
  saveChatMessage(session: AccountSession, msg: ChatMessage): Promise<Result<boolean>>;
  saveSettings(session: AccountSession, settings: Settings): Promise<Result<boolean>>;
  dateIndex(partition: string): Promise<Result<readonly string[]>>;
  rebuildDateIndex(partition: string, dates: readonly string[]): Promise<Result<boolean>>;
  batchWrite(partition: string, entries: readonly StorageEntry[]): Promise<Result<boolean>>;
  batchRemove(partition: string, keys: readonly string[]): Promise<Result<boolean>>;
  loadGuestSnapshot(nowYMD: string): Promise<Result<GuestSnapshot>>;
}

/** Default prompt state used when nothing has been persisted yet. */
export function defaultPromptState(): GuestPromptState {
  const state: GuestPromptState = {
    firstStudyYMD: '',
    neverPrompt: false,
    lastPromptDate: '',
    lastDecisionYMD: '',
  };
  return state;
}

/** Create the canonical scoped repository. */
export function createScopedRepository(deps: ScopedRepositoryDeps): ScopedRepository {
  const storage: StorageService = deps.storage;
  const codec: JsonCodec = deps.codec;
  const gate: ProgressGate = deps.gate;
  const clock: Clock = deps.clock;

  async function readList<T>(prefix: string, validate: (value: T) => boolean): Promise<Result<readonly T[]>> {
    const kr = await storage.keys(prefix);
    if (!kr.ok || kr.value === undefined) {
      return fail<readonly T[]>(ErrorCode.STORAGE_READ_FAILED, 'keys(' + prefix + ') failed');
    }
    const out: T[] = [];
    for (const key of kr.value) {
      const gr = await storage.get(key);
      if (!gr.ok || gr.value === undefined) continue; // safe default per §11.1
      const decoded = codec.decode<T>(gr.value, validate);
      if (decoded.ok && decoded.value !== undefined) out.push(decoded.value);
    }
    return ok<readonly T[]>(out);
  }

  async function readOne<T>(key: string, validate: (value: T) => boolean): Promise<Result<T | undefined>> {
    const gr = await storage.get(key);
    if (!gr.ok) return fail<T | undefined>(ErrorCode.STORAGE_READ_FAILED, 'get(' + key + ') failed');
    if (gr.value === undefined) return ok<T | undefined>(undefined);
    const decoded = codec.decode<T>(gr.value, validate);
    if (!decoded.ok || decoded.value === undefined) return ok<T | undefined>(undefined);
    return ok<T | undefined>(decoded.value);
  }

  async function writeOne<T>(key: string, value: T): Promise<Result<boolean>> {
    const r = await storage.set(key, codec.encode<T>(value));
    if (!r.ok) return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'set(' + key + ') failed');
    return ok<boolean>(true);
  }

  async function dateIndexOf(partition: string): Promise<Result<readonly string[]>> {
    const r = await readOne<readonly string[]>(datesIndexKey(partition), isStringArrayLike);
    if (!r.ok) return fail<readonly string[]>(r.error !== undefined ? r.error.code : ErrorCode.STORAGE_READ_FAILED, 'date index read failed');
    return ok<readonly string[]>(r.value !== undefined ? r.value : []);
  }

  async function touchDate(partition: string, ymd: string): Promise<Result<boolean>> {
    if (!isYMD(ymd)) return ok<boolean>(true);
    const current = await dateIndexOf(partition);
    const base: readonly string[] = current.ok && current.value !== undefined ? current.value : [];
    const set: Set<string> = new Set<string>();
    for (const d of base) set.add(d);
    set.add(ymd);
    const sorted: string[] = [];
    for (const d of set) sorted.push(d);
    sorted.sort();
    return writeOne<readonly string[]>(datesIndexKey(partition), sorted);
  }

  const repository: ScopedRepository = {
    storage: storage,
    codec: codec,
    gate: gate,

    partition(session: AccountSession): string {
      return partitionOf(session);
    },

    async loadWords(session: AccountSession): Promise<Result<readonly Word[]>> {
      return readList<Word>(wordsPrefix(partitionOf(session)), isWordLike);
    },

    async loadRecords(session: AccountSession): Promise<Result<readonly StudyRecord[]>> {
      return readList<StudyRecord>(recordsPrefix(partitionOf(session)), isRecordLike);
    },

    async loadCheckIns(session: AccountSession, fromYMD: string, toYMD: string): Promise<Result<readonly CheckIn[]>> {
      const r = await readList<CheckIn>(checkInsPrefix(partitionOf(session)), isCheckInLike);
      if (!r.ok || r.value === undefined) return r;
      const out: CheckIn[] = [];
      for (const c of r.value) {
        if (compareYMD(c.dateYMD, fromYMD) >= 0 && compareYMD(c.dateYMD, toYMD) <= 0) out.push(c);
      }
      out.sort((a, b) => compareYMD(a.dateYMD, b.dateYMD));
      return ok<readonly CheckIn[]>(out);
    },

    async loadChatMessages(session: AccountSession, sessionId: string): Promise<Result<readonly ChatMessage[]>> {
      const prefix: string = chatPrefix(partitionOf(session)) + sessionId + ':';
      const r = await readList<ChatMessage>(prefix, isChatMessageLike);
      if (!r.ok || r.value === undefined) return r;
      const sorted: ChatMessage[] = [];
      for (const m of r.value) sorted.push(m);
      sorted.sort((a, b) => a.createdAtMs - b.createdAtMs);
      return ok<readonly ChatMessage[]>(sorted);
    },

    async loadSettings(session: AccountSession): Promise<Result<Settings>> {
      const r = await readOne<Settings>(settingsKey(partitionOf(session)), isSettingsLike);
      if (!r.ok) return fail<Settings>(r.error !== undefined ? r.error.code : ErrorCode.STORAGE_READ_FAILED, 'settings read failed');
      return ok<Settings>(r.value !== undefined ? r.value : DEFAULT_SETTINGS);
    },

    async saveWord(session: AccountSession, word: Word): Promise<Result<boolean>> {
      const p: string = partitionOf(session);
      const w = await writeOne<Word>(wordsKey(p, word.id), word);
      if (!w.ok) return w;
      if (word.createdAtYMD !== '') return touchDate(p, word.createdAtYMD);
      return ok<boolean>(true);
    },

    async saveRecord(session: AccountSession, record: StudyRecord): Promise<Result<boolean>> {
      const p: string = partitionOf(session);
      const w = await writeOne<StudyRecord>(recordKey(p, record.wordId), record);
      if (!w.ok) return w;
      return touchDate(p, record.updatedAtYMD);
    },

    async saveCheckIn(session: AccountSession, checkIn: CheckIn): Promise<Result<boolean>> {
      const p: string = partitionOf(session);
      const w = await writeOne<CheckIn>(checkInKey(p, checkIn.dateYMD), checkIn);
      if (!w.ok) return w;
      return touchDate(p, checkIn.dateYMD);
    },

    async saveChatMessage(session: AccountSession, msg: ChatMessage): Promise<Result<boolean>> {
      const p: string = partitionOf(session);
      const w = await writeOne<ChatMessage>(chatKey(p, msg.sessionId, msg.id), msg);
      if (!w.ok) return w;
      return touchDate(p, clock.ymdFromMs(msg.createdAtMs));
    },

    async saveSettings(session: AccountSession, settings: Settings): Promise<Result<boolean>> {
      return writeOne<Settings>(settingsKey(partitionOf(session)), settings);
    },

    async dateIndex(partition: string): Promise<Result<readonly string[]>> {
      return dateIndexOf(partition);
    },

    async rebuildDateIndex(partition: string, dates: readonly string[]): Promise<Result<boolean>> {
      const set: Set<string> = new Set<string>();
      for (const d of dates) if (isYMD(d)) set.add(d);
      const sorted: string[] = [];
      for (const d of set) sorted.push(d);
      sorted.sort();
      return writeOne<readonly string[]>(datesIndexKey(partition), sorted);
    },

    async batchWrite(partition: string, entries: readonly StorageEntry[]): Promise<Result<boolean>> {
      for (const entry of entries) {
        if (!entry.key.startsWith(partition)) {
          return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'cross-partition key rejected: ' + entry.key);
        }
      }
      const r = await storage.batchSet(entries);
      if (!r.ok) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchSet failed, nothing committed');
      return ok<boolean>(true);
    },

    async batchRemove(partition: string, keys: readonly string[]): Promise<Result<boolean>> {
      for (const key of keys) {
        if (!key.startsWith(partition)) {
          return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'cross-partition key rejected: ' + key);
        }
      }
      const r = await storage.batchRemove(keys);
      if (!r.ok) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchRemove failed');
      return ok<boolean>(true);
    },

    async loadGuestSnapshot(nowYMD: string): Promise<Result<GuestSnapshot>> {
      const p: string = partitionOf(DEFAULT_GUEST_SESSION);
      const window: DateWindow = windowFrom(nowYMD, GUEST_RETENTION_DAYS);
      const within = (ymd: string): boolean =>
        compareYMD(ymd, window.fromYMD) >= 0 && compareYMD(ymd, window.toYMD) <= 0;

      const wordsR = await repository.loadWords(DEFAULT_GUEST_SESSION);
      const recordsR = await repository.loadRecords(DEFAULT_GUEST_SESSION);
      const checkInsR = await repository.loadCheckIns(DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD);
      const chatsR = await readList<ChatMessage>(chatPrefix(p), isChatMessageLike);
      if (!wordsR.ok || !recordsR.ok || !checkInsR.ok || !chatsR.ok) {
        return fail<GuestSnapshot>(ErrorCode.STORAGE_READ_FAILED, 'guest snapshot read failed');
      }
      const words: Word[] = [];
      for (const w of wordsR.value ?? []) {
        if (w.createdAtYMD !== '' && within(w.createdAtYMD)) words.push(w);
      }
      const records: StudyRecord[] = [];
      for (const r of recordsR.value ?? []) {
        if (within(r.updatedAtYMD)) records.push(r);
      }
      const checkIns: CheckIn[] = [];
      for (const c of checkInsR.value ?? []) {
        if (within(c.dateYMD)) checkIns.push(c);
      }
      const chatMessages: ChatMessage[] = [];
      for (const m of chatsR.value ?? []) {
        if (within(clock.ymdFromMs(m.createdAtMs))) chatMessages.push(m);
      }

      const stateR = await readOne<GuestPromptState>(promptStateKey(), isPromptStateLike);
      const promptState: GuestPromptState = stateR.ok && stateR.value !== undefined
        ? stateR.value : defaultPromptState();
      const indexR = await dateIndexOf(p);
      const dateIndex: readonly string[] = indexR.ok && indexR.value !== undefined ? indexR.value : [];

      const snapshot: GuestSnapshot = {
        window: window,
        words: words,
        records: records,
        checkIns: checkIns,
        chatMessages: chatMessages,
        promptState: promptState,
        dateIndex: dateIndex,
      };
      return ok<GuestSnapshot>(snapshot);
    },
  };
  return repository;
}
