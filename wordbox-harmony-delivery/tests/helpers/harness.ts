/**
 * 真实内核装配 harness —— 通过内核自带的 `createKernel` 一次性装配全部
 * Service（与工程师 `_smoke.test.ts` 的用法一致），仅注入测试替身端口：
 *   FakeClock / MemoryStorageService / MockAI / ScriptedAI /
 *   FakeAccountProvider / FakeInferenceEngine。
 * 全程无网络、无真机、无 `Date.now()`；每个用例创建全新 harness，互相独立。
 */
import {
  createKernel, createMemoryStorageService, createScriptedAI, createMockAI,
  createOnDeviceAI, ok, fail, ErrorCode, AIProviderKind, AcceleratorKind,
  DEFAULT_GUEST_SESSION, authenticatedSession,
} from '@core';
import type {
  AccountAuthResult, AccountProvider, AIService, InferenceEngine,
  Kernel, KernelServices, Result, AccountSession,
  Word, StudyRecord, CheckIn, ChatMessage,
} from '@core';
import { FakeClock } from './fakeClock';
import { createTestStorage } from './memoryStorage';

type TestStorage = ReturnType<typeof createTestStorage>;

// ---------------------------------------------------------------------------
// 可注入端口替身
// ---------------------------------------------------------------------------

/** 账号服务端口替身：可预设认证结果或强制失败，记录调用次数。 */
export class FakeAccountProvider implements AccountProvider {
  private auth: AccountAuthResult;
  private failure: ErrorCode | undefined;
  public signInCalls: number = 0;
  public signOutCalls: number = 0;
  public refreshCalls: number = 0;

  constructor(auth?: AccountAuthResult) {
    this.auth = auth ?? { uid: 'qa-uid-001', displayName: 'QA 旅客', expiresAtMs: 4_102_444_800_000 };
    this.failure = undefined;
  }

  setAuth(auth: AccountAuthResult): void { this.auth = auth; }
  setFailure(code: ErrorCode | undefined): void { this.failure = code; }

  async signIn(): Promise<Result<AccountAuthResult>> {
    this.signInCalls = this.signInCalls + 1;
    if (this.failure !== undefined) return fail<AccountAuthResult>(this.failure, 'FakeAccountProvider signIn 失败');
    return ok<AccountAuthResult>(this.auth);
  }

  async signOut(): Promise<Result<boolean>> {
    this.signOutCalls = this.signOutCalls + 1;
    return ok<boolean>(true);
  }

  async refreshToken(): Promise<Result<AccountAuthResult>> {
    this.refreshCalls = this.refreshCalls + 1;
    if (this.failure !== undefined) return fail<AccountAuthResult>(this.failure, 'FakeAccountProvider refreshToken 失败');
    return ok<AccountAuthResult>(this.auth);
  }
}

/**
 * 端侧推理引擎端口替身：覆盖三类降级
 *  ① AcceleratorKind.UNAVAILABLE（模型未就绪）
 *  ② loadModel 失败
 *  ③ infer 失败（超时 / 低内存 / 引擎错误）或空回复
 */
export class FakeInferenceEngine implements InferenceEngine {
  private accelerator: AcceleratorKind = AcceleratorKind.NPU;
  private loadFailure: ErrorCode | undefined = undefined;
  private inferFailure: ErrorCode | undefined = undefined;
  private inferText: string = 'Sure, here is your boarding pass. [[QUALITY:4]]';
  public unloadCalls: number = 0;
  public inferCalls: number = 0;
  public lastPrompt: string = '';
  public lastTimeoutMs: number = 0;

  setAccelerator(kind: AcceleratorKind): void { this.accelerator = kind; }
  failLoad(code: ErrorCode): void { this.loadFailure = code; }
  failInfer(code: ErrorCode): void { this.inferFailure = code; }
  setInferText(text: string): void { this.inferText = text; }

  reset(): void {
    this.accelerator = AcceleratorKind.NPU;
    this.loadFailure = undefined;
    this.inferFailure = undefined;
    this.inferText = 'Sure, here is your boarding pass. [[QUALITY:4]]';
    this.unloadCalls = 0;
    this.inferCalls = 0;
    this.lastPrompt = '';
    this.lastTimeoutMs = 0;
  }

  async probeAccelerator(): Promise<AcceleratorKind> { return this.accelerator; }

  async loadModel(): Promise<Result<boolean>> {
    if (this.loadFailure !== undefined) return fail<boolean>(this.loadFailure, 'FakeInferenceEngine loadModel 失败');
    return ok<boolean>(true);
  }

  async infer(prompt: string, timeoutMs: number): Promise<Result<string>> {
    this.inferCalls = this.inferCalls + 1;
    this.lastPrompt = prompt;
    this.lastTimeoutMs = timeoutMs;
    if (this.inferFailure !== undefined) return fail<string>(this.inferFailure, 'FakeInferenceEngine infer 失败');
    return ok<string>(this.inferText);
  }

