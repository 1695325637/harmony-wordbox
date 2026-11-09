/**
 * aiFallback.test.ts —— 端侧模型三类降级集成测试。
 * 覆盖：加速器不可用（模型未就绪）/ loadModel 失败 / infer 超时与低内存 /
 * 空回复；验证均降级到 ScriptedAI、产出合法 QUALITY、回写调度、
 * 且 600s 打卡闭环不被阻断。全程无网络、无真机、无 Date.now()。
 */
import { describe, it, expect } from 'vitest';
import {
  AcceleratorKind, ErrorCode, AIProviderKind, Scene, DAILY_GOAL_SECONDS,
  createScriptedAI, createQualityTagParser, createAIProviderRouter,
  createMockAI, AI_MAX_RETRY,
} from '@core';
import {
  createHarness, FakeInferenceEngine, createOnDevicePrimary,
} from '../helpers/harness';
import { FakeClock } from '../helpers/fakeClock';
import { makeAIContext, D1 } from '../helpers/fixtures';

interface DegradeCase {
  readonly name: string;
  readonly prepare: (engine: FakeInferenceEngine) => void;
  readonly expectedCode: ErrorCode;
}

const CASES: readonly DegradeCase[] = [
  {
    name: '加速器不可用（模型未就绪）',
    prepare: (e) => e.setAccelerator(AcceleratorKind.UNAVAILABLE),
    expectedCode: ErrorCode.AI_MODEL_NOT_READY,
  },
  {
    name: 'loadModel 失败',
    prepare: (e) => e.failLoad(ErrorCode.AI_MODEL_NOT_READY),
    expectedCode: ErrorCode.AI_MODEL_NOT_READY,
  },
  {
    name: 'infer 推理超时',
    prepare: (e) => e.failInfer(ErrorCode.AI_INFERENCE_TIMEOUT),
    expectedCode: ErrorCode.AI_INFERENCE_TIMEOUT,
  },
  {
    name: 'infer 低内存',
    prepare: (e) => e.failInfer(ErrorCode.AI_OUT_OF_MEMORY),
    expectedCode: ErrorCode.AI_OUT_OF_MEMORY,
  },
];

describe('端侧降级：OnDeviceAI → AIProviderRouter → ScriptedAI', () => {
  for (const c of CASES) {
    it(`「${c.name}」→ errorChain 记录 ${c.expectedCode}、降级回复合法 QUALITY、attempts=AI_MAX_RETRY+1`, async () => {
      const engine = new FakeInferenceEngine();
      c.prepare(engine);
      const primary = createOnDevicePrimary(engine);
      const router = createAIProviderRouter(primary, createScriptedAI(), createQualityTagParser());
      const clock = new FakeClock(D1);
      const env = await router.reply(makeAIContext(), clock);
      expect(env.degraded).toBe(true);
      expect(env.attempts).toBe(AI_MAX_RETRY + 1);
      expect(env.errorChain.length).toBeGreaterThan(0);
      expect(env.errorChain[0].code).toBe(c.expectedCode);
      expect(env.reply.provider).toBe(AIProviderKind.Scripted);
      expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
      expect(env.parsed.quality).toBeLessThanOrEqual(5);
      expect(env.parsed.displayText).not.toContain('[[QUALITY:');
      expect(engine.unloadCalls).toBeGreaterThan(0);
    });
  }

  it('「infer 返回空回复」→ 归一化为 AI_EMPTY_REPLY 并降级，仍产出合法 QUALITY', async () => {
    const engine = new FakeInferenceEngine();
    engine.setInferText('   ');
    const router = createAIProviderRouter(createOnDevicePrimary(engine), createScriptedAI(), createQualityTagParser());
    const env = await router.reply(makeAIContext(), new FakeClock(D1));
    expect(env.degraded).toBe(true);
    expect(env.errorChain[0].code).toBe(ErrorCode.AI_EMPTY_REPLY);
    expect(env.parsed.quality).toBeGreaterThanOrEqual(0);
  });

  it('端侧模型完全正常 → 主路径成功、degraded=false、provider=OnDevice、不触发降级', async () => {
    const engine = new FakeInferenceEngine();
    const router = createAIProviderRouter(createOnDevicePrimary(engine), createScriptedAI(), createQualityTagParser());
    const env = await router.reply(makeAIContext(), new FakeClock(D1));
    expect(env.degraded).toBe(false);
    expect(env.attempts).toBe(1);
    expect(env.errorChain.length).toBe(0);
    expect(env.reply.provider).toBe(AIProviderKind.OnDevice);
    expect(env.parsed.quality).toBe(4);
    expect(engine.inferCalls).toBe(1);
    expect(engine.lastTimeoutMs).toBeGreaterThan(0);
    expect(engine.lastPrompt).toContain('[[QUALITY:n]]');
  });
});

