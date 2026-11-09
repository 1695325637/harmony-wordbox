/**
 * `@core` barrel — the single import surface for the Harmony track, the H5
 * preview track and all Vitest suites. No business logic lives here; it only
 * re-exports the kernel and provides `createKernel`, a convenience factory
 * that wires every port/service exactly once from a small set of injected
 * platform adapters.
 */
import { StorageService, Clock, AccountProvider, AIService } from './ports/ports';
import { JsonCodec, createJsonCodec } from './ports/codec';
import { createProgressGate, ProgressGate } from './services/progressGate';
import { createEbbinghausScheduler, EbbinghausScheduler } from './services/scheduler';
import { createQualityTagParser, QualityTagParser } from './services/quality';
import { createPromptStrategy, PromptStrategy } from './services/prompt';
import { createSceneService, SceneService } from './services/scene';
import { createAIProviderRouter, AIProviderRouter } from './services/aiRouter';
import { createScopedRepository, ScopedRepository } from './services/repository';
import { createGuestRetentionPolicy, createRetentionService, GuestRetentionPolicy, RetentionService } from './services/retention';
import { createAccountService, AccountService } from './services/account';
import { createCheckInService, CheckInService } from './services/checkin';
import { createStatsService, StatsService } from './services/stats';
import { createWordBookService, WordBookService } from './services/wordbook';
import { createProgressMergeService, ProgressMergeService } from './services/migration';
import { createMigrationService, MigrationService } from './services/migration';
import { createLoginPromptPolicy, createLoginPromptService, LoginPromptPolicy, LoginPromptService } from './services/loginPrompt';
import { createWordBoxApp, WordBoxApp, AppDeps } from './services/appFacade';

// ---------------------------------------------------------------------------
// Re-exports (types.ts already re-exports ErrorCode / AppError / Result)
// ---------------------------------------------------------------------------
export * from './models/types';
export { ok, fail, makeError, errorMessage, mapAccountKitError, mapInferenceError } from './models/errors';
export * from './models/constants';
export * from './utils/date';
export * from './utils/id';
export * from './utils/collection';
export * from './data/seedWords';
export * from './data/scriptTemplates';
export * from './ports/ports';
export * from './ports/keys';
export * from './ports/codec';
export * from './adapters/memoryStorage';
export * from './adapters/systemClock';
export * from './services/scheduler';
export * from './services/quality';
export * from './services/prompt';
export * from './services/scriptedAI';
export * from './services/mockAI';
export * from './services/onDeviceAI';
export * from './services/aiRouter';
export * from './services/scene';
export * from './services/progressGate';
export * from './services/repository';
export * from './services/checkin';
export * from './services/stats';
export * from './services/wordbook';
export * from './services/account';
export * from './services/retention';
export * from './services/loginPrompt';
export * from './services/migration';
export * from './services/appFacade';

// ---------------------------------------------------------------------------
// One-stop kernel wiring
// ---------------------------------------------------------------------------

/** Platform adapters that must be supplied by the hosting track. */
export interface KernelPorts {
  readonly storage: StorageService;
  readonly clock: Clock;
  readonly accountProvider: AccountProvider;
  /** Primary AI provider (OnDeviceAI on Harmony, ScriptedAI / MockAI on preview/tests). */
  readonly primaryAI: AIService;
  /** Fallback provider (always ScriptedAI in production). */
  readonly fallbackAI: AIService;
  /** Optional codec override; defaults to `createJsonCodec()`. */
  readonly codec?: JsonCodec;
}

/** All kernel services, exposed for direct unit testing. */
export interface KernelServices {
  readonly scheduler: EbbinghausScheduler;
  readonly parser: QualityTagParser;
  readonly promptStrategy: PromptStrategy;
  readonly aiRouter: AIProviderRouter;
  readonly repository: ScopedRepository;
  readonly gate: ProgressGate;
  readonly retention: RetentionService;
  readonly retentionPolicy: GuestRetentionPolicy;
  readonly account: AccountService;
  readonly checkIn: CheckInService;
  readonly stats: StatsService;
  readonly wordBook: WordBookService;
  readonly scenes: SceneService;
  readonly migration: MigrationService;
  readonly mergePlanner: ProgressMergeService;
  readonly loginPrompt: LoginPromptService;
  readonly loginPromptPolicy: LoginPromptPolicy;
  readonly codec: JsonCodec;
}

