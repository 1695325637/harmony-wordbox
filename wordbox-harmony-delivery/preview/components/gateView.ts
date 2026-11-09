/**
 * F-20 gate view — renders only `Gated<T>.allowed`. It NEVER reads any
 * progress data: no numbers, no curves, no heatmaps for guest sessions.
 */
import { getCtx } from '../context';
import { runAccountFlow } from './typeADialog';

export function gateViewHtml(unlockHint: string): string {
  return '<section class="wb-gate">'
    + '<div class="wb-gate-icon">🔒</div>'
    + '<h2>登录后可查看</h2>'
    + '<p>' + (unlockHint.length > 0 ? unlockHint : '登录华为账号，解锁进度') + '</p>'
    + '<p class="wb-hint">你仍可照常学习与打卡，进度数据已保存在本机。</p>'
    + '<button class="wb-btn wb-btn-primary" data-action="gate-login">登录华为账号</button>'
    + '</section>';
}

/** Bind the gate's login button. */
export function bindGateView(root: HTMLElement): void {
  const btn: HTMLButtonElement | null = root.querySelector('[data-action="gate-login"]');
  if (btn === null) return;
  btn.addEventListener('click', () => {
    void runAccountFlow(getCtx());
  });
}

/** Convenience: full page replacement for a gated page. */
export function gatedPage(unlockHint: string): { readonly html: string; readonly bind: (root: HTMLElement) => void } {
  return { html: gateViewHtml(unlockHint), bind: bindGateView };
}
