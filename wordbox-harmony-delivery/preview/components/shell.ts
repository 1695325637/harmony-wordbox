/** Top bar (session label / login hint) + bottom 5-tab navigation. */
import { SessionKind } from '@core';
import { getCtx, AppCtx } from '../context';
import { PAGES, PAGE_LABELS } from '../router';

export async function shellHtml(active: string): Promise<string> {
  const ctx: AppCtx = getCtx();
  const r = await ctx.kernel.services.account.current();
  const authenticated: boolean = r.ok && r.value !== undefined && r.value.kind === SessionKind.Authenticated;
  const label: string = authenticated && r.value !== undefined ? r.value.displayName : '游客模式';
  const badge: string = authenticated ? '已登录 · 进度已解锁' : '登录解锁进度统计';

  const tabs: string[] = [];
  for (const page of PAGES) {
    const cls: string = 'wb-tab' + (page === active ? ' wb-tab-active' : '');
    tabs.push('<button class="' + cls + '" data-page="' + page + '">' + PAGE_LABELS[page] + '</button>');
  }
  return '<header class="wb-top">'
    + '<div class="wb-brand">📦 单词盒子 <small>WordBox</small></div>'
    + '<div class="wb-top-right"><span class="wb-badge">' + badge + '</span><span class="wb-user">' + label + '</span></div>'
    + '</header>'
    + '<nav class="wb-tabs">' + tabs.join('') + '</nav>';
}

/** Bind tab navigation. */
export function bindShell(root: HTMLElement): void {
  const buttons: NodeListOf<HTMLButtonElement> = root.querySelectorAll('[data-page]');
  buttons.forEach((btn: HTMLButtonElement) => {
    btn.addEventListener('click', () => {
      const page: string | null = btn.getAttribute('data-page');
      if (page !== null) getCtx().navigate(page);
    });
  });
}