  async unload(): Promise<Result<boolean>> {
    this.unloadCalls = this.unloadCalls + 1;
    return ok<boolean>(true);
  }
}

/** 构造端侧主模型（供 aiFallback 集成用例注入）。 */
export function createOnDevicePrimary(engine: FakeInferenceEngine): AIService {
  return createOnDeviceAI(engine);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export interface HarnessOptions {
  readonly initialYMD?: string;
  readonly clock?: FakeClock;
  readonly storage?: TestStorage;
  readonly primaryAI?: AIService;
  readonly fallbackAI?: AIService;
  readonly accountProvider?: AccountProvider;
}

export interface TestHarness {
  readonly clock: FakeClock;
  readonly storage: TestStorage;
  readonly accountProvider: AccountProvider;
  readonly kernel: Kernel;
  readonly app: Kernel['app'];
  readonly services: KernelServices;
}

/** 创建一套完整、彼此隔离的真实内核 + 测试端口。 */
export function createHarness(options: HarnessOptions = {}): TestHarness {
  const clock: FakeClock = options.clock ?? new FakeClock(options.initialYMD ?? '2026-11-01');
  const storage: TestStorage = options.storage ?? createTestStorage();
  const accountProvider: AccountProvider = options.accountProvider ?? new FakeAccountProvider();
  const primaryAI: AIService = options.primaryAI ?? createMockAI();
  const fallbackAI: AIService = options.fallbackAI ?? createScriptedAI();
  const kernel: Kernel = createKernel({
    storage: storage,
    clock: clock,
    accountProvider: accountProvider,
    primaryAI: primaryAI,
    fallbackAI: fallbackAI,
  });
  return {
    clock: clock,
    storage: storage,
    accountProvider: accountProvider,
    kernel: kernel,
    app: kernel.app,
    services: kernel.services,
  };
}

// ---------------------------------------------------------------------------
// 数据播种辅助（直接走真实 Repository，保证与被测链路同源）
// ---------------------------------------------------------------------------

export function guestSessionOf(): AccountSession { return DEFAULT_GUEST_SESSION; }

export function authSessionOf(uid: string = 'qa-uid-001'): AccountSession {
  return authenticatedSession(uid, 'QA 旅客', 0, 0);
}

/** 把某个 YMD 换算成可被 FakeClock.ymdFromMs 正确还原的时间戳。 */
export function msOf(h: TestHarness, ymd: string): number {
  return h.clock.msFromYMD(ymd);
}

function assertOk(r: Result<unknown>, what: string): void {
  if (!r.ok) throw new Error('harness 写入失败: ' + what + ' / ' + (r.error !== undefined ? r.error.code : 'unknown'));
}

export async function writeGuestCheckIn(h: TestHarness, c: CheckIn): Promise<void> {
  assertOk(await h.services.repository.saveCheckIn(guestSessionOf(), c), 'guest checkIn ' + c.dateYMD);
}

export async function writeGuestWord(h: TestHarness, w: Word): Promise<void> {
  assertOk(await h.services.repository.saveWord(guestSessionOf(), w), 'guest word ' + w.id);
}

export async function writeGuestRecord(h: TestHarness, r: StudyRecord): Promise<void> {
  assertOk(await h.services.repository.saveRecord(guestSessionOf(), r), 'guest record ' + r.wordId);
}

export async function writeGuestChat(h: TestHarness, m: ChatMessage): Promise<void> {
  assertOk(await h.services.repository.saveChatMessage(guestSessionOf(), m), 'guest chat ' + m.id);
}

export async function writeAccountCheckIn(h: TestHarness, session: AccountSession, c: CheckIn): Promise<void> {
  assertOk(await h.services.repository.saveCheckIn(session, c), 'account checkIn ' + c.dateYMD);
}

export async function writeAccountRecord(h: TestHarness, session: AccountSession, r: StudyRecord): Promise<void> {
  assertOk(await h.services.repository.saveRecord(session, r), 'account record ' + r.wordId);
}

export async function writeAccountWord(h: TestHarness, session: AccountSession, w: Word): Promise<void> {
  assertOk(await h.services.repository.saveWord(session, w), 'account word ' + w.id);
}

/** 便捷登录：走真实 app facade（会产生类型 B 判定）。 */
export async function signInViaApp(h: TestHarness, uid: string = 'qa-uid-001'): Promise<void> {
  const r = await h.app.onHuaweiAuthResult({ uid: uid, displayName: 'QA 旅客', expiresAtMs: 4_102_444_800_000 }, h.clock);
  if (!r.ok) throw new Error('harness 登录失败');
}

export { AIProviderKind, createMockAI, createScriptedAI, createTestStorage };
