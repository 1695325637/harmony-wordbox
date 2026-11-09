/**
 * Single shared overlay that owns the TWO dialog flows. Every page embeds
 * `DialogLayer({ state: appState })` once; the layer reads the observable
 * `AppState` flags and renders exactly one dialog at a time.
 *
 * Separation contract (QA will check this):
 *  - Type A is shown ONLY from `LoginPromptService.decide()` output stored by
 *    `bootstrapHarmony()`; its actions go through `onLoginGuideAction()`.
 *  - Type B is shown ONLY from `onHuaweiAuthResult()` / `migration.detect()`
 *    outputs; its choices go through `onMergeChoice()`.
 *  - `neverPrompt` is never consulted anywhere in the Type B path.
 */
import {
  LoginPromptDecision, PromptActionKind, MergePromptDecision, MergeChoiceKind,
  DialogType, PromptSkipReason, MergeSkipReason,
  emptyPromptSummary, DateWindow, Result, GuideActionResult, MergeResult,
} from '../core/index';
import { AppState } from '../app/AppState';
import { startHarmonyLogin, refreshHarmonySession } from '../app/AppBootstrap';
import { LoginGuideDialog } from './LoginGuideDialog';
import { MergeChoiceDialog } from './MergeChoiceDialog';

const FALLBACK_WINDOW: DateWindow = { fromYMD: '', toYMD: '', days: 7 };

@Component
export struct DialogLayer {
  @ObjectLink state: AppState;

  private guideDecision(): LoginPromptDecision {
    return this.state.typeADecision !== undefined ? this.state.typeADecision : {
      shouldPrompt: false,
      dialogType: DialogType.LoginGuide,
      dayIndex: 0,
      reason: PromptSkipReason.NO_GUEST_DATA,
      summary: emptyPromptSummary(FALLBACK_WINDOW),
    };
  }

  private mergeDecision(): MergePromptDecision {
    return this.state.typeBDecision !== undefined ? this.state.typeBDecision : {
      shouldShow: false,
      dialogType: DialogType.MergeChoice,
      guestSnapshot: undefined,
      summary: emptyPromptSummary(FALLBACK_WINDOW),
      reason: MergeSkipReason.NO_GUEST_DATA,
    };
  }

  private async guideAction(action: PromptActionKind): Promise<void> {
    const kernel = this.state.kernel;
    if (kernel === undefined) return;
    // "暂不" / "不再提示" persist lastPromptDate / neverPrompt in the kernel.
    const actionR: Result<GuideActionResult> = await kernel.app
      .onLoginGuideAction(action, kernel.clock);
    if (actionR.ok && actionR.value !== undefined && actionR.value.launchAccountKit) {
      // Authorize, then let the kernel decide whether Type B should appear.
      await startHarmonyLogin();
    }
    this.state.showTypeA = false;
    this.state.bump();
  }

  private async chooseMerge(choice: MergeChoiceKind): Promise<void> {
    const kernel = this.state.kernel;
    if (kernel === undefined) return;
    const merged: Result<MergeResult> = await kernel.app.onMergeChoice(choice, kernel.clock);
    if (merged.ok && merged.value !== undefined && merged.value.performed) {
      // Completion bumps refreshTick so Home / Calendar / Stats re-read at once.
      await refreshHarmonySession();
    }
    this.state.showTypeB = false;
    this.state.bump();
  }

  private hasDialog(): boolean {
    return this.state.showTypeA || this.state.showTypeB;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      if (this.state.showTypeA) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('#99000000')
        LoginGuideDialog({
          decision: this.guideDecision(),
          onAction: (action: PromptActionKind) => { void this.guideAction(action); },
        })
      } else if (this.state.showTypeB) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('#99000000')
        MergeChoiceDialog({
          decision: this.mergeDecision(),
          onChoose: (choice: MergeChoiceKind) => { void this.chooseMerge(choice); },
        })
      }
    }
    .width(this.hasDialog() ? '100%' : 0)
    .height(this.hasDialog() ? '100%' : 0)
    .position({ x: 0, y: 0 })
    .zIndex(100)
  }
}