describe('端侧降级：不阻断 600s 打卡闭环（完整 app 流程）', () => {
  for (const c of CASES) {
    it(`「${c.name}」下完整学习闭环：sendMessage 仍回写调度、tick 600s 仍自动打卡`, async () => {
      const engine = new FakeInferenceEngine();
      c.prepare(engine);
      const h = createHarness({
        initialYMD: D1,
        primaryAI: createOnDevicePrimary(engine),
        fallbackAI: createScriptedAI(),
      });
      await h.app.bootstrap(h.clock);
      await h.app.startLearning(Scene.AIRPORT, h.clock);
      const sid = h.app.activeSessionId();
      const turn = await h.app.sendMessage(sid, 'May I see your boarding pass?', h.clock);
      expect(turn.ok).toBe(true);
      expect(turn.value?.degraded).toBe(true);
      expect(turn.value?.providerUsed).toBe(AIProviderKind.Scripted);
      expect(turn.value?.parsed.quality).toBeGreaterThanOrEqual(0);
      expect(turn.value?.updatedRecords.length).toBeGreaterThan(0);

      const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
      expect(ci.ok).toBe(true);
      expect(ci.value?.checkedIn).toBe(true);
      expect(ci.value?.activeSeconds).toBe(DAILY_GOAL_SECONDS);

      const summary = await h.app.finishLearning(sid, h.clock);
      expect(summary.value?.checkedIn).toBe(true);
      expect(summary.value?.aiRounds).toBe(1);
      expect(summary.value?.allTargetWordsCovered).toBe(true);
    });
  }

  it('连续 6 轮端侧全失败 → 每轮降级均完成对话与调度回写，最后一轮 tick 600s 打卡成功', async () => {
    const engine = new FakeInferenceEngine();
    engine.setAccelerator(AcceleratorKind.UNAVAILABLE);
    const h = createHarness({
      initialYMD: D1,
      primaryAI: createOnDevicePrimary(engine),
      fallbackAI: createScriptedAI(),
    });
    await h.app.bootstrap(h.clock);
    await h.app.startLearning(Scene.SHOPPING, h.clock);
    const sid = h.app.activeSessionId();
    for (let turn = 0; turn < 6; turn++) {
      const r = await h.app.sendMessage(sid, 'Can I get a tax refund?', h.clock);
      expect(r.ok).toBe(true);
      expect(r.value?.degraded).toBe(true);
      expect(r.value?.parsed.quality).toBeGreaterThanOrEqual(0);
    }
    const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    expect(ci.value?.checkedIn).toBe(true);
    const summary = await h.app.finishLearning(sid, h.clock);
    expect(summary.value?.aiRounds).toBe(6);
    expect(summary.value?.checkedIn).toBe(true);
  });

  it('primary 与 fallback 全部失败 → 内核兜底文案仍带合法 QUALITY、调度照常回写、600s 打卡不中断', async () => {
    const primary = createMockAI([], [
      ErrorCode.AI_ENGINE_ERROR, ErrorCode.AI_ENGINE_ERROR,
      ErrorCode.AI_ENGINE_ERROR, ErrorCode.AI_ENGINE_ERROR,
    ]);
    const fallback = createMockAI([], [ErrorCode.AI_EMPTY_REPLY]);
    const h = createHarness({ initialYMD: D1, primaryAI: primary, fallbackAI: fallback });
    await h.app.bootstrap(h.clock);
    await h.app.startLearning(Scene.EMERGENCY, h.clock);
    const sid = h.app.activeSessionId();
    const turn = await h.app.sendMessage(sid, 'I need help please', h.clock);
    expect(turn.ok).toBe(true);
    expect(turn.value?.degraded).toBe(true);
    expect(turn.value?.parsed.quality).toBeGreaterThanOrEqual(0);
    expect(turn.value?.updatedRecords.length).toBeGreaterThan(0);
    const ci = await h.app.tickActiveSeconds(sid, DAILY_GOAL_SECONDS, h.clock);
    expect(ci.ok).toBe(true);
    expect(ci.value?.checkedIn).toBe(true);
    const summary = await h.app.finishLearning(sid, h.clock);
    expect(summary.value?.checkedIn).toBe(true);
  });
});
