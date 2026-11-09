/** Hash router for the 6 preview pages (no page reload). */
export const PAGES: readonly string[] = ['home', 'chat', 'vocabulary', 'calendar', 'stats', 'account'];
export const PAGE_LABELS: Readonly<Record<string, string>> = {
  home: '首页', chat: '对话', vocabulary: '生词本', calendar: '日历', stats: '统计', account: '我的',
};

export function currentPage(): string {
  const raw: string = window.location.hash.replace(/^#\/?/, '');
  return PAGES.indexOf(raw) >= 0 ? raw : 'home';
}

export function navigate(page: string): void {
  const target: string = PAGES.indexOf(page) >= 0 ? page : 'home';
  if (window.location.hash === '#/' + target) return;
  window.location.hash = '#/' + target;
}

export function onHashChange(handler: () => void): void {
  window.addEventListener('hashchange', handler);
}
