/**
 * The six ports (dependency-injection contracts) of the WordBox kernel.
 * Only contracts live here: no implementation, no platform import.
 * Every platform capability (storage, clock, inference, account, speech) must
 * be injected through one of these interfaces — the kernel never imports
 * `@ohos.*`, `window.*`, `node:*` or any vendor SDK.
 */
import {
  Result, StorageEntry, AIProviderKind, AIContext, AIReply,
  AcceleratorKind, AccountAuthResult,
} from '../models/types';

/** Wall-clock abstraction. `SystemClock` is the only implementation allowed to call `new Date()`. */
export interface Clock {
  nowMs(): number;
  todayYMD(): string;
  ymdFromMs(ms: number): string;
  msFromYMD(ymd: string): number;
}

/** String key/value store. Implementations must make `batchSet` atomic. */
export interface StorageService {
  get(key: string): Promise<Result<string | undefined>>;
  set(key: string, value: string): Promise<Result<boolean>>;
  remove(key: string): Promise<Result<boolean>>;
  keys(prefix: string): Promise<Result<readonly string[]>>;
  batchSet(entries: readonly StorageEntry[]): Promise<Result<boolean>>;
  batchRemove(keys: readonly string[]): Promise<Result<boolean>>;
}

/** A chat-generation provider (OnDevice / Scripted / Mock). */
export interface AIService {
  readonly kind: AIProviderKind;
  readonly timeoutMs: number;
  isReady(): Promise<boolean>;
  generate(ctx: AIContext): Promise<Result<AIReply>>;
}

/** On-device inference engine port — implemented only on the Harmony track. */
export interface InferenceEngine {
  probeAccelerator(): Promise<AcceleratorKind>;
  loadModel(): Promise<Result<boolean>>;
  infer(prompt: string, timeoutMs: number): Promise<Result<string>>;
  unload(): Promise<Result<boolean>>;
}

/** Account provider port — Huawei Account Kit / offline preview / test double. */
export interface AccountProvider {
  signIn(): Promise<Result<AccountAuthResult>>;
  signOut(): Promise<Result<boolean>>;
  refreshToken(): Promise<Result<AccountAuthResult>>;
}

/** Speech port (Q6 / P1): declared for MVP completeness, not enabled. */
export interface SpeechService {
  speak(text: string, locale: string): Promise<Result<boolean>>;
  listen(locale: string): Promise<Result<string>>;
}
