/** F-01 home — overview + one-tap entry into the chat page. */
import {
  SCENE_LABELS, SCENE_ICONS, DAILY_GOAL_SECONDS, DayState, Scene,
} from '@core';
import { AppCtx, PageView, esc, mmss } from '../context';

export async function homePage(ctx: AppCtx): Promise<PageView> {
  const r = await ctx.app.todayOverview(ctx.clock);
  const o = r.ok && r.value !== undefined ? r.value : undefined;
  const queue = o?.queue;
  const streakText: string = o !== undefined && o.streakVisible
    ? '连续 ' + String(o.streak) + ' 天' : '🔒 登录解锁';
  const remaining: number = o?.remainingSeconds ?? DAILY_GOAL_SECONDS;

  const grid: string[] = [];
  const weekly = o?.weeklyGrid ?? [];
  for (let i: number = 0; i < 7; i++) {
    const state: DayState = weekly[i] ?? DayState.Missed;
    const cls: string = state === DayState.Checked ? 'wb-day-checked' : 'wb-day-missed';
    grid.push('<span class="wb-day ' + cls + '" title="第 ' + String(i + 1) + ' 天"></span>');
  }
  const sceneLabel: string = o !== undefined ? SCENE_LABELS[o.scene] : SCENE_LABELS[Scene.AIRPORT];
  const sceneIcon: string = o !== undefined ? SCENE_ICONS[o.scene] : SCENE_ICONS[Scene.AIRPORT];

  const html = '<section class="wb-card wb-hero">'
    + '<div class="wb-hero-date">' + esc(o?.dateYMD ?? ctx.clock.todayYMD()) + ' · ' + esc(o?.accountLabel ?? '游客') + '</div>'
    + '<h2>今天 10 分钟，学「用得上的旅行单词」</h2>'
    + '<div class="wb-metric-row">'
    + '<div class="wb-metric"><b>' + String(queue?.newWordIds.length ?? 0) + '</b><span>今日新词</span></div>'
    + '<div class="wb-metric"><b>' + String((queue?.reviewWordIds.length ?? 0) + (queue?.relearnWordIds.length ?? 0)) + '</b><span>待复习</span></div>'
    + '<div class="wb-metric"><b>' + streakText + '</b><span>连续打卡</span></div>'
    + '</div>'
    + '<div class="wb-progress"><div class="wb-progress-bar" style="width:'
    + String(Math.min(100, Math.round(((DAILY_GOAL_SECONDS - remaining) / DAILY_GOAL_SECONDS) * 100))) + '%"></div></div>'
    + '<p class="wb-hint">今日已学 ' + mmss(DAILY_GOAL_SECONDS - remaining) + ' / ' + mmss(DAILY_GOAL_SECONDS)
    + '，还需 ' + mmss(remaining) + ' 自动打卡</p>'
    + '<button class="wb-btn wb-btn-primary wb-btn-block" data-action="start">开始学习 →</button>'
    + (o !== undefined && !o.streakVisible ? '<p class="wb-hint">' + esc(o.gateHint) + '</p>' : '')
    + '</section>'
    + '<section class="wb-card"><h3>今日场景 · ' + sceneIcon + ' ' + esc(sceneLabel) + '</h3>'
    + '<p class="wb-hint">AI 会在真实旅行情景里带你反复用上新词。</p></section>'
    + '<section class="wb-card"><h3>本周打卡</h3><div class="wb-week">' + grid.join('') + '</div>'
    + '<p class="wb-hint">窗口最近 7 天，游客数据按日滚动清理。</p></section>';

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const btn: HTMLButtonElement | null = root.querySelector('[data-action="start"]');
      if (btn !== null) btn.addEventListener('click', () => ctx.navigate('chat'));
    },
  };
  return view;
}
