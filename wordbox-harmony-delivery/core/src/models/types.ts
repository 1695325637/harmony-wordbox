/**
 * All domain data structures for the WordBox kernel.
 * Every field is `readonly`, every collection is `readonly T[]`, and there is
 * no `any` / `unknown` / dynamic property access (ArkTS strict subset).
 * `Result<T>` / `AppError` / `ErrorCode` live in `errors.ts` and are re-exported
 * by the barrel `index.ts`.
 */
import { ErrorCode } from './errors';
import type { AppError, Result } from './errors';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum Scene {
  AIRPORT = 'airport',
  CUSTOMS = 'customs',
  HOTEL = 'hotel',
  DINING = 'dining',
  DIRECTIONS = 'directions',
  SHOPPING = 'shopping',
  TRANSPORT = 'transport',
  EMERGENCY = 'emergency',
}

export enum SessionKind { Guest = 'guest', Authenticated = 'authenticated' }
export enum WordStatus { New = 'new', Learning = 'learning', Relearning = 'relearning', Mastered = 'mastered' }
export enum WordSource { Seed = 'seed', User = 'user', Chat = 'chat' }
export enum AIProviderKind { OnDevice = 'onDevice', Scripted = 'scripted', Mock = 'mock' }
export enum AcceleratorKind { NPU = 'npu', CPU = 'cpu', UNAVAILABLE = 'unavailable' }
export enum ChatRole { AI = 'ai', User = 'user', System = 'system' }
export enum DialogType { LoginGuide = 'A', MergeChoice = 'B' }
export enum PromptActionKind { GoLogin = 'goLogin', Later = 'later', NeverPrompt = 'neverPrompt' }
export enum MergeChoiceKind { Merge = 'merge', KeepAccount = 'keepAccount', Defer = 'defer' }
export enum StatsWindow { D7 = 7, D30 = 30, D90 = 90 }
export enum DayState { Checked = 'checked', Missed = 'missed', Future = 'future' }
export enum GateReason { Ok = 'ok', Guest = 'guest' }
export enum PromptSkipReason {
  NONE = 'none',
  AUTHENTICATED = 'authenticated',
  NO_GUEST_DATA = 'noGuestData',
  EMPTY_WINDOW = 'emptyWindow',
  NEVER_PROMPT = 'neverPrompt',
  ALREADY_PROMPTED_TODAY = 'alreadyPromptedToday',
  NOT_SCHEDULED_DAY = 'notScheduledDay',
}
export enum MergeSkipReason {
  PERFORMED = 'performed',
  ALREADY_MERGED = 'alreadyMerged',
  NO_GUEST_DATA = 'noGuestData',
  OUTSIDE_WINDOW_ONLY = 'outsideWindowOnly',
  DECISION_KEEP_ACCOUNT = 'decisionKeepAccount',
  DECISION_DEFER = 'decisionDefer',
  NOT_AUTHENTICATED = 'notAuthenticated',
}
export enum ConflictRule { SAME_DAY_CHECKIN = 'sameDayCheckIn', RECORD_NO_REGRESSION = 'recordNoRegression', WORD_DEDUP = 'wordDedup' }
export enum ConflictSource { ACCOUNT = 'account', GUEST = 'guest', BLENDED = 'blended' }

// Re-export error types so a single `@core` import gives the full contract.
export { ErrorCode };
export type { AppError, Result };

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export interface Word {
  readonly id: string;
  readonly text: string;
  readonly phonetic: string;
  readonly meaningZh: string;
  readonly scene: Scene;
  readonly locale: string;
  readonly exampleInScene: string;
  readonly aiRolePrompt: string;
  readonly source: WordSource;
  readonly createdAtYMD: string;
}

export interface StudyRecord {
  readonly wordId: string;
  readonly ef: number;
  readonly repetitions: number;
  readonly intervalDays: number;
  readonly dueYMD: string;
  readonly lastReviewedYMD: string;
  readonly lapses: number;
  readonly status: WordStatus;
  readonly totalReviews: number;
  readonly correctReviews: number;
  readonly createdAtYMD: string;
  readonly updatedAtYMD: string;
}

export interface CheckIn {
  readonly dateYMD: string;
  readonly activeSeconds: number;
  readonly goalSeconds: number;
  readonly checkedIn: boolean;
  readonly checkedInAtMs: number;
  readonly streakAfter: number;
  readonly newWords: number;
  readonly reviewedWords: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: ChatRole;
  readonly scene: Scene;
  readonly wordIds: readonly string[];
  readonly content: string;
  readonly quality: number;
  readonly createdAtMs: number;
  readonly provider: AIProviderKind;
  readonly degraded: boolean;
}

