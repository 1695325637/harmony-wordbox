/**
 * Harmony cold-start assembly (track B).
 *
 * Wires the four platform adapters into `createKernel()` — exactly the same
 * factory used by the H5 preview and the Vitest suites — then runs the fixed
 * `bootstrap()` order. The primary AI provider is `OnDeviceAI` over
 * `HarmonyInferenceEngine`; the fallback is always `ScriptedAI`. UI pages
 * never import a vendor Kit.
 *
 * NOT compiled in this environment (no DevEco / Harmony SDK).
 */
import { common } from '@kit.AbilityKit';
import {
  Kernel, KernelPorts, BootstrapResult, Result, ErrorCode, fail,
  SessionKind, AccountAuthResult, AccountSession,
  AuthFlowResult, MergePromptDecision,
  createKernel, createOnDeviceAI, createScriptedAI,
} from '../core/index';
import {
  HarmonyPreferencesStorage, createHarmonyPreferencesStorage,
} from '../adapters/HarmonyPreferencesStorage';
import { HarmonyClock, createHarmonyClock } from '../adapters/HarmonyClock';
import {
  HarmonyInferenceEngine, createHarmonyInferenceEngine,
} from '../adapters/HarmonyInferenceEngine';
import {
  HuaweiAccountProvider, createHuaweiAccountProvider,
} from '../adapters/HuaweiAccountProvider';
import { appState } from './AppState';

/** Assemble the kernel once per application process. */
export async function bootstrapHarmony(context: common.UIAbilityContext): Promise<Result<BootstrapResult>> {
  const storage: HarmonyPreferencesStorage = createHarmonyPreferencesStorage();
  const initR: Result<boolean> = await storage.init(context);
  if (!initR.ok) {
    return fail<BootstrapResult>(ErrorCode.STORAGE_READ_FAILED, 'preferences init failed');
  }

  const clock: HarmonyClock = createHarmonyClock();
  const accountProvider: HuaweiAccountProvider = createHuaweiAccountProvider(context);
  const engine: HarmonyInferenceEngine = createHarmonyInferenceEngine();
  const primaryAI = createOnDeviceAI(engine);
  const fallbackAI = createScriptedAI();

  const ports: KernelPorts = {
    storage: storage,
    clock: clock,
    accountProvider: accountProvider,
    primaryAI: primaryAI,
    fallbackAI: fallbackAI,
  };
  const kernel: Kernel = createKernel(ports);
  appState.kernel = kernel;

  const boot: Result<BootstrapResult> = await kernel.app.bootstrap(clock);
  if (boot.ok && boot.value !== undefined) {
    appState.bootstrapResult = boot.value;
    appState.session = boot.value.session;
    // Type A is produced ONLY by `decide()` on a guest cold start.
    appState.typeADecision = boot.value.loginGuide;
    appState.showTypeA = boot.value.loginGuide.shouldPrompt;
    appState.ready = true;
    appState.bump();
  }
  return boot;
}

/** Refresh the observable session from the kernel (login / logout / merge). */
export async function refreshHarmonySession(): Promise<void> {
  const kernel: Kernel | undefined = appState.kernel;
  if (kernel === undefined) return;
  const current = await kernel.services.account.current();
  if (current.ok && current.value !== undefined) {
    appState.session = current.value;
  }
  appState.bump();
}

/**
 * Launch the Huawei account authorization and hand the result to the kernel.
 * Type B is opened ONLY when the kernel's `onHuaweiAuthResult()` returns a
 * `mergePrompt.shouldShow === true` decision; `neverPrompt` is never read here.
 */
export async function startHarmonyLogin(): Promise<void> {
  const kernel: Kernel | undefined = appState.kernel;
  if (kernel === undefined) return;
  const authR: Result<AccountAuthResult> = await kernel.accountProvider.signIn();
  const auth: AccountAuthResult | undefined = authR.ok && authR.value !== undefined
    ? authR.value : undefined;
  const flow: Result<AuthFlowResult> = await kernel.app.onHuaweiAuthResult(auth, kernel.clock);
  if (flow.ok && flow.value !== undefined && flow.value.mergePrompt.shouldShow) {
    appState.typeBDecision = flow.value.mergePrompt;
    appState.showTypeB = true;
  }
  await refreshHarmonySession();
}

/** Q12 "再次合并": only `MigrationService.detect()` may produce Type B here. */
export async function reopenMergeDialog(): Promise<boolean> {
  const kernel: Kernel | undefined = appState.kernel;
  if (kernel === undefined) return false;
  const current: Result<AccountSession> = await kernel.services.account.current();
  if (!current.ok || current.value === undefined) return false;
  const session: AccountSession = current.value;
  if (session.kind !== SessionKind.Authenticated) return false;
  const detected: Result<MergePromptDecision> = await kernel.services.migration
    .detect(session.uid, kernel.clock.todayYMD());
  if (!detected.ok || detected.value === undefined || !detected.value.shouldShow) return false;
  appState.typeBDecision = detected.value;
  appState.showTypeB = true;
  appState.bump();
  return true;
}

/** Sign out returns to the guest partition WITHOUT deleting any stored data. */
export async function signOutHarmony(): Promise<void> {
  const kernel: Kernel | undefined = appState.kernel;
  if (kernel === undefined) return;
  await kernel.services.account.signOut(kernel.clock);
  await refreshHarmonySession();
}
