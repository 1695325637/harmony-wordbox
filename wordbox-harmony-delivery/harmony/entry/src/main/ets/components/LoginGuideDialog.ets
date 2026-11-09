/**
 * Type A — guest login guide (F-22). A distinct ArkUI component; it is NEVER
 * shared with MergeChoiceDialog (Type B). It renders only the引导性
 * `PromptSummary` (never statistics-page numbers) and the three actions.
 * "去登录" is the only path that can lead to Type B after authorization.
 *
 * This is a pure view: all kernel calls live in `DialogLayer`, so the dialog
 * itself can never bypass the `LoginPromptService` state machine.
 */
import {
  LoginPromptDecision, PromptActionKind, PromptSummary,
  DialogType, PromptSkipReason, emptyPromptSummary, DateWindow,
} from '../core/index';

const GUIDE_WINDOW: DateWindow = { fromYMD: '', toYMD: '', days: 7 };

@Component
export struct LoginGuideDialog {
  decision: LoginPromptDecision = {
    shouldPrompt: false,
    dialogType: DialogType.LoginGuide,
    dayIndex: 0,
    reason: PromptSkipReason.NO_GUEST_DATA,
    summary: emptyPromptSummary(GUIDE_WINDOW),
  };
  onAction: (action: PromptActionKind) => void = () => {};

  private summaryText(s: PromptSummary): string {
    return '学习 ' + String(s.studyDays) + ' 天 · 已学 ' + String(s.wordsLearned)
      + ' 词 · 累计 ' + String(s.totalMinutes) + ' 分钟';
  }

  build() {
    Column({ space: 12 }) {
      Text('登录以保存学习进度')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
      Text(this.summaryText(this.decision.summary))
        .fontSize(15)
        .fontColor('#6B7280')
      Text('游客进度仅保留最近 7 天（' + this.decision.summary.windowFromYMD
        + ' ~ ' + this.decision.summary.windowToYMD + '）。登录华为账号可长期保存。')
        .fontSize(13)
        .fontColor('#6B7280')
      Text('今天是第 D' + String(this.decision.dayIndex) + ' 天。')
        .fontSize(13)
        .fontColor('#6B7280')

      Button('去登录')
        .width('100%')
        .onClick(() => { this.onAction(PromptActionKind.GoLogin); })
      Button('暂不')
        .width('100%')
        .backgroundColor('#EEF2F9')
        .fontColor('#1F2937')
        .onClick(() => { this.onAction(PromptActionKind.Later); })
      Button('不再提示')
        .width('100%')
        .backgroundColor('#FFFFFF')
        .fontColor('#DC2626')
        .onClick(() => { this.onAction(PromptActionKind.NeverPrompt); })
    }
    .width('88%')
    .padding(20)
    .backgroundColor('#FFFFFF')
    .borderRadius(18)
  }
}
