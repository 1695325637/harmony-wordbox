/**
 * quality.test.ts —— `[[QUALITY:n]]` 标签协议单测。
 * 口径（team-lead / ARCHITECTURE §10.3 / quality.ts 一致）：
 * 缺失 / 越界 / 非整数 → quality = -1，表示该轮不回写调度、不中断计时。
 * 覆盖：parse / strip / clamp、多标签、畸形标签、纯函数不可变性、不抛异常。
 */
import { describe, it, expect } from 'vitest';
import { createQualityTagParser } from '@core';
import type { QualityTagParser, ParsedAIReply } from '@core';

describe('QUALITY 标签：parse 合法输入', () => {
  it('输入「你好 [[QUALITY:5]]」→ quality=5，displayText 去掉标签只留「你好」', () => {
    const p = createQualityTagParser();
    const r = p.parse('你好 [[QUALITY:5]]');
    expect(r.quality).toBe(5);
    expect(r.displayText).toBe('你好');
    expect(r.wordIds).toEqual([]);
  });

  it('输入「[[QUALITY:0]]」→ quality=0（0 是合法下界，不得当成缺失）', () => {
    const p = createQualityTagParser();
    expect(p.parse('低分 [[QUALITY:0]]').quality).toBe(0);
  });

  it('输入含多个合法标签「[[QUALITY:2]] ... [[QUALITY:4]]」→ 最后一个合法标签胜出 quality=4', () => {
    const p = createQualityTagParser();
    expect(p.parse('a [[QUALITY:2]] b [[QUALITY:4]]').quality).toBe(4);
  });

  it('输入「[[QUALITY: 3 ]]」带空白 → trim 后仍解析为 quality=3', () => {
    const p = createQualityTagParser();
    expect(p.parse('x [[QUALITY: 3 ]]').quality).toBe(3);
  });

  it('输入含非法标签后跟合法标签 → 忽略非法、取合法值；合法后跟非法 → 保持合法值', () => {
    const p = createQualityTagParser();
    expect(p.parse('x [[QUALITY:9]] y [[QUALITY:3]]').quality).toBe(3);
    expect(p.parse('x [[QUALITY:3]] y [[QUALITY:9]]').quality).toBe(3);
  });
});

describe('QUALITY 标签：缺失 / 越界 / 非整数 → -1', () => {
  it('输入完全无标签「no tag here」→ quality=-1，displayText 原样保留', () => {
    const p = createQualityTagParser();
    const r = p.parse('no tag here');
    expect(r.quality).toBe(-1);
    expect(r.displayText).toBe('no tag here');
  });

  it('输入越界标签 [[QUALITY:6]] / [[QUALITY:99]] / [[QUALITY:-1]] → 全部 quality=-1', () => {
    const p = createQualityTagParser();
    expect(p.parse('x [[QUALITY:6]]').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:99]]').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:-1]]').quality).toBe(-1);
  });

  it('输入非整数 / 非数字 / 空标签 [[QUALITY:3.5]] / [[QUALITY:abc]] / [[QUALITY:]] → 全部 quality=-1', () => {
    const p = createQualityTagParser();
    expect(p.parse('x [[QUALITY:3.5]]').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:abc]]').quality).toBe(-1);
    expect(p.parse('x [[QUALITY:]]').quality).toBe(-1);
  });

  it('输入畸形未闭合标签「text [[QUALITY:3」→ quality=-1，strip 丢弃畸形尾部且不抛异常', () => {
    const p = createQualityTagParser();
    let r: ParsedAIReply | undefined = undefined;
    expect(() => { r = p.parse('text [[QUALITY:3'); }).not.toThrow();
    expect(r).toBeDefined();
    if (r !== undefined) expect(r.quality).toBe(-1);
  });

  it('clamp 输入 0..5 整数 → 原值；输入 -1 / 6 / 2.5 / NaN → -1', () => {
    const p = createQualityTagParser();
    for (let n = 0; n <= 5; n++) expect(p.clamp(n)).toBe(n);
    expect(p.clamp(-1)).toBe(-1);
    expect(p.clamp(6)).toBe(-1);
    expect(p.clamp(2.5)).toBe(-1);
    expect(p.clamp(Number.NaN)).toBe(-1);
  });
});

describe('QUALITY 标签：strip 与不可变性', () => {
  it('strip 输入含两个标签的字符串 → 移除全部标签并 trim，正文完整保留', () => {
    const p = createQualityTagParser();
    expect(p.strip('  A [[QUALITY:4]] B [[QUALITY:2]]  ')).toBe('A  B');
  });

  it('parse 对同一字符串重复调用 → 结果恒等（纯函数、无内部状态、不抛异常）', () => {
    const p: QualityTagParser = createQualityTagParser();
    const raw = '稳定 [[QUALITY:3]]';
    const a = p.parse(raw);
    const b = p.parse(raw);
    expect(a).toEqual(b);
    expect(a.quality).toBe(3);
    expect(raw).toBe('稳定 [[QUALITY:3]]');
  });

  it('缺失 / 越界标签的解析结果 quality=-1 → 满足「不回写调度、不中断计时」判定条件', () => {
    const p = createQualityTagParser();
    const invalid = ['no tag', 'x [[QUALITY:6]]', 'x [[QUALITY:-1]]', 'x [[QUALITY:3.5]]'];
    for (const raw of invalid) {
      const r = p.parse(raw);
      expect(r.quality).toBe(-1);
      expect(r.quality >= 0).toBe(false);
    }
  });
});
