/**
 * `CheckInService` — 600s active-interaction accumulator with one check-in
 * per local day. Only foreground Chat UI calls `tickActiveSeconds`; the
 * service itself is platform-agnostic and idempotent. Streak rebuilding reads
 * the same CheckIn data source as F-07/F-08 (zero drift).
 */
import { CheckIn, StreakInfo, AccountSession } from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { Clock } from '../ports/ports';
import { DAILY_GOAL_SECONDS, DEFAULT_GUEST_SESSION, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD } from '../models/constants';
import { addDays, diffDays, compareYMD, isYMD } from '../utils/date';
import { ScopedRepository } from './repository';
import { AccountService } from './account';

export interface CheckInService {
  accumulate(dateYMD: string, deltaSeconds: number, clock: Clock): Promise<Result<CheckIn>>;
  snapshot(dateYMD: string): Promise<Result<CheckIn>>;
  remainingSeconds(dateYMD: string): Promise<Result<number>>;
  streak(): Promise<Result<StreakInfo>>;
  rebuildStreak(): Promise<Result<StreakInfo>>;
  listRange(fromYMD: string, toYMD: string): Promise<Result<readonly CheckIn[]>>;
  writeCheckIn(checkIn: CheckIn): Promise<Result<boolean>>;
}

export interface CheckInDeps {
  readonly repository: ScopedRepository;
  readonly account: AccountService;
  readonly clock: Clock;
}

function emptyCheckIn(dateYMD: string): CheckIn {
  const checkIn: CheckIn = {
    dateYMD: dateYMD,
    activeSeconds: 0,
    goalSeconds: DAILY_GOAL_SECONDS,
    checkedIn: false,
    checkedInAtMs: 0,
    streakAfter: 0,
    newWords: 0,
    reviewedWords: 0,
  };
  return checkIn;
}

