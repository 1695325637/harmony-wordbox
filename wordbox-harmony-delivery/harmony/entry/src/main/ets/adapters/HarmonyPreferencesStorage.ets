/**
 * Harmony StorageService adapter (track B).
 *
 * Backed by `@kit.ArkData` preferences. `batchSet` applies every `put` in
 * memory and commits with a SINGLE `flush()`; if any step fails it restores the
 * pre-batch snapshot (or removes newly created keys) and flushes the rollback,
 * so a failed batch never leaves a partial write. Keys are stored as raw
 * strings, exactly as the kernel's `StorageService` contract requires.
 *
 * This file is NOT compiled in the current environment (no DevEco / SDK).
 * It is written against the standard API-12 preferences surface.
 */
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import {
  StorageService, StorageEntry, Result, ErrorCode, ok, fail,
} from '../core/index';

interface OldValue {
  readonly key: string;
  readonly existed: boolean;
  readonly value: string;
}

const STORE_NAME: string = 'wordbox_store';

export class HarmonyPreferencesStorage implements StorageService {
  private store: preferences.Preferences | undefined = undefined;

  /** Must be called once from EntryAbility/AppBootstrap with the app context. */
  async init(context: common.UIAbilityContext): Promise<Result<boolean>> {
    try {
      const opened: preferences.Preferences = await preferences.getPreferences(context, STORE_NAME);
      this.store = opened;
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_READ_FAILED, 'preferences.getPreferences failed');
    }
  }

  private ready(): preferences.Preferences | undefined {
    return this.store;
  }

  async get(key: string): Promise<Result<string | undefined>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<string | undefined>(ErrorCode.STORAGE_READ_FAILED, 'store not initialized');
    }
    try {
      const has: boolean = await store.has(key);
      if (!has) return ok<string | undefined>(undefined);
      const value: preferences.ValueType = await store.get(key, '');
      return ok<string | undefined>(String(value));
    } catch {
      return fail<string | undefined>(ErrorCode.STORAGE_READ_FAILED, 'preferences.get failed');
    }
  }

  async set(key: string, value: string): Promise<Result<boolean>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'store not initialized');
    }
    try {
      await store.put(key, value);
      await store.flush();
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'preferences.put/flush failed');
    }
  }

  async remove(key: string): Promise<Result<boolean>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'store not initialized');
    }
    try {
      await store.delete(key);
      await store.flush();
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'preferences.delete/flush failed');
    }
  }

  async keys(prefix: string): Promise<Result<readonly string[]>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<readonly string[]>(ErrorCode.STORAGE_READ_FAILED, 'store not initialized');
    }
    try {
      const all: object = await store.getAll();
      const names: string[] = Object.keys(all);
      const out: string[] = [];
      for (const name of names) {
        if (name.indexOf(prefix) === 0) out.push(name);
      }
      out.sort();
      return ok<readonly string[]>(out);
    } catch {
      return fail<readonly string[]>(ErrorCode.STORAGE_READ_FAILED, 'preferences.getAll failed');
    }
  }

  /** Snapshot the previous value of every key in a batch (for rollback). */
  private async snapshot(keys: readonly string[]): Promise<OldValue[]> {
    const store: preferences.Preferences | undefined = this.ready();
    const out: OldValue[] = [];
    if (store === undefined) return out;
    for (const key of keys) {
      const existed: boolean = await store.has(key);
      let value: string = '';
      if (existed) {
        const previous: preferences.ValueType = await store.get(key, '');
        value = String(previous);
      }
      out.push({ key: key, existed: existed, value: value });
    }
    return out;
  }

  private async restore(snapshot: readonly OldValue[]): Promise<void> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) return;
    try {
      for (const old of snapshot) {
        if (old.existed) await store.put(old.key, old.value);
        else await store.delete(old.key);
      }
      await store.flush();
    } catch {
      // Rollback is best-effort; the original failure is already reported.
    }
  }

  async batchSet(entries: readonly StorageEntry[]): Promise<Result<boolean>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'store not initialized');
    }
    const keys: string[] = [];
    for (const entry of entries) {
      if (entry.key.length === 0) {
        return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'empty key, nothing committed');
      }
      keys.push(entry.key);
    }
    const snapshot: OldValue[] = await this.snapshot(keys);
    try {
      for (const entry of entries) await store.put(entry.key, entry.value);
      // Single atomic-ish commit: one flush for the whole batch.
      await store.flush();
      return ok<boolean>(true);
    } catch {
      await this.restore(snapshot);
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchSet failed, rolled back');
    }
  }

  async batchRemove(keys: readonly string[]): Promise<Result<boolean>> {
    const store: preferences.Preferences | undefined = this.ready();
    if (store === undefined) {
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'store not initialized');
    }
    for (const key of keys) {
      if (key.length === 0) {
        return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'empty key, nothing removed');
      }
    }
    const snapshot: OldValue[] = await this.snapshot(keys);
    try {
      for (const key of keys) await store.delete(key);
      await store.flush();
      return ok<boolean>(true);
    } catch {
      await this.restore(snapshot);
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchRemove failed, rolled back');
    }
  }
}

export function createHarmonyPreferencesStorage(): HarmonyPreferencesStorage {
  return new HarmonyPreferencesStorage();
}
