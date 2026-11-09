/**
 * Track C AI assembly. The primary provider is a switchable wrapper over
 * `ScriptedAI` that can force an `E_AI_MODEL_NOT_READY` failure, so the H5
 * preview can demonstrate the on-device → ScriptedAI downgrade without any
 * SDK. The router's fallback is always a real `ScriptedAI`.
 */
import {
  AIService, AIContext, AIReply, AIProviderKind, AIProviderRouter, AIResponseEnvelope,
  ErrorCode, Result, fail, createAIProviderRouter, createScriptedAI,
  createQualityTagParser, ScriptedAI, QualityTagParser, AI_INFERENCE_TIMEOUT_MS,
} from '@core';

class SwitchablePrimaryAI implements AIService {
  readonly kind: AIProviderKind = AIProviderKind.OnDevice;
  readonly timeoutMs: number = AI_INFERENCE_TIMEOUT_MS;
  private readonly scripted: ScriptedAI;
  private failureDemo: boolean = false;

  constructor(scripted: ScriptedAI) {
    this.scripted = scripted;
  }

  setFailureDemo(enabled: boolean): void {
    this.failureDemo = enabled;
  }

  isFailureDemo(): boolean {
    return this.failureDemo;
  }

  async isReady(): Promise<boolean> {
    return !this.failureDemo;
  }

  async generate(ctx: AIContext): Promise<Result<AIReply>> {
    if (this.failureDemo) {
      return fail<AIReply>(ErrorCode.AI_MODEL_NOT_READY, 'preview: simulated on-device failure');
    }
    return this.scripted.generate(ctx);
  }
}

export interface PreviewAI {
  readonly router: AIProviderRouter;
  readonly primary: SwitchablePrimaryAI;
  readonly fallback: ScriptedAI;
  readonly parser: QualityTagParser;
  setFailureDemo(enabled: boolean): void;
  isFailureDemo(): boolean;
}

/** Assemble the preview AI provider graph. */
export function createPreviewRouter(): PreviewAI {
  const scripted: ScriptedAI = createScriptedAI();
  const fallback: ScriptedAI = createScriptedAI();
  const parser: QualityTagParser = createQualityTagParser();
  const primary: SwitchablePrimaryAI = new SwitchablePrimaryAI(scripted);
  const router: AIProviderRouter = createAIProviderRouter(primary, fallback, parser);
  const preview: PreviewAI = {
    router: router,
    primary: primary,
    fallback: fallback,
    parser: parser,
    setFailureDemo(enabled: boolean): void {
      primary.setFailureDemo(enabled);
    },
    isFailureDemo(): boolean {
      return primary.isFailureDemo();
    },
  };
  return preview;
}

/** Type alias so a caller can hold an envelope without importing extra symbols. */
export type PreviewEnvelope = AIResponseEnvelope;