/** Create the canonical check-in service. */
export function createCheckInService(deps: CheckInDeps): CheckInService {
  const repository: ScopedRepository = deps.repository;
  const account: AccountService = deps.account;
  const clock: Clock = deps.clock;

  async function session(): Promise<AccountSession> {
    const r = await account.current();
    return r.ok && r.value !== undefined ? r.value : DEFAULT_GUEST_SESSION;
  }

  async function computeStreak(all: readonly CheckIn[]): Promise<StreakInfo> {
    const dates: string[] = [];
    for (const c of all) if (c.checkedIn) dates.push(c.dateYMD);
    dates.sort((a, b) => compareYMD(a, b));
    const unique: string[] = [];
    for (const d of dates) if (unique.length === 0 || unique[unique.length - 1] !== d) unique.push(d);

    let longest: number = 0;
    let run: number = 0;
    let previous: string = '';
    for (const d of unique) {
      if (previous !== '' && diffDays(previous, d) === 1) run = run + 1;
      else run = 1;
      if (run > longest) longest = run;
      previous = d;
    }
    let current: number = run;
    if (unique.length === 0) current = 0;
    else {
      const last: string = unique[unique.length - 1];
      const today: string = clock.todayYMD();
      if (last !== today && last !== addDays(today, -1)) current = 0;
    }
    const info: StreakInfo = { current: current, longest: longest, checkedInDates: unique };
    return info;
  }

  const service: CheckInService = {
    async snapshot(dateYMD: string): Promise<Result<CheckIn>> {
      if (!isYMD(dateYMD)) return fail<CheckIn>(ErrorCode.INVALID_DATE, 'invalid check-in date');
      const s: AccountSession = await session();
      const r = await repository.loadCheckIns(s, dateYMD, dateYMD);
      if (!r.ok || r.value === undefined) {
        return fail<CheckIn>(r.error !== undefined ? r.error.code : ErrorCode.STORAGE_READ_FAILED, 'check-in read failed');
      }
      if (r.value.length > 0) return ok<CheckIn>(r.value[0]);
      return ok<CheckIn>(emptyCheckIn(dateYMD));
    },

    async accumulate(dateYMD: string, deltaSeconds: number, clockParam: Clock): Promise<Result<CheckIn>> {
      if (!isYMD(dateYMD)) return fail<CheckIn>(ErrorCode.INVALID_DATE, 'invalid check-in date');
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return fail<CheckIn>(ErrorCode.INVALID_ARGUMENT, 'deltaSeconds must be positive');
      }
      const s: AccountSession = await session();
      const snapR = await service.snapshot(dateYMD);
      if (!snapR.ok || snapR.value === undefined) {
        return fail<CheckIn>(snapR.error !== undefined ? snapR.error.code : ErrorCode.STORAGE_READ_FAILED, 'snapshot failed');
      }
      const snap: CheckIn = snapR.value;
      const activeSeconds: number = snap.activeSeconds + deltaSeconds;
      const shouldCheckIn: boolean = !snap.checkedIn && activeSeconds >= snap.goalSeconds;

      let next: CheckIn = {
        dateYMD: snap.dateYMD,
        activeSeconds: activeSeconds,
        goalSeconds: snap.goalSeconds,
        checkedIn: snap.checkedIn || shouldCheckIn,
        checkedInAtMs: shouldCheckIn ? clockParam.nowMs() : snap.checkedInAtMs,
        streakAfter: snap.streakAfter,
        newWords: snap.newWords,
        reviewedWords: snap.reviewedWords,
      };

      const written = await repository.saveCheckIn(s, next);
      if (!written.ok) return fail<CheckIn>(ErrorCode.STORAGE_WRITE_FAILED, 'check-in write failed');

      if (shouldCheckIn) {
        const streak = await service.rebuildStreak();
        if (streak.ok && streak.value !== undefined) {
          next = {
            dateYMD: next.dateYMD,
            activeSeconds: next.activeSeconds,
            goalSeconds: next.goalSeconds,
            checkedIn: next.checkedIn,
            checkedInAtMs: next.checkedInAtMs,
            streakAfter: streak.value.current,
            newWords: next.newWords,
            reviewedWords: next.reviewedWords,
          };
          const again = await repository.saveCheckIn(s, next);
          if (!again.ok) return fail<CheckIn>(ErrorCode.STORAGE_WRITE_FAILED, 'streak write failed');
        }
      }
      return ok<CheckIn>(next);
    },

    async remainingSeconds(dateYMD: string): Promise<Result<number>> {
      const snapR = await service.snapshot(dateYMD);
      if (!snapR.ok || snapR.value === undefined) {
        return fail<number>(snapR.error !== undefined ? snapR.error.code : ErrorCode.STORAGE_READ_FAILED, 'snapshot failed');
      }
      return ok<number>(Math.max(0, snapR.value.goalSeconds - snapR.value.activeSeconds));
    },

    async streak(): Promise<Result<StreakInfo>> {
      return service.rebuildStreak();
    },

    async rebuildStreak(): Promise<Result<StreakInfo>> {
      const s: AccountSession = await session();
      const r = await repository.loadCheckIns(s, FULL_RANGE_FROM_YMD, FULL_RANGE_TO_YMD);
      if (!r.ok || r.value === undefined) {
        return fail<StreakInfo>(r.error !== undefined ? r.error.code : ErrorCode.STORAGE_READ_FAILED, 'streak read failed');
      }
      return ok<StreakInfo>(await computeStreak(r.value));
    },

    async listRange(fromYMD: string, toYMD: string): Promise<Result<readonly CheckIn[]>> {
      const s: AccountSession = await session();
      return repository.loadCheckIns(s, fromYMD, toYMD);
    },

    async writeCheckIn(checkIn: CheckIn): Promise<Result<boolean>> {
      const s: AccountSession = await session();
      return repository.saveCheckIn(s, checkIn);
    },
  };
  return service;
}
