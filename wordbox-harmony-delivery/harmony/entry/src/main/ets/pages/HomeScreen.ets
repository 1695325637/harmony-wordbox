/**
 * F-01 home (ArkUI). Data source is the SAME `todayOverview()` used by the
 * H5 preview. For a guest session the streak is replaced by "登录解锁" and
 * the F-20 unlock hint is shown instead of any progress number.
 */
import { router } from '@kit.ArkUI';
import {
  HomeOverview, DailyQueue, DAILY_GOAL_SECONDS, SCENE_LABELS, SCENE_ICONS,
  DayState,
} from '../core/index';
import { appState } from '../app/AppState';
import { DialogLayer } from '../components/DialogLayer';

@Entry
@Component
struct HomeScreen {
  @State dateYMD: string = '';
  @State newCount: number = 0;
  @State reviewCount: number = 0;
  @State streakText: string = '🔒 登录解锁';
  @State elapsedSeconds: number = 0;
  @State sceneLabel: string = '';
  @State sceneIcon: string = '';
  @State accountLabel: string = '游客';
  @State gateHint: string = '';
  @State weekFlags: boolean[] = [false, false, false, false, false, false, false];

  async aboutToAppear(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    const result = await kernel.app.todayOverview(kernel.clock);
    const o: HomeOverview | undefined = result.ok && result.value !== undefined
      ? result.value : undefined;
    if (o === undefined) return;
    const queue: DailyQueue = o.queue;
    this.dateYMD = o.dateYMD;
    this.newCount = queue.newWordIds.length;
    this.reviewCount = queue.reviewWordIds.length + queue.relearnWordIds.length;
    this.streakText = o.streakVisible ? '连续 ' + String(o.streak) + ' 天' : '🔒 登录解锁';
    this.elapsedSeconds = DAILY_GOAL_SECONDS - o.remainingSeconds;
    this.sceneLabel = SCENE_LABELS[o.scene];
    this.sceneIcon = SCENE_ICONS[o.scene];
    this.accountLabel = o.accountLabel;
    this.gateHint = o.streakVisible ? '' : o.gateHint;
    const flags: boolean[] = [];
    for (const state of o.weeklyGrid) flags.push(state === DayState.Checked);
    this.weekFlags = flags;
  }

  private progressPercent(): number {
    return Math.min(100, Math.round((this.elapsedSeconds / DAILY_GOAL_SECONDS) * 100));
  }

  build() {
    Column({ space: 12 }) {
      Text('📦 单词盒子').fontSize(22).fontWeight(FontWeight.Bold)
      Text(this.dateYMD + ' · ' + this.accountLabel).fontSize(13).fontColor('#6B7280')
      Text('今天 10 分钟，学「用得上的旅行单词」').fontSize(18).fontWeight(FontWeight.Bold)

      Row({ space: 8 }) {
        Column() {
          Text(String(this.newCount)).fontSize(22).fontWeight(FontWeight.Bold)
          Text('今日新词').fontSize(12).fontColor('#6B7280')
        }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
        Column() {
          Text(String(this.reviewCount)).fontSize(22).fontWeight(FontWeight.Bold)
          Text('待复习').fontSize(12).fontColor('#6B7280')
        }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
        Column() {
          Text(this.streakText).fontSize(16).fontWeight(FontWeight.Bold)
          Text('连续打卡').fontSize(12).fontColor('#6B7280')
        }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
      }.width('100%')

      Progress({ value: this.progressPercent(), total: 100, type: ProgressType.Linear })
        .width('100%')
        .height(10)
      Text('今日已学 ' + String(Math.floor(this.elapsedSeconds / 60)) + ' 分 / 10 分，满 600 秒自动打卡')
        .fontSize(12).fontColor('#6B7280')

      Button('开始学习 →')
        .width('100%')
        .onClick(() => { router.pushUrl({ url: 'pages/ChatScreen' }); })

      Row() {
        Text(this.sceneIcon).fontSize(20)
        Text('今日场景 · ' + this.sceneLabel).fontSize(15)
      }.width('100%').padding(12).backgroundColor('#FFFFFF').borderRadius(12)

      Text('本周打卡').fontSize(15).fontWeight(FontWeight.Bold)
      Row({ space: 8 }) {
        ForEach(this.weekFlags, (flag: boolean) => {
          Column()
            .width(26).height(26).borderRadius(7)
            .backgroundColor(flag ? '#3B6CF6' : '#E5E9F2')
        })
      }.width('100%')

      if (this.gateHint.length > 0) {
        Text(this.gateHint).fontSize(12).fontColor('#D97706')
      }

      Row({ space: 8 }) {
        Button('生词本').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { router.pushUrl({ url: 'pages/VocabularyScreen' }); })
        Button('日历').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { router.pushUrl({ url: 'pages/CalendarScreen' }); })
        Button('统计').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { router.pushUrl({ url: 'pages/StatsScreen' }); })
        Button('我的').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { router.pushUrl({ url: 'pages/AccountScreen' }); })
      }.width('100%')

      // Cold-start Type A and post-auth Type B are rendered by this single layer.
      DialogLayer({ state: appState })
    }
    .width('100%')
    .padding(16)
    .backgroundColor('#F4F6FB')
  }
}
