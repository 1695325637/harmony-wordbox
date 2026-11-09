/**
 * F-08 statistics — 7/30/90-day windows, mastery curve, accumulated time,
 * review completion rate and the fixed 8-scene mastery distribution. The
 * F-20 gate is a full-page replacement: guest sessions see ZERO curves/numbers.
 */
import {
  ALL_SCENES, MasteryPoint, SCENE_ICONS, SCENE_LABELS, SceneMastery,
  StatsWindow, StatsSummary, Gated, GATE_UNLOCK_HINT,
} from '@core';
import { AppCtx, PageView, esc, mmss } from '../context';
import { gatedPage } from '../components/gateView';

let statsWindow: StatsWindow = StatsWindow.D7;

/** Reset the transient window selection (FakeClock reset). */
export function resetStats(): void {
  statsWindow = StatsWindow.D7;
}

const WINDOWS: readonly StatsWindow[] = [StatsWindow.D7, StatsWindow.D30, StatsWindow.D90];

function curveHtml(points: readonly MasteryPoint[]): string {
  let max: number = 1;
  for (const point of points) if (point.masteredWords > max) max = point.masteredWords;
  const bars: string[] = [];
  for (const point of points) {
    const height: number = Math.max(4, Math.round((point.masteredWords / max) * 100));
    bars.push('<div class="wb-curve-col" title="' + esc(point.dateYMD) + '：掌握 '
      + String(point.masteredWords) + ' 词"><span style="height:' + String(height) + '%"></span></div>');
  }
  return '<div class="wb-curve">' + bars.join('') + '</div>'
    + '<div class="wb-curve-axis"><span>' + esc(points[0]?.dateYMD ?? '') + '</span><span>'
    + esc(points[points.length - 1]?.dateYMD ?? '') + '</span></div>';
}

function sceneHtml(distribution: readonly SceneMastery[]): string {
  const byScene: Map<string, SceneMastery> = new Map<string, SceneMastery>();
  for (const item of distribution) byScene.set(item.scene, item);
  const rows: string[] = [];
  for (const scene of ALL_SCENES) {
    const item: SceneMastery | undefined = byScene.get(scene);
    const mastered: number = item !== undefined ? item.mastered : 0;
    const total: number = item !== undefined ? item.total : 0;
    const pct: number = item !== undefined ? Math.round(item.ratio * 100) : 0;
    rows.push('<div class="wb-scene-row">'
      + '<span class="wb-scene-name">' + SCENE_ICONS[scene] + ' ' + esc(SCENE_LABELS[scene]) + '</span>'
      + '<div class="wb-bar"><i style="width:' + String(pct) + '%"></i></div>'
      + '<span class="wb-scene-count">' + String(mastered) + '/' + String(total) + '</span>'
      + '</div>');
  }
  return '<div class="wb-scene-list">' + rows.join('') + '</div>';
}

export async function statsPage(ctx: AppCtx): Promise<PageView> {
  const result = await ctx.app.statistics(statsWindow, ctx.clock);
  const gated: Gated<StatsSummary> | undefined = result.ok && result.value !== undefined
    ? result.value : undefined;
  if (gated === undefined || !gated.allowed || gated.data === undefined) {
    return gatedPage(gated !== undefined ? gated.unlockHint : GATE_UNLOCK_HINT);
  }
  const s: StatsSummary = gated.data;
  const ratePct: number = Math.round(s.reviewCompletionRate * 100);

  const windowButtons: string[] = [];
  for (const window of WINDOWS) {
    const active: string = window === statsWindow ? ' wb-on' : '';
    windowButtons.push('<button class="wb-mini' + active + '" data-win="' + String(window) + '">近 '
      + String(window) + ' 天</button>');
  }

  const html = '<section class="wb-card">'
    + '<h3>学习统计 <small>' + esc(s.asOfYMD) + '</small></h3>'
    + '<div class="wb-filter-row">' + windowButtons.join('') + '</div>'
    + '<div class="wb-metric-row">'
    + '<div class="wb-metric"><b>' + String(s.masteredWords) + '</b><span>已掌握</span></div>'
    + '<div class="wb-metric"><b>' + String(s.learningWords) + '</b><span>学习中</span></div>'
    + '<div class="wb-metric"><b>' + String(ratePct) + '%</b><span>复习完成率</span></div>'
    + '</div>'
    + '<div class="wb-metric-row">'
    + '<div class="wb-metric"><b>' + mmss(s.totalActiveSeconds) + '</b><span>累计时长</span></div>'
    + '<div class="wb-metric"><b>' + String(s.currentStreak) + '</b><span>当前连续(天)</span></div>'
    + '<div class="wb-metric"><b>' + String(s.longestStreak) + '</b><span>最长连续(天)</span></div>'
    + '</div>'
    + '<p class="wb-hint">打卡 ' + String(s.checkedInDays) + ' 天 · 累计复习 '
    + String(s.totalReviews) + ' 次 · 正确 ' + String(s.correctReviews) + ' 次</p>'
    + '</section>'
    + '<section class="wb-card"><h3>掌握曲线</h3>' + curveHtml(s.masteryCurve) + '</section>'
    + '<section class="wb-card"><h3>8 场景掌握分布</h3>' + sceneHtml(s.sceneDistribution) + '</section>';

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const buttons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-win]');
      buttons.forEach((btn: HTMLButtonElement) => {
        btn.addEventListener('click', () => {
          const raw: string | null = btn.getAttribute('data-win');
          const value: number = Number(raw ?? '7');
          for (const candidate of WINDOWS) if (candidate === value) statsWindow = candidate;
          void ctx.refresh();
        });
      });
    },
  };
  return view;
}
