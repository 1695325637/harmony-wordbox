// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/stats.ts

/**
 * `StatsService` — 7/30/90-day aggregation, monthly calendar and post-merge
 * recomputation. The F-20 gate is applied INSIDE `summary` / `calendar`
 * (read layer): for a guest session no progress number is even computed.
 */
import {
  AccountSession, CalendarDay, CalendarMonth, CheckIn, DayState, Gated,
  GateReason, MasteryPoint, SceneMastery, StatsSummary, StatsWindow,
  StudyRecord, WordStatus,
} from '../models/types';
import { Result, ok } from '../models/errors';
import { ALL_SCENES, GATE_UNLOCK_HINT } from '../models/constants';
import { addDays, compareYMD, daysInMonth, monthOf, monthStartYMD, ymdOfMonthDay } from '../utils/date';
import { seedWordsOf, SEED_WORDS } from '../data/seedWords';
import { ScopedRepository } from './repository';
import { ProgressGate } from './progressGate';
import { CheckInService } from './checkin';
import { AccountService, authenticatedSession } from './account';

export interface StatsService {
  summary(windowDays: StatsWindow, asOfYMD: string, session: AccountSession): Promise<Result<Gated<StatsSummary>>>;
  calendar(monthYMD: string, asOfYMD: string, session: AccountSession): Promise<Result<Gated<CalendarMonth>>>;
  recomputeAfterMerge(uid: string, asOfYMD: string): Promise<Result<StatsSummary>>;
}

export interface StatsDeps {
  readonly repository: ScopedRepository;
  readonly gate: ProgressGate;
  readonly checkIn: CheckInService;
  readonly account: AccountService;
}

function gatedBlocked<T>(): Gated<T> {
  const gated: Gated<T> = {
    allowed: false,
    reason: GateReason.Guest,
    data: undefined,
    unlockHint: GATE_UNLOCK_HINT,
  };
  return gated;
}

function isMastered(r: StudyRecord): boolean {
  return r.status === WordStatus.Mastered || r.intervalDays >= 30;
}

