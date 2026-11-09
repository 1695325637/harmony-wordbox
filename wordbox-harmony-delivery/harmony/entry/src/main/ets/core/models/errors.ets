// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/models/errors.ts

/**
 * Error codes, the Result envelope and pure error helpers.
 * This module is intentionally dependency-free: it is the bottom of the kernel
 * dependency graph and is imported by `types.ts` and every service.
 * ArkTS strict-subset compatible: no `any`, no platform API, no reflection.
 */

/** All error codes the kernel can produce or normalize. */
export enum ErrorCode {
  NONE = '',
  INVALID_ARGUMENT = 'E_INVALID_ARGUMENT',
  INVALID_DATE = 'E_INVALID_DATE',
  INVALID_QUALITY = 'E_INVALID_QUALITY',
  STORAGE_READ_FAILED = 'E_STORAGE_READ',
  STORAGE_WRITE_FAILED = 'E_STORAGE_WRITE',
  STORAGE_BATCH_PARTIAL = 'E_STORAGE_BATCH_PARTIAL',
  NOT_AUTHENTICATED = 'E_NOT_AUTHENTICATED',
  ACCOUNT_AUTH_FAILED = 'E_ACC_AUTH_FAILED',
  ACCOUNT_NETWORK = 'E_ACC_NETWORK',
  ACCOUNT_USER_CANCELLED = 'E_ACC_CANCELLED',
  ACCOUNT_KIT_UNAVAILABLE = 'E_ACC_KIT_UNAVAILABLE',
  ACCOUNT_TOKEN_EXPIRED = 'E_ACC_TOKEN_EXPIRED',
  AI_MODEL_NOT_READY = 'E_AI_MODEL_NOT_READY',
  AI_NPU_UNAVAILABLE = 'E_AI_NPU_UNAVAILABLE',
  AI_FIRST_TOKEN_TIMEOUT = 'E_AI_FIRST_TOKEN_TIMEOUT',
  AI_INFERENCE_TIMEOUT = 'E_AI_INFERENCE_TIMEOUT',
  AI_OUT_OF_MEMORY = 'E_AI_OUT_OF_MEMORY',
  AI_EMPTY_REPLY = 'E_AI_EMPTY_REPLY',
  AI_ENGINE_ERROR = 'E_AI_ENGINE_ERROR',
  GATE_BLOCKED = 'E_GATE_BLOCKED',
  MERGE_NO_GUEST_DATA = 'E_MERGE_NO_GUEST_DATA',
  MERGE_OUTSIDE_WINDOW_ONLY = 'E_MERGE_OUTSIDE_WINDOW_ONLY',
  MERGE_DECISION_BLOCKED = 'E_MERGE_DECISION_BLOCKED',
  MERGE_NOT_AUTHENTICATED = 'E_MERGE_NOT_AUTHENTICATED',
  PROMPT_INVALID_STATE = 'E_PROMPT_INVALID_STATE',
}

/** A structured, local-only error description. */
export interface AppError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly detail: string;
}

/**
 * The single return envelope of every service method.
 * `ok=true` ⇒ `value` present, `error` undefined.
 * `ok=false` ⇒ `value` undefined, `error` present.
 */
export interface Result<T> {
  readonly ok: boolean;
  readonly value: T | undefined;
  readonly error: AppError | undefined;
}

/** Build a successful Result. */
export function ok<T>(value: T): Result<T> {
  const result: Result<T> = { ok: true, value: value, error: undefined };
  return result;
}

/** Build a failed Result; never throws. */
export function fail<T>(code: ErrorCode, detail: string): Result<T> {
  const error: AppError = { code: code, message: errorMessage(code), detail: detail };
  const result: Result<T> = { ok: false, value: undefined, error: error };
  return result;
}

/** Build a standalone AppError (used by AI diagnostics / errorChain). */
export function makeError(code: ErrorCode, detail: string): AppError {
  const error: AppError = { code: code, message: errorMessage(code), detail: detail };
  return error;
}

