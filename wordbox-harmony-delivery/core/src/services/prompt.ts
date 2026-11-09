/**
 * Travel-scene prompt strategy. Pure and deterministic: it only reads the
 * injected `AIContext` and shared scene metadata, never the network or SDK.
 */
import { AIContext, AIPrompt, ChatMessage, ChatRole, Word } from '../models/types';
import { SCENE_LABELS, SCENE_AI_ROLES } from '../models/constants';

export interface PromptStrategy {
  build(ctx: AIContext): AIPrompt;
}

function lastUserText(history: readonly ChatMessage[]): string {
  let text: string = '';
  for (const message of history) {
    if (message.role === ChatRole.User) text = message.content;
  }
  return text;
}

/** Create the canonical prompt strategy. */
export function createPromptStrategy(): PromptStrategy {
  const strategy: PromptStrategy = {
    build(ctx: AIContext): AIPrompt {
      const role: string = SCENE_AI_ROLES[ctx.scene];
      const label: string = SCENE_LABELS[ctx.scene];
      const system: string = '你是' + role + '，正在「' + label
        + '」的真实旅行场景中与一位准备出境的中国旅客用简单英语对话。'
        + '每轮必须使用 targetWords 中的至少一个词，先给情景句，再对用户上一句做简短纠错与中文释义。'
        + '全程不联网、不引用外部资料。';

      const byId: Map<string, Word> = new Map<string, Word>();
      for (const word of ctx.words) byId.set(word.id, word);
      const targetWords: string[] = [];
      const targetTexts: string[] = [];
      for (const id of ctx.targetWordIds) {
        const word: Word | undefined = byId.get(id);
        if (word !== undefined) {
          targetWords.push(word.text + ' / ' + word.exampleInScene + ' / ' + word.aiRolePrompt);
          targetTexts.push(word.text);
        } else {
          targetWords.push(id);
          targetTexts.push(id);
        }
      }

      const lastUser: string = lastUserText(ctx.history);
      const wordList: string = targetTexts.length > 0 ? targetTexts.join('、') : '本场景常用旅行词';
      const user: string = '上一句用户说：' + (lastUser.length > 0 ? lastUser : '(本轮开始)')
        + '。本轮必用目标词：' + wordList + '。turnIndex=' + String(ctx.turnIndex)
        + '。请继续这个真实旅行情景对话，并自然用上至少一个目标词。';

      const qualityProtocol: string = '回复末尾必须附 [[QUALITY:n]]，n 为 0..5 整数，'
        + '表示用户上一句对目标词的使用质量；标签不得出现在给用户看的正文里。';

      const prompt: AIPrompt = {
        system: system,
        user: user,
        targetWords: targetWords,
        qualityProtocol: qualityProtocol,
      };
      return prompt;
    },
  };
  return strategy;
}
