/**
 * Type A — guest login guide (F-22). Produced ONLY by
 * `LoginPromptService.decide()` on a guest cold start. Shows a引导性 summary
 * (never statistics-page numbers) and three actions. "去登录" triggers the
 * account flow, whose success is the ONLY path to Type B.
 */
import {
  LoginPromptDecision, PromptActionKind, PromptSummary,
  AccountAuthResult,
} from '@core';
import { getCtx, AppCtx, esc } from '../context';

function summaryHtml(s: PromptSummary, dayIndex: number): string {
  return '<div class="wb-summary">'
    + '<div class="wb-summary-item"><b>' + String(s.studyDays) + '</b><span>学习天数</span></div>'
    + '<div class="wb-summary-item"><b>' + String(s.wordsLearned) + '</b><span>已学词</span></div>'
    + '<div class="wb-summary-item"><b>' + String(s.totalMinutes) + '</b><span>累计分钟</span></div>'
    + '</div>'
    + '<p class="wb-hint">游客进度仅保留最近 7 天（' + esc(s.windowFromYMD) + ' ~ '
    + esc(s.windowToYMD) + '）。登录华为账号可长期保存进度。</p>'
    + '<p class="wb-hint">今天是第 D' + String(dayIndex) + ' 天。</p>';
}

/** Simulate Huawei Account Kit authorization through the offline adapter. */
export async function runAccountFlow(ctx: AppCtx): Promise<void> {
  const authR = await ctx.accountProvider.signIn();
  const auth: AccountAuthResult | undefined = authR.ok && authR.value !== undefined ? authR.value : undefined;
  const flow = await ctx.app.onHuaweiAuthResult(auth, ctx.clock);
  if (!flow.ok || flow.value === undefined) {
    ctx.toast('登录未完成，已退回游客态，学习不受影响');
    await ctx.refresh();
    return;
  }
  if (auth === undefined) {
    ctx.toast('登录未完成，已退回游客态，学习不受影响');
    await ctx.refresh();
    return;
  }
  if (flow.value.mergePrompt.shouldShow) ctx.showTypeB(flow.value.mergePrompt);
  else ctx.toast('登录成功，进度已解锁');
  await ctx.refresh();
}

/** Show the Type A dialog and persist `lastPromptDate` (max once per day). */
export function showTypeADialog(decision: LoginPromptDecision): void {
  const ctx: AppCtx = getCtx();
  // Persist at display time, exactly as the state machine requires.
  void ctx.kernel.services.loginPrompt.onShown(ctx.clock.todayYMD(), PromptActionKind.Later);
  ctx.modal.show(
    '登录以保存学习进度',
    summaryHtml(decision.summary, decision.dayIndex),
    [
      {
        label: '去登录',
        kind: 'primary',
        onClick: async () => {
          await ctx.app.onLoginGuideAction(PromptActionKind.GoLogin, ctx.clock);
          await runAccountFlow(ctx);
        },
      },
      {
        label: '暂不',
        kind: 'secondary',
        onClick: async () => {
          await ctx.app.onLoginGuideAction(PromptActionKind.Later, ctx.clock);
          ctx.toast('好的，明天再提醒');
          await ctx.refresh();
        },
      },
      {
        label: '不再提示',
        kind: 'danger',
        onClick: async () => {
          await ctx.app.onLoginGuideAction(PromptActionKind.NeverPrompt, ctx.clock);
          ctx.toast('已关闭登录引导（不影响合并选择弹窗）');
          await ctx.refresh();
        },
      },
    ],
  );
}
