/**
 * F-07 / F-08 statistics (ArkUI). 7 / 30 / 90-day windows, mastery curve and
 * the fixed 8-scene distribution. The F-20 gate is enforced INSIDE
 * `StatsService.summary()`; this page only renders `Gated<T>.allowed`.
 */
import { router } from '@kit.ArkUI';
import {
  Gated, GateReason, StatsWindow, StatsSummary, MasteryPoint, SceneMastery,
  SCENE_LABELS, SCENE_ICONS, Result,
} from '../core/index';
import { appState, AppState } from '../app/AppState';
import { startHarmonyLogin } from '../app/AppBootstrap';
import { GateView } from '../components/GateView';
import { DialogLayer } from '../components/DialogLayer';

interface CurveRow {
  readonly dateYMD: string;
  readonly masteredWords: number;
  readonly widthPercent: number;
}

interface SceneRow {
  readonly label: string;
  readonly total: number;
  readonly mastered: number;
  readonly percent: number;
}

@Entry
@Component
struct StatsScreen {
  @ObjectLink @Watch('onStateChange') state: AppState = appState;
  @State windowDays: StatsWindow = StatsWindow.D7;
  @State allowed: boolean = false;
  @State unlockHint: string = '登录华为账号，解锁进度';
  @State asOfYMD: string = '';
  @State masteredWords: number = 0;
  @State learningWords: number = 0;
  @State totalReviews: number = 0;
  @State correctReviews: number = 0;
  @State completionPercent: number = 0;
  @State totalMinutes: number = 0;
  @State checkedInDays: number = 0;
  @State currentStreak: number = 0;
  @State longestStreak: number = 0;
  @State curveRows: CurveRow[] = [];
  @State sceneRows: SceneRow[] = [];
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
    const r: Result<Gated<StatsSummary>> = await kernel.app
      .statistics(this.windowDays, kernel.clock);
    if (!r.ok || r.value === undefined) return;
    const gated: Gated<StatsSummary> = r.value;
    this.allowed = gated.allowed && gated.reason === GateReason.Ok;
    this.unlockHint = gated.unlockHint;
    if (!this.allowed || gated.data === undefined) {
      this.resetNumbers();
      return;
    }
    const s: StatsSummary = gated.data;
    this.asOfYMD = s.asOfYMD;
    this.masteredWords = s.masteredWords;
    this.learningWords = s.learningWords;
    this.totalReviews = s.totalReviews;
    this.correctReviews = s.correctReviews;
    this.completionPercent = Math.round(s.reviewCompletionRate * 100);
    this.totalMinutes = Math.round(s.totalActiveSeconds / 60);
    this.checkedInDays = s.checkedInDays;
    this.currentStreak = s.currentStreak;
    this.longestStreak = s.longestStreak;

    let maxMastered: number = 1;
    for (const point of s.masteryCurve) {
      if (point.masteredWords > maxMastered) maxMastered = point.masteredWords;
    }
    const curveRows: CurveRow[] = [];
    for (const point of s.masteryCurve) {
      const item: MasteryPoint = point;
      curveRows.push({
        dateYMD: item.dateYMD,
        masteredWords: item.masteredWords,
        widthPercent: Math.max(4, Math.round((item.masteredWords / maxMastered) * 100)),
      });
    }
    this.curveRows = curveRows;

