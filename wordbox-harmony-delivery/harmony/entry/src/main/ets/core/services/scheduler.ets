// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/scheduler.ts

/**
 * Ebbinghaus SM-2 scheduler — pure functions, immutable updates.
 * The second successful-review interval comes from `SM2_SECOND_INTERVAL_DAYS`
 * (delivery-director ruling = 6, classic SM-2). With EF held at 2.5 the
 * interval sequence is 1 → 6 → 15 → 38 (→ Mastered).
 */
import {
  StudyRecord, Word, WordStatus, DailyQueue, DateWindow,
} from '../models/types';
import {
  SM2_INITIAL_EF, SM2_MIN_EF, SM2_QUALITY_PASS, SM2_FIRST_INTERVAL_DAYS,
  SM2_SECOND_INTERVAL_DAYS, SM2_MASTERED_INTERVAL_DAYS, SM2_RELEARN_GAP_DAYS,
  SM2_GAP_EF_PENALTY, ALL_SCENES,
} from '../models/constants';
import { addDays, diffDays, compareYMD, windowFrom } from '../utils/date';

export interface EbbinghausScheduler {
  createRecord(wordId: string, todayYMD: string): StudyRecord;
  review(record: StudyRecord, quality: number, todayYMD: string): StudyRecord;
  isDue(record: StudyRecord, todayYMD: string): boolean;
  rebaseAfterGap(record: StudyRecord, todayYMD: string): StudyRecord;
  statusOf(intervalDays: number, lapses: number, relearn: boolean): WordStatus;
  buildDailyQueue(words: readonly Word[], records: readonly StudyRecord[], todayYMD: string, newCap: number): DailyQueue;
  progressRank(record: StudyRecord): number;
}

function statusRank(status: WordStatus): number {
  switch (status) {
    case WordStatus.Mastered: return 4;
    case WordStatus.Learning: return 3;
    case WordStatus.Relearning: return 2;
    case WordStatus.New: return 1;
    default: return 1;
  }
}