export interface MasteryPoint { readonly dateYMD: string; readonly masteredWords: number; }
export interface SceneMastery {
  readonly scene: Scene; readonly total: number; readonly mastered: number; readonly ratio: number;
}

export interface StatsSummary {
  readonly windowDays: StatsWindow;
  readonly asOfYMD: string;
  readonly masteredWords: number;
  readonly learningWords: number;
  readonly totalReviews: number;
  readonly correctReviews: number;
  readonly reviewCompletionRate: number;
  readonly totalActiveSeconds: number;
  readonly checkedInDays: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly masteryCurve: readonly MasteryPoint[];
  readonly sceneDistribution: readonly SceneMastery[];
}

export interface AccountSession {
  readonly kind: SessionKind;
  readonly uid: string;
  readonly displayName: string;
  readonly partition: string;
  readonly authenticatedAtMs: number;
  readonly tokenRefreshedAtMs: number;
}

export interface GuestPromptState {
  readonly firstStudyYMD: string;
  readonly neverPrompt: boolean;
  readonly lastPromptDate: string;
  readonly lastDecisionYMD: string;
}

export interface MergeDecision {
  readonly uid: string;
  readonly choice: MergeChoiceKind;
  readonly decidedAtMs: number;
  readonly idempotencyKey: string;
}

export interface MergeResult {
  readonly performed: boolean;
  readonly reason: MergeSkipReason;
  readonly windowFromYMD: string;
  readonly windowToYMD: string;
  readonly mergedWordIds: readonly string[];
  readonly mergedRecordWordIds: readonly string[];
  readonly mergedCheckInDates: readonly string[];
  readonly skippedOutsideWindowCount: number;
  readonly conflictResolvedCount: number;
  readonly recomputed: boolean;
  readonly after: StatsSummary | undefined;
  readonly idempotentHit: boolean;
}

export interface Settings {
  readonly dailyGoalSeconds: number;
  readonly newWordsPerDay: number;
  readonly restDayEnabled: boolean;
  readonly preferredScenes: readonly Scene[];
  readonly darkMode: boolean;
  readonly aiProvider: AIProviderKind;
  readonly locale: string;
}

// ---------------------------------------------------------------------------
// Composite / auxiliary structures
// ---------------------------------------------------------------------------

export interface DateWindow { readonly fromYMD: string; readonly toYMD: string; readonly days: number; }
export interface DatedEntity<T> { readonly dateYMD: string; readonly payload: T; }
export interface PruneResult<T> { readonly kept: readonly T[]; readonly removed: readonly T[]; readonly changed: boolean; }
export interface PruneReport {
  readonly window: DateWindow;
  readonly removedKeys: readonly string[];
  readonly removedCount: number;
  readonly keptCount: number;
  readonly idempotent: boolean;
  readonly rebuiltIndex: boolean;
}
export interface GuestSnapshot {
  readonly window: DateWindow;
  readonly words: readonly Word[];
  readonly records: readonly StudyRecord[];
  readonly checkIns: readonly CheckIn[];
  readonly chatMessages: readonly ChatMessage[];
  readonly promptState: GuestPromptState;
  readonly dateIndex: readonly string[];
}
export interface DailyQueue {
  readonly dateYMD: string;
  readonly newWordIds: readonly string[];
  readonly reviewWordIds: readonly string[];
  readonly relearnWordIds: readonly string[];
  readonly total: number;
}
export interface StreakInfo {
  readonly current: number; readonly longest: number; readonly checkedInDates: readonly string[];
}
export interface GateDecision { readonly allowed: boolean; readonly reason: GateReason; readonly unlockHint: string; }
export interface Gated<T> {
  readonly allowed: boolean; readonly reason: GateReason;
  readonly data: T | undefined;
  readonly unlockHint: string;
}
export interface CalendarDay { readonly dateYMD: string; readonly state: DayState; readonly activeSeconds: number; }
export interface CalendarMonth {
  readonly month: string;
  readonly days: readonly CalendarDay[];
  readonly daysInMonth: number;
  readonly checkedInDays: number;
  readonly longestStreak: number;
  readonly totalActiveSeconds: number;
}
export interface SceneMeta {
  readonly scene: Scene; readonly labelZh: string; readonly icon: string;
  readonly aiRole: string; readonly seedCount: number;
}
export interface SceneWordCount { readonly scene: Scene; readonly count: number; }
export interface WordFilter { readonly scene: Scene | 'ALL'; readonly keyword: string; readonly status: WordStatus | 'ALL'; }
export interface NewWordInput { readonly text: string; readonly meaningZh: string; readonly scene: Scene; readonly exampleInScene: string; }
export interface WordEntry { readonly word: Word; readonly record: StudyRecord; }
export interface StorageEntry { readonly key: string; readonly value: string; }

