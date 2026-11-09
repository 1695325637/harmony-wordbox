/**
 * Guest 7-day sliding window (`[today-6, today]`) — A12 pure policy plus the
 * service that prunes the guest partition and produces window-only snapshots.
 * Pruning is idempotent and NEVER removes in-window data. Merging relies on
 * `loadGuestSnapshot` filtering without deleting, so outside-window entries
 * can be counted (`skippedOutsideWindowCount`) but never written back.
 */
import {
  DatedEntity, PruneResult, PruneReport, GuestSnapshot, GuestPromptState,
  DateWindow, Word, StudyRecord, CheckIn, ChatMessage,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import {
  GUEST_RETENTION_DAYS, DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD,
} from '../models/constants';
import { windowFrom, compareYMD, isYMD } from '../utils/date';
import { JsonCodec, isChatMessageLike, isPromptStateLike } from '../ports/codec';
import { StorageService, Clock } from '../ports/ports';
import {
  partitionOf, wordsKey, recordKey, checkInKey, chatKey, chatPrefix,
  promptStateKey,
} from '../ports/keys';
import { ScopedRepository, defaultPromptState } from './repository';

// ---------------------------------------------------------------------------
// Pure policy
// ---------------------------------------------------------------------------

export interface GuestRetentionPolicy {
  windowOf(nowYMD: string): DateWindow;
  isWithinWindow(dateYMD: string, nowYMD: string): boolean;
  filterWithinWindow<T>(items: readonly DatedEntity<T>[], nowYMD: string): readonly DatedEntity<T>[];
  pruneOutsideWindow<T>(items: readonly DatedEntity<T>[], nowYMD: string): PruneResult<DatedEntity<T>>;
  isIdempotent(prev: readonly DatedEntity<unknown>[], next: readonly DatedEntity<unknown>[], nowYMD: string): boolean;
}

/** Create the pure 7-day retention policy. */
export function createGuestRetentionPolicy(): GuestRetentionPolicy {
  const policy: GuestRetentionPolicy = {
    windowOf(nowYMD: string): DateWindow {
      return windowFrom(nowYMD, GUEST_RETENTION_DAYS);
    },

    isWithinWindow(dateYMD: string, nowYMD: string): boolean {
      if (!isYMD(dateYMD)) return false;
      const window: DateWindow = policy.windowOf(nowYMD);
      return compareYMD(dateYMD, window.fromYMD) >= 0 && compareYMD(dateYMD, window.toYMD) <= 0;
    },

    filterWithinWindow<T>(items: readonly DatedEntity<T>[], nowYMD: string): readonly DatedEntity<T>[] {
      const kept: DatedEntity<T>[] = [];
      for (const item of items) {
        if (policy.isWithinWindow(item.dateYMD, nowYMD)) kept.push(item);
      }
      return kept;
    },

    pruneOutsideWindow<T>(items: readonly DatedEntity<T>[], nowYMD: string): PruneResult<DatedEntity<T>> {
      const kept: DatedEntity<T>[] = [];
      const removed: DatedEntity<T>[] = [];
      for (const item of items) {
        if (policy.isWithinWindow(item.dateYMD, nowYMD)) kept.push(item);
        else removed.push(item);
      }
      const result: PruneResult<DatedEntity<T>> = {
        kept: kept,
        removed: removed,
        changed: removed.length > 0,
      };
      return result;
    },

    isIdempotent(prev: readonly DatedEntity<unknown>[], next: readonly DatedEntity<unknown>[], nowYMD: string): boolean {
      const pruned = policy.pruneOutsideWindow<unknown>(prev, nowYMD);
      if (pruned.changed) return false;
      if (pruned.kept.length !== next.length) return false;
      for (let i: number = 0; i < pruned.kept.length; i++) {
        if (pruned.kept[i].dateYMD !== next[i].dateYMD) return false;
      }
      return true;
    },
  };
  return policy;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface RetentionService {
  pruneGuestPartition(nowYMD: string): Promise<Result<PruneReport>>;
  loadGuestSnapshot(nowYMD: string): Promise<Result<GuestSnapshot>>;
  hasGuestProgress(nowYMD: string): Promise<Result<boolean>>;
  markFirstStudyDate(nowYMD: string): Promise<Result<GuestPromptState>>;
  promptState(): Promise<Result<GuestPromptState>>;
  savePromptState(state: GuestPromptState): Promise<Result<boolean>>;
}

export interface RetentionDeps {
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly repository: ScopedRepository;
  readonly policy: GuestRetentionPolicy;
  readonly clock: Clock;
}

/** Create the retention service. */
export function createRetentionService(deps: RetentionDeps): RetentionService {
  const storage: StorageService = deps.storage;
  const codec: JsonCodec = deps.codec;
  const repository: ScopedRepository = deps.repository;
  const policy: GuestRetentionPolicy = deps.policy;
  const clock: Clock = deps.clock;
  const guestPartition: string = partitionOf(DEFAULT_GUEST_SESSION);

  async function readPromptState(): Promise<GuestPromptState> {
    const r = await storage.get(promptStateKey());
    if (!r.ok || r.value === undefined) return defaultPromptState();
    const decoded = codec.decode<GuestPromptState>(r.value, isPromptStateLike);
    return decoded.ok && decoded.value !== undefined ? decoded.value : defaultPromptState();
  }

  async function allGuestChatMessages(): Promise<readonly ChatMessage[]> {
    const keysR = await storage.keys(chatPrefix(guestPartition));
    if (!keysR.ok || keysR.value === undefined) return [];
    const out: ChatMessage[] = [];
    for (const key of keysR.value) {
      const gr = await storage.get(key);
      if (!gr.ok || gr.value === undefined) continue;
      const decoded = codec.decode<ChatMessage>(gr.value, isChatMessageLike);
      if (decoded.ok && decoded.value !== undefined) out.push(decoded.value);
    }
    return out;
  }

  const service: RetentionService = {
    async pruneGuestPartition(nowYMD: string): Promise<Result<PruneReport>> {
      const window: DateWindow = policy.windowOf(nowYMD);
      const within = (ymd: string): boolean => policy.isWithinWindow(ymd, nowYMD);

      const indexR = await repository.dateIndex(guestPartition);
      const index: readonly string[] = indexR.ok && indexR.value !== undefined ? indexR.value : [];
      const outsideDates: string[] = [];
      for (const d of index) if (!within(d)) outsideDates.push(d);

      const wordsR = await repository.loadWords(DEFAULT_GUEST_SESSION);
      const recordsR = await repository.loadRecords(DEFAULT_GUEST_SESSION);
      const checkInsR = await repository.loadCheckIns(DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD);
      const chats: readonly ChatMessage[] = await allGuestChatMessages();

      // NON-DESTRUCTIVE window eviction.
      //
      // The active `guest:index:dates` is rebuilt to contain ONLY the 7-day
      // window, so cold-start cleanup is observable, deterministic and
      // idempotent. The underlying guest entity keys are intentionally NOT
      // deleted: every read path (`repository.loadGuestSnapshot`,
      // `StatsService`, `WordBookService`) already filters by ENTITY DATE, so
      // outside-window bytes are inert and never leak into a snapshot. Keeping
      // them is required by two hard rules:
      //   1. `MigrationService.merge()` must count them in
      //      `skippedOutsideWindowCount` and never write them back. If a cold
      //      start destroyed them first, that counter could never be > 0 in a
      //      real user flow (the app bootstraps every day).
      //   2. "游客分区数据一律不删除" (Q12 / 解释 A) — after a merge the guest
      //      partition must remain byte-for-byte readable.
      // `removedKeys` therefore lists the keys EVICTED FROM THE ACTIVE WINDOW,
      // not keys erased from storage.
      const evictedKeys: string[] = [];
      if (outsideDates.length > 0) {
        const keySet: Set<string> = new Set<string>();
        for (const d of outsideDates) keySet.add(checkInKey(guestPartition, d));
        for (const w of wordsR.value ?? []) {
          if (w.createdAtYMD !== '' && !within(w.createdAtYMD)) keySet.add(wordsKey(guestPartition, w.id));
        }
        for (const r of recordsR.value ?? []) {
          if (!within(r.updatedAtYMD)) keySet.add(recordKey(guestPartition, r.wordId));
        }
        for (const c of checkInsR.value ?? []) {
          if (!within(c.dateYMD)) keySet.add(checkInKey(guestPartition, c.dateYMD));
        }
        for (const m of chats) {
          const messageYMD: string = clock.ymdFromMs(m.createdAtMs);
          if (!within(messageYMD)) keySet.add(chatKey(guestPartition, m.sessionId, m.id));
        }
        for (const k of keySet) evictedKeys.push(k);
        evictedKeys.sort();
      }

      const keptDates: string[] = [];
      for (const d of index) if (within(d)) keptDates.push(d);
      const rebuilt = await repository.rebuildDateIndex(guestPartition, keptDates);
      if (!rebuilt.ok) return fail<PruneReport>(ErrorCode.STORAGE_WRITE_FAILED, 'guest date index rebuild failed');

      const report: PruneReport = {
        window: window,
        removedKeys: evictedKeys,
        removedCount: evictedKeys.length,
        keptCount: keptDates.length,
        idempotent: evictedKeys.length === 0,
        rebuiltIndex: true,
      };
      return ok<PruneReport>(report);
    },

    async loadGuestSnapshot(nowYMD: string): Promise<Result<GuestSnapshot>> {
      // NOTE: no pruning here — outside-window entries must remain countable by
      // MigrationService.merge (`skippedOutsideWindowCount`), never written back.
      return repository.loadGuestSnapshot(nowYMD);
    },

    async hasGuestProgress(nowYMD: string): Promise<Result<boolean>> {
      const snapshotR = await repository.loadGuestSnapshot(nowYMD);
      if (!snapshotR.ok || snapshotR.value === undefined) {
        return fail<boolean>(snapshotR.error !== undefined ? snapshotR.error.code : ErrorCode.STORAGE_READ_FAILED, 'snapshot failed');
      }
      const s: GuestSnapshot = snapshotR.value;
      const exists: boolean = s.words.length > 0 || s.records.length > 0
        || s.checkIns.length > 0 || s.chatMessages.length > 0;
      return ok<boolean>(exists);
    },

    async markFirstStudyDate(nowYMD: string): Promise<Result<GuestPromptState>> {
      const current: GuestPromptState = await readPromptState();
      if (current.firstStudyYMD !== '') return ok<GuestPromptState>(current);
      if (!isYMD(nowYMD)) return fail<GuestPromptState>(ErrorCode.INVALID_DATE, 'invalid first study date');
      const next: GuestPromptState = {
        firstStudyYMD: nowYMD,
        neverPrompt: current.neverPrompt,
        lastPromptDate: current.lastPromptDate,
        lastDecisionYMD: current.lastDecisionYMD,
      };
      const w = await storage.set(promptStateKey(), codec.encode<GuestPromptState>(next));
      if (!w.ok) return fail<GuestPromptState>(ErrorCode.STORAGE_WRITE_FAILED, 'prompt state write failed');
      return ok<GuestPromptState>(next);
    },

    async promptState(): Promise<Result<GuestPromptState>> {
      return ok<GuestPromptState>(await readPromptState());
    },

    async savePromptState(state: GuestPromptState): Promise<Result<boolean>> {
      const w = await storage.set(promptStateKey(), codec.encode<GuestPromptState>(state));
      if (!w.ok) return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'prompt state write failed');
      return ok<boolean>(true);
    },
  };
  return service;
}
