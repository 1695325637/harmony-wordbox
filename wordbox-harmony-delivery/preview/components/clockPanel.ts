/**
 * FakeClock demo panel — one-click D1→D8, cross-month, cold reboot and AI
 * failure-demo toggles. Every advance re-runs `bootstrap()`, so window
 * pruning and the Type-A state machine are observable in the browser.
 */
import { addDays, GUEST_RETENTION_DAYS } from '@core';
import { getCtx, AppCtx } from '../context';

const BASE_YMD: string = '2026-11-03';

export async function clockPanelHtml(): Promise<string> {
  const ctx: AppCtx = getCtx();
  const today: string = ctx.clock.todayYMD();
  const stateR = await ctx.kernel.services.retention.promptState();
  const d1: string = stateR.ok && stateR.value !== undefined ? stateR.value.firstStudyYMD : '';
  const day: number = d1.length > 0 && d1 <= today
    ? Math.round((ctx.clock.msFromYMD(today) - ctx.clock.msFromYMD(d1)) / 86_400_000) + 1 : 0;
  const dayLabel: string = d1.length === 0 ? 'D—' : (day > 0 ? 'D' + String(day) : 'D0');
  const windowFrom: string = addDays(today, -(GUEST_RETENTION_DAYS - 1));
  const failing: boolean = ctx.previewAI.isFailureDemo();

  return '<section class="wb-clock">'
    + '<div class="wb-clock-head"><b>⏱ FakeClock 演示面板</b>'
    + '<span>今天 <b>' + today + '</b> · ' + dayLabel + (d1.length > 0 ? '（D1=' + d1 + '）' : '（尚无学习数据）') + '</span></div>'
    + '<div class="wb-clock-window">7 天窗口：' + windowFrom + ' ~ ' + today + '</div>'
    + '<div class="wb-clock-actions">'
    + '<button data-clock="a1">+1 天</button>'
    + '<button data-clock="a3">+3 天</button>'
    + '<button data-clock="d5">跳到 D5</button>'
    + '<button data-clock="d8">跳到 D8</button>'
    + '<button data-clock="month">跨月 +40 天</button>'
    + '<button data-clock="cold">重新冷启动</button>'
    + '<button data-clock="reset">重置演示</button>'
    + '<button data-clock="fail"' + (failing ? ' class="wb-on"' : '') + '>故障降级：' + (failing ? '开' : '关') + '</button>'
    + '</div></section>';
}

/** Bind all FakeClock panel buttons. */
export function bindClockPanel(root: HTMLElement): void {
  const ctx: AppCtx = getCtx();
  const buttons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-clock]');
  buttons.forEach((btn: HTMLButtonElement) => {
    btn.addEventListener('click', async () => {
      const action: string | null = btn.getAttribute('data-clock');
      if (action === null) return;
      const stateR = await ctx.kernel.services.retention.promptState();
      const d1: string = stateR.ok && stateR.value !== undefined ? stateR.value.firstStudyYMD : '';
      switch (action) {
        case 'a1': ctx.clock.advanceDays(1); break;
        case 'a3': ctx.clock.advanceDays(3); break;
        case 'd5': ctx.clock.setYMD(addDays(d1.length > 0 ? d1 : ctx.clock.todayYMD(), 4)); break;
        case 'd8': ctx.clock.setYMD(addDays(d1.length > 0 ? d1 : ctx.clock.todayYMD(), 7)); break;
        case 'month': ctx.clock.advanceDays(40); break;
        case 'cold':
          // Cold reboot: keep persisted data but drop all in-memory UI state.
          ctx.resetTransient();
          break;
        case 'reset':
          ctx.resetTransient();
          ctx.storage.clearAll();
          ctx.clock.setYMD(BASE_YMD);
          ctx.navigate('home');
          break;
        case 'fail':
          ctx.previewAI.setFailureDemo(!ctx.previewAI.isFailureDemo());
          await ctx.refresh();
          return;
        default: break;
      }
      await ctx.bootstrap();
    });
  });
}
