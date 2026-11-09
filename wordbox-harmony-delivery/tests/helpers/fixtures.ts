/**
 * 确定性领域对象夹具 —— 所有字段显式、readonly、零 Date.now()、
 * 零网络、零真机依赖。用于构造窗口内/窗口外数据、冲突数据与弹窗输入。
 */
import {
  AccountSession, AIContext, ChatMessage, CheckIn, DateWindow, DialogType,
  DatedEntity, GateReason, GuestPromptState, GuestSnapshot, LoginPromptInput,
  Scene, SessionKind, StatsSummary, StatsWindow, StudyRecord, Word, WordSource,
  WordStatus, AIProviderKind, ChatRole,
} from '@core/models/types';
import {
  DAILY_GOAL_SECONDS, DEFAULT_GUEST_SESSION, GUEST_RETENTION_DAYS,
  SM2_INITIAL_EF,
} from '@core/models/constants';
import { windowFrom, addDays } from '@core/utils/date';
import { guestSession, authenticatedSession } from '@core/services/account';

export const D1: string = '2026-11-01';
/** 跨月基准：D1=2026-10-28，D8=2026-11-04，覆盖 10→11 月切换。 */
export const CROSS_MONTH_D1: string = '2026-10-28';
/** 闰年基准：2028-02-27 起，覆盖 02-29。 */
export const LEAP_D1: string = '2028-02-27';

export function d(dayIndex: number, from: string = D1): string {
  return addDays(from, dayIndex - 1);
}

export function makeWindow(todayYMD: string, days: number = GUEST_RETENTION_DAYS): DateWindow {
  return windowFrom(todayYMD, days);
}

export function makeWord(o: Partial<Word> = {}): Word {
  const w: Word = {
    id: o.id ?? 'w-airport-boarding-pass',
    text: o.text ?? 'boarding pass',
    phonetic: o.phonetic ?? '',
    meaningZh: o.meaningZh ?? '登机牌',
    scene: o.scene ?? Scene.AIRPORT,
    locale: o.locale ?? 'en-US',
    exampleInScene: o.exampleInScene ?? 'May I see your boarding pass?',
    aiRolePrompt: o.aiRolePrompt ?? '你是值机员',
    source: o.source ?? WordSource.User,
    createdAtYMD: o.createdAtYMD ?? D1,
  };
  return w;
}

/** 8 场景各一条种子词（source=Seed，createdAtYMD='' 表示内置词不参与窗口清理）。 */
export function makeSeedWords(scenes: readonly Scene[]): readonly Word[] {
  const out: Word[] = [];
  for (let i = 0; i < scenes.length; i++) {
    out.push(makeWord({
      id: 'w-' + scenes[i] + '-seed-' + String(i),
      text: 'seed-' + scenes[i],
      scene: scenes[i],
      source: WordSource.Seed,
      createdAtYMD: '',
    }));
  }
  return out;
}

export function makeWordSet(count: number, scene: Scene, from: string = D1): readonly Word[] {
  const out: Word[] = [];
  for (let i = 0; i < count; i++) {
    out.push(makeWord({
      id: 'w-' + scene + '-' + String(i),
      text: 'word-' + String(i),
      scene: scene,
      createdAtYMD: from,
    }));
  }
  return out;
}

export function makeRecord(o: Partial<StudyRecord> = {}): StudyRecord {
  const r: StudyRecord = {
    wordId: o.wordId ?? 'w-airport-boarding-pass',
    ef: o.ef ?? SM2_INITIAL_EF,
    repetitions: o.repetitions ?? 0,
    intervalDays: o.intervalDays ?? 0,
    dueYMD: o.dueYMD ?? D1,
    lastReviewedYMD: o.lastReviewedYMD ?? '',
    lapses: o.lapses ?? 0,
    status: o.status ?? WordStatus.New,
    totalReviews: o.totalReviews ?? 0,
    correctReviews: o.correctReviews ?? 0,
    createdAtYMD: o.createdAtYMD ?? D1,
    updatedAtYMD: o.updatedAtYMD ?? D1,
  };
  return r;
}

export function makeCheckIn(o: Partial<CheckIn> = {}): CheckIn {
  const c: CheckIn = {
    dateYMD: o.dateYMD ?? D1,
    activeSeconds: o.activeSeconds ?? DAILY_GOAL_SECONDS,
    goalSeconds: o.goalSeconds ?? DAILY_GOAL_SECONDS,
    checkedIn: o.checkedIn ?? true,
    checkedInAtMs: o.checkedInAtMs ?? 1_700_000_000_000,
    streakAfter: o.streakAfter ?? 1,
    newWords: o.newWords ?? 0,
    reviewedWords: o.reviewedWords ?? 0,
  };
  return c;
}