    const sceneRows: SceneRow[] = [];
    for (const item of s.sceneDistribution) {
      const entry: SceneMastery = item;
      sceneRows.push({
        label: SCENE_ICONS[entry.scene] + ' ' + SCENE_LABELS[entry.scene],
        total: entry.total,
        mastered: entry.mastered,
        percent: Math.round(entry.ratio * 100),
      });
    }
    this.sceneRows = sceneRows;
  }

  private resetNumbers(): void {
    this.asOfYMD = '';
    this.masteredWords = 0;
    this.learningWords = 0;
    this.totalReviews = 0;
    this.correctReviews = 0;
    this.completionPercent = 0;
    this.totalMinutes = 0;
    this.checkedInDays = 0;
    this.currentStreak = 0;
    this.longestStreak = 0;
    this.curveRows = [];
    this.sceneRows = [];
  }

  private setWindow(windowDays: StatsWindow): void {
    this.windowDays = windowDays;
    void this.load();
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column({ space: 12 }) {
        Text('学习统计').fontSize(22).fontWeight(FontWeight.Bold)
        Row({ space: 8 }) {
          Button('近 7 天').layoutWeight(1)
            .backgroundColor(this.windowDays === StatsWindow.D7 ? '#3B6CF6' : '#EEF2F9')
            .fontColor(this.windowDays === StatsWindow.D7 ? '#FFFFFF' : '#1F2937')
            .onClick(() => { this.setWindow(StatsWindow.D7); })
          Button('近 30 天').layoutWeight(1)
            .backgroundColor(this.windowDays === StatsWindow.D30 ? '#3B6CF6' : '#EEF2F9')
            .fontColor(this.windowDays === StatsWindow.D30 ? '#FFFFFF' : '#1F2937')
            .onClick(() => { this.setWindow(StatsWindow.D30); })
          Button('近 90 天').layoutWeight(1)
            .backgroundColor(this.windowDays === StatsWindow.D90 ? '#3B6CF6' : '#EEF2F9')
            .fontColor(this.windowDays === StatsWindow.D90 ? '#FFFFFF' : '#1F2937')
            .onClick(() => { this.setWindow(StatsWindow.D90); })
        }.width('100%')

        if (!this.allowed) {
          GateView({
            unlockHint: this.unlockHint,
            onLogin: () => { void startHarmonyLogin(); },
          })
        } else {
          Text('截至 ' + this.asOfYMD).fontSize(12).fontColor('#6B7280')
          Row({ space: 8 }) {
            Column() {
              Text(String(this.masteredWords)).fontSize(22).fontWeight(FontWeight.Bold)
              Text('已掌握').fontSize(12).fontColor('#6B7280')
            }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
            Column() {
              Text(String(this.learningWords)).fontSize(22).fontWeight(FontWeight.Bold)
              Text('学习中').fontSize(12).fontColor('#6B7280')
            }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
            Column() {
              Text(String(this.completionPercent) + '%').fontSize(22).fontWeight(FontWeight.Bold)
              Text('复习完成率').fontSize(12).fontColor('#6B7280')
            }.layoutWeight(1).backgroundColor('#EEF2F9').borderRadius(10).padding(10)
          }.width('100%')

          Text('复习 ' + String(this.correctReviews) + ' / ' + String(this.totalReviews)
            + ' · 累计 ' + String(this.totalMinutes) + ' 分钟 · 打卡 '
            + String(this.checkedInDays) + ' 天 · 当前连续 ' + String(this.currentStreak)
            + ' 天 · 最长 ' + String(this.longestStreak) + ' 天')
            .fontSize(12).fontColor('#6B7280')

          Text('掌握曲线').fontSize(15).fontWeight(FontWeight.Bold)
          Column({ space: 4 }) {
            ForEach(this.curveRows, (row: CurveRow) => {
              Row({ space: 6 }) {
                Text(row.dateYMD).fontSize(11).width(86).fontColor('#6B7280')
                Row()
                  .height(12)
                  .width(row.widthPercent + '%')
                  .backgroundColor('#3B6CF6')
                  .borderRadius(6)
                Text(String(row.masteredWords)).fontSize(11)
              }.width('100%')
            })
          }.width('100%')

          Text('8 大场景掌握度').fontSize(15).fontWeight(FontWeight.Bold)
          Column({ space: 4 }) {
            ForEach(this.sceneRows, (row: SceneRow) => {
              Row({ space: 6 }) {
                Text(row.label).fontSize(12).width(96)
                Row()
                  .height(10)
                  .width(row.percent + '%')
                  .backgroundColor('#34C38F')
                  .borderRadius(5)
                Text(String(row.mastered) + '/' + String(row.total)).fontSize(11)
              }.width('100%')
            })
          }.width('100%')
        }

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
