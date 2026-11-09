/**
 * Guest → account progress merge (F-21 / Q11 / Q12).
 *
 * Pure conflict resolver (`ProgressMergeService`) + idempotent orchestrator
 * (`MigrationService`). The eight-step order is fixed:
 *   auth → window-filtered snapshot → empty check → ledger → conflict plans →
 *   single atomic batchWrite (+ ledger) → rebuildStreak + recompute → refresh.
 * Outside-window entries are counted but NEVER written back; the guest
 * partition is NEVER deleted (Q12 / interpretation A).
 */
import {
  AccountSession, ChatMessage, CheckIn, ConflictRule, ConflictSource,
  DateWindow, DialogType, GuestSnapshot, MergeChoiceKind, MergeConflict,
  MergeDecision, MergePlan, MergePromptDecision, MergeResult, MergeSkipReason,
  SessionKind, StorageEntry, StudyRecord, Word, WordStatus, WordSource,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD } from '../models/constants';
import { compareYMD, isYMD } from '../utils/date';
import { fnv1a } from '../utils/id';
import { JsonValue, sortBy, stableStringify } from '../utils/collection';
import { JsonCodec, isChatMessageLike, isMergeDecisionLike } from '../ports/codec';
import { StorageService, Clock } from '../ports/ports';
import {
  partitionOf, wordsKey, recordKey, checkInKey, chatKey, datesIndexKey,
  chatPrefix, mergeDecisionKey, mergeLedgerKey, mergeMarkerKey,
} from '../ports/keys';
import { EbbinghausScheduler } from './scheduler';
import { ScopedRepository } from './repository';
import { AccountService } from './account';
import { GuestRetentionPolicy, RetentionService } from './retention';
import { CheckInService } from './checkin';
import { StatsService } from './stats';
import { buildPromptSummary, emptyPromptSummary } from './loginPrompt';

// ---------------------------------------------------------------------------
// Pure conflict resolver
// ---------------------------------------------------------------------------

export interface ProgressMergeService {
  mergeWordLists(accountWords: readonly Word[], guestWords: readonly Word[]): MergePlan<Word>;
  mergeRecords(accountRecords: readonly StudyRecord[], guestRecords: readonly StudyRecord[]): MergePlan<StudyRecord>;
  mergeCheckIns(accountCheckIns: readonly CheckIn[], guestCheckIns: readonly CheckIn[]): MergePlan<CheckIn>;
  computeIdempotencyKey(snapshot: GuestSnapshot): string;
}

/** Normalized dedup key: seed words keep their id, user/chat words normalize by text+scene. */
function wordKeyOf(w: Word): string {
  if (w.source === WordSource.Seed) return w.id;
  return w.text.toLowerCase() + '|' + w.scene;
}

/** Canonical, key-sorted snapshot used for the idempotency ledger key. */
function snapshotPayload(s: GuestSnapshot): JsonValue {
  const words: JsonValue[] = [];
  for (const w of sortBy(s.words, (x) => x.id)) {
    words.push({ id: w.id, text: w.text, scene: w.scene, source: w.source, createdAtYMD: w.createdAtYMD });
  }
  const records: JsonValue[] = [];
  for (const r of sortBy(s.records, (x) => x.wordId)) {
    records.push({
      wordId: r.wordId, ef: r.ef, repetitions: r.repetitions, intervalDays: r.intervalDays,
      dueYMD: r.dueYMD, status: r.status, lapses: r.lapses,
      totalReviews: r.totalReviews, correctReviews: r.correctReviews, updatedAtYMD: r.updatedAtYMD,
    });
  }
  const checkIns: JsonValue[] = [];
  for (const c of sortBy(s.checkIns, (x) => x.dateYMD)) {
    checkIns.push({
      dateYMD: c.dateYMD, activeSeconds: c.activeSeconds, checkedIn: c.checkedIn,
      streakAfter: c.streakAfter, checkedInAtMs: c.checkedInAtMs,
    });
  }
  const chats: JsonValue[] = [];
  for (const m of sortBy(s.chatMessages, (x) => x.id)) {
    chats.push({ id: m.id, sessionId: m.sessionId, content: m.content, quality: m.quality, createdAtMs: m.createdAtMs });
  }
  const payload: Readonly<Record<string, JsonValue>> = {
    words: words, records: records, checkIns: checkIns, chats: chats,
  };
  return payload;
}