/** Fully wired kernel. */
export interface Kernel {
  readonly app: WordBoxApp;
  readonly deps: AppDeps;
  readonly services: KernelServices;
  readonly ports: KernelPorts;
  readonly storage: StorageService;
  readonly clock: Clock;
  readonly accountProvider: AccountProvider;
}

/**
 * Wire the complete kernel from injected platform ports. Build order follows
 * the dependency graph (repository → retention → account → checkIn → stats →
 * migration → loginPrompt → app); there are no runtime cycles.
 */
export function createKernel(ports: KernelPorts): Kernel {
  const codec: JsonCodec = ports.codec !== undefined ? ports.codec : createJsonCodec();
  const gate: ProgressGate = createProgressGate();
  const scheduler: EbbinghausScheduler = createEbbinghausScheduler();
  const parser: QualityTagParser = createQualityTagParser();
  const promptStrategy: PromptStrategy = createPromptStrategy();
  const retentionPolicy: GuestRetentionPolicy = createGuestRetentionPolicy();
  const loginPromptPolicy: LoginPromptPolicy = createLoginPromptPolicy();
  const mergePlanner: ProgressMergeService = createProgressMergeService(scheduler);
  const scenes: SceneService = createSceneService();
  const aiRouter: AIProviderRouter = createAIProviderRouter(ports.primaryAI, ports.fallbackAI, parser);

  const repository: ScopedRepository = createScopedRepository({
    storage: ports.storage, codec: codec, gate: gate, clock: ports.clock,
  });
  const retention: RetentionService = createRetentionService({
    storage: ports.storage, codec: codec, repository: repository,
    policy: retentionPolicy, clock: ports.clock,
  });
  const account: AccountService = createAccountService({
    storage: ports.storage, codec: codec, repository: repository, retention: retention,
  });
  const checkIn: CheckInService = createCheckInService({
    repository: repository, account: account, clock: ports.clock,
  });
  const stats: StatsService = createStatsService({
    repository: repository, gate: gate, checkIn: checkIn, account: account,
  });
  const wordBook: WordBookService = createWordBookService({
    repository: repository, scheduler: scheduler, scenes: scenes,
  });
  const migration: MigrationService = createMigrationService({
    storage: ports.storage, codec: codec, repository: repository, account: account,
    retention: retention, retentionPolicy: retentionPolicy, checkIn: checkIn,
    stats: stats, mergePlanner: mergePlanner,
  });
  const loginPrompt: LoginPromptService = createLoginPromptService({
    policy: loginPromptPolicy, retention: retention, retentionPolicy: retentionPolicy,
    account: account, migration: migration,
  });

  const deps: AppDeps = {
    clock: ports.clock,
    storage: ports.storage,
    codec: codec,
    repository: repository,
    gate: gate,
    scheduler: scheduler,
    checkIn: checkIn,
    stats: stats,
    wordBook: wordBook,
    scenes: scenes,
    account: account,
    accountProvider: ports.accountProvider,
    retention: retention,
    retentionPolicy: retentionPolicy,
    loginPrompt: loginPrompt,
    loginPromptPolicy: loginPromptPolicy,
    migration: migration,
    mergePlanner: mergePlanner,
    aiRouter: aiRouter,
    parser: parser,
    promptStrategy: promptStrategy,
  };
  const app: WordBoxApp = createWordBoxApp(deps);

  const services: KernelServices = {
    scheduler: scheduler,
    parser: parser,
    promptStrategy: promptStrategy,
    aiRouter: aiRouter,
    repository: repository,
    gate: gate,
    retention: retention,
    retentionPolicy: retentionPolicy,
    account: account,
    checkIn: checkIn,
    stats: stats,
    wordBook: wordBook,
    scenes: scenes,
    migration: migration,
    mergePlanner: mergePlanner,
    loginPrompt: loginPrompt,
    loginPromptPolicy: loginPromptPolicy,
    codec: codec,
  };
  const kernel: Kernel = {
    app: app,
    deps: deps,
    services: services,
    ports: ports,
    storage: ports.storage,
    clock: ports.clock,
    accountProvider: ports.accountProvider,
  };
  return kernel;
}
