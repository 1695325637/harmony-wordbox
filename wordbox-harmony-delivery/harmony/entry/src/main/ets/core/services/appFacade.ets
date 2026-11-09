// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/appFacade.ts

/**
 * `WordBoxApp` — the single orchestration facade used by BOTH UI tracks.
 * It fixes the cold-start order, the A → auth → B dialog sequence, the AI
 * → quality → schedule → persistence learning turn and the 600s check-in loop.
 * All dependencies are injected via `AppDeps`; no platform object is created
 * inside the kernel.
 */
import {
  AccountAuthResult, AccountSession, AccountTransition, AIContext,
  AuthFlowResult, BootstrapResult, CalendarMonth, CheckIn, ChatMessage,
  ChatRole, DailyQueue, DateWindow, DialogType, Gated, GateReason,
  GuideActionResult, HomeOverview, LearnSummary, LearningTurn,
  LoginPromptDecision, MergeChoiceKind, MergePromptDecision, MergeResult,
  MergeSkipReason, NewWordInput, PruneReport, PromptActionKind,
  PromptSkipReason, Scene, Settings, SessionKind, StatsSummary, StatsWindow,
  StudyRecord, Word, WordEntry,
} from '../models/types';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import {
  DAILY_GOAL_SECONDS, DEFAULT_NEW_CAP, DEFAULT_SETTINGS, DEFAULT_GUEST_SESSION,
  GATE_UNLOCK_HINT, GUEST_RETENTION_DAYS,
} from '../models/constants';
import { addDays, weekGrid } from '../utils/date';
import { sessionIdOf, messageIdOf } from '../utils/id';
import { SEED_WORDS } from '../data/seedWords';
import { StorageService, Clock, AccountProvider } from '../ports/ports';
import { JsonCodec } from '../ports/codec';
import { ScopedRepository } from './repository';
import { ProgressGate } from './progressGate';
import { EbbinghausScheduler } from './scheduler';
import { CheckInService } from './checkin';
import { StatsService } from './stats';
import { WordBookService } from './wordbook';
import { SceneService } from './scene';
import { AccountService } from './account';
import { RetentionService, GuestRetentionPolicy } from './retention';
import { LoginPromptService, LoginPromptPolicy, emptyPromptSummary } from './loginPrompt';
import { MigrationService, ProgressMergeService } from './migration';
import { AIProviderRouter } from './aiRouter';
import { QualityTagParser } from './quality';
import { PromptStrategy } from './prompt';

export interface AppDeps {
  readonly clock: Clock;
  readonly storage: StorageService;
  readonly codec: JsonCodec;
  readonly repository: ScopedRepository;
  readonly gate: ProgressGate;
  readonly scheduler: EbbinghausScheduler;
  readonly checkIn: CheckInService;
  readonly stats: StatsService;
  readonly wordBook: WordBookService;
  readonly scenes: SceneService;
  readonly account: AccountService;
  readonly accountProvider: AccountProvider;
  readonly retention: RetentionService;
  readonly retentionPolicy: GuestRetentionPolicy;
  readonly loginPrompt: LoginPromptService;
  readonly loginPromptPolicy: LoginPromptPolicy;
  readonly migration: MigrationService;
  readonly mergePlanner: ProgressMergeService;
  readonly aiRouter: AIProviderRouter;
  readonly parser: QualityTagParser;
  readonly promptStrategy: PromptStrategy;
}

export interface WordBoxApp {
  bootstrap(clock: Clock): Promise<Result<BootstrapResult>>;
  todayOverview(clock: Clock): Promise<Result<HomeOverview>>;
  startLearning(scene: Scene, clock: Clock): Promise<Result<DailyQueue>>;
  /** Returns the id of the most recently started learning session (UI/QA helper). */
  activeSessionId(): string;
  sendMessage(sessionId: string, userText: string, clock: Clock): Promise<Result<LearningTurn>>;
  tickActiveSeconds(sessionId: string, seconds: number, clock: Clock): Promise<Result<CheckIn>>;
  finishLearning(sessionId: string, clock: Clock): Promise<Result<LearnSummary>>;
  onLoginGuideAction(action: PromptActionKind, clock: Clock): Promise<Result<GuideActionResult>>;
  onHuaweiAuthResult(auth: AccountAuthResult | undefined, clock: Clock): Promise<Result<AuthFlowResult>>;
  onMergeChoice(choice: MergeChoiceKind, clock: Clock): Promise<Result<MergeResult>>;
  calendar(monthYMD: string, clock: Clock): Promise<Result<Gated<CalendarMonth>>>;
  statistics(windowDays: StatsWindow, clock: Clock): Promise<Result<Gated<StatsSummary>>>;
  addWord(input: NewWordInput, clock: Clock): Promise<Result<WordEntry>>;
}

