/**
 * The single source of truth for every shared constant in the WordBox kernel.
 * No other file may hard-code 600 / 7 / [5,7] / 2.5 / 1.3 / 6.
 * OAQ-1 ruling (delivery director, 2026-11-09): classic SM-2 second interval = 6,
 * giving the interval sequence 1 → 6 → 15 → 38 with EF held at 2.5.
 */
import { Scene, AIProviderKind, SessionKind, Settings, AccountSession } from './types';

// ---------------------------------------------------------------------------
// Learning / check-in
// ---------------------------------------------------------------------------
export const DAILY_GOAL_SECONDS: number = 600;
export const DEFAULT_NEW_CAP: number = 8;
export const MS_PER_DAY: number = 86_400_000;

// ---------------------------------------------------------------------------
// SM-2 scheduler
// ---------------------------------------------------------------------------
export const SM2_INITIAL_EF: number = 2.5;
export const SM2_MIN_EF: number = 1.3;
export const SM2_QUALITY_PASS: number = 3;
export const SM2_FIRST_INTERVAL_DAYS: number = 1;
export const SM2_SECOND_INTERVAL_DAYS: number = 6;
export const SM2_MASTERED_INTERVAL_DAYS: number = 30;
export const SM2_RELEARN_GAP_DAYS: number = 7;
export const SM2_GAP_EF_PENALTY: number = 0.2;

// ---------------------------------------------------------------------------
// Guest retention window & login-guide state machine (F-22)
// ---------------------------------------------------------------------------
export const GUEST_RETENTION_DAYS: number = 7;
export const LOGIN_PROMPT_DAYS: readonly number[] = [5, 7];
export const PROMPT_DAILY_AFTER_DAY: number = 7;

// ---------------------------------------------------------------------------
// On-device AI timing / retry
// ---------------------------------------------------------------------------
export const AI_FIRST_TOKEN_TIMEOUT_MS: number = 2000;
export const AI_INFERENCE_TIMEOUT_MS: number = 10000;
export const AI_MAX_RETRY: number = 1;

// ---------------------------------------------------------------------------
// Scenes (order is significant: new-word queue walks ALL_SCENES in this order)
// ---------------------------------------------------------------------------
export const ALL_SCENES: readonly Scene[] = [
  Scene.AIRPORT,
  Scene.CUSTOMS,
  Scene.HOTEL,
  Scene.DINING,
  Scene.DIRECTIONS,
  Scene.SHOPPING,
  Scene.TRANSPORT,
  Scene.EMERGENCY,
];

export const SCENE_LABELS: Readonly<Record<Scene, string>> = {
  [Scene.AIRPORT]: '机场值机',
  [Scene.CUSTOMS]: '过海关',
  [Scene.HOTEL]: '酒店入住',
  [Scene.DINING]: '餐厅点餐',
  [Scene.DIRECTIONS]: '问路导航',
  [Scene.SHOPPING]: '购物退税',
  [Scene.TRANSPORT]: '交通购票',
  [Scene.EMERGENCY]: '紧急求助',
};

export const SCENE_AI_ROLES: Readonly<Record<Scene, string>> = {
  [Scene.AIRPORT]: '值机员',
  [Scene.CUSTOMS]: '海关官员',
  [Scene.HOTEL]: '前台',
  [Scene.DINING]: '服务员',
  [Scene.DIRECTIONS]: '路人',
  [Scene.SHOPPING]: '店员',
  [Scene.TRANSPORT]: '售票员',
  [Scene.EMERGENCY]: '求助台工作人员',
};

export const SCENE_ICONS: Readonly<Record<Scene, string>> = {
  [Scene.AIRPORT]: '✈️',
  [Scene.CUSTOMS]: '🛂',
  [Scene.HOTEL]: '🏨',
  [Scene.DINING]: '🍽️',
  [Scene.DIRECTIONS]: '🧭',
  [Scene.SHOPPING]: '🛍️',
  [Scene.TRANSPORT]: '🎫',
  [Scene.EMERGENCY]: '🆘',
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: Settings = {
  dailyGoalSeconds: DAILY_GOAL_SECONDS,
  newWordsPerDay: DEFAULT_NEW_CAP,
  restDayEnabled: false,
  preferredScenes: ALL_SCENES,
  darkMode: false,
  aiProvider: AIProviderKind.OnDevice,
  locale: 'en-US',
};

/** The immutable guest session used whenever no authenticated session exists. */
export const DEFAULT_GUEST_SESSION: AccountSession = {
  kind: SessionKind.Guest,
  uid: 'guest',
  displayName: '游客',
  partition: 'guest:',
  authenticatedAtMs: 0,
  tokenRefreshedAtMs: 0,
};

/** Unlock hint shown by the F-20 read-layer gate. */
export const GATE_UNLOCK_HINT: string = '登录华为账号，解锁进度';

/** Sentinel used by the check-in / stats services for a full-range date scan. */
export const FULL_RANGE_FROM_YMD: string = '1970-01-01';
export const FULL_RANGE_TO_YMD: string = '2999-12-31';