/** Human-readable message for an error code (local diagnostics only). */
export function errorMessage(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.NONE: return 'ok';
    case ErrorCode.INVALID_ARGUMENT: return 'invalid argument';
    case ErrorCode.INVALID_DATE: return 'invalid date';
    case ErrorCode.INVALID_QUALITY: return 'invalid quality';
    case ErrorCode.STORAGE_READ_FAILED: return 'storage read failed';
    case ErrorCode.STORAGE_WRITE_FAILED: return 'storage write failed';
    case ErrorCode.STORAGE_BATCH_PARTIAL: return 'storage batch failed, nothing committed';
    case ErrorCode.NOT_AUTHENTICATED: return 'not authenticated';
    case ErrorCode.ACCOUNT_AUTH_FAILED: return 'account auth failed';
    case ErrorCode.ACCOUNT_NETWORK: return 'account network error';
    case ErrorCode.ACCOUNT_USER_CANCELLED: return 'account sign-in cancelled';
    case ErrorCode.ACCOUNT_KIT_UNAVAILABLE: return 'account kit unavailable';
    case ErrorCode.ACCOUNT_TOKEN_EXPIRED: return 'account token expired';
    case ErrorCode.AI_MODEL_NOT_READY: return 'on-device model not ready';
    case ErrorCode.AI_NPU_UNAVAILABLE: return 'npu unavailable, cpu fallback';
    case ErrorCode.AI_FIRST_TOKEN_TIMEOUT: return 'first token timeout';
    case ErrorCode.AI_INFERENCE_TIMEOUT: return 'inference timeout';
    case ErrorCode.AI_OUT_OF_MEMORY: return 'inference out of memory';
    case ErrorCode.AI_EMPTY_REPLY: return 'empty inference reply';
    case ErrorCode.AI_ENGINE_ERROR: return 'inference engine error';
    case ErrorCode.GATE_BLOCKED: return 'progress gate blocked';
    case ErrorCode.MERGE_NO_GUEST_DATA: return 'no guest data to merge';
    case ErrorCode.MERGE_OUTSIDE_WINDOW_ONLY: return 'only outside-window guest data';
    case ErrorCode.MERGE_DECISION_BLOCKED: return 'merge blocked by decision';
    case ErrorCode.MERGE_NOT_AUTHENTICATED: return 'merge requires authentication';
    case ErrorCode.PROMPT_INVALID_STATE: return 'prompt state invalid';
    default: return 'unknown error';
  }
}

const ACCOUNT_KIT_ERROR_MAP: Readonly<Record<string, ErrorCode>> = {
  '1001500001': ErrorCode.ACCOUNT_NETWORK,
  'network': ErrorCode.ACCOUNT_NETWORK,
  '1001500002': ErrorCode.ACCOUNT_USER_CANCELLED,
  'cancel': ErrorCode.ACCOUNT_USER_CANCELLED,
  'cancelled': ErrorCode.ACCOUNT_USER_CANCELLED,
  '1001500003': ErrorCode.ACCOUNT_KIT_UNAVAILABLE,
  'unavailable': ErrorCode.ACCOUNT_KIT_UNAVAILABLE,
  '1001500004': ErrorCode.ACCOUNT_TOKEN_EXPIRED,
  'expired': ErrorCode.ACCOUNT_TOKEN_EXPIRED,
  '1001500005': ErrorCode.ACCOUNT_AUTH_FAILED,
};

const INFERENCE_ERROR_MAP: Readonly<Record<string, ErrorCode>> = {
  'model_not_ready': ErrorCode.AI_MODEL_NOT_READY,
  'npu_unavailable': ErrorCode.AI_NPU_UNAVAILABLE,
  'first_token_timeout': ErrorCode.AI_FIRST_TOKEN_TIMEOUT,
  'inference_timeout': ErrorCode.AI_INFERENCE_TIMEOUT,
  'out_of_memory': ErrorCode.AI_OUT_OF_MEMORY,
  'empty_reply': ErrorCode.AI_EMPTY_REPLY,
  'engine_error': ErrorCode.AI_ENGINE_ERROR,
};

/** Normalize an external Account Kit code into an internal ErrorCode (pure). */
export function mapAccountKitError(kitCode: string): ErrorCode {
  const mapped: ErrorCode | undefined = ACCOUNT_KIT_ERROR_MAP[kitCode];
  return mapped !== undefined ? mapped : ErrorCode.ACCOUNT_AUTH_FAILED;
}

/** Normalize an external inference engine code into an internal ErrorCode (pure). */
export function mapInferenceError(kitCode: string): ErrorCode {
  const mapped: ErrorCode | undefined = INFERENCE_ERROR_MAP[kitCode];
  return mapped !== undefined ? mapped : ErrorCode.AI_ENGINE_ERROR;
}
