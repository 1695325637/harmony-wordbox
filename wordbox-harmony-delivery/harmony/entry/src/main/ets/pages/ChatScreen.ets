/**
 * F-02 chat (ArkUI). ≥6 AI turns, `[[QUALITY:n]]` feedback, degradation badge
 * and a foreground 600s timer that is driven ONLY while the page is shown.
 * `onPageShow` starts the ticker; `onPageHide` (background / lock screen)
 * pauses it, so background time never counts toward the check-in goal.
 */
import {
  ALL_SCENES, SCENE_LABELS, DAILY_GOAL_SECONDS, Scene, ChatMessage,
} from '../core/index';
import { appState } from '../app/AppState';

interface ChatLine {
  readonly who: string;
  readonly text: string;
  readonly quality: number;
  readonly degraded: boolean;
  readonly provider: string;
}

@Entry
@Component
struct ChatScreen {
  @State scene: Scene = Scene.AIRPORT;
  @State lines: ChatLine[] = [];
  @State input: string = '';
  @State elapsed: number = 0;
  @State checkedIn: boolean = false;
  private sessionId: string = '';
  private ticker: number = -1;

  async aboutToAppear(): Promise<void> {
    await this.ensureSession();
  }

  onPageShow(): void {
    this.startTicker();
  }

  onPageHide(): void {
    this.stopTicker();
  }

  aboutToDisappear(): void {
    this.stopTicker();
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => {
      this.elapsed = this.elapsed + 1;
      const kernel = appState.kernel;
      if (kernel === undefined) return;
      void kernel.app.tickActiveSeconds(this.sessionId, 1, kernel.clock).then((r) => {
        if (r.ok && r.value !== undefined) this.checkedIn = r.value.checkedIn;
      });
    }, 1000);
  }

  private stopTicker(): void {
    if (this.ticker !== -1) {
      clearInterval(this.ticker);
      this.ticker = -1;
    }
  }

  private async ensureSession(): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    if (this.sessionId.length === 0) {
      const started = await kernel.app.startLearning(this.scene, kernel.clock);
      if (started.ok) this.sessionId = kernel.app.activeSessionId();
    }
  }

  private async send(): Promise<void> {
    const text: string = this.input.trim();
    if (text.length === 0) return;
    await this.ensureSession();
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    const userLines: ChatLine[] = this.lines.slice();
    userLines.push({ who: 'user', text: text, quality: -1, degraded: false, provider: '' });
    this.lines = userLines;
    this.input = '';
    const turn = await kernel.app.sendMessage(this.sessionId, text, kernel.clock);
    const next: ChatLine[] = this.lines.slice();
    if (turn.ok && turn.value !== undefined) {
      const m: ChatMessage = turn.value.message;
      next.push({
        who: 'ai', text: m.content, quality: m.quality,
        degraded: turn.value.degraded, provider: String(m.provider),
      });
    } else {
      next.push({ who: 'ai', text: '（本轮回复不可用，请重试）', quality: -1, degraded: true, provider: 'none' });
    }
    this.lines = next;
  }

  private async finish(): Promise<void> {
    const kernel = appState.kernel;
    if (kernel === undefined) return;
    this.stopTicker();
    const summary = await kernel.app.finishLearning(this.sessionId, kernel.clock);
    if (summary.ok && summary.value !== undefined) {
      this.checkedIn = summary.value.checkedIn;
    }
  }

  private timerText(): string {
    const m: number = Math.floor(this.elapsed / 60);
    const s: number = this.elapsed % 60;
    return (m < 10 ? '0' : '') + String(m) + ':' + (s < 10 ? '0' : '') + String(s)
      + ' / 10:00';
  }

  build() {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Select(ALL_SCENES.map((s: Scene) => ({ value: SCENE_LABELS[s] })))
          .selected(0)
          .onSelect((index: number) => { this.scene = ALL_SCENES[index]; })
        Text(this.timerText()).fontSize(20).fontWeight(FontWeight.Bold)
      }.width('100%')

      if (this.checkedIn) {
        Text('🎉 今日打卡完成').fontSize(14).fontColor('#16A34A')
      }

      List({ space: 8 }) {
        ForEach(this.lines, (line: ChatLine) => {
          ListItem() {
            Column({ space: 4 }) {
              if (line.who === 'ai') {
                Text((line.degraded ? '⚠ 降级 ScriptedAI' : '端侧 AI') + ' · ' + line.provider
                  + (line.quality >= 0 ? ' · QUALITY ' + String(line.quality) : ' · 本轮未计分'))
                  .fontSize(11).fontColor('#6B7280')
              }
              Text(line.text).fontSize(14)
            }
            .width('100%')
            .padding(10)
            .borderRadius(12)
            .backgroundColor(line.who === 'ai' ? '#FFFFFF' : '#3B6CF6')
            .fontColor(line.who === 'ai' ? '#1F2937' : '#FFFFFF')
          }
        })
      }
      .layoutWeight(1)
      .width('100%')

      Row({ space: 8 }) {
        TextInput({ text: this.input, placeholder: '说一句英语，例如 I would like a window seat.' })
          .layoutWeight(1)
          .onChange((value: string) => { this.input = value; })
        Button('发送').onClick(() => { void this.send(); })
      }.width('100%')

      Row({ space: 8 }) {
        Button('完成学习').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(() => { void this.finish(); })
        Button('+600 秒').layoutWeight(1).backgroundColor('#EEF2F9').fontColor('#1F2937')
          .onClick(async () => {
            const kernel = appState.kernel;
            if (kernel === undefined) return;
            this.elapsed = this.elapsed + DAILY_GOAL_SECONDS;
            const ci = await kernel.app.tickActiveSeconds(this.sessionId, DAILY_GOAL_SECONDS, kernel.clock);
            if (ci.ok && ci.value !== undefined) this.checkedIn = ci.value.checkedIn;
          })
      }.width('100%')
    }
    .width('100%')
    .height('100%')
    .padding(14)
    .backgroundColor('#F4F6FB')
  }
}
