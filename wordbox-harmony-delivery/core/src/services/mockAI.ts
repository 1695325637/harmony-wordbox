/**
 * `MockAI` — injectable test double for the `AIService` port. Tests can queue
 * arbitrary replies (including malformed QUALITY tags) and force any AI error
 * code to exercise every downgrade branch deterministically.
 */
import { AIContext, AIReply, AIProviderKind } from '../models/types';
import { ErrorCode, ok, fail, Result } from '../models/errors';
import { AIService } from '../ports/ports';
import { AI_INFERENCE_TIMEOUT_MS } from '../models/constants';

export class MockAI implements AIService {
  readonly kind: AIProviderKind = AIProviderKind.Mock;
  readonly timeoutMs: number = AI_INFERENCE_TIMEOUT_MS;

  private replies: string[];
  private failures: ErrorCode[];
  private tags: string | undefined;
  private degradedFlag: boolean;

  constructor(replies: readonly string[] = [], failures: readonly ErrorCode[] = []) {
    this.replies = [];
    this.failures = [];
    this.tags = undefined;
    this.degradedFlag = false;
    for (const reply of replies) this.replies.push(reply);
    for (const code of failures) this.failures.push(code);
  }

  /** Queue a forced failure code for the next `generate` call(s). */
  forceFailure(code: ErrorCode): void {
    this.failures.push(code);
  }

  /** Force every subsequent reply to be exactly `raw` (any QUALITY text). */
  setTags(raw: string): void {
    this.tags = raw;
  }

  /** Append a reply to the queue. */
  enqueue(raw: string): void {
    this.replies.push(raw);
  }

  /** Control the `degraded` flag on generated replies. */
  setDegraded(degraded: boolean): void {
    this.degradedFlag = degraded;
  }

  /** Reset all injected state. */
  reset(): void {
    this.replies = [];
    this.failures = [];
    this.tags = undefined;
    this.degradedFlag = false;
  }

  async isReady(): Promise<boolean> {
    return this.failures.length === 0;
  }

  async generate(ctx: AIContext): Promise<Result<AIReply>> {
    if (this.failures.length > 0) {
      const code: ErrorCode = this.failures.shift() ?? ErrorCode.AI_ENGINE_ERROR;
      return fail<AIReply>(code, 'mock forced failure at turn ' + String(ctx.turnIndex));
    }
    let content: string;
    if (this.tags !== undefined) {
      content = this.tags;
    } else if (this.replies.length > 0) {
      content = this.replies.shift() ?? 'Sure! Let us continue. [[QUALITY:4]]';
    } else {
      content = 'Sure! Let us continue. [[QUALITY:4]]';
    }
    const reply: AIReply = {
      content: content,
      provider: AIProviderKind.Mock,
      latencyMs: 0,
      degraded: this.degradedFlag,
      errorCode: ErrorCode.NONE,
    };
    return ok<AIReply>(reply);
  }
}

/** Factory for the mock provider. */
export function createMockAI(replies: readonly string[] = [], failures: readonly ErrorCode[] = []): MockAI {
  return new MockAI(replies, failures);
}