/** Mutable per-session learning state (in-memory; learning data itself is persisted). */
interface LearningSessionState {
  readonly sessionId: string;
  readonly scene: Scene;
  readonly targetWordIds: readonly string[];
  readonly coveredWordIds: string[];
  readonly history: ChatMessage[];
  readonly createdAtMs: number;
  turnIndex: number;
  aiRounds: number;
  activeSeconds: number;
}

function uniq(ids: readonly string[]): readonly string[] {
  const seen: Set<string> = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

function noOpMergeResult(reason: MergeSkipReason, window: DateWindow): MergeResult {
  const result: MergeResult = {
    performed: false,
    reason: reason,
    windowFromYMD: window.fromYMD,
    windowToYMD: window.toYMD,
    mergedWordIds: [],
    mergedRecordWordIds: [],
    mergedCheckInDates: [],
    skippedOutsideWindowCount: 0,
    conflictResolvedCount: 0,
    recomputed: false,
    after: undefined,
    idempotentHit: false,
  };
  return result;
}

function defaultLoginGuide(window: DateWindow): LoginPromptDecision {
  const d: LoginPromptDecision = {
    shouldPrompt: false,
    dialogType: DialogType.LoginGuide,
    dayIndex: 0,
    reason: PromptSkipReason.NO_GUEST_DATA,
    summary: emptyPromptSummary(window),
  };
  return d;
}

function noOpMergePrompt(window: DateWindow, reason: MergeSkipReason): MergePromptDecision {
  const d: MergePromptDecision = {
    shouldShow: false,
    dialogType: DialogType.MergeChoice,
    guestSnapshot: undefined,
    summary: emptyPromptSummary(window),
    reason: reason,
  };
  return d;
}

function emptyPruneReport(window: DateWindow): PruneReport {
  const report: PruneReport = {
    window: window,
    removedKeys: [],
    removedCount: 0,
    keptCount: 0,
    idempotent: true,
    rebuiltIndex: false,
  };
  return report;
}

/** Create the canonical WordBox application facade. */
export function createWordBoxApp(deps: AppDeps): WordBoxApp {
  const repository: ScopedRepository = deps.repository;
  const scheduler: EbbinghausScheduler = deps.scheduler;
  const checkIn: CheckInService = deps.checkIn;
  const stats: StatsService = deps.stats;
  const wordBook: WordBookService = deps.wordBook;
  const scenes: SceneService = deps.scenes;
  const account: AccountService = deps.account;
  const retention: RetentionService = deps.retention;
  const retentionPolicy: GuestRetentionPolicy = deps.retentionPolicy;
  const loginPrompt: LoginPromptService = deps.loginPrompt;
  const migration: MigrationService = deps.migration;
  const gate: ProgressGate = deps.gate;
  const aiRouter: AIProviderRouter = deps.aiRouter;

  const sessions: Map<string, LearningSessionState> = new Map<string, LearningSessionState>();
  let startCounter: number = 0;
  let lastSessionId: string = '';

  async function currentSession(): Promise<AccountSession> {
    const r = await account.current();
    return r.ok && r.value !== undefined ? r.value : DEFAULT_GUEST_SESSION;
  }

  async function currentSettings(): Promise<Settings> {
    const s: AccountSession = await currentSession();
    const r = await repository.loadSettings(s);
    return r.ok && r.value !== undefined ? r.value : DEFAULT_SETTINGS;
  }

  function queueFor(records: readonly StudyRecord[], todayYMD: string, newCap: number): DailyQueue {
    return scheduler.buildDailyQueue(SEED_WORDS, records, todayYMD, newCap);
  }

  function targetIdsOf(queue: DailyQueue): readonly string[] {
    const ids: string[] = [];
    for (const id of queue.relearnWordIds) ids.push(id);
    for (const id of queue.reviewWordIds) ids.push(id);
    for (const id of queue.newWordIds) ids.push(id);
    return uniq(ids);
  }

  async function wordsFor(ids: readonly string[], session: AccountSession): Promise<readonly Word[]> {
    const byId: Map<string, Word> = new Map<string, Word>();
    for (const w of SEED_WORDS) byId.set(w.id, w);
    const storedR = await repository.loadWords(session);
    if (storedR.ok && storedR.value !== undefined) {
      for (const w of storedR.value) byId.set(w.id, w);
    }
    const out: Word[] = [];
    for (const id of ids) {
      const w: Word | undefined = byId.get(id);
      if (w !== undefined) out.push(w);
    }
    return out;
  }

  async function ensureSession(sessionId: string, clock: Clock): Promise<LearningSessionState> {
    const existing: LearningSessionState | undefined = sessions.get(sessionId);
    if (existing !== undefined) return existing;
    const today: string = clock.todayYMD();
    const session: AccountSession = await currentSession();
    const recordsR = await repository.loadRecords(session);
    const records: readonly StudyRecord[] = recordsR.ok && recordsR.value !== undefined ? recordsR.value : [];
    const settings: Settings = await currentSettings();
    const queue: DailyQueue = queueFor(records, today, settings.newWordsPerDay);
    const created: LearningSessionState = {
      sessionId: sessionId,
      scene: scenes.suggestedScenes(settings, today)[0] ?? Scene.AIRPORT,
      targetWordIds: targetIdsOf(queue),
      coveredWordIds: [],
      history: [],
      createdAtMs: clock.nowMs(),
      turnIndex: 0,
      aiRounds: 0,
      activeSeconds: 0,
    };
    sessions.set(sessionId, created);
    if (lastSessionId.length === 0) lastSessionId = sessionId;
    return created;
  }

  const app: WordBoxApp = {
    async bootstrap(clock: Clock): Promise<Result<BootstrapResult>> {
      const today: string = clock.todayYMD();
      const sessionR = await account.current();
      const session: AccountSession = sessionR.ok && sessionR.value !== undefined ? sessionR.value : DEFAULT_GUEST_SESSION;
      const window: DateWindow = retentionPolicy.windowOf(today);

      // 1) window cleanup (idempotent, never blocks the first frame)
      const pruneR = await retention.pruneGuestPartition(today);
      const pruneReport: PruneReport = pruneR.ok && pruneR.value !== undefined
        ? pruneR.value : emptyPruneReport(window);

      // 2) D1 is the first day learning DATA exists (not merely app open)
      const hasR = await retention.hasGuestProgress(today);
      if (hasR.ok && hasR.value === true) await retention.markFirstStudyDate(today);

      // 3) Type-A decision (guest cold start only)
      const guideR = await loginPrompt.decide(today);
      const loginGuide: LoginPromptDecision = guideR.ok && guideR.value !== undefined
        ? guideR.value : defaultLoginGuide(window);

      // 4) settings
      const settingsR = await repository.loadSettings(session);
      const settings: Settings = settingsR.ok && settingsR.value !== undefined ? settingsR.value : DEFAULT_SETTINGS;

      const result: BootstrapResult = {
        session: session,
        pruneReport: pruneReport,
        loginGuide: loginGuide,
        settings: settings,
        window: window,
      };
      return ok<BootstrapResult>(result);
    },

    async todayOverview(clock: Clock): Promise<Result<HomeOverview>> {
      const today: string = clock.todayYMD();
      const session: AccountSession = await currentSession();
      const settings: Settings = await currentSettings();
      const recordsR = await repository.loadRecords(session);
      const records: readonly StudyRecord[] = recordsR.ok && recordsR.value !== undefined ? recordsR.value : [];
      const queue: DailyQueue = queueFor(records, today, settings.newWordsPerDay);
      const snapR = await checkIn.snapshot(today);
      const checkInSnap: CheckIn = snapR.ok && snapR.value !== undefined ? snapR.value : {
        dateYMD: today, activeSeconds: 0, goalSeconds: DAILY_GOAL_SECONDS,
        checkedIn: false, checkedInAtMs: 0, streakAfter: 0, newWords: 0, reviewedWords: 0,
      };
      const remainingR = await checkIn.remainingSeconds(today);
      const remainingSeconds: number = remainingR.ok && remainingR.value !== undefined ? remainingR.value : DAILY_GOAL_SECONDS;
      const gateDecision = gate.check(session);
      const streakR = await checkIn.streak();
      const streakInfo = streakR.ok && streakR.value !== undefined ? streakR.value : { current: 0, longest: 0, checkedInDates: [] };
      const weeklyGrid = weekGrid(addDays(today, -(GUEST_RETENTION_DAYS - 1)), streakInfo.checkedInDates);
      const scene: Scene = scenes.suggestedScenes(settings, today)[0] ?? Scene.AIRPORT;
      const overview: HomeOverview = {
        dateYMD: today,
        queue: queue,
        checkIn: checkInSnap,
        streakVisible: gateDecision.allowed,
        streak: gateDecision.allowed ? streakInfo.current : 0,
        remainingSeconds: remainingSeconds,
        weeklyGrid: weeklyGrid,
        scene: scene,
        accountLabel: session.kind === SessionKind.Authenticated ? session.displayName : '游客',
        gateHint: gateDecision.allowed ? '' : gateDecision.unlockHint,
      };
      return ok<HomeOverview>(overview);
    },

    async startLearning(scene: Scene, clock: Clock): Promise<Result<DailyQueue>> {
      const today: string = clock.todayYMD();
      const session: AccountSession = await currentSession();
      const settings: Settings = await currentSettings();
      const recordsR = await repository.loadRecords(session);
      const records: readonly StudyRecord[] = recordsR.ok && recordsR.value !== undefined ? recordsR.value : [];
      const queue: DailyQueue = queueFor(records, today, settings.newWordsPerDay);
      startCounter = startCounter + 1;
      const sessionId: string = sessionIdOf(session.uid, today, clock.nowMs() + startCounter);
      const state: LearningSessionState = {
        sessionId: sessionId,
        scene: scene,
        targetWordIds: targetIdsOf(queue),
        coveredWordIds: [],
        history: [],
        createdAtMs: clock.nowMs(),
        turnIndex: 0,
        aiRounds: 0,
        activeSeconds: 0,
      };
      sessions.set(sessionId, state);
      lastSessionId = sessionId;
      return ok<DailyQueue>(queue);
    },

    activeSessionId(): string {
      return lastSessionId;
    },

    async sendMessage(sessionId: string, userText: string, clock: Clock): Promise<Result<LearningTurn>> {
      const today: string = clock.todayYMD();
      const session: AccountSession = await currentSession();
      const state: LearningSessionState = await ensureSession(sessionId, clock);
      const targetWordIds: readonly string[] = state.targetWordIds.length > 0
        ? state.targetWordIds : targetIdsOf(queueFor([], today, DEFAULT_NEW_CAP));

      // 1) persist the user's message
      const userMsg: ChatMessage = {
        id: messageIdOf(sessionId, ChatRole.User, state.turnIndex),
        sessionId: sessionId,
        role: ChatRole.User,
        scene: state.scene,
        wordIds: [],
        content: userText,
        quality: -1,
        createdAtMs: clock.nowMs(),
        provider: aiRouter.currentProvider(),
        degraded: false,
      };
      const userSaved = await repository.saveChatMessage(session, userMsg);
      if (!userSaved.ok) return fail<LearningTurn>(ErrorCode.STORAGE_WRITE_FAILED, 'user message write failed');
      state.history.push(userMsg);

      // 2) AI reply (primary → retry → fallback)
      const words: readonly Word[] = await wordsFor(targetWordIds, session);
      const ctx: AIContext = {
        scene: state.scene,
        dateYMD: today,
        targetWordIds: targetWordIds,
        words: words,
        history: state.history,
        sessionId: sessionId,
        turnIndex: state.turnIndex,
      };
      const envelope = await aiRouter.reply(ctx, clock);

      // 3) quality write-back (quality < 0 ⇒ no schedule write, no error, no interruption)
      const updatedRecords: StudyRecord[] = [];
      if (envelope.parsed.quality >= 0) {
        const recordsR = await repository.loadRecords(session);
        const byWord: Map<string, StudyRecord> = new Map<string, StudyRecord>();
        if (recordsR.ok && recordsR.value !== undefined) {
          for (const r of recordsR.value) byWord.set(r.wordId, r);
        }
        for (const wordId of targetWordIds) {
          const existing: StudyRecord = byWord.get(wordId) ?? scheduler.createRecord(wordId, today);
          const updated: StudyRecord = scheduler.review(existing, envelope.parsed.quality, today);
          const saved = await repository.saveRecord(session, updated);
          if (saved.ok) updatedRecords.push(updated);
        }
      }

      // 4) persist the AI message (display text has tags stripped)
      const aiMsg: ChatMessage = {
        id: messageIdOf(sessionId, ChatRole.AI, state.turnIndex),
        sessionId: sessionId,
        role: ChatRole.AI,
        scene: state.scene,
        wordIds: targetWordIds,
        content: envelope.parsed.displayText,
        quality: envelope.parsed.quality,
        createdAtMs: clock.nowMs(),
        provider: envelope.reply.provider,
        degraded: envelope.degraded,
      };
      await repository.saveChatMessage(session, aiMsg);
      state.history.push(aiMsg);
      for (const id of targetWordIds) {
        if (state.coveredWordIds.indexOf(id) < 0) state.coveredWordIds.push(id);
      }
      state.turnIndex = state.turnIndex + 1;
      state.aiRounds = state.aiRounds + 1;
      await retention.markFirstStudyDate(today);

      const checkInR = await checkIn.snapshot(today);
      const checkInSnap: CheckIn = checkInR.ok && checkInR.value !== undefined ? checkInR.value : {
        dateYMD: today, activeSeconds: 0, goalSeconds: DAILY_GOAL_SECONDS,
        checkedIn: false, checkedInAtMs: 0, streakAfter: 0, newWords: 0, reviewedWords: 0,
      };
      const turn: LearningTurn = {
        message: aiMsg,
        parsed: envelope.parsed,
        updatedRecords: updatedRecords,
        providerUsed: envelope.reply.provider,
        degraded: envelope.degraded,
        checkIn: checkInSnap,
      };
      return ok<LearningTurn>(turn);
    },

    async tickActiveSeconds(sessionId: string, seconds: number, clock: Clock): Promise<Result<CheckIn>> {
      const today: string = clock.todayYMD();
      const state: LearningSessionState = await ensureSession(sessionId, clock);
      if (seconds > 0) state.activeSeconds = state.activeSeconds + seconds;
      await retention.markFirstStudyDate(today);
      return checkIn.accumulate(today, seconds, clock);
    },

    async finishLearning(sessionId: string, clock: Clock): Promise<Result<LearnSummary>> {
      const today: string = clock.todayYMD();
      const state: LearningSessionState | undefined = sessions.get(sessionId);
      const targetWords: readonly string[] = state !== undefined ? state.targetWordIds : [];
      const wordsCovered: readonly string[] = state !== undefined ? state.coveredWordIds : [];
      let allCovered: boolean = true;
      for (const id of targetWords) {
        if (wordsCovered.indexOf(id) < 0) allCovered = false;
      }
      const snapR = await checkIn.snapshot(today);
      const checkedIn: boolean = snapR.ok && snapR.value !== undefined ? snapR.value.checkedIn : false;
      const streakR = await checkIn.streak();
      const streak: number = streakR.ok && streakR.value !== undefined ? streakR.value.current : 0;
      const summary: LearnSummary = {
        totalActiveSeconds: state !== undefined ? state.activeSeconds : 0,
        checkedIn: checkedIn,
        aiRounds: state !== undefined ? state.aiRounds : 0,
        wordsCovered: wordsCovered,
        targetWords: targetWords,
        allTargetWordsCovered: allCovered,
        streak: streak,
      };
      return ok<LearnSummary>(summary);
    },

    async onLoginGuideAction(action: PromptActionKind, clock: Clock): Promise<Result<GuideActionResult>> {
      const today: string = clock.todayYMD();
      const stateR = await loginPrompt.onShown(today, action);
      const window: DateWindow = retentionPolicy.windowOf(today);
      const nextState = stateR.ok && stateR.value !== undefined ? stateR.value : {
        firstStudyYMD: '', neverPrompt: false, lastPromptDate: today, lastDecisionYMD: '',
      };
      const result: GuideActionResult = {
        action: action,
        nextState: nextState,
        launchAccountKit: action === PromptActionKind.GoLogin,
        dialogType: DialogType.LoginGuide,
      };
      return ok<GuideActionResult>(result);
    },

    async onHuaweiAuthResult(auth: AccountAuthResult | undefined, clock: Clock): Promise<Result<AuthFlowResult>> {
      const today: string = clock.todayYMD();
      const window: DateWindow = retentionPolicy.windowOf(today);
      const beforeR = await account.current();
      const before: AccountSession = beforeR.ok && beforeR.value !== undefined ? beforeR.value : DEFAULT_GUEST_SESSION;

      if (auth === undefined) {
        const transition: AccountTransition = {
          before: before, after: before, guestProgressExists: false,
          shouldShowTypeB: false, decisionAlreadyMade: false,
        };
        const flow: AuthFlowResult = {
          transition: transition,
          mergePrompt: noOpMergePrompt(window, MergeSkipReason.NO_GUEST_DATA),
          loginGuideSuppressed: before.kind === SessionKind.Authenticated,
        };
        return ok<AuthFlowResult>(flow);
      }

      const signInR = await account.signIn(auth, clock);
      if (!signInR.ok || signInR.value === undefined) {
        const transition: AccountTransition = {
          before: before, after: before, guestProgressExists: false,
          shouldShowTypeB: false, decisionAlreadyMade: false,
        };
        const flow: AuthFlowResult = {
          transition: transition,
          mergePrompt: noOpMergePrompt(window, MergeSkipReason.NOT_AUTHENTICATED),
          loginGuideSuppressed: false,
        };
        return ok<AuthFlowResult>(flow);
      }
      const transition: AccountTransition = signInR.value;
      const mergeR = await loginPrompt.onAuthSucceeded(transition, today);
      const mergePrompt: MergePromptDecision = mergeR.ok && mergeR.value !== undefined
        ? mergeR.value : noOpMergePrompt(window, MergeSkipReason.NO_GUEST_DATA);
      const flow: AuthFlowResult = {
        transition: transition,
        mergePrompt: mergePrompt,
        loginGuideSuppressed: true, // authenticated ⇒ Type A always off
      };
      return ok<AuthFlowResult>(flow);
    },

    async onMergeChoice(choice: MergeChoiceKind, clock: Clock): Promise<Result<MergeResult>> {
      const today: string = clock.todayYMD();
      const window: DateWindow = retentionPolicy.windowOf(today);
      const cur = await account.current();
      const uid: string = cur.ok && cur.value !== undefined ? cur.value.uid : 'guest';
      const recorded = await migration.recordDecision(uid, choice, today, clock);
      if (!recorded.ok) return fail<MergeResult>(ErrorCode.STORAGE_WRITE_FAILED, 'merge decision failed');
      if (choice === MergeChoiceKind.Defer) return ok<MergeResult>(noOpMergeResult(MergeSkipReason.DECISION_DEFER, window));
      if (choice === MergeChoiceKind.KeepAccount) return ok<MergeResult>(noOpMergeResult(MergeSkipReason.DECISION_KEEP_ACCOUNT, window));
      return migration.merge(uid, today, clock);
    },

    async calendar(monthYMD: string, clock: Clock): Promise<Result<Gated<CalendarMonth>>> {
      const session: AccountSession = await currentSession();
      return stats.calendar(monthYMD, clock.todayYMD(), session);
    },

    async statistics(windowDays: StatsWindow, clock: Clock): Promise<Result<Gated<StatsSummary>>> {
      const session: AccountSession = await currentSession();
      return stats.summary(windowDays, clock.todayYMD(), session);
    },

    async addWord(input: NewWordInput, clock: Clock): Promise<Result<WordEntry>> {
      const session: AccountSession = await currentSession();
      const result = await wordBook.add(session, input, clock);
      if (result.ok) await retention.markFirstStudyDate(clock.todayYMD());
      return result;
    },
  };
  return app;
}