/** Create the canonical stats service. */
export function createStatsService(deps: StatsDeps): StatsService {
  const repository: ScopedRepository = deps.repository;
  const gate: ProgressGate = deps.gate;
  const checkIn: CheckInService = deps.checkIn;

  async function computeSummary(windowDays: StatsWindow, asOfYMD: string, session: AccountSession): Promise<StatsSummary> {
    const fromYMD: string = addDays(asOfYMD, -(windowDays - 1));
    const recordsR = await repository.loadRecords(session);
    const checkInsR = await repository.loadCheckIns(session, fromYMD, asOfYMD);
    const records: readonly StudyRecord[] = recordsR.ok && recordsR.value !== undefined ? recordsR.value : [];
    const checkIns: readonly CheckIn[] = checkInsR.ok && checkInsR.value !== undefined ? checkInsR.value : [];

    let masteredWords: number = 0;
    let learningWords: number = 0;
    let totalReviews: number = 0;
    let correctReviews: number = 0;
    let dueTasks: number = 0;
    for (const r of records) {
      if (isMastered(r)) masteredWords = masteredWords + 1;
      else learningWords = learningWords + 1;
      totalReviews = totalReviews + r.totalReviews;
      correctReviews = correctReviews + r.correctReviews;
      if (compareYMD(r.dueYMD, asOfYMD) <= 0 && r.status !== WordStatus.Mastered) dueTasks = dueTasks + 1;
    }
    const reviewCompletionRate: number = dueTasks > 0 ? Math.min(1, correctReviews / dueTasks) : 0;

    let totalActiveSeconds: number = 0;
    let checkedInDays: number = 0;
    for (const c of checkIns) {
      totalActiveSeconds = totalActiveSeconds + c.activeSeconds;
      if (c.checkedIn) checkedInDays = checkedInDays + 1;
    }

    const streakR = await checkIn.streak();
    const currentStreak: number = streakR.ok && streakR.value !== undefined ? streakR.value.current : 0;
    const longestStreak: number = streakR.ok && streakR.value !== undefined ? streakR.value.longest : 0;

    const masteryCurve: MasteryPoint[] = [];
    for (let i: number = 0; i < windowDays; i++) {
      const day: string = addDays(fromYMD, i);
      let masteredAsOf: number = 0;
      for (const r of records) {
        if (isMastered(r) && compareYMD(r.updatedAtYMD, day) <= 0) masteredAsOf = masteredAsOf + 1;
      }
      masteryCurve.push({ dateYMD: day, masteredWords: masteredAsOf });
    }

    const sceneOfWord: Map<string, string> = new Map<string, string>();
    for (const w of SEED_WORDS) sceneOfWord.set(w.id, w.scene);
    const masteredByScene: Map<string, number> = new Map<string, number>();
    for (const scene of ALL_SCENES) masteredByScene.set(scene, 0);
    for (const r of records) {
      if (!isMastered(r)) continue;
      const scene: string | undefined = sceneOfWord.get(r.wordId);
      if (scene !== undefined) {
        const prev: number = masteredByScene.get(scene) ?? 0;
        masteredByScene.set(scene, prev + 1);
      }
    }
    const sceneDistribution: SceneMastery[] = [];
    for (const scene of ALL_SCENES) {
      const total: number = seedWordsOf(scene).length;
      const mastered: number = masteredByScene.get(scene) ?? 0;
      const ratio: number = total > 0 ? mastered / total : 0;
      sceneDistribution.push({ scene: scene, total: total, mastered: mastered, ratio: ratio });
    }

    const summary: StatsSummary = {
      windowDays: windowDays,
      asOfYMD: asOfYMD,
      masteredWords: masteredWords,
      learningWords: learningWords,
      totalReviews: totalReviews,
      correctReviews: correctReviews,
      reviewCompletionRate: reviewCompletionRate,
      totalActiveSeconds: totalActiveSeconds,
      checkedInDays: checkedInDays,
      currentStreak: currentStreak,
      longestStreak: longestStreak,
      masteryCurve: masteryCurve,
      sceneDistribution: sceneDistribution,
    };
    return summary;
  }

  const service: StatsService = {
    async summary(windowDays: StatsWindow, asOfYMD: string, session: AccountSession): Promise<Result<Gated<StatsSummary>>> {
      const required = gate.require(session);
      if (!required.ok) return ok<Gated<StatsSummary>>(gatedBlocked<StatsSummary>());
      const data: StatsSummary = await computeSummary(windowDays, asOfYMD, session);
      return ok<Gated<StatsSummary>>(gate.guard<StatsSummary>(session, data));
    },

    async calendar(monthYMD: string, asOfYMD: string, session: AccountSession): Promise<Result<Gated<CalendarMonth>>> {
      const required = gate.require(session);
      if (!required.ok) return ok<Gated<CalendarMonth>>(gatedBlocked<CalendarMonth>());

      const month: string = monthOf(monthYMD);
      const dim: number = daysInMonth(month);
      const fromYMD: string = monthStartYMD(month);
      const toYMD: string = ymdOfMonthDay(month, dim);
      const r = await repository.loadCheckIns(session, fromYMD, toYMD);
      const byDate: Map<string, CheckIn> = new Map<string, CheckIn>();
      for (const c of (r.ok && r.value !== undefined ? r.value : [])) byDate.set(c.dateYMD, c);

      const days: CalendarDay[] = [];
      let checkedInDays: number = 0;
      let totalActiveSeconds: number = 0;
      let longestStreak: number = 0;
      let run: number = 0;
      let previousChecked: boolean = false;
      for (let d: number = 1; d <= dim; d++) {
        const ymd: string = ymdOfMonthDay(month, d);
        const c: CheckIn | undefined = byDate.get(ymd);
        const isChecked: boolean = c !== undefined && c.checkedIn;
        let state: DayState;
        if (isChecked) state = DayState.Checked;
        else if (compareYMD(ymd, asOfYMD) > 0) state = DayState.Future;
        else state = DayState.Missed;
        const activeSeconds: number = c !== undefined ? c.activeSeconds : 0;
        days.push({ dateYMD: ymd, state: state, activeSeconds: activeSeconds });
        totalActiveSeconds = totalActiveSeconds + activeSeconds;
        if (isChecked) {
          checkedInDays = checkedInDays + 1;
          run = previousChecked ? run + 1 : 1;
          if (run > longestStreak) longestStreak = run;
          previousChecked = true;
        } else {
          run = 0;
          previousChecked = false;
        }
      }

      const data: CalendarMonth = {
        month: month,
        days: days,
        daysInMonth: dim,
        checkedInDays: checkedInDays,
        longestStreak: longestStreak,
        totalActiveSeconds: totalActiveSeconds,
      };
      return ok<Gated<CalendarMonth>>(gate.guard<CalendarMonth>(session, data));
    },

    async recomputeAfterMerge(uid: string, asOfYMD: string): Promise<Result<StatsSummary>> {
      // Internal post-merge recompute runs in authenticated context, so the
      // F-20 gate does not apply here.
      const session: AccountSession = authenticatedSession(uid, uid, 0, 0);
      const data: StatsSummary = await computeSummary(StatsWindow.D30, asOfYMD, session);
      return ok<StatsSummary>(data);
    },
  };
  return service;
}
