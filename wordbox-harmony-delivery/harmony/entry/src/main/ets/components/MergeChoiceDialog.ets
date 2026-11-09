/**
 * Type B — "是否合并游客进度" (Q11 / F-21). Only reachable AFTER a successful
 * authorization (or Q12 re-merge via `MigrationService.detect()`); it NEVER
 * references `neverPrompt` (the Type A flag). Three options map 1:1 to
 * `MergeChoiceKind`; the kernel performs the eight-step merge, conflict
 * resolution and idempotent ledger.
 *
 * Pure view: orchestration lives in `DialogLayer`.
 */
import {
  MergePromptDecision, MergeChoiceKind, PromptSummary,
  DialogType, MergeSkipReason, emptyPromptSummary, DateWindow,
} from '../core/index';

const MERGE_WINDOW: DateWindow = { fromYMD: '', toYMD: '', days: 7 };

@Component
export struct MergeChoiceDialog {
  decision: MergePromptDecision = {
    shouldShow: false,
    dialogType: DialogType.MergeChoice,
    guestSnapshot: undefined,
    summary: emptyPromptSummary(MERGE_WINDOW),
    reason: MergeSkipReason.NO_GUEST_DATA,
  };
  onChoose: (choice: MergeChoiceKind) => void = () => {};

  private summaryText(s: PromptSummary): string {
    return '学习 ' + String(s.studyDays) + ' 天 · 已学 ' + String(s.wordsLearned)
      + ' 词 · 累计 ' + String(s.totalMinutes) + ' 分钟';
  }

  build() {
    Column({ space: 12 }) {
      Text('是否合并游客进度？')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
      Text('检测到最近 7 天（' + this.decision.summary.windowFromYMD
        + ' ~ ' + this.decision.summary.windowToYMD + '）的游客学习进度：')
        .fontSize(14)
      Text(this.summaryText(this.decision.summary))
        .fontSize(15)
        .fontColor('#6B7280')
      Text('窗口外的数据不会带入账号；不合并时窗口内数据仍保留、可再次合并。')
        .fontSize(13)
        .fontColor('#6B7280')

      Button('合并进度')
        .width('100%')
        .onClick(() => { this.onChoose(MergeChoiceKind.Merge); })
      Button('不合并，保留账号已有进度')
        .width('100%')
        .backgroundColor('#EEF2F9')
        .fontColor('#1F2937')
        .onClick(() => { this.onChoose(MergeChoiceKind.KeepAccount); })
      Button('取消（暂不处理）')
        .width('100%')
        .backgroundColor('#FFFFFF')
        .fontColor('#DC2626')
        .onClick(() => { this.onChoose(MergeChoiceKind.Defer); })
    }
    .width('88%')
    .padding(20)
    .backgroundColor('#FFFFFF')
    .borderRadius(18)
  }
}