/** Create the canonical pure-function scheduler. */
export function createEbbinghausScheduler(): EbbinghausScheduler {
  const scheduler: EbbinghausScheduler = {
    createRecord(wordId: string, todayYMD: string): StudyRecord {
      const record: StudyRecord = {
        wordId: wordId,
        ef: SM2_INITIAL_EF,
        repetitions: 0,
        intervalDays: 0,
        dueYMD: todayYMD,
        lastReviewedYMD: '',
        lapses: 0,
        status: WordStatus.New,
        totalReviews: 0,
        correctReviews: 0,
        createdAtYMD: todayYMD,
        updatedAtYMD: todayYMD,
      };
      return record;
    },

    review(record: StudyRecord, quality: number, todayYMD: string): StudyRecord {
      // Invalid quality: return the input object unchanged (no mutation, no state drift).
      if (!Number.isInteger(quality) || quality < 0 || quality > 5) return record;
      const q: number = quality;
      const delta: number = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
      const ef: number = Math.max(SM2_MIN_EF, record.ef + delta);
      const totalReviews: number = record.totalReviews + 1;
      const correctReviews: number = record.correctReviews + (q >= SM2_QUALITY_PASS ? 1 : 0);

      let repetitions: number;
      let intervalDays: number;
      let lapses: number;
      let status: WordStatus;
      if (q < SM2_QUALITY_PASS) {
        repetitions = 0;
        intervalDays = SM2_FIRST_INTERVAL_DAYS;
        lapses = record.lapses + 1;
        status = WordStatus.Relearning;
      } else {
        repetitions = record.repetitions + 1;
        lapses = record.lapses;
        if (repetitions === 1) intervalDays = SM2_FIRST_INTERVAL_DAYS;
        else if (repetitions === 2) intervalDays = SM2_SECOND_INTERVAL_DAYS;
        else intervalDays = Math.max(1, Math.round(record.intervalDays * ef));
        status = intervalDays >= SM2_MASTERED_INTERVAL_DAYS ? WordStatus.Mastered : WordStatus.Learning;
      }
      const dueYMD: string = addDays(todayYMD, intervalDays);
      // Return a brand-new object; `updatedAtYMD` is the guest-window judgement day.
      const next: StudyRecord = {
        wordId: record.wordId,
        ef: ef,
        repetitions: repetitions,
        intervalDays: intervalDays,
        dueYMD: dueYMD,
        lastReviewedYMD: todayYMD,
        lapses: lapses,
        status: status,
        totalReviews: totalReviews,
        correctReviews: correctReviews,
        createdAtYMD: record.createdAtYMD,
        updatedAtYMD: todayYMD,
      };
      return next;
    },

    isDue(record: StudyRecord, todayYMD: string): boolean {
      return compareYMD(record.dueYMD, todayYMD) <= 0 && record.status !== WordStatus.Mastered;
    },

    rebaseAfterGap(record: StudyRecord, todayYMD: string): StudyRecord {
      if (record.lastReviewedYMD === '') return record;
      const gap: number = diffDays(record.lastReviewedYMD, todayYMD);
      if (gap <= SM2_RELEARN_GAP_DAYS) return record;
      const next: StudyRecord = {
        wordId: record.wordId,
        ef: Math.max(SM2_MIN_EF, record.ef - SM2_GAP_EF_PENALTY),
        repetitions: 0,
        intervalDays: SM2_FIRST_INTERVAL_DAYS,
        dueYMD: todayYMD,
        lastReviewedYMD: record.lastReviewedYMD,
        lapses: record.lapses,
        status: WordStatus.Relearning,
        totalReviews: record.totalReviews,
        correctReviews: record.correctReviews,
        createdAtYMD: record.createdAtYMD,
        updatedAtYMD: todayYMD,
      };
      return next;
    },

    statusOf(intervalDays: number, lapses: number, relearn: boolean): WordStatus {
      if (relearn) return WordStatus.Relearning;
      if (intervalDays >= SM2_MASTERED_INTERVAL_DAYS) return WordStatus.Mastered;
      if (intervalDays <= 0) return WordStatus.New;
      if (lapses < 0) return WordStatus.Relearning;
      return WordStatus.Learning;
    },

    progressRank(record: StudyRecord): number {
      return statusRank(record.status) * 1e9
        + record.repetitions * 1e7
        + record.intervalDays * 1e5
        + Math.round(record.ef * 1000) * 10
        + record.totalReviews;
    },

    buildDailyQueue(words: readonly Word[], records: readonly StudyRecord[], todayYMD: string, newCap: number): DailyQueue {
      const cap: number = Number.isFinite(newCap) && newCap > 0 ? Math.floor(newCap) : 0;
      const known: Set<string> = new Set<string>();
      for (const record of records) known.add(record.wordId);

      const relearnWordIds: string[] = [];
      const reviewCandidates: { readonly wordId: string; readonly dueYMD: string }[] = [];
      for (const record of records) {
        const gap: number = record.lastReviewedYMD === '' ? 0 : diffDays(record.lastReviewedYMD, todayYMD);
        if (record.lastReviewedYMD !== '' && gap > SM2_RELEARN_GAP_DAYS) {
          relearnWordIds.push(record.wordId);
        } else if (scheduler.isDue(record, todayYMD)) {
          reviewCandidates.push({ wordId: record.wordId, dueYMD: record.dueYMD });
        }
      }
      reviewCandidates.sort((a, b) => compareYMD(a.dueYMD, b.dueYMD));
      const reviewWordIds: string[] = reviewCandidates.map((c) => c.wordId);

      // New words: seed words with no StudyRecord, walked in ALL_SCENES order.
      const ordered: Word[] = [];
      for (const scene of ALL_SCENES) {
        for (const word of words) {
          if (word.scene === scene) ordered.push(word);
        }
      }
      const newWordIds: string[] = [];
      for (const word of ordered) {
        if (newWordIds.length >= cap) break;
        if (!known.has(word.id)) newWordIds.push(word.id);
      }

      const queue: DailyQueue = {
        dateYMD: todayYMD,
        newWordIds: newWordIds,
        reviewWordIds: reviewWordIds,
        relearnWordIds: relearnWordIds,
        total: newWordIds.length + reviewWordIds.length + relearnWordIds.length,
      };
      return queue;
    },
  };
  return scheduler;
}

/** Convenience: the 7-day retention window from the same pure date helpers. */
export function queueWindow(todayYMD: string, days: number): DateWindow {
  return windowFrom(todayYMD, days);
}
