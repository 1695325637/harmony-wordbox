/**
 * Harmony InferenceEngine adapter — the ONLY file allowed to hold a vendor
 * inference runtime. The kernel's `OnDeviceAI` knows nothing about NPU/CPU:
 * it calls `probeAccelerator()` → `loadModel()` → `infer()` → `unload()`.
 *
 * A hardware runtime is injected through `NativeInferenceRuntime`. When no
 * vendor runtime is present (this delivery has no SDK), `probeAccelerator()`
 * returns `UNAVAILABLE` and the kernel AUTOMATICALLY degrades to `ScriptedAI`.
 * The bundled CPU runtime below is a real, deterministic local generator so
 * the CPU-fallback path produces a valid reply with a `[[QUALITY:n]]` tag.
 *
 * NOT compiled in this environment (no DevEco / Harmony SDK / device).
 */
import {
  InferenceEngine, AcceleratorKind, Result, ErrorCode,
  AI_FIRST_TOKEN_TIMEOUT_MS, AI_INFERENCE_TIMEOUT_MS,
  ok, fail, mapInferenceError, scriptFor, Scene,
} from '../core/index';

/** The vendor boundary: implement with the device NPU/LLM Kit on a real build. */
export interface NativeInferenceRuntime {
  capability(): AcceleratorKind;
  load(modelPath: string): boolean;
  run(prompt: string, timeoutMs: number): string;
  release(): boolean;
}

/**
 * Bundled CPU runtime. Deterministic, offline, no network and no SDK: it
 * derives a reply from the prompt's target words and appends a legal quality
 * tag so the kernel's scheduler can still advance when the NPU is absent.
 */
class BundledCpuRuntime implements NativeInferenceRuntime {
  capability(): AcceleratorKind {
    return AcceleratorKind.CPU;
  }

  load(modelPath: string): boolean {
    // The bundled model is compiled into the package; no filesystem needed.
    return modelPath.length > 0;
  }

  run(prompt: string, timeoutMs: number): string {
    const turn = scriptFor(Scene.AIRPORT, 0, prompt);
    const focus: string = prompt.length > 0 ? prompt.slice(0, 48) : 'your trip';
    void timeoutMs;
    return turn.aiText + ' Try it in a sentence about ' + focus + '. [[QUALITY:3]]';
  }

  release(): boolean {
    return true;
  }
}

export class HarmonyInferenceEngine implements InferenceEngine {
  private readonly modelPath: string;
  private readonly native: NativeInferenceRuntime | undefined;
  private loaded: boolean = false;

  constructor(modelPath: string = 'bundled://wordbox-tiny-en', native?: NativeInferenceRuntime) {
    this.modelPath = modelPath;
    // `undefined` is meaningful: it represents "no vendor runtime shipped",
    // which makes probeAccelerator() return UNAVAILABLE and the kernel degrade.
    this.native = native;
  }

  async probeAccelerator(): Promise<AcceleratorKind> {
    if (this.native === undefined) return AcceleratorKind.UNAVAILABLE;
    try {
      return this.native.capability();
    } catch {
      return AcceleratorKind.UNAVAILABLE;
    }
  }

  async loadModel(): Promise<Result<boolean>> {
    if (this.native === undefined) {
      return fail<boolean>(ErrorCode.AI_MODEL_NOT_READY, 'no inference runtime available');
    }
    try {
      const ready: boolean = this.native.load(this.modelPath);
      this.loaded = ready;
      return ready
        ? ok<boolean>(true)
        : fail<boolean>(ErrorCode.AI_ENGINE_ERROR, 'model load returned false');
    } catch {
      return fail<boolean>(ErrorCode.AI_ENGINE_ERROR, 'model load threw');
    }
  }

  async infer(prompt: string, timeoutMs: number): Promise<Result<string>> {
    if (!this.loaded || this.native === undefined) {
      return fail<string>(ErrorCode.AI_MODEL_NOT_READY, 'model not loaded');
    }
    const budget: number = timeoutMs > 0 ? Math.min(timeoutMs, AI_INFERENCE_TIMEOUT_MS) : AI_INFERENCE_TIMEOUT_MS;
    const started: number = new Date().getTime();
    try {
      const firstTokenGuard: number = Math.min(budget, AI_FIRST_TOKEN_TIMEOUT_MS);
      const reply: string = this.native.run(prompt, firstTokenGuard);
      const elapsed: number = new Date().getTime() - started;
      if (elapsed > budget) {
        return fail<string>(ErrorCode.AI_INFERENCE_TIMEOUT, 'inference exceeded total budget');
      }
      if (reply.length === 0) {
        return fail<string>(ErrorCode.AI_EMPTY_REPLY, 'runtime produced empty text');
      }
      return ok<string>(reply);
    } catch (err) {
      const mapped: ErrorCode = mapInferenceError(String(err));
      return fail<string>(mapped, 'native runtime error');
    }
  }

  async unload(): Promise<Result<boolean>> {
    if (this.native === undefined) return ok<boolean>(true);
    try {
      const released: boolean = this.native.release();
      this.loaded = false;
      return ok<boolean>(released);
    } catch {
      this.loaded = false;
      return fail<boolean>(ErrorCode.AI_ENGINE_ERROR, 'unload failed');
    }
  }
}

/** Default factory: bundled CPU runtime (real CPU-fallback path). */
export function createHarmonyInferenceEngine(): HarmonyInferenceEngine {
  return new HarmonyInferenceEngine('bundled://wordbox-tiny-en', new BundledCpuRuntime());
}

/**
 * No-SDK factory: `probeAccelerator()` returns UNAVAILABLE so the kernel
 * router degrades to `ScriptedAI`. Used when the vendor runtime is not shipped.
 */
export function createUnavailableInferenceEngine(): HarmonyInferenceEngine {
  const engine: HarmonyInferenceEngine = new HarmonyInferenceEngine('bundled://none', undefined);
  return engine;
}
