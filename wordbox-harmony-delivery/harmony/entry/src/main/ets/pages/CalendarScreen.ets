/**
 * F-06 calendar (ArkUI). F-20 gate lives in the READ LAYER: this page calls
 * `WordBoxApp.calendar()` and renders `GateView` whenever `allowed === false`.
 * It never reads a CheckIn / StudyRecord before consulting the gate, and it
 * never decides access from `appState.session` by itself.
 */
import { router } from '@kit.ArkUI';
import {
  Gated, GateReason, CalendarMonth, CalendarDay, DayState, Result,
  monthOf, monthStartYMD, daysInMonth, ymdOfMonthDay, addDays, diffDays,
} from '../core/index';
import { appState, AppState } from '../app/AppState';
import { startHarmonyLogin } from '../app/AppBootstrap';
import { GateView } from '../components/GateView';
import { DialogLayer } from '../components/DialogLayer';

interface DayCell {
  readonly label: string;
  readonly state: DayState;
  readonly blank: boolean;
  readonly activeSeconds: number;
}

/** 2024-01-01 is a Monday; `diffDays` is a pure UTC-day ordinal (DST-safe). */
const MONDAY_ANCHOR: string = '2024-01-01';

@Entry
@Component
struct CalendarScreen {
  @ObjectLink @Watch('onStateChange') state: AppState = appState;
  @State month: string = '';
  @State allowed: boolean = false;
  @State unlockHint: string = '登录华为账号，解锁进度';
  @State cells: DayCell[] = [];
  @State checkedInDays: number = 0;
  @State longestStreak: number = 0;
  @State totalMinutes: number = 0;
  private loadedOnce: boolean = false;

  async aboutToAppear(): Promise<void> {
    this.month = monthOf(this.state.kernel !== undefined
      ? this.state.kernel.clock.todayYMD() : MONDAY_ANCHOR);
    await this.load();
    this.loadedOnce = true;
  }

  onStateChange(): void {
    if (this.loadedOnce) void this.load();
  }

  private async load(): Promise<void> {
    const kernel = this.state.kernel;
    if (kernel === undefined) return;
    const r: Result<Gated<CalendarMonth>> = await kernel.app.calendar(this.month, kernel.clock);
    if (!r.ok || r.value === undefined) return;
    const gated: Gated<CalendarMonth> = r.value;
    this.allowed = gated.allowed && gated.reason === GateReason.Ok;
    this.unlockHint = gated.unlockHint;
    if (!this.allowed || gated.data === undefined) {
      this.cells = [];
      this.checkedInDays = 0;
      this.longestStreak = 0;
      this.totalMinutes = 0;
      return;
    }
    const data: CalendarMonth = gated.data;
    this.checkedInDays = data.checkedInDays;
    this.longestStreak = data.longestStreak;
    this.totalMinutes = Math.round(data.totalActiveSeconds / 60);

    const byDate: Map<string, CalendarDay> = new Map<string, CalendarDay>();
    for (const day of data.days) byDate.set(day.dateYMD, day);

    const first: string = monthStartYMD(this.month);
    const offsetRaw: number = diffDays(MONDAY_ANCHOR, first) % 7;
    const offset: number = offsetRaw < 0 ? offsetRaw + 7 : offsetRaw;
    const cells: DayCell[] = [];
    for (let i = 0; i < offset; i++) {
      cells.push({ label: '', state: DayState.Future, blank: true, activeSeconds: 0 });
    }
    const count: number = daysInMonth(this.month);
    for (let day = 1; day <= count; day++) {
      const ymd: string = ymdOfMonthDay(this.month, day);
      const item: CalendarDay | undefined = byDate.get(ymd);
      cells.push({
        label: String(day),
        state: item !== undefined ? item.state : DayState.Missed,
        blank: false,
        activeSeconds: item !== undefined ? item.activeSeconds : 0,
      });
    }
    this.cells = cells;
  }

  private shiftMonth(delta: number): void {
    const start: string = monthStartYMD(this.month);
    const end: string = ymdOfMonthDay(this.month, daysInMonth(this.month));
    const shifted: string = delta < 0 ? addDays(start, -1) : addDays(end, 1);
    this.month = monthOf(shifted);
    void this.load();
  }

  private cellColor(cell: DayCell): string {
    if (cell.blank) return '#FFFFFF';
    if (cell.state === DayState.Checked) return '#3B6CF6';
    if (cell.state === DayState.Future) return '#F3F4F6';
    return '#FEE2E2';
  }

  private cellTextColor(cell: DayCell): string {
    return cell.state === DayState.Checked ? '#FFFFFF' : '#1F2937';
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column({ space: 12 }) {
        Row({ space: 8 }) {
          Button('←').backgroundColor('#EEF2F9').fontColor('#1F2937')
            .onClick(() => { this.shiftMonth(-1); })
          Text(this.month).fontSize(20).fontWeight(FontWeight.Bold).layoutWeight(1)
            .textAlign(TextAlign.Center)
          Button('→').backgroundColor('#EEF2F9').fontColor('#1F2937')
            .onClick(() => { this.shiftMonth(1); })
        }.width('100%')

        if (!this.allowed) {
          GateView({
            unlockHint: this.unlockHint,
            onLogin: () => { void startHarmonyLogin(); },
          })
        } else {
          Row({ space: 8 }) {
            Text('打卡 ' + String(this.checkedInDays) + ' 天').fontSize(13)
            Text('最长连续 ' + String(this.longestStreak) + ' 天').fontSize(13)
            Text('累计 ' + String(this.totalMinutes) + ' 分').fontSize(13)
          }.width('100%')

          Row({ space: 0 }) {
            ForEach(['一', '二', '三', '四', '五', '六', '日'], (label: string) => {
              Text(label).fontSize(12).layoutWeight(1).textAlign(TextAlign.Center)
                .fontColor('#6B7280')
            })
          }.width('100%')

          Grid() {
            ForEach(this.cells, (cell: DayCell) => {
              GridItem() {
                Column() {
                  Text(cell.label).fontSize(13).fontColor(this.cellTextColor(cell))
                }
                .width('100%')
                .height(38)
                .justifyContent(FlexAlign.Center)
                .backgroundColor(this.cellColor(cell))
                .borderRadius(8)
              }
            })
          }
          .columnsTemplate('1fr 1fr 1fr 1fr 1fr 1fr 1fr')
          .rowsGap(4)
          .columnsGap(4)
          .width('100%')

          Text('蓝色 = 已打卡 · 红色 = 未打卡 · 灰色 = 未来')
            .fontSize(11).fontColor('#6B7280')
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