/** 构造一段连续（或含断点）的打卡记录，dayIndexes 从 1 起算。 */
export function makeCheckInSeries(dayIndexes: readonly number[], from: string = D1): readonly CheckIn[] {
  const out: CheckIn[] = [];
  for (const n of dayIndexes) out.push(makeCheckIn({ dateYMD: d(n, from) }));
  return out;
}

export function makeChatMessage(o: Partial<ChatMessage> = {}): ChatMessage {
  const m: ChatMessage = {
    id: o.id ?? 'm-1',
    sessionId: o.sessionId ?? 's-1',
    role: o.role ?? ChatRole.AI,
    scene: o.scene ?? Scene.AIRPORT,
    wordIds: o.wordIds ?? [],
    content: o.content ?? 'Here is your boarding pass.',
    quality: o.quality ?? 5,
    createdAtMs: o.createdAtMs ?? 0,
    provider: o.provider ?? AIProviderKind.Scripted,
    degraded: o.degraded ?? false,
  };
  return m;
}

export function makePromptState(o: Partial<GuestPromptState> = {}): GuestPromptState {
  const s: GuestPromptState = {
    firstStudyYMD: o.firstStudyYMD ?? D1,
    neverPrompt: o.neverPrompt ?? false,
    lastPromptDate: o.lastPromptDate ?? '',
    lastDecisionYMD: o.lastDecisionYMD ?? '',
  };
  return s;
}

export function makeGuestSession(): AccountSession {
  return guestSession();
}

export function makeAuthSession(uid: string = 'demo-uid-001'): AccountSession {
  return authenticatedSession(uid, '测试旅客', 0, 0);
}

export function makeLoginPromptInput(o: Partial<LoginPromptInput> = {}): LoginPromptInput {
  const todayYMD: string = o.todayYMD ?? D1;
  const input: LoginPromptInput = {
    firstStudyYMD: o.firstStudyYMD ?? D1,
    todayYMD: todayYMD,
    state: o.state ?? makePromptState({ firstStudyYMD: o.firstStudyYMD ?? D1 }),
    session: o.session ?? makeGuestSession(),
    hasGuestProgress: o.hasGuestProgress ?? true,
    window: o.window ?? makeWindow(todayYMD),
  };
  return input;
}

export function makeDated<T>(dateYMD: string, payload: T): DatedEntity<T> {
  const e: DatedEntity<T> = { dateYMD: dateYMD, payload: payload };
  return e;
}

/** 构造 D1..D8 逐日窗口实体，便于窗口/清理/合并测试。 */
export function makeDatedDays(dayIndexes: readonly number[], from: string = D1): readonly DatedEntity<number>[] {
  const out: DatedEntity<number>[] = [];
  for (const n of dayIndexes) out.push(makeDated(d(n, from), n));
  return out;
}

export function makeGuestSnapshot(o: Partial<GuestSnapshot> = {}): GuestSnapshot {
  const todayYMD: string = o.window?.toYMD ?? d(8);
  const s: GuestSnapshot = {
    window: o.window ?? makeWindow(todayYMD),
    words: o.words ?? [],
    records: o.records ?? [],
    checkIns: o.checkIns ?? [],
    chatMessages: o.chatMessages ?? [],
    promptState: o.promptState ?? makePromptState(),
    dateIndex: o.dateIndex ?? [],
  };
  return s;
}

export function makeAIContext(o: Partial<AIContext> = {}): AIContext {
  const ctx: AIContext = {
    scene: o.scene ?? Scene.AIRPORT,
    dateYMD: o.dateYMD ?? D1,
    targetWordIds: o.targetWordIds ?? ['w-airport-boarding-pass'],
    words: o.words ?? [makeWord()],
    history: o.history ?? [],
    sessionId: o.sessionId ?? 's-1',
    turnIndex: o.turnIndex ?? 0,
  };
  return ctx;
}

export function makeEmptyStats(o: Partial<StatsSummary> = {}): StatsSummary {
  const s: StatsSummary = {
    windowDays: o.windowDays ?? StatsWindow.D30,
    asOfYMD: o.asOfYMD ?? d(8),
    masteredWords: o.masteredWords ?? 0,
    learningWords: o.learningWords ?? 0,
    totalReviews: o.totalReviews ?? 0,
    correctReviews: o.correctReviews ?? 0,
    reviewCompletionRate: o.reviewCompletionRate ?? 0,
    totalActiveSeconds: o.totalActiveSeconds ?? 0,
    checkedInDays: o.checkedInDays ?? 0,
    currentStreak: o.currentStreak ?? 0,
    longestStreak: o.longestStreak ?? 0,
    masteryCurve: o.masteryCurve ?? [],
    sceneDistribution: o.sceneDistribution ?? [],
  };
  return s;
}

export { DEFAULT_GUEST_SESSION, DialogType, GateReason, SessionKind };