/** Create the pure merge planner. */
export function createProgressMergeService(scheduler: EbbinghausScheduler): ProgressMergeService {
  const service: ProgressMergeService = {
    mergeWordLists(accountWords: readonly Word[], guestWords: readonly Word[]): MergePlan<Word> {
      const accountKeys: Set<string> = new Set<string>();
      for (const w of accountWords) accountKeys.add(wordKeyOf(w));
      const toWrite: Word[] = [];
      const conflicts: MergeConflict[] = [];
      const seenGuest: Set<string> = new Set<string>();
      let skipped: number = 0;
      for (const w of guestWords) {
        const key: string = wordKeyOf(w);
        if (seenGuest.has(key)) {
          skipped = skipped + 1;
          continue; // dedup within the guest list itself
        }
        seenGuest.add(key);
        if (accountKeys.has(key)) {
          conflicts.push({ key: key, rule: ConflictRule.WORD_DEDUP, chosen: ConflictSource.ACCOUNT });
          skipped = skipped + 1;
        } else {
          toWrite.push(w);
        }
      }
      const plan: MergePlan<Word> = { toWrite: toWrite, conflicts: conflicts, skipped: skipped };
      return plan;
    },

    mergeRecords(accountRecords: readonly StudyRecord[], guestRecords: readonly StudyRecord[]): MergePlan<StudyRecord> {
      const byWord: Map<string, StudyRecord> = new Map<string, StudyRecord>();
      for (const r of accountRecords) byWord.set(r.wordId, r);
      const toWrite: StudyRecord[] = [];
      const conflicts: MergeConflict[] = [];
      for (const g of guestRecords) {
        const a: StudyRecord | undefined = byWord.get(g.wordId);
        if (a === undefined) {
          toWrite.push(g);
          continue;
        }
        const rankG: number = scheduler.progressRank(g);
        const rankA: number = scheduler.progressRank(a);
        let chosen: StudyRecord = a;
        if (rankG > rankA || (rankG === rankA && compareYMD(g.updatedAtYMD, a.updatedAtYMD) > 0)) chosen = g;
        // Hard rule: never regress away from Mastered.
        if (a.status === WordStatus.Mastered && chosen.status !== WordStatus.Mastered) chosen = a;
        const merged: StudyRecord = {
          wordId: chosen.wordId,
          ef: chosen.ef,
          repetitions: chosen.repetitions,
          intervalDays: chosen.intervalDays,
          dueYMD: chosen.dueYMD,
          lastReviewedYMD: chosen.lastReviewedYMD,
          lapses: Math.min(a.lapses, g.lapses),
          status: chosen.status,
          totalReviews: Math.max(a.totalReviews, g.totalReviews),
          correctReviews: Math.max(a.correctReviews, g.correctReviews),
          createdAtYMD: chosen.createdAtYMD,
          updatedAtYMD: compareYMD(a.updatedAtYMD, g.updatedAtYMD) >= 0 ? a.updatedAtYMD : g.updatedAtYMD,
        };
        toWrite.push(merged);
        const source: ConflictSource = chosen === a
          ? ConflictSource.ACCOUNT
          : (chosen === g ? ConflictSource.GUEST : ConflictSource.BLENDED);
        conflicts.push({ key: g.wordId, rule: ConflictRule.RECORD_NO_REGRESSION, chosen: source });
      }
      const plan: MergePlan<StudyRecord> = { toWrite: toWrite, conflicts: conflicts, skipped: 0 };
      return plan;
    },

    mergeCheckIns(accountCheckIns: readonly CheckIn[], guestCheckIns: readonly CheckIn[]): MergePlan<CheckIn> {
      const byDate: Map<string, CheckIn> = new Map<string, CheckIn>();
      for (const c of accountCheckIns) byDate.set(c.dateYMD, c);
      const toWrite: CheckIn[] = [];
      const conflicts: MergeConflict[] = [];
      for (const g of guestCheckIns) {
        const a: CheckIn | undefined = byDate.get(g.dateYMD);
        if (a === undefined) {
          toWrite.push(g);
          continue;
        }
        const checkedInAtMs: number = a.checkedInAtMs === 0 ? g.checkedInAtMs
          : (g.checkedInAtMs === 0 ? a.checkedInAtMs : Math.min(a.checkedInAtMs, g.checkedInAtMs));
        const merged: CheckIn = {
          dateYMD: g.dateYMD,
          activeSeconds: Math.max(a.activeSeconds, g.activeSeconds), // NEVER summed
          goalSeconds: Math.max(a.goalSeconds, g.goalSeconds),
          checkedIn: a.checkedIn || g.checkedIn,
          checkedInAtMs: checkedInAtMs,
          streakAfter: Math.max(a.streakAfter, g.streakAfter),
          newWords: Math.max(a.newWords, g.newWords),
          reviewedWords: Math.max(a.reviewedWords, g.reviewedWords),
        };
        toWrite.push(merged);
        conflicts.push({ key: g.dateYMD, rule: ConflictRule.SAME_DAY_CHECKIN, chosen: ConflictSource.BLENDED });
      }
      const plan: MergePlan<CheckIn> = { toWrite: toWrite, conflicts: conflicts, skipped: 0 };
      return plan;
    },

    computeIdempotencyKey(snapshot: GuestSnapshot): string {
      return fnv1a(stableStringify(snapshotPayload(snapshot)));
    },
  };
  return service;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface MigrationService {
  detect(uid: string, nowYMD: string): Promise<Result<MergePromptDecision>>;
  recordDecision(uid: string, choice: MergeChoiceKind, nowYMD: string, clock: Clock): Promise<Result<MergeDecision>>;
  merge(uid: string, nowYMD: string, clock: Clock): Promise<Result<MergeResult>>;
  hasDecision(uid: string): Promise<Result<boolean>>;
}

export interface MigrationDeps {
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly repository: ScopedRepository;
  readonly account: AccountService;
  readonly retention: RetentionService;
  readonly retentionPolicy: GuestRetentionPolicy;
  readonly checkIn: CheckInService;
  readonly stats: StatsService;
  readonly mergePlanner: ProgressMergeService;
}

function emptyMergeResult(reason: MergeSkipReason, window: DateWindow, skipped: number): MergeResult {
  const result: MergeResult = {
    performed: false,
    reason: reason,
    windowFromYMD: window.fromYMD,
    windowToYMD: window.toYMD,
    mergedWordIds: [],
    mergedRecordWordIds: [],
    mergedCheckInDates: [],
    skippedOutsideWindowCount: skipped,
    conflictResolvedCount: 0,
    recomputed: false,
    after: undefined,
    idempotentHit: false,
  };
  return result;
}

function snapshotHasData(s: GuestSnapshot | undefined): boolean {
  if (s === undefined) return false;
  return s.words.length > 0 || s.records.length > 0 || s.checkIns.length > 0 || s.chatMessages.length > 0;
}

/** Create the idempotent migration service. */
export function createMigrationService(deps: MigrationDeps): MigrationService {
  const storage: StorageService = deps.storage;
  const codec: JsonCodec = deps.codec;
  const repository: ScopedRepository = deps.repository;
  const account: AccountService = deps.account;
  const retention: RetentionService = deps.retention;
  const retentionPolicy: GuestRetentionPolicy = deps.retentionPolicy;
  const checkIn: CheckInService = deps.checkIn;
  const stats: StatsService = deps.stats;
  const mergePlanner: ProgressMergeService = deps.mergePlanner;
  const guestPartition: string = partitionOf(DEFAULT_GUEST_SESSION);

  async function explicitDecision(uid: string): Promise<boolean> {
    const r = await storage.get(mergeDecisionKey(uid));
    if (!r.ok || r.value === undefined) return false;
    const decoded = codec.decode<MergeDecision>(r.value, isMergeDecisionLike);
    if (!decoded.ok || decoded.value === undefined) return false;
    return decoded.value.choice !== MergeChoiceKind.Defer;
  }

  /** Count raw guest entities outside the window (they are never written back). */
  async function countOutsideWindow(nowYMD: string, clock: Clock): Promise<number> {
    const window: DateWindow = retentionPolicy.windowOf(nowYMD);
    const within = (ymd: string): boolean =>
      isYMD(ymd) && compareYMD(ymd, window.fromYMD) >= 0 && compareYMD(ymd, window.toYMD) <= 0;
    let count: number = 0;
    const wordsR = await repository.loadWords(DEFAULT_GUEST_SESSION);
    for (const w of (wordsR.ok && wordsR.value !== undefined ? wordsR.value : [])) {
      if (w.createdAtYMD !== '' && !within(w.createdAtYMD)) count = count + 1;
    }
    const recordsR = await repository.loadRecords(DEFAULT_GUEST_SESSION);
    for (const r of (recordsR.ok && recordsR.value !== undefined ? recordsR.value : [])) {
      if (!within(r.updatedAtYMD)) count = count + 1;
    }
    const checkInsR = await repository.loadCheckIns(DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD);
    for (const c of (checkInsR.ok && checkInsR.value !== undefined ? checkInsR.value : [])) {
      if (!within(c.dateYMD)) count = count + 1;
    }
    const chatKeysR = await storage.keys(chatPrefix(guestPartition));
    if (chatKeysR.ok && chatKeysR.value !== undefined) {
      for (const key of chatKeysR.value) {
        const gr = await storage.get(key);
        if (!gr.ok || gr.value === undefined) continue;
        const decoded = codec.decode<ChatMessage>(gr.value, isChatMessageLike);
        if (decoded.ok && decoded.value !== undefined && !within(clock.ymdFromMs(decoded.value.createdAtMs))) {
          count = count + 1;
        }
      }
    }
    return count;
  }

  const service: MigrationService = {
    async hasDecision(uid: string): Promise<Result<boolean>> {
      return ok<boolean>(await explicitDecision(uid));
    },

    async detect(uid: string, nowYMD: string): Promise<Result<MergePromptDecision>> {
      const decisionMade: boolean = await explicitDecision(uid);
      const snapR = await retention.loadGuestSnapshot(nowYMD);
      const snapshot: GuestSnapshot | undefined = snapR.ok && snapR.value !== undefined ? snapR.value : undefined;
      const hasData: boolean = snapshotHasData(snapshot);
      const window: DateWindow = retentionPolicy.windowOf(nowYMD);
      const summary = snapshot !== undefined ? buildPromptSummary(snapshot) : emptyPromptSummary(window);
      const shouldShow: boolean = hasData && !decisionMade;
      let reason: MergeSkipReason = MergeSkipReason.PERFORMED;
      if (decisionMade) reason = MergeSkipReason.DECISION_KEEP_ACCOUNT;
      else if (!hasData) reason = MergeSkipReason.NO_GUEST_DATA;
      const d: MergePromptDecision = {
        shouldShow: shouldShow,
        dialogType: DialogType.MergeChoice,
        guestSnapshot: shouldShow ? snapshot : undefined,
        summary: summary,
        reason: reason,
      };
      return ok<MergePromptDecision>(d);
    },

    async recordDecision(uid: string, choice: MergeChoiceKind, nowYMD: string, clock: Clock): Promise<Result<MergeDecision>> {
      const snapR = await retention.loadGuestSnapshot(nowYMD);
      const snapshot: GuestSnapshot | undefined = snapR.ok && snapR.value !== undefined ? snapR.value : undefined;
      const key: string = snapshot !== undefined
        ? mergePlanner.computeIdempotencyKey(snapshot)
        : fnv1a('empty|' + uid + '|' + nowYMD);
      const decision: MergeDecision = {
        uid: uid,
        choice: choice,
        decidedAtMs: clock.nowMs(),
        idempotencyKey: key,
      };
      if (choice !== MergeChoiceKind.Defer) {
        const w = await storage.set(mergeDecisionKey(uid), codec.encode<MergeDecision>(decision));
        if (!w.ok) return fail<MergeDecision>(ErrorCode.STORAGE_WRITE_FAILED, 'merge decision write failed');
        const stateR = await retention.promptState();
        if (stateR.ok && stateR.value !== undefined) {
          const state = stateR.value;
          await retention.savePromptState({
            firstStudyYMD: state.firstStudyYMD,
            neverPrompt: state.neverPrompt,
            lastPromptDate: state.lastPromptDate,
            lastDecisionYMD: nowYMD,
          });
        }
      }
      return ok<MergeDecision>(decision);
    },

    async merge(uid: string, nowYMD: string, clock: Clock): Promise<Result<MergeResult>> {
      const window: DateWindow = retentionPolicy.windowOf(nowYMD);

      // Step 1 — authentication guard.
      const cur = await account.current();
      const session: AccountSession | undefined = cur.ok && cur.value !== undefined ? cur.value : undefined;
      if (session === undefined || session.kind !== SessionKind.Authenticated) {
        return ok<MergeResult>(emptyMergeResult(MergeSkipReason.NOT_AUTHENTICATED, window, 0));
      }
      const userPartition: string = partitionOf(session);

      // Step 2 — window-filtered guest snapshot (never deletes guest data).
      const snapR = await retention.loadGuestSnapshot(nowYMD);
      const snapshot: GuestSnapshot | undefined = snapR.ok && snapR.value !== undefined ? snapR.value : undefined;
      const skippedOutsideWindowCount: number = await countOutsideWindow(nowYMD, clock);

      // Step 3 — empty window → zero writes.
      if (snapshot === undefined
        || (snapshot.words.length === 0 && snapshot.records.length === 0
          && snapshot.checkIns.length === 0 && snapshot.chatMessages.length === 0)) {
        const reason: MergeSkipReason = skippedOutsideWindowCount > 0
          ? MergeSkipReason.OUTSIDE_WINDOW_ONLY : MergeSkipReason.NO_GUEST_DATA;
        return ok<MergeResult>(emptyMergeResult(reason, window, skippedOutsideWindowCount));
      }
      const s: GuestSnapshot = snapshot;

      // Step 4 — idempotency ledger.
      const key: string = mergePlanner.computeIdempotencyKey(s);
      const ledger = await storage.get(mergeLedgerKey(uid, key));
      if (ledger.ok && ledger.value !== undefined) {
        const hit: MergeResult = {
          performed: false,
          reason: MergeSkipReason.ALREADY_MERGED,
          windowFromYMD: window.fromYMD,
          windowToYMD: window.toYMD,
          mergedWordIds: [],
          mergedRecordWordIds: [],
          mergedCheckInDates: [],
          skippedOutsideWindowCount: skippedOutsideWindowCount,
          conflictResolvedCount: 0,
          recomputed: false,
          after: undefined,
          idempotentHit: true,
        };
        return ok<MergeResult>(hit);
      }

      // Step 5 — load account data and resolve conflicts.
      const accountWordsR = await repository.loadWords(session);
      const accountRecordsR = await repository.loadRecords(session);
      const accountCheckInsR = await repository.loadCheckIns(session, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD);
      const accountWords: readonly Word[] = accountWordsR.ok && accountWordsR.value !== undefined ? accountWordsR.value : [];
      const accountRecords: readonly StudyRecord[] = accountRecordsR.ok && accountRecordsR.value !== undefined ? accountRecordsR.value : [];
      const accountCheckIns: readonly CheckIn[] = accountCheckInsR.ok && accountCheckInsR.value !== undefined ? accountCheckInsR.value : [];

      const wordPlan: MergePlan<Word> = mergePlanner.mergeWordLists(accountWords, s.words);
      const recordPlan: MergePlan<StudyRecord> = mergePlanner.mergeRecords(accountRecords, s.records);
      const checkInPlan: MergePlan<CheckIn> = mergePlanner.mergeCheckIns(accountCheckIns, s.checkIns);

      // Step 6 — ONE atomic batch write to the user partition + ledger.
      const entries: StorageEntry[] = [];
      const mergedDates: Set<string> = new Set<string>();
      for (const w of wordPlan.toWrite) {
        entries.push({ key: wordsKey(userPartition, w.id), value: codec.encode<Word>(w) });
        if (w.createdAtYMD !== '' && isYMD(w.createdAtYMD)) mergedDates.add(w.createdAtYMD);
      }
      for (const r of recordPlan.toWrite) {
        entries.push({ key: recordKey(userPartition, r.wordId), value: codec.encode<StudyRecord>(r) });
        if (isYMD(r.updatedAtYMD)) mergedDates.add(r.updatedAtYMD);
      }
      for (const c of checkInPlan.toWrite) {
        entries.push({ key: checkInKey(userPartition, c.dateYMD), value: codec.encode<CheckIn>(c) });
        if (isYMD(c.dateYMD)) mergedDates.add(c.dateYMD);
      }
      for (const m of s.chatMessages) {
        entries.push({ key: chatKey(userPartition, m.sessionId, m.id), value: codec.encode<ChatMessage>(m) });
        const d: string = clock.ymdFromMs(m.createdAtMs);
        if (isYMD(d)) mergedDates.add(d);
      }
      const existingIndexR = await repository.dateIndex(userPartition);
      if (existingIndexR.ok && existingIndexR.value !== undefined) {
        for (const d of existingIndexR.value) if (isYMD(d)) mergedDates.add(d);
      }
      const sortedDates: string[] = [];
      for (const d of mergedDates) sortedDates.push(d);
      sortedDates.sort();
      entries.push({ key: datesIndexKey(userPartition), value: codec.encode<readonly string[]>(sortedDates) });
      entries.push({ key: mergeLedgerKey(uid, key), value: codec.encode<Readonly<Record<string, number>>>({ appliedAtMs: clock.nowMs() }) });

      const batch = await repository.batchWrite(userPartition, entries);
      if (!batch.ok) return fail<MergeResult>(ErrorCode.STORAGE_BATCH_PARTIAL, 'merge batch write failed, nothing committed');

      // Guest partition stays intact. Persist a local result marker for 我的 page.
      const mergedWordIds: string[] = [];
      for (const w of wordPlan.toWrite) mergedWordIds.push(w.id);
      const mergedRecordWordIds: string[] = [];
      for (const r of recordPlan.toWrite) mergedRecordWordIds.push(r.wordId);
      const mergedCheckInDates: string[] = [];
      for (const c of checkInPlan.toWrite) mergedCheckInDates.push(c.dateYMD);
      const conflictResolvedCount: number = wordPlan.conflicts.length
        + recordPlan.conflicts.length + checkInPlan.conflicts.length;

      // Step 7 — rebuild streak + full stats recompute.
      await checkIn.rebuildStreak();
      const recomputed = await stats.recomputeAfterMerge(uid, nowYMD);
      const after = recomputed.ok && recomputed.value !== undefined ? recomputed.value : undefined;

      const finalResult: MergeResult = {
        performed: true,
        reason: MergeSkipReason.PERFORMED,
        windowFromYMD: window.fromYMD,
        windowToYMD: window.toYMD,
        mergedWordIds: mergedWordIds,
        mergedRecordWordIds: mergedRecordWordIds,
        mergedCheckInDates: mergedCheckInDates,
        skippedOutsideWindowCount: skippedOutsideWindowCount,
        conflictResolvedCount: conflictResolvedCount,
        recomputed: true,
        after: after,
        idempotentHit: false,
      };
      await storage.set(mergeMarkerKey(), codec.encode<MergeResult>(finalResult));

      // Step 8 — callers refresh home / calendar / stats via the facade.
      return ok<MergeResult>(finalResult);
    },
  };
  return service;
}
