// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/aiRouter.ts

/**
 * `AIProviderRouter` — orchestrates primary (OnDevice) → at most one retry →
 * fallback (ScriptedAI). Records a local-only `errorChain`. Degradation never
 * interrupts the 600s check-in loop: the fallback always yields a legal
 * `[[QUALITY:n]]` tag so scheduling keeps advancing.
 */
import {
  AIContext, AIReply, AIProviderKind, AIResponseEnvelope, ParsedAIReply, AppError,
} from '../models/types';
import { ErrorCode, makeError } from '../models/errors';
import { AIService, Clock } from '../ports/ports';
import { AI_MAX_RETRY } from '../models/constants';
import { QualityTagParser } from './quality';

export interface AIProviderRouter {
  readonly primary: AIService;
  readonly fallback: AIService;
  reply(ctx: AIContext, clock: Clock): Promise<AIResponseEnvelope>;
  currentProvider(): AIProviderKind;
}

/** Create the router with explicit primary / fallback / parser injection. */
export function createAIProviderRouter(
  primary: AIService,
  fallback: AIService,
  parser: QualityTagParser,
): AIProviderRouter {
  let lastProvider: AIProviderKind = primary.kind;
  const maxAttempts: number = AI_MAX_RETRY + 1;

  const router: AIProviderRouter = {
    primary: primary,
    fallback: fallback,

    currentProvider(): AIProviderKind {
      return lastProvider;
    },

    async reply(ctx: AIContext, clock: Clock): Promise<AIResponseEnvelope> {
      const errorChain: AppError[] = [];
      let attempts: number = 0;

      for (let i: number = 0; i < maxAttempts; i++) {
        attempts = attempts + 1;
        const r = await primary.generate(ctx);
        if (r.ok && r.value !== undefined) {
          const raw: ParsedAIReply = parser.parse(r.value.content);
          const parsed: ParsedAIReply = {
            displayText: raw.displayText,
            quality: raw.quality,
            wordIds: ctx.targetWordIds,
          };
          lastProvider = r.value.provider;
          const envelope: AIResponseEnvelope = {
            reply: r.value,
            parsed: parsed,
            degraded: false,
            attempts: attempts,
            errorChain: [],
          };
          return envelope;
        }
        const e: AppError = r.error !== undefined
          ? r.error
          : makeError(ErrorCode.AI_ENGINE_ERROR, 'unknown primary failure');
        errorChain.push(e);
      }

      // Fallback path (degraded). Never throws, never blocks the learning loop.
      const startMs: number = clock.nowMs();
      const f = await fallback.generate(ctx);
      let content: string;
      let provider: AIProviderKind;
      if (f.ok && f.value !== undefined) {
        content = f.value.content;
        provider = f.value.provider;
      } else {
        content = 'Let us keep practising these travel words. [[QUALITY:3]]';
        provider = fallback.kind;
        const e: AppError = f.error !== undefined
          ? f.error
          : makeError(ErrorCode.AI_ENGINE_ERROR, 'fallback failure');
        errorChain.push(e);
      }

      // Guarantee a legal QUALITY tag on degradation.
      let rawParsed: ParsedAIReply = parser.parse(content);
      if (rawParsed.quality < 0) {
        content = content + ' [[QUALITY:3]]';
        rawParsed = parser.parse(content);
      }
      const parsed: ParsedAIReply = {
        displayText: rawParsed.displayText,
        quality: rawParsed.quality,
        wordIds: ctx.targetWordIds,
      };
      const reply: AIReply = {
        content: content,
        provider: provider,
        latencyMs: Math.max(0, clock.nowMs() - startMs),
        degraded: true,
        errorCode: ErrorCode.NONE,
      };
      lastProvider = provider;
      const envelope: AIResponseEnvelope = {
        reply: reply,
        parsed: parsed,
        degraded: true,
        attempts: attempts,
        errorChain: errorChain,
      };
      return envelope;
    },
  };
  return router;
}
