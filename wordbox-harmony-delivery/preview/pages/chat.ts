/**
 * F-02 chat — scene selection, ≥6 AI turns, `[[QUALITY:n]]` feedback,
 * foreground 600s timer (paused when the tab is hidden), degradation badge
 * and "取词入生词本".
 */
import {
  ALL_SCENES, SCENE_LABELS, DAILY_GOAL_SECONDS, Scene, SEED_WORDS, Word,
} from '@core';
import { AppCtx, PageView, esc, mmss } from '../context';

interface ChatLine {
  readonly who: 'user' | 'ai';
  readonly text: string;
  readonly quality: number;
  readonly degraded: boolean;
  readonly provider: string;
  readonly wordIds: readonly string[];
}

let chatSessionId: string = '';
let chatScene: Scene = Scene.AIRPORT;
let chatLines: ChatLine[] = [];
let chatElapsed: number = 0;
let chatTimer: number | undefined = undefined;

/** Stop the per-second foreground timer (called when leaving the page). */
export function stopChatTimer(): void {
  if (chatTimer !== undefined) {
    window.clearInterval(chatTimer);
    chatTimer = undefined;
  }
}

/** Reset chat state (used by the FakeClock reset button). */
export function resetChat(): void {
  stopChatTimer();
  chatSessionId = '';
  chatLines = [];
  chatElapsed = 0;
  chatScene = Scene.AIRPORT;
}

function renderLine(line: ChatLine, index: number): string {
  const isAI: boolean = line.who === 'ai';
  const cls: string = 'wb-msg ' + (isAI ? 'wb-msg-ai' : 'wb-msg-user');
  const badge: string = isAI
    ? '<span class="wb-msg-tag">' + (line.degraded ? '⚠ 降级 ScriptedAI' : '端侧 AI')
      + ' · ' + esc(line.provider) + '</span>'
      + (line.quality >= 0 ? '<span class="wb-msg-quality">QUALITY ' + String(line.quality) + '</span>'
        : '<span class="wb-msg-quality wb-muted">本轮未计分</span>')
    : '';
  const pick: string = isAI && line.wordIds.length > 0
    ? '<button class="wb-mini" data-pick="' + String(index) + '">取词入生词本</button>' : '';
  return '<div class="' + cls + '">' + badge + '<div class="wb-msg-text">' + esc(line.text) + '</div>' + pick + '</div>';
}

