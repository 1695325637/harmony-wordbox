/**
 * aiRouter.test.ts —— AIProviderRouter 主备降级协议单测。
 * 覆盖：primary 成功 / 最多一次重试 / primary 连续失败降级 Scripted /
 * 降级自动补齐合法 QUALITY / fallback 亦失败兜底 / errorChain /
 * currentProvider / 全程不抛异常（Result<T> 契约）。
 */
import { describe, it, expect } from 'vitest';
import {
  createAIProviderRouter, createMockAI, createScriptedAI, createQualityTagParser,
  ErrorCode, AIProviderKind, AI_MAX_RETRY, Scene,
} from '@core';
import type { AIResponseEnvelope } from '@core';
import { FakeClock } from '../helpers/fakeClock';
import { makeAIContext } from '../helpers/fixtures';

function routerWith(primaryReplies: readonly string[], primaryFailures: readonly ErrorCode[]) {
  const primary = createMockAI(primaryReplies, primaryFailures);
  const fallback = createScriptedAI();
  const router = createAIProviderRouter(primary, fallback, createQualityTagParser());
  const clock = new FakeClock('2026-11-03');
  return { primary, fallback, router, clock };
}

describe('AI 路由：primary 成功路径', () => {
  it('primary 返回带合法标签的回复 → degraded=false、attempts=1、errorChain 为空、provider=Mock、quality=4', async () => {
    const { router, clock } = routerWith(['Nice! [[QUALITY:4]]'], []);
    const env = await router.reply(makeAIContext(), clock);
    expect(env.degraded).toBe(false);
    expect(env.attempts).toBe(1);
    expect(env.errorChain.length).toBe(0);
    expect(env.reply.provider).toBe(AIProviderKind.Mock);
    expect(env.parsed.quality).toBe(4);
    expect(env.parsed.displayText).toBe('Nice!');
    expect(env.parsed.wordIds).toEqual(makeAIContext().targetWordIds);
  });

  it('primary 第一次失败、第二次成功 → degraded=false、attempts=2、errorChain 仍为空（成功即清空）', async () => {
    const { router, clock } = routerWith(['ok [[QUALITY:3]]'], [ErrorCode.AI_INFERENCE_TIMEOUT]);
    const env = await router.reply(makeAIContext(), clock);
    expect(env.degraded).toBe(false);
    expect(env.attempts).toBe(2);
    expect(env.errorChain.length).toBe(0);
    expect(env.parsed.quality).toBe(3);
  });

  it('primary 成功但回复缺失合法 QUALITY 标签 → parsed.quality=-1（主路径不擅自补标签）', async () => {
    const { router, clock } = routerWith(['plain text without any tag'], []);
    const env = await router.reply(makeAIContext(), clock);
    expect(env.degraded).toBe(false);
    expect(env.parsed.quality).toBe(-1);
  });
});

