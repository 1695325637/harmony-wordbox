/**
 * Login-guide (Type A) state machine — F-22.
 *
 * Eight short-circuit branches (ARCHITECTURE §5.1):
 *  1 Authenticated → no    2 no guest data → no    3 empty window → no
 *  4 neverPrompt → no      5 already prompted today → no
 *  6 d ∈ [5,7] → YES       7 d > 7 → YES          8 otherwise → no
 * D1..D4 silent / D5 prompt / D6 silent / D7 prompt / D8+ daily until sign-in.
 *
 * `onAuthSucceeded` is the ONLY kernel entry that can produce Type B, and it
 * deliberately never reads `neverPrompt` (so "不再提示" cannot suppress B).
 */
import {
  AccountSession, AccountTransition, DateWindow, DialogType, GuestPromptState,
  GuestSnapshot, LoginPromptDecision, LoginPromptInput, MergePromptDecision,
  MergeSkipReason, PromptActionKind, PromptSkipReason, PromptSummary,
  SessionKind,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { LOGIN_PROMPT_DAYS, PROMPT_DAILY_AFTER_DAY } from '../models/constants';
import { dayIndexOf, isYMD } from '../utils/date';
import { GuestRetentionPolicy, RetentionService } from './retention';
import { AccountService } from './account';
import type { MigrationService } from './migration';

export interface LoginPromptPolicy {
  shouldPromptLogin(input: LoginPromptInput): LoginPromptDecision;
  applyAction(state: GuestPromptState, action: PromptActionKind, todayYMD: string): GuestPromptState;
  dayIndex(firstStudyYMD: string, todayYMD: string): number;
  buildSummary(snapshot: GuestSnapshot): PromptSummary;
}

export interface LoginPromptService {
  decide(nowYMD: string): Promise<Result<LoginPromptDecision>>;
  onShown(nowYMD: string, action: PromptActionKind): Promise<Result<GuestPromptState>>;
  onAuthSucceeded(transition: AccountTransition, nowYMD: string): Promise<Result<MergePromptDecision>>;
}

/** Build a引导性 (non-statistics-page) summary from a window-only snapshot. */
export function buildPromptSummary(snapshot: GuestSnapshot): PromptSummary {
  const dates: Set<string> = new Set<string>();
  let totalActiveSeconds: number = 0;
  for (const c of snapshot.checkIns) {
    dates.add(c.dateYMD);
    totalActiveSeconds = totalActiveSeconds + c.activeSeconds;
  }
  for (const r of snapshot.records) dates.add(r.updatedAtYMD);
  for (const w of snapshot.words) if (w.createdAtYMD !== '') dates.add(w.createdAtYMD);
  const wordsLearned: Set<string> = new Set<string>();
  for (const r of snapshot.records) wordsLearned.add(r.wordId);
  const summary: PromptSummary = {
    studyDays: dates.size,
    wordsLearned: wordsLearned.size,
    totalMinutes: Math.round(totalActiveSeconds / 60),
    windowFromYMD: snapshot.window.fromYMD,
    windowToYMD: snapshot.window.toYMD,
  };
  return summary;
}

/** A zero summary derived from a window (used when no snapshot is available). */
export function emptyPromptSummary(window: DateWindow): PromptSummary {
  const summary: PromptSummary = {
    studyDays: 0,
    wordsLearned: 0,
    totalMinutes: 0,
    windowFromYMD: window.fromYMD,
    windowToYMD: window.toYMD,
  };
  return summary;
}

function decision(
  shouldPrompt: boolean,
  reason: PromptSkipReason,
  dayIndex: number,
  summary: PromptSummary,
): LoginPromptDecision {
  const d: LoginPromptDecision = {
    shouldPrompt: shouldPrompt,
    dialogType: DialogType.LoginGuide,
    dayIndex: dayIndex,
    reason: reason,
    summary: summary,
  };
  return d;
}

/** Create the pure Type-A policy. */
export function createLoginPromptPolicy(): LoginPromptPolicy {
  const policy: LoginPromptPolicy = {
    dayIndex(firstStudyYMD: string, todayYMD: string): number {
      return dayIndexOf(firstStudyYMD, todayYMD);
    },

    shouldPromptLogin(input: LoginPromptInput): LoginPromptDecision {
      const d: number = policy.dayIndex(input.firstStudyYMD, input.todayYMD);
      const summary: PromptSummary = emptyPromptSummary(input.window);
      // 1 — already authenticated
      if (input.session.kind === SessionKind.Authenticated) {
        return decision(false, PromptSkipReason.AUTHENTICATED, d, summary);
      }
      // 2 — no guest data at all
      if (!input.hasGuestProgress || input.firstStudyYMD === '') {
        return decision(false, PromptSkipReason.NO_GUEST_DATA, 0, summary);
      }
      // 3 — empty / degenerate window (defensive guard; snapshot is window-only)
      if (input.window.days <= 0 || !isYMD(input.window.fromYMD) || !isYMD(input.window.toYMD)) {
        return decision(false, PromptSkipReason.EMPTY_WINDOW, d, summary);
      }
      // 4 — user chose "不再提示"
      if (input.state.neverPrompt) {
        return decision(false, PromptSkipReason.NEVER_PROMPT, d, summary);
      }
      // 5 — at most once per local day
      if (input.state.lastPromptDate === input.todayYMD) {
        return decision(false, PromptSkipReason.ALREADY_PROMPTED_TODAY, d, summary);
      }
      // 6 — D5 / D7
      if (LOGIN_PROMPT_DAYS.indexOf(d) >= 0) {
        return decision(true, PromptSkipReason.NONE, d, summary);
      }
      // 7 — D8 onward, once per day until sign-in
      if (d > PROMPT_DAILY_AFTER_DAY) {
        return decision(true, PromptSkipReason.NONE, d, summary);
      }
      // 8 — D1..D4, D6, d === 0
      return decision(false, PromptSkipReason.NOT_SCHEDULED_DAY, d, summary);
    },

    applyAction(state: GuestPromptState, action: PromptActionKind, todayYMD: string): GuestPromptState {
      const never: boolean = state.neverPrompt || action === PromptActionKind.NeverPrompt;
      const next: GuestPromptState = {
        firstStudyYMD: state.firstStudyYMD, // never modified by Type-A actions
        neverPrompt: never,
        lastPromptDate: todayYMD,
        lastDecisionYMD: state.lastDecisionYMD,
      };
      return next;
    },

    buildSummary(snapshot: GuestSnapshot): PromptSummary {
      return buildPromptSummary(snapshot);
    },
  };
  return policy;
}

export interface LoginPromptDeps {
  readonly policy: LoginPromptPolicy;
  readonly retention: RetentionService;
  readonly retentionPolicy: GuestRetentionPolicy;
  readonly account: AccountService;
  readonly migration: MigrationService;
}

/** Create the Type-A / Type-B orchestration service. */
export function createLoginPromptService(deps: LoginPromptDeps): LoginPromptService {
  const policy: LoginPromptPolicy = deps.policy;
  const retention: RetentionService = deps.retention;
  const retentionPolicy: GuestRetentionPolicy = deps.retentionPolicy;
  const account: AccountService = deps.account;
  const migration: MigrationService = deps.migration;

  const service: LoginPromptService = {
    async decide(nowYMD: string): Promise<Result<LoginPromptDecision>> {
      const sessionR = await account.current();
      const session: AccountSession = sessionR.ok && sessionR.value !== undefined ? sessionR.value : {
        kind: SessionKind.Guest, uid: 'guest', displayName: '游客', partition: 'guest:',
        authenticatedAtMs: 0, tokenRefreshedAtMs: 0,
      };
      const hasR = await retention.hasGuestProgress(nowYMD);
      const hasGuestProgress: boolean = hasR.ok && hasR.value === true;
      const stateR = await retention.promptState();
      const state: GuestPromptState = stateR.ok && stateR.value !== undefined
        ? stateR.value
        : { firstStudyYMD: '', neverPrompt: false, lastPromptDate: '', lastDecisionYMD: '' };
      const window: DateWindow = retentionPolicy.windowOf(nowYMD);
      const input: LoginPromptInput = {
        firstStudyYMD: state.firstStudyYMD,
        todayYMD: nowYMD,
        state: state,
        session: session,
        hasGuestProgress: hasGuestProgress,
        window: window,
      };
      const base: LoginPromptDecision = policy.shouldPromptLogin(input);
      const snapR = await retention.loadGuestSnapshot(nowYMD);
      const summary: PromptSummary = snapR.ok && snapR.value !== undefined
        ? buildPromptSummary(snapR.value) : base.summary;
      const enriched: LoginPromptDecision = {
        shouldPrompt: base.shouldPrompt,
        dialogType: base.dialogType,
        dayIndex: base.dayIndex,
        reason: base.reason,
        summary: summary,
      };
      return ok<LoginPromptDecision>(enriched);
    },

    async onShown(nowYMD: string, action: PromptActionKind): Promise<Result<GuestPromptState>> {
      const stateR = await retention.promptState();
      const state: GuestPromptState = stateR.ok && stateR.value !== undefined
        ? stateR.value
        : { firstStudyYMD: '', neverPrompt: false, lastPromptDate: '', lastDecisionYMD: '' };
      const next: GuestPromptState = policy.applyAction(state, action, nowYMD);
      const saved = await retention.savePromptState(next);
      if (!saved.ok) return fail<GuestPromptState>(ErrorCode.STORAGE_WRITE_FAILED, 'prompt state save failed');
      return ok<GuestPromptState>(next);
    },

    async onAuthSucceeded(transition: AccountTransition, nowYMD: string): Promise<Result<MergePromptDecision>> {
      // Deliberately does NOT read `neverPrompt` — Type B is independent of A.
      if (!transition.shouldShowTypeB) {
        const reason: MergeSkipReason = transition.decisionAlreadyMade
          ? MergeSkipReason.DECISION_KEEP_ACCOUNT
          : (transition.guestProgressExists ? MergeSkipReason.PERFORMED : MergeSkipReason.NO_GUEST_DATA);
        const window: DateWindow = retentionPolicy.windowOf(nowYMD);
        const d: MergePromptDecision = {
          shouldShow: false,
          dialogType: DialogType.MergeChoice,
          guestSnapshot: undefined,
          summary: emptyPromptSummary(window),
          reason: reason,
        };
        return ok<MergePromptDecision>(d);
      }
      return migration.detect(transition.after.uid, nowYMD);
    },
  };
  return service;
}
