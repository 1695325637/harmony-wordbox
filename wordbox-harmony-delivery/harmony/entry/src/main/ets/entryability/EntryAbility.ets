/**
 * Harmony entry ability. It owns NO business rule: it assembles the ports
 * through `AppBootstrap`, then loads the home page. Cold-start UI timing is a
 * UI concern; the kernel's `bootstrap()` order is fixed inside `WordBoxApp`.
 *
 * NOT compiled in this environment (no DevEco / Harmony SDK).
 */
import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { bootstrapHarmony } from '../app/AppBootstrap';

export default class EntryAbility extends UIAbility {
  onCreate(): void {
    // All assembly happens in onWindowStageCreate where a context is ready.
  }

  onDestroy(): void {
    // The kernel holds no platform handles that require explicit teardown.
  }

  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    try {
      await bootstrapHarmony(this.context);
    } catch (err) {
      console.error('[WordBox] bootstrap failed: ' + String(err));
    }
    windowStage.loadContent('pages/HomeScreen', (err: BusinessError) => {
      if (err.code !== 0) {
        console.error('[WordBox] loadContent failed: ' + String(err.code));
      }
    });
  }

  onWindowStageDestroy(): void {
    // Nothing to release; preferences and the model are process-scoped.
  }

  onForeground(): void {
    // Chat page resumes its foreground timer via onPageShow.
  }

  onBackground(): void {
    // Chat page pauses its foreground timer via onPageHide.
  }
}
