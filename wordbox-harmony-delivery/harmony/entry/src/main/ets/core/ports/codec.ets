// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/ports/codec.ts

/**
 * JSON codec. This is the ONLY file in the kernel that uses an `as T`
 * assertion, and that assertion is always paired with a caller-supplied
 * field-level `validate` function (ArkTS strict-subset requirement).
 * Validators use statically-typed field access — no `unknown`, no `any`,
 * no dynamic property indexing.
 */
import { Result, ok, fail, ErrorCode } from '../models/errors';
import {
  Word, StudyRecord, CheckIn, ChatMessage, Settings,
  AccountSession, GuestPromptState, MergeDecision,
} from '../models/types';

export interface JsonCodec {
  encode<T>(value: T): string;
  decode<T>(raw: string, validate: (value: T) => boolean): Result<T>;
}

/** Create the canonical JsonCodec. */
export function createJsonCodec(): JsonCodec {
  const codec: JsonCodec = {
    encode<T>(value: T): string {
      return JSON.stringify(value);
    },
    decode<T>(raw: string, validate: (value: T) => boolean): Result<T> {
      try {
        const parsed: T = JSON.parse(raw) as T;
        if (parsed === null || parsed === undefined) {
          return fail<T>(ErrorCode.STORAGE_READ_FAILED, 'null payload');
        }
        if (!validate(parsed)) {
          return fail<T>(ErrorCode.STORAGE_READ_FAILED, 'decoded value failed field validation');
        }
        return ok<T>(parsed);
      } catch {
        return fail<T>(ErrorCode.STORAGE_READ_FAILED, 'invalid JSON payload');
      }
    },
  };
  return codec;
}

function isStr(v: string): boolean { return typeof v === 'string'; }
function isNum(v: number): boolean { return typeof v === 'number' && Number.isFinite(v); }
function isBool(v: boolean): boolean { return typeof v === 'boolean'; }

/** Generic `readonly string[]` validator (date index / scene lists). */
export function isStringArrayLike(v: readonly string[]): boolean {
  if (!Array.isArray(v)) return false;
  for (const item of v) if (!isStr(item)) return false;
  return true;
}

/** Validate the shape of a serialized `Word`. */
export function isWordLike(v: Word): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.id) && isStr(v.text) && isStr(v.phonetic) && isStr(v.meaningZh)
    && isStr(v.scene) && isStr(v.locale) && isStr(v.exampleInScene) && isStr(v.aiRolePrompt)
    && isStr(v.source) && isStr(v.createdAtYMD);
}

/** Validate the shape of a serialized `StudyRecord`. */
export function isRecordLike(v: StudyRecord): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.wordId) && isNum(v.ef) && isNum(v.repetitions) && isNum(v.intervalDays)
    && isStr(v.dueYMD) && isStr(v.lastReviewedYMD) && isNum(v.lapses) && isStr(v.status)
    && isNum(v.totalReviews) && isNum(v.correctReviews) && isStr(v.createdAtYMD)
    && isStr(v.updatedAtYMD);
}

/** Validate the shape of a serialized `CheckIn`. */
export function isCheckInLike(v: CheckIn): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.dateYMD) && isNum(v.activeSeconds) && isNum(v.goalSeconds)
    && isBool(v.checkedIn) && isNum(v.checkedInAtMs) && isNum(v.streakAfter)
    && isNum(v.newWords) && isNum(v.reviewedWords);
}

/** Validate the shape of a serialized `ChatMessage`. */
export function isChatMessageLike(v: ChatMessage): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.id) && isStr(v.sessionId) && isStr(v.role) && isStr(v.scene)
    && isStringArrayLike(v.wordIds) && isStr(v.content) && isNum(v.quality)
    && isNum(v.createdAtMs) && isStr(v.provider) && isBool(v.degraded);
}

/** Validate the shape of a serialized `Settings`. */
export function isSettingsLike(v: Settings): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isNum(v.dailyGoalSeconds) && isNum(v.newWordsPerDay) && isBool(v.restDayEnabled)
    && isStringArrayLike(v.preferredScenes) && isBool(v.darkMode)
    && isStr(v.aiProvider) && isStr(v.locale);
}

/** Validate the shape of a serialized `AccountSession`. */
export function isSessionLike(v: AccountSession): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.kind) && isStr(v.uid) && isStr(v.displayName) && isStr(v.partition)
    && isNum(v.authenticatedAtMs) && isNum(v.tokenRefreshedAtMs);
}

/** Validate the shape of a serialized `GuestPromptState`. */
export function isPromptStateLike(v: GuestPromptState): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.firstStudyYMD) && isBool(v.neverPrompt)
    && isStr(v.lastPromptDate) && isStr(v.lastDecisionYMD);
}

/** Validate the shape of a serialized `MergeDecision`. */
export function isMergeDecisionLike(v: MergeDecision): boolean {
  if (v === null || typeof v !== 'object') return false;
  return isStr(v.uid) && isStr(v.choice) && isNum(v.decidedAtMs) && isStr(v.idempotencyKey);
}