describe('AI 路由：primary 失败 → Scripted 降级', () => {
  it('primary 连续失败 AI_MAX_RETRY+1 次 → 降级 Scripted、degraded=true、attempts=AI_MAX_RETRY+1、errorChain 记录每次错误', async () => {
    expect(AI_MAX_RETRY).toBe(1);
    const { router, clock } = routerWith([], [ErrorCode.AI_MODEL_NOT_READY, ErrorCode.AI_MODEL_NOT_READY]);
    const env = await router.reply(makeAIContext(), clock);
    expect(env.degraded).toBe(true);
    expect(env.attempts).toBe(AI_MAX_RETRY + 1);
    expect(env.errorChain.length).toBe(AI_MAX_RETRY + 1);
    expect(env.errorChain[0].code).toBe(ErrorCode.AI_MODEL_NOT_READY);
    expect(env.reply.provider).toBe(AIProviderKind.Scripted);
    expect(env.reply.degraded).toBe(true);
    expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
  });

  it('三类端侧错误码（未就绪 / 推理超时 / 低内存）均进入 errorChain 且最终降级不抛异常', async () => {
    const cases: readonly ErrorCode[] = [
      ErrorCode.AI_MODEL_NOT_READY,
      ErrorCode.AI_INFERENCE_TIMEOUT,
      ErrorCode.AI_OUT_OF_MEMORY,
    ];
    for (const code of cases) {
      const primary = createMockAI([], [code, code]);
      const router = createAIProviderRouter(primary, createScriptedAI(), createQualityTagParser());
      const clock = new FakeClock('2026-11-03');
      const env: AIResponseEnvelope = await router.reply(makeAIContext(), clock);
      expect(env.degraded).toBe(true);
      expect(env.errorChain[0].code).toBe(code);
      expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
    }
  });

  it('fallback 内容不含合法 QUALITY 标签 → 自动追加「[[QUALITY:3]]」，parsed.quality=3，保证调度可回写', async () => {
    const primary = createMockAI([], [ErrorCode.AI_ENGINE_ERROR, ErrorCode.AI_ENGINE_ERROR]);
    const fallback = createMockAI();
    fallback.setTags('这里是降级回复，没有质量标签');
    const router = createAIProviderRouter(primary, fallback, createQualityTagParser());
    const env = await router.reply(makeAIContext(), new FakeClock('2026-11-03'));
    expect(env.degraded).toBe(true);
    expect(env.reply.content).toContain('[[QUALITY:3]]');
    expect(env.parsed.quality).toBe(3);
    expect(env.parsed.displayText).not.toContain('[[QUALITY:');
  });

  it('primary 与 fallback 均失败 → 使用内核兜底文案，仍给出合法 QUALITY，errorChain 追加，不抛异常', async () => {
    const primary = createMockAI([], [ErrorCode.AI_ENGINE_ERROR, ErrorCode.AI_ENGINE_ERROR]);
    const fallback = createMockAI([], [ErrorCode.AI_EMPTY_REPLY]);
    const router = createAIProviderRouter(primary, fallback, createQualityTagParser());
    const env = await router.reply(makeAIContext(), new FakeClock('2026-11-03'));
    expect(env.degraded).toBe(true);
    expect(env.errorChain.length).toBe(AI_MAX_RETRY + 2);
    expect(env.reply.content).toContain('[[QUALITY:3]]');
    expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
  });
});

describe('AI 路由：provider 跟踪与降级闭环', () => {
  it('currentProvider 初始为 primary.kind，降级后变为 Scripted，再次成功回到 Mock', async () => {
    const primary = createMockAI([], [ErrorCode.AI_MODEL_NOT_READY, ErrorCode.AI_MODEL_NOT_READY]);
    const router = createAIProviderRouter(primary, createScriptedAI(), createQualityTagParser());
    const clock = new FakeClock('2026-11-03');
    expect(router.currentProvider()).toBe(AIProviderKind.Mock);
    await router.reply(makeAIContext(), clock);
    expect(router.currentProvider()).toBe(AIProviderKind.Scripted);
    primary.enqueue('again [[QUALITY:5]]');
    const env2 = await router.reply(makeAIContext(), clock);
    expect(env2.degraded).toBe(false);
    expect(router.currentProvider()).toBe(AIProviderKind.Mock);
  });

  it('连续 6 轮 primary 全失败 → 每轮降级均产出 quality>=0 的合法回复，不中断 600s 打卡闭环', async () => {
    const primary = createMockAI();
    for (let i = 0; i < 6 * (AI_MAX_RETRY + 1); i++) primary.forceFailure(ErrorCode.AI_MODEL_NOT_READY);
    const router = createAIProviderRouter(primary, createScriptedAI(), createQualityTagParser());
    const clock = new FakeClock('2026-11-03');
    for (let turn = 0; turn < 6; turn++) {
      const env = await router.reply(makeAIContext({ turnIndex: turn, scene: Scene.HOTEL }), clock);
      expect(env.degraded).toBe(true);
      expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
      expect(env.parsed.quality).toBeLessThanOrEqual(5);
      expect(env.reply.degraded).toBe(true);
    }
  });
});
