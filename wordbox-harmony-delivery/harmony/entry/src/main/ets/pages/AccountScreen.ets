/**
 * F-19 account (ArkUI) + Q12 re-merge entry. Authorization ALWAYS goes
 * through `startHarmonyLogin()` -> `WordBoxApp.onHuaweiAuthResult()`, so Type B
 * can only be produced by the kernel. "再次合并" re-runs
 * `MigrationService.detect()` instead of re-deciding from UI state.
 */
import { router } from '@kit.ArkUI';
import {
  AccountSession, SessionKind, Result, DateWindow,
  GUEST_RETENTION_DAYS, windowFrom,
} from '../core/index';
import { appState, AppState } from '../app/AppState';
import {
  startHarmonyLogin, reopenMergeDialog, signOutHarmony, refreshHarmonySession,
} from '../app/AppBootstrap';
import { DialogLayer } from '../components/DialogLayer';

@Entry
@Component
struct AccountScreen {
  @ObjectLink @Watch('onStateChange') state: AppState = appState;
  @State accountLabel: string = '游客';
  @State uid: string = '';
  @State authenticated: boolean = false;
  @State windowText: string = '';
  @State hint: string = '';
  private loadedOnce: boolean = false;

  async aboutToAppear(): Promise<void> {
    await this.load();
    this.loadedOnce = true;
  }

  onStateChange(): void {
    if (this.loadedOnce) void this.load();
  }

  private async load(): Promise<void> {
    const kernel = this.state.kernel;
    if (kernel === undefined) return;
    const r: Result<AccountSession> = await kernel.services.account.current();
    const session: AccountSession = r.ok && r.value !== undefined
      ? r.value : { kind: SessionKind.Guest, uid: '', displayName: '游客', partition: 'guest:', authenticatedAtMs: 0, tokenRefreshedAtMs: 0 };
    this.authenticated = session.kind === SessionKind.Authenticated;
    this.uid = session.uid;
    this.accountLabel = this.authenticated
      ? (session.displayName.length > 0 ? session.displayName : '华为账号用户')
      : '游客（数据仅保留最近 7 天）';
    const today: string = kernel.clock.todayYMD();
    const w: DateWindow = windowFrom(today, GUEST_RETENTION_DAYS);
    this.windowText = w.fromYMD + ' ~ ' + w.toYMD;
  }

  private async login(): Promise<void> {
    this.hint = '正在拉起华为账号授权…';
    await startHarmonyLogin();
    await this.load();
    this.hint = '授权流程结束。';
  }

  private async logout(): Promise<void> {
    await signOutHarmony();
    await this.load();
    this.hint = '已退出登录，本机数据未删除。';
  }

  private async remerge(): Promise<void> {
    const opened: boolean = await reopenMergeDialog();
    this.hint = opened
      ? '检测到可合并的窗口内游客进度，请在弹窗中选择。'
      : '当前没有待合并的窗口内游客进度（或已完成合并）。';
    await refreshHarmonySession();
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column({ space: 12 }) {
        Text('我的').fontSize(22).fontWeight(FontWeight.Bold)

        Column({ space: 6 }) {
          Text(this.accountLabel).fontSize(18).fontWeight(FontWeight.Bold)
          if (this.uid.length > 0) {
            Text('UID ' + this.uid).fontSize(12).fontColor('#6B7280')
          }
          Text('游客 7 天滑动窗口：' + this.windowText)
            .fontSize(12).fontColor('#6B7280')
          Text('窗口外数据不参与合并，游客分区在合并后不会被删除。')
            .fontSize(12).fontColor('#6B7280')
        }
        .width('100%')
        .padding(14)
        .backgroundColor('#FFFFFF')
        .borderRadius(12)

        if (!this.authenticated) {
          Button('登录华为账号')
            .width('100%')
            .onClick(() => { void this.login(); })
          Text('登录成功后，由内核决定是否弹出「是否合并游客进度」（类型 B）。')
            .fontSize(12).fontColor('#6B7280')
        } else {
          Button('再次合并游客进度（Q12）')
            .width('100%')
            .onClick(() => { void this.remerge(); })
          Button('退出登录')
            .width('100%')
            .backgroundColor('#FFFFFF')
            .fontColor('#DC2626')
            .onClick(() => { void this.logout(); })
        }

        if (this.hint.length > 0) {
          Text(this.hint).fontSize(13).fontColor('#D97706')
        }

        Text('两类弹窗严格分离：类型 A 仅由游客态冷启动的登录引导产生；'
          + '类型 B 仅在授权成功 / 迁移探测后产生。「不再提示」只关闭类型 A。')
          .fontSize(12).fontColor('#6B7280')

        Button('返回首页').width('100%').backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { router.back(); })
      }
      .width('100%')
      .height('100%')
      .padding(16)
      .backgroundColor('#F4F6FB')

      DialogLayer({ state: appState })
    }
    .width('100%')
    .height('100%')
  }
}
