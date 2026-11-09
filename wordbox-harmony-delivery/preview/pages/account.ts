/**
 * F-19 / Q12 account — guest sign-in entry, "continue as guest", session
 * label, the "再次合并游客进度" entry (shown ONLY when window-internal guest
 * progress exists) and sign-out. Type B is produced exclusively by the
 * kernel's `MigrationService.detect()` — this page never fabricates a dialog.
 */
import {
  AccountSession, DEFAULT_GUEST_SESSION, MergePromptDecision,
  SessionKind, GUEST_RETENTION_DAYS,
} from '@core';
import { OfflineAuthOutcome } from '@adapters/preview/offlineAccountProvider';
import { AppCtx, PageView, esc } from '../context';
import { runAccountFlow } from '../components/typeADialog';

const OUTCOMES: readonly OfflineAuthOutcome[] = ['succeed', 'cancel', 'networkError', 'kitUnavailable'];
const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  succeed: '授权成功',
  cancel: '用户取消',
  networkError: '网络错误',
  kitUnavailable: 'Account Kit 不可用',
};

function outcomeOptions(current: OfflineAuthOutcome): string {
  const out: string[] = [];
  for (const outcome of OUTCOMES) {
    const selected: string = outcome === current ? ' selected' : '';
    out.push('<option value="' + outcome + '"' + selected + '>'
      + esc(OUTCOME_LABELS[outcome] ?? outcome) + '</option>');
  }
  return out.join('');
}

export async function accountPage(ctx: AppCtx): Promise<PageView> {
  const sessionR = await ctx.kernel.services.account.current();
  const session: AccountSession = sessionR.ok && sessionR.value !== undefined
    ? sessionR.value : DEFAULT_GUEST_SESSION;
  const authenticated: boolean = session.kind === SessionKind.Authenticated;

  let guestDataExists: boolean = false;
  if (authenticated) {
    const snapR = await ctx.kernel.services.retention.loadGuestSnapshot(ctx.clock.todayYMD());
    if (snapR.ok && snapR.value !== undefined) {
      const snap = snapR.value;
      guestDataExists = snap.words.length > 0 || snap.records.length > 0
        || snap.checkIns.length > 0 || snap.chatMessages.length > 0;
    }
  }

  const body: string = authenticated
    ? '<section class="wb-card wb-account">'
      + '<div class="wb-account-avatar">✓</div>'
      + '<h3>' + esc(session.displayName) + '</h3>'
      + '<p class="wb-hint">uid：' + esc(session.uid) + ' · 分区 ' + esc(session.partition) + '</p>'
      + '<p class="wb-hint">进度统计与打卡日历已解锁；数据保存在本机用户分区。</p>'
      + (guestDataExists
        ? '<button class="wb-btn wb-btn-primary wb-btn-block" data-action="remerge">再次合并游客进度</button>'
          + '<p class="wb-hint">检测到最近 ' + String(GUEST_RETENTION_DAYS)
          + ' 天窗口内仍有游客数据；仅窗口内进度会被带入，窗口外数据不会写入账号。</p>'
        : '<p class="wb-hint">当前无窗口内游客进度，无需合并。</p>')
      + '<button class="wb-btn wb-btn-secondary wb-btn-block" data-action="signout">退出登录（不删除任何数据）</button>'
      + '</section>'
    : '<section class="wb-card wb-account">'
      + '<div class="wb-account-avatar wb-account-guest">👤</div>'
      + '<h3>游客模式</h3>'
      + '<p class="wb-hint">学习、对话、打卡照常可用；进度仅保留最近 '
      + String(GUEST_RETENTION_DAYS) + ' 天。日历与统计页登录后解锁。</p>'
      + '<button class="wb-btn wb-btn-primary wb-btn-block" data-action="login">登录华为账号</button>'
      + '<button class="wb-btn wb-btn-secondary wb-btn-block" data-action="stay-guest">继续以游客身份使用</button>'
      + '<p class="wb-hint">授权成功后，如有窗口内游客进度，将弹出「是否合并」选择（类型 B）。</p>'
      + '</section>';

  const demo = '<section class="wb-card"><h3>演示：模拟华为账号授权结果</h3>'
    + '<div class="wb-filter-row"><select id="wb-auth-outcome">'
    + outcomeOptions(ctx.accountProvider.getOutcome()) + '</select>'
    + '<span class="wb-hint">用于演示取消 / 网络错误 / Kit 不可用时会话态不变</span></div>'
    + '<p class="wb-hint">离线适配器不联网、不接 SDK；成功返回固定演示 uid。</p></section>'
    + '<section class="wb-card"><h3>隐私</h3>'
    + '<p class="wb-hint">仅保存昵称与本地不可逆 uid；不采集无关个人信息。端侧推理不上传对话内容。</p>'
    + '</section>';

  const html = body + demo;

  const view: PageView = {
    html: html,
    bind: (root: HTMLElement): void => {
      const outcomeSel: HTMLSelectElement | null = root.querySelector('#wb-auth-outcome');
      if (outcomeSel !== null) {
        outcomeSel.addEventListener('change', () => {
          const value: string = outcomeSel.value;
          for (const candidate of OUTCOMES) {
            if (candidate === value) ctx.accountProvider.setOutcome(candidate);
          }
          ctx.toast('授权结果已设为：' + esc(OUTCOME_LABELS[value] ?? value));
        });
      }

      const loginBtn: HTMLButtonElement | null = root.querySelector('[data-action="login"]');
      if (loginBtn !== null) loginBtn.addEventListener('click', () => void runAccountFlow(ctx));

      const stayBtn: HTMLButtonElement | null = root.querySelector('[data-action="stay-guest"]');
      if (stayBtn !== null) {
        stayBtn.addEventListener('click', () => {
          ctx.toast('好的，继续以游客身份学习');
          ctx.navigate('home');
        });
      }

      const remergeBtn: HTMLButtonElement | null = root.querySelector('[data-action="remerge"]');
      if (remergeBtn !== null) {
        remergeBtn.addEventListener('click', async () => {
          const detectR = await ctx.kernel.services.migration.detect(session.uid, ctx.clock.todayYMD());
          const decision: MergePromptDecision | undefined = detectR.ok && detectR.value !== undefined
            ? detectR.value : undefined;
          if (decision === undefined) { ctx.toast('无法读取游客进度快照'); return; }
          // Deliberately hand the kernel-produced decision to the Type B dialog;
          // neverPrompt (Type A) is not consulted anywhere on this path.
          ctx.showTypeB(decision);
        });
      }

      const signoutBtn: HTMLButtonElement | null = root.querySelector('[data-action="signout"]');
      if (signoutBtn !== null) {
        signoutBtn.addEventListener('click', async () => {
          const out = await ctx.kernel.services.account.signOut(ctx.clock);
          ctx.toast(out.ok ? '已退出登录，游客数据保留' : '退出失败');
          await ctx.bootstrap();
          await ctx.refresh();
        });
      }
    },
  };
  return view;
}
