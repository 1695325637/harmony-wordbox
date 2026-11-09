// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.
// Mechanical mirror of core/src produced by scripts/sync-core.mjs.
// Edit the source under core/src/ then run `npm run sync:core`.
// Verified by `npm run check:core-sync`. Business bytes are unchanged.
// Source: core/src/services/scriptedAI.ts

/**
 * `ScriptedAI` — fully offline fallback provider. It always produces a legal
 * `[[QUALITY:n]]` tag so scheduling keeps advancing even when the on-device
 * model is unavailable. No network, no SDK, no `Date.now()`.
 */
import { AIContext, AIReply, AIProviderKind, ChatMessage, ChatRole } from '../models/types';
import { ErrorCode, ok, Result } from '../models/errors';
import { AIService } from '../ports/ports';
import { AI_INFERENCE_TIMEOUT_MS } from '../models/constants';
import { scriptFor, ScriptTurn } from '../data/scriptTemplates';

export class ScriptedAI implements AIService {
  readonly kind: AIProviderKind = AIProviderKind.Scripted;
  readonly timeoutMs: number = AI_INFERENCE_TIMEOUT_MS;

  async isReady(): Promise<boolean> {
    return true;
  }

  async generate(ctx: AIContext): Promise<Result<AIReply>> {
    const turn: ScriptTurn = scriptFor(ctx.scene, ctx.turnIndex, ctx.sessionId);
    const targetTexts: string[] = [];
    for (const word of ctx.words) {
      if (ctx.targetWordIds.indexOf(word.id) >= 0) targetTexts.push(word.text);
    }
    const lastUser: string = ScriptedAI.lastUserText(ctx.history);
    const lowered: string = lastUser.toLowerCase();
    let hit: boolean = false;
    for (const text of targetTexts) {
      if (text.length > 0 && lowered.indexOf(text.toLowerCase()) >= 0) hit = true;
    }
    const quality: number = hit ? 5 : 3;
    const focus: string = targetTexts.length > 0 ? targetTexts.join(' / ') : 'these travel phrases';
    const content: string = turn.aiText + ' 本轮请试着用上：' + focus
      + '。 [[QUALITY:' + String(quality) + ']]';
    const reply: AIReply = {
      content: content,
      provider: AIProviderKind.Scripted,
      latencyMs: 0,
      degraded: true,
      errorCode: ErrorCode.NONE,
    };
    return ok<AIReply>(reply);
  }

  private static lastUserText(history: readonly ChatMessage[]): string {
    let text: string = '';
    for (const message of history) {
      if (message.role === ChatRole.User) text = message.content;
    }
    return text;
  }
}

/** Factory for the scripted fallback provider. */
export function createScriptedAI(): ScriptedAI {
  return new ScriptedAI();
}