export async function chatPage(ctx: AppCtx): Promise<PageView> {
  if (chatSessionId.length === 0) {
    const started = await ctx.app.startLearning(chatScene, ctx.clock);
    if (started.ok) chatSessionId = ctx.app.activeSessionId();
  }
  const options: string[] = [];
  for (const scene of ALL_SCENES) {
    options.push('<option value="' + scene + '"' + (scene === chatScene ? ' selected' : '') + '>'
      + esc(SCENE_LABELS[scene]) + '</option>');
  }
  const messagesHtml: string = chatLines.length === 0
    ? '<div class="wb-empty">选择场景后发一句英语，AI 会带你用上今天的旅行单词。</div>'
    : chatLines.map(renderLine).join('');

  const html = '<section class="wb-card wb-chat-head">'
    + '<div class="wb-chat-controls"><select id="wb-scene">' + options.join('') + '</select>'
    + '<button class="wb-mini" data-action="restart">重新开始</button></div>'
    + '<div class="wb-timer" id="wb-timer">' + mmss(chatElapsed) + ' / ' + mmss(DAILY_GOAL_SECONDS) + '</div>'
    + '<p class="wb-hint">前台每秒累计；页面失焦自动暂停；满 ' + mmss(DAILY_GOAL_SECONDS) + ' 自动打卡。</p>'
    + '</section>'
    + '<section class="wb-chat-log" id="wb-chat-log">' + messagesHtml + '</section>'
    + '<section class="wb-card wb-chat-input">'
    + '<input id="wb-input" type="text" placeholder="试着说一句英语，例如：I would like a window seat." />'
    + '<div class="wb-chat-actions">'
    + '<button class="wb-btn wb-btn-primary" data-action="send">发送</button>'
    + '<button class="wb-mini" data-action="tick600">+600 秒（演示打卡）</button>'
    + '<button class="wb-mini" data-action="finish">完成学习</button>'
    + '</div></section>';

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const sceneSel: HTMLSelectElement | null = root.querySelector('#wb-scene');
      const input: HTMLInputElement | null = root.querySelector('#wb-input');
      const timerEl: HTMLElement | null = root.querySelector('#wb-timer');

      const updateTimer = (): void => {
        if (timerEl !== null) timerEl.textContent = mmss(chatElapsed) + ' / ' + mmss(DAILY_GOAL_SECONDS);
      };

      // Foreground timer: skip ticks while the tab is hidden (A1/Q4).
      stopChatTimer();
      chatTimer = window.setInterval(() => {
        if (document.hidden) return;
        chatElapsed = chatElapsed + 1;
        updateTimer();
        void ctx.app.tickActiveSeconds(chatSessionId, 1, ctx.clock);
      }, 1000);

      if (sceneSel !== null) {
        sceneSel.addEventListener('change', () => {
          const value: string = sceneSel.value;
          for (const s of ALL_SCENES) if (s === value) chatScene = s;
          resetChat();
          void ctx.refresh();
        });
      }

      const send = async (): Promise<void> => {
        const text: string = input !== null ? input.value.trim() : '';
        if (text.length === 0) return;
        chatLines.push({ who: 'user', text: text, quality: -1, degraded: false, provider: '', wordIds: [] });
        if (input !== null) input.value = '';
        const turn = await ctx.app.sendMessage(chatSessionId, text, ctx.clock);
        if (turn.ok && turn.value !== undefined) {
          const m = turn.value.message;
          chatLines.push({
            who: 'ai', text: m.content, quality: m.quality, degraded: turn.value.degraded,
            provider: m.provider, wordIds: m.wordIds,
          });
        } else {
          chatLines.push({ who: 'ai', text: '（本轮回复不可用，请重试）', quality: -1, degraded: true, provider: 'none', wordIds: [] });
        }
        await ctx.refresh();
      };

      const sendBtn: HTMLButtonElement | null = root.querySelector('[data-action="send"]');
      if (sendBtn !== null) sendBtn.addEventListener('click', () => void send());
      if (input !== null) {
        input.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') void send();
        });
      }

      const restart: HTMLButtonElement | null = root.querySelector('[data-action="restart"]');
      if (restart !== null) restart.addEventListener('click', () => { resetChat(); void ctx.refresh(); });

      const tick600: HTMLButtonElement | null = root.querySelector('[data-action="tick600"]');
      if (tick600 !== null) {
        tick600.addEventListener('click', async () => {
          chatElapsed = chatElapsed + DAILY_GOAL_SECONDS;
          const ci = await ctx.app.tickActiveSeconds(chatSessionId, DAILY_GOAL_SECONDS, ctx.clock);
          updateTimer();
          ctx.toast(ci.value?.checkedIn === true ? '🎉 今日打卡完成！' : '已累计 600 秒有效学习');
          await ctx.refresh();
        });
      }

      const finish: HTMLButtonElement | null = root.querySelector('[data-action="finish"]');
      if (finish !== null) {
        finish.addEventListener('click', async () => {
          stopChatTimer();
          const s = await ctx.app.finishLearning(chatSessionId, ctx.clock);
          if (s.value !== undefined) {
            ctx.toast('本轮 ' + String(s.value.aiRounds) + ' 回合 · 目标词'
              + (s.value.allTargetWordsCovered ? '全覆盖' : '未全覆盖') + ' · '
              + (s.value.checkedIn ? '已打卡' : '未打卡'));
          }
          await ctx.refresh();
        });
      }

      const pickButtons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-pick]');
      pickButtons.forEach((btn: HTMLButtonElement) => {
        btn.addEventListener('click', async () => {
          const idx: number = Number(btn.getAttribute('data-pick') ?? '0');
          const line: ChatLine | undefined = chatLines[idx];
          if (line === undefined || line.wordIds.length === 0) return;
          const wordId: string = line.wordIds[0];
          const word: Word | undefined = SEED_WORDS.find((w) => w.id === wordId);
          if (word === undefined) return;
          const added = await ctx.app.addWord({
            text: word.text, meaningZh: word.meaningZh, scene: word.scene,
            exampleInScene: word.exampleInScene,
          }, ctx.clock);
          ctx.toast(added.ok ? '已加入生词本并自动进入复习队列' : '加入失败');
          await ctx.refresh();
        });
      });
    },
  };
  return view;
}
