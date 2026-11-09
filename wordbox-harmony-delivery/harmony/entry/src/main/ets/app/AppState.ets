/**
 * Global observable UI state for the Harmony track. It holds NO business
 * rules — only the kernel instance, the two dialog flags, the last bootstrap
 * result and a refresh counter. A merge completion increments `refreshTick`,
 * which drives Home / Calendar / Stats to re-read `WordBoxApp` immediately.
 */
import {
  Kernel, WordBoxApp, BootstrapResult, LoginPromptDecision,
  MergePromptDecision, AccountSession, SessionKind,
} from '../core/index';

@Observed
export class AppState {
  kernel: Kernel | undefined = undefined;
  session: AccountSession | undefined = undefined;
  bootstrapResult: BootstrapResult | undefined = undefined;
  showTypeA: boolean = false;
  showTypeB: boolean = false;
  typeADecision: LoginPromptDecision | undefined = undefined;
  typeBDecision: MergePromptDecision | undefined = undefined;
  refreshTick: number = 0;
  ready: boolean = false;

  app(): WordBoxApp | undefined {
    return this.kernel !== undefined ? this.kernel.app : undefined;
  }

  isAuthenticated(): boolean {
    return this.session !== undefined && this.session.kind === SessionKind.Authenticated;
  }

  /** Called after login / logout / merge so gated pages refresh at once. */
  bump(): void {
    this.refreshTick = this.refreshTick + 1;
  }
}

/** A single shared instance, injected into every page by AppBootstrap. */
export const appState: AppState = new AppState();
