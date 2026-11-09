/**
 * Track C entry point — assembles the four platform adapters, calls the
 * kernel's `createKernel()` (the SAME `core/src` used by Harmony and Vitest),
 * builds the DOM hosts, runs the cold-start `bootstrap()` order and wires the
 * hash router. No business rule is duplicated here: every page calls
 * `WordBoxApp` / kernel services only.
 */
import {
  Kernel, KernelPorts, WordBoxApp, BootstrapResult,
  LoginPromptDecision, MergePromptDecision,
  createKernel,
} from '@core';
import { LocalStorageAdapter, createLocalStorageAdapter } from '@adapters/preview/localStorage';
import { FakeClock, createFakeClock } from '@adapters/preview/fakeClock';
import {
  OfflineAccountProvider, createOfflineAccountProvider,
} from '@adapters/preview/offlineAccountProvider';
import { PreviewAI, createPreviewRouter } from '@adapters/preview/previewAI';
import { AppCtx, PageView, setCtx } from './context';
import { PAGES, currentPage, navigate, onHashChange } from './router';
import { ModalController, createModal } from './components/modal';
import { shellHtml, bindShell } from './components/shell';
import { clockPanelHtml, bindClockPanel } from './components/clockPanel';
import { showTypeADialog } from './components/typeADialog';
import { showTypeBDialog } from './components/typeBDialog';
import { homePage } from './pages/home';
import { chatPage, resetChat, stopChatTimer } from './pages/chat';
import { vocabularyPage, resetVocabulary } from './pages/vocabulary';
import { calendarPage, resetCalendar } from './pages/calendar';
import { statsPage, resetStats } from './pages/stats';
import { accountPage } from './pages/account';

function requireElement(id: string): HTMLElement {
  const element: HTMLElement | null = document.getElementById(id);
  if (element === null) throw new Error('missing host element: ' + id);
  return element;
}

/** Build the static single-page frame; page content is injected into #wb-page. */
function buildFrame(): void {
  const appRoot: HTMLElement | null = document.getElementById('app');
  if (appRoot === null) throw new Error('#app mount point not found');
  appRoot.innerHTML = '<div class="wb-app">'
    + '<div id="wb-shell"></div>'
    + '<div class="wb-scroll">'
    + '<div id="wb-clock"></div>'
    + '<main id="wb-page"></main>'
    + '</div>'
    + '<div id="wb-modal"></div>'
    + '<div id="wb-toast"></div>'
    + '</div>';
}

async function main(): Promise<void> {
  buildFrame();

  const shellHost: HTMLElement = requireElement('wb-shell');
  const clockHost: HTMLElement = requireElement('wb-clock');
  const pageHost: HTMLElement = requireElement('wb-page');
  const toastHost: HTMLElement = requireElement('wb-toast');
  const modalHost: HTMLElement = requireElement('wb-modal');

  // --- Platform adapters (track C) -----------------------------------------
  const storage: LocalStorageAdapter = createLocalStorageAdapter();
  const clock: FakeClock = createFakeClock();
  const accountProvider: OfflineAccountProvider = createOfflineAccountProvider();
  const previewAI: PreviewAI = createPreviewRouter();

  // --- The ONE kernel, shared with Harmony + tests -------------------------
  const ports: KernelPorts = {
    storage: storage,
    clock: clock,
    accountProvider: accountProvider,
    primaryAI: previewAI.primary,
    fallbackAI: previewAI.fallback,
  };
  const kernel: Kernel = createKernel(ports);
  const app: WordBoxApp = kernel.app;
  const modal: ModalController = createModal(modalHost);

  let lastBootstrap: BootstrapResult | undefined = undefined;

  async function render(): Promise<void> {
    // Leaving the chat page must stop the foreground 600s timer.
    stopChatTimer();
    const page: string = currentPage();

    shellHost.innerHTML = await shellHtml(page);
    bindShell(shellHost);
    clockHost.innerHTML = await clockPanelHtml();
    bindClockPanel(clockHost);

    let view: PageView;
    switch (page) {
      case 'chat': view = await chatPage(ctx); break;
      case 'vocabulary': view = await vocabularyPage(ctx); break;
      case 'calendar': view = await calendarPage(ctx); break;
      case 'stats': view = await statsPage(ctx); break;
      case 'account': view = await accountPage(ctx); break;
      default: view = await homePage(ctx); break;
    }
    pageHost.innerHTML = view.html;
    if (view.bind !== undefined) view.bind(pageHost);
  }

  async function bootstrap(): Promise<void> {
    const result = await app.bootstrap(clock);
    if (result.ok && result.value !== undefined) {
      lastBootstrap = result.value;
      const guide: LoginPromptDecision = result.value.loginGuide;
      // Type A is produced ONLY by `decide()` on a guest cold start.
      if (guide.shouldPrompt) showTypeADialog(guide);
    }
    await render();
  }

  function toast(message: string): void {
    const item: HTMLDivElement = document.createElement('div');
    item.className = 'wb-toast-item';
    item.textContent = message;
    toastHost.appendChild(item);
    window.setTimeout(() => { item.remove(); }, 2600);
  }

  function showTypeA(decision: LoginPromptDecision): void {
    showTypeADialog(decision);
  }

  function showTypeB(decision: MergePromptDecision): void {
    showTypeBDialog(decision);
  }

  function resetTransient(): void {
    resetChat();
    resetVocabulary();
    resetCalendar();
    resetStats();
    modal.dismiss();
  }

  const ctx: AppCtx = {
    kernel: kernel,
    app: app,
    clock: clock,
    storage: storage,
    accountProvider: accountProvider,
    previewAI: previewAI,
    modal: modal,
    shellHost: shellHost,
    clockHost: clockHost,
    pageHost: pageHost,
    toastHost: toastHost,
    navigate: (page: string): void => { navigate(page); },
    refresh: render,
    bootstrap: bootstrap,
    showTypeA: showTypeA,
    showTypeB: showTypeB,
    toast: toast,
    currentPage: currentPage,
    resetTransient: resetTransient,
  };
  setCtx(ctx);

  onHashChange(() => { void render(); });

  // Ensure a known hash on first load, then run the cold-start sequence.
  if (PAGES.indexOf(currentPage()) < 0 || window.location.hash.length === 0) {
    window.location.hash = '#/home';
  }
  await bootstrap();
  void lastBootstrap;
}

void main();