// ---------------------------------------------------------------------------
// AI protocol
// ---------------------------------------------------------------------------

export interface AIContext {
  readonly scene: Scene;
  readonly dateYMD: string;
  readonly targetWordIds: readonly string[];
  readonly words: readonly Word[];
  readonly history: readonly ChatMessage[];
  readonly sessionId: string;
  readonly turnIndex: number;
}
export interface AIPrompt { readonly system: string; readonly user: string; readonly targetWords: readonly string[]; readonly qualityProtocol: string; }
export interface AIReply {
  readonly content: string;
  readonly provider: AIProviderKind;
  readonly latencyMs: number;
  readonly degraded: boolean;
  readonly errorCode: ErrorCode;
}
export interface ParsedAIReply {
  readonly displayText: string;
  readonly quality: number;
  readonly wordIds: readonly string[];
}
export interface AIResponseEnvelope {
  readonly reply: AIReply;
  readonly parsed: ParsedAIReply;
  readonly degraded: boolean;
  readonly attempts: number;
  readonly errorChain: readonly AppError[];
}

// ---------------------------------------------------------------------------
// Account external contract
// ---------------------------------------------------------------------------

export interface AccountAuthResult {
  readonly uid: string;
  readonly displayName: string;
  readonly expiresAtMs: number;
}
export interface AccountTransition {
  readonly before: AccountSession;
  readonly after: AccountSession;
  readonly guestProgressExists: boolean;
  readonly shouldShowTypeB: boolean;
  readonly decisionAlreadyMade: boolean;
}

// ---------------------------------------------------------------------------
// Dialogs and orchestration
// ---------------------------------------------------------------------------

export interface LoginPromptInput {
  readonly firstStudyYMD: string;
  readonly todayYMD: string;
  readonly state: GuestPromptState;
  readonly session: AccountSession;
  readonly hasGuestProgress: boolean;
  readonly window: DateWindow;
}
export interface PromptSummary {
  readonly studyDays: number; readonly wordsLearned: number; readonly totalMinutes: number;
  readonly windowFromYMD: string; readonly windowToYMD: string;
}
export interface LoginPromptDecision {
  readonly shouldPrompt: boolean;
  readonly dialogType: DialogType;
  readonly dayIndex: number;
  readonly reason: PromptSkipReason;
  readonly summary: PromptSummary;
}
export interface MergePromptDecision {
  readonly shouldShow: boolean;
  readonly dialogType: DialogType;
  readonly guestSnapshot: GuestSnapshot | undefined;
  readonly summary: PromptSummary;
  readonly reason: MergeSkipReason;
}
export interface GuideActionResult {
  readonly action: PromptActionKind;
  readonly nextState: GuestPromptState;
  readonly launchAccountKit: boolean;
  readonly dialogType: DialogType;
}
export interface AuthFlowResult {
  readonly transition: AccountTransition;
  readonly mergePrompt: MergePromptDecision;
  readonly loginGuideSuppressed: boolean;
}
export interface BootstrapResult {
  readonly session: AccountSession;
  readonly pruneReport: PruneReport;
  readonly loginGuide: LoginPromptDecision;
  readonly settings: Settings;
  readonly window: DateWindow;
}
export interface HomeOverview {
  readonly dateYMD: string;
  readonly queue: DailyQueue;
  readonly checkIn: CheckIn;
  readonly streakVisible: boolean;
  readonly streak: number;
  readonly remainingSeconds: number;
  readonly weeklyGrid: readonly DayState[];
  readonly scene: Scene;
  readonly accountLabel: string;
  readonly gateHint: string;
}
export interface LearningTurn {
  readonly message: ChatMessage;
  readonly parsed: ParsedAIReply;
  readonly updatedRecords: readonly StudyRecord[];
  readonly providerUsed: AIProviderKind;
  readonly degraded: boolean;
  readonly checkIn: CheckIn;
}
export interface LearnSummary {
  readonly totalActiveSeconds: number;
  readonly checkedIn: boolean;
  readonly aiRounds: number;
  readonly wordsCovered: readonly string[];
  readonly targetWords: readonly string[];
  readonly allTargetWordsCovered: boolean;
  readonly streak: number;
}
export interface MergePlan<T> { readonly toWrite: readonly T[]; readonly conflicts: readonly MergeConflict[]; readonly skipped: number; }
export interface MergeConflict { readonly key: string; readonly rule: ConflictRule; readonly chosen: ConflictSource; }
