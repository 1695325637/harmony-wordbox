/**
 * Shared preview application context (singleton). Kept free of page imports so
 * pages/components can `getCtx()` without creating circular dependencies.
 */
import {
  Kernel, WordBoxApp, LoginPromptDecision, MergePromptDecision,
} from '@core';
import { FakeClock } from '@adapters/preview/fakeClock';
import { LocalStorageAdapter } from '@adapters/preview/localStorage';
import { OfflineAccountProvider } from '@adapters/preview/offlineAccountProvider';
import { PreviewAI } from '@adapters/preview/previewAI';
import type { ModalController } from './components/modal';

/** A page returns its markup plus an optional binding hook. */
export interface PageView {
  readonly html: string;
  readonly bind?: (root: HTMLElement) => void;
}

/** Application-wide context available to every page/component. */
export interface AppCtx {
  readonly kernel: Kernel;
  readonly app: WordBoxApp;
  readonly clock: FakeClock;
  readonly storage: LocalStorageAdapter;
  readonly accountProvider: OfflineAccountProvider;
  readonly previewAI: PreviewAI;
  readonly modal: ModalController;
  readonly shellHost: HTMLElement;
  readonly clockHost: HTMLElement;
  readonly pageHost: HTMLElement;
  readonly toastHost: HTMLElement;
  navigate(page: string): void;
  refresh(): Promise<void>;
  bootstrap(): Promise<void>;
  showTypeA(decision: LoginPromptDecision): void;
  showTypeB(decision: MergePromptDecision): void;
  toast(message: string): void;
  currentPage(): string;
  resetTransient(): void;
}

let current: AppCtx | undefined = undefined;

export function setCtx(ctx: AppCtx): void {
  current = ctx;
}

export function getCtx(): AppCtx {
  if (current === undefined) throw new Error('preview context not initialized');
  return current;
}

/** Small HTML escaping helper used by every page. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format seconds as `mm:ss`. */
export function mmss(seconds: number): string {
  const s: number = Math.max(0, Math.floor(seconds));
  const m: number = Math.floor(s / 60);
  const r: number = s % 60;
  return (m < 10 ? '0' : '') + String(m) + ':' + (r < 10 ? '0' : '') + String(r);
}
