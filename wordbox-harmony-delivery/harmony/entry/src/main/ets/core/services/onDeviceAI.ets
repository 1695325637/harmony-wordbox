// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/onDeviceAI.ts

/**
 * `OnDeviceAI` — the primary provider. It depends ONLY on the `InferenceEngine`
 * port (never on `@ohos.*` / vendor SDK), so all failure branches are unit
 * testable in Node. Any AI_* error is normalized and propagated to the router,
 * which then degrades to `ScriptedAI`.
 */
import { AIContext, AIReply, AIProviderKind, AcceleratorKind } from '../models/types';
import { ErrorCode, ok, fail, Result } from '../models/errors';
import { AIService, InferenceEngine } from '../ports/ports';
import { AI_INFERENCE_TIMEOUT_MS } from '../models/constants';
import { PromptStrategy, createPromptStrategy } from './prompt';

export class OnDeviceAI implements AIService {
  readonly kind: AIProviderKind = AIProviderKind.OnDevice;
  readonly timeoutMs: number = AI_INFERENCE_TIMEOUT_MS;

  private readonly engine: InferenceEngine;
  private readonly promptStrategy: PromptStrategy;
  private unloadCount: number = 0;

  constructor(engine: InferenceEngine, promptStrategy?: PromptStrategy) {
    this.engine = engine;
    this.promptStrategy = promptStrategy ?? createPromptStrategy();
  }

  /** Diagnostic hook: how many times `unload()` was requested. */
  getUnloadCount(): number {
    return this.unloadCount;
  }

  async isReady(): Promise<boolean> {
    const accel: AcceleratorKind = await this.engine.probeAccelerator();
    return accel !== AcceleratorKind.UNAVAILABLE;
  }

  async generate(ctx: AIContext): Promise<Result<AIReply>> {
    const accel: AcceleratorKind = await this.engine.probeAccelerator();
    if (accel === AcceleratorKind.UNAVAILABLE) {
      this.unloadCount = this.unloadCount + 1;
      await this.engine.unload();
      return fail<AIReply>(ErrorCode.AI_MODEL_NOT_READY, 'accelerator unavailable');
    }

    const loaded: Result<boolean> = await this.engine.loadModel();
    if (!loaded.ok || loaded.value !== true) {
      this.unloadCount = this.unloadCount + 1;
      await this.engine.unload();
      const code: ErrorCode = loaded.error !== undefined ? loaded.error.code : ErrorCode.AI_MODEL_NOT_READY;
      return fail<AIReply>(code, loaded.error !== undefined ? loaded.error.detail : 'model load failed');
    }

    const prompt = this.promptStrategy.build(ctx);
    const text: string = prompt.system + '\n' + prompt.user + '\n' + prompt.qualityProtocol;
    const inferred: Result<string> = await this.engine.infer(text, AI_INFERENCE_TIMEOUT_MS);
    if (!inferred.ok || inferred.value === undefined) {
      this.unloadCount = this.unloadCount + 1;
      await this.engine.unload();
      const code: ErrorCode = inferred.error !== undefined ? inferred.error.code : ErrorCode.AI_ENGINE_ERROR;
      const detail: string = inferred.error !== undefined ? inferred.error.detail : 'inference failed';
      return fail<AIReply>(code, detail);
    }
    if (inferred.value.trim().length === 0) {
      this.unloadCount = this.unloadCount + 1;
      await this.engine.unload();
      return fail<AIReply>(ErrorCode.AI_EMPTY_REPLY, 'empty inference reply');
    }

    this.unloadCount = this.unloadCount + 1;
    await this.engine.unload();
    const reply: AIReply = {
      content: inferred.value,
      provider: AIProviderKind.OnDevice,
      latencyMs: 0,
      degraded: false,
      errorCode: ErrorCode.NONE,
    };
    return ok<AIReply>(reply);
  }
}

/** Factory for the on-device provider. */
export function createOnDeviceAI(engine: InferenceEngine, promptStrategy?: PromptStrategy): OnDeviceAI {
  return new OnDeviceAI(engine, promptStrategy);
}
