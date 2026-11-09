/**
 * Type B — "是否合并游客进度" (Q11 / F-21). Only reachable AFTER a successful
 * authorization; never references `neverPrompt` (Type A's flag).
 */
import { MergePromptDecision, MergeChoiceKind } from '@core';
import { getCtx, AppCtx, esc } from '../context';

function bodyHtml(decision: MergePromptDecision): string {
  const s = decision.summary;
  return '<p>检测到最近 7 天（' + esc(s.windowFromYMD) + ' ~ ' + esc(s.windowToYMD)
    + '）的游客学习进度：</p>'
    + '<div class="wb-summary">'
    + '<div class="wb-summary-item"><b>' + String(s.studyDays) + '</b><span>学习天数</span></div>'
    + '<div class="wb-summary-item"><b>' + String(s.wordsLearned) + '</b><span>已学词</span></div>'
    + '<div class="wb-summary-item"><b>' + String(s.totalMinutes) + '</b><span>累计分钟</span></div>'
    + '</div>'
    + '<p class="wb-hint">窗口外的数据不会带入账号；不合并时窗口内数据仍保留、可再次合并。</p>';
}

/** Show the Type B dialog (three options). */
export function showTypeBDialog(decision: MergePromptDecision): void {
  const ctx: AppCtx = getCtx();
  ctx.modal.show('是否合并游客进度？', bodyHtml(decision), [
    {
      label: '合并进度',
      kind: 'primary',
      onClick: async () => {
        const r = await ctx.app.onMergeChoice(MergeChoiceKind.Merge, ctx.clock);
        if (r.ok && r.value !== undefined && r.value.performed) {
          ctx.toast('合并完成：已带入窗口内进度并重算统计');
        } else if (r.ok && r.value !== undefined && r.value.idempotentHit) {
          ctx.toast('该进度已合并过（幂等）');
        } else {
          ctx.toast('无需合并：' + String(r.value?.reason ?? '未知原因'));
        }
        await ctx.refresh();
      },
    },
    {
      label: '不合并，保留账号已有进度',
      kind: 'secondary',
      onClick: async () => {
        await ctx.app.onMergeChoice(MergeChoiceKind.KeepAccount, ctx.clock);
        ctx.toast('已保留账号进度，游客数据未删除');
        await ctx.refresh();
      },
    },
    {
      label: '取消（暂不处理）',
      kind: 'danger',
      onClick: async () => {
        await ctx.app.onMergeChoice(MergeChoiceKind.Defer, ctx.clock);
        ctx.toast('已取消，可在「我的」再次发起合并');
        await ctx.refresh();
      },
    },
  ]);
}
