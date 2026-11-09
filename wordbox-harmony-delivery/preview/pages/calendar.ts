/**
 * F-07 calendar — monthly three-state heatmap (Checked / Missed / Future),
 * "本月 X/Y 天", longest streak and accumulated study time. The F-20 gate is
 * rendered as a full-page replacement: a guest session sees ZERO progress
 * numbers because this page never reads any data when `Gated.allowed` is false.
 */
import {
  CalendarMonth, CalendarDay, DayState, Gated,
  addDays, daysInMonth, diffDays, monthOf, monthStartYMD, ymdOfMonthDay,
  GATE_UNLOCK_HINT,
} from '@core';

/** A known Monday used as the weekday anchor for the month grid. */
const MONDAY_ANCHOR_YMD: string = '2024-01-01';
import { AppCtx, PageView, esc, mmss } from '../context';
import { gatedPage } from '../components/gateView';

let calendarMonth: string = '';

/** Reset the transient month selection (FakeClock reset). */
export function resetCalendar(): void {
  calendarMonth = '';
}

function currentMonth(ctx: AppCtx): string {
  return calendarMonth.length > 0 ? calendarMonth : monthOf(ctx.clock.todayYMD());
}

function shiftMonth(month: string, delta: number): string {
  const start: string = monthStartYMD(month);
  if (delta > 0) return monthOf(addDays(ymdOfMonthDay(month, daysInMonth(month)), 1));
  return monthOf(addDays(start, -1));
}

function cellHtml(day: CalendarDay): string {
  const cls: string = day.state === DayState.Checked ? 'wb-cal-checked'
    : (day.state === DayState.Future ? 'wb-cal-future' : 'wb-cal-missed');
  const mark: string = day.state === DayState.Checked ? '✓' : String(Number(day.dateYMD.slice(8, 10)));
  const tip: string = day.dateYMD + (day.activeSeconds > 0 ? ' · ' + mmss(day.activeSeconds) : '');
  return '<div class="wb-cal-cell ' + cls + '" title="' + esc(tip) + '">' + mark + '</div>';
}

export async function calendarPage(ctx: AppCtx): Promise<PageView> {
  const month: string = currentMonth(ctx);
  const result = await ctx.app.calendar(monthStartYMD(month), ctx.clock);
  const gated: Gated<CalendarMonth> | undefined = result.ok && result.value !== undefined
    ? result.value : undefined;
  if (gated === undefined || !gated.allowed || gated.data === undefined) {
    return gatedPage(gated !== undefined ? gated.unlockHint : GATE_UNLOCK_HINT);
  }
  const data: CalendarMonth = gated.data;

  // Align the first day to its weekday column (Mon..Sun) using a pure UTC day
  // ordinal difference from a known Monday; immune to DST and timezone shifts.
  const firstYMD: string = monthStartYMD(month);
  const rawOffset: number = diffDays(MONDAY_ANCHOR_YMD, firstYMD) % 7;
  const weekdayOffset: number = rawOffset < 0 ? rawOffset + 7 : rawOffset;
  const blanks: string[] = [];
  for (let i: number = 0; i < weekdayOffset; i++) blanks.push('<div class="wb-cal-cell wb-cal-blank"></div>');

  const cells: string[] = [];
  for (const day of data.days) cells.push(cellHtml(day));

  const html = '<section class="wb-card">'
    + '<div class="wb-cal-nav">'
    + '<button class="wb-mini" data-cal="prev">← 上月</button>'
    + '<b>' + esc(data.month) + '</b>'
    + '<button class="wb-mini" data-cal="next">下月 →</button>'
    + '</div>'
    + '<div class="wb-metric-row">'
    + '<div class="wb-metric"><b>' + String(data.checkedInDays) + '/' + String(data.daysInMonth) + '</b><span>本月打卡</span></div>'
    + '<div class="wb-metric"><b>' + String(data.longestStreak) + '</b><span>最长连续(天)</span></div>'
    + '<div class="wb-metric"><b>' + mmss(data.totalActiveSeconds) + '</b><span>累计时长</span></div>'
    + '</div>'
    + '<div class="wb-cal-week">'
    + ['一', '二', '三', '四', '五', '六', '日'].map((w: string) => '<span>' + w + '</span>').join('')
    + '</div>'
    + '<div class="wb-cal-grid">' + blanks.join('') + cells.join('') + '</div>'
    + '<div class="wb-cal-legend">'
    + '<span><i class="wb-cal-checked"></i> 已打卡</span>'
    + '<span><i class="wb-cal-missed"></i> 未打卡</span>'
    + '<span><i class="wb-cal-future"></i> 未到</span>'
    + '</div>'
    + '</section>';

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const buttons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-cal]');
      buttons.forEach((btn: HTMLButtonElement) => {
        btn.addEventListener('click', () => {
          const action: string | null = btn.getAttribute('data-cal');
          if (action === 'prev') calendarMonth = shiftMonth(month, -1);
          else if (action === 'next') calendarMonth = shiftMonth(month, 1);
          void ctx.refresh();
        });
      });
    },
  };
  return view;
}
