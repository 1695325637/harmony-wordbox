/**
 * Track C adapter: `window.localStorage` as a `StorageService`.
 * DOM usage is confined to adapters/preview/** — the kernel stays DOM-free.
 */
import { StorageService, StorageEntry, Result, ok, fail, ErrorCode } from '@core';

export class LocalStorageAdapter implements StorageService {
  private readonly prefix: string;

  constructor(prefix: string = 'wordbox:') {
    this.prefix = prefix;
  }

  private physical(key: string): string {
    return this.prefix + key;
  }

  private store(): Storage {
    return window.localStorage;
  }

  async get(key: string): Promise<Result<string | undefined>> {
    try {
      const value: string | null = this.store().getItem(this.physical(key));
      return ok<string | undefined>(value === null ? undefined : value);
    } catch {
      return fail<string | undefined>(ErrorCode.STORAGE_READ_FAILED, 'localStorage get failed');
    }
  }

  async set(key: string, value: string): Promise<Result<boolean>> {
    try {
      this.store().setItem(this.physical(key), value);
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'localStorage set failed');
    }
  }

  async remove(key: string): Promise<Result<boolean>> {
    try {
      this.store().removeItem(this.physical(key));
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'localStorage remove failed');
    }
  }

  async keys(prefix: string): Promise<Result<readonly string[]>> {
    try {
      const store: Storage = this.store();
      const target: string = this.physical(prefix);
      const out: string[] = [];
      for (let i: number = 0; i < store.length; i++) {
        const physical: string | null = store.key(i);
        if (physical !== null && physical.startsWith(target)) out.push(physical.slice(this.prefix.length));
      }
      out.sort();
      return ok<readonly string[]>(out);
    } catch {
      return fail<readonly string[]>(ErrorCode.STORAGE_READ_FAILED, 'localStorage keys failed');
    }
  }

  async batchSet(entries: readonly StorageEntry[]): Promise<Result<boolean>> {
    try {
      const store: Storage = this.store();
      // Pre-validate, snapshot old values for rollback, then commit atomically.
      const rollback: { readonly key: string; readonly value: string | null }[] = [];
      for (const entry of entries) {
        if (entry.key.length === 0) {
          return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'empty key, nothing committed');
        }
        rollback.push({ key: this.physical(entry.key), value: store.getItem(this.physical(entry.key)) });
      }
      try {
        for (const entry of entries) store.setItem(this.physical(entry.key), entry.value);
      } catch {
        for (const r of rollback) {
          if (r.value === null) store.removeItem(r.key);
          else store.setItem(r.key, r.value);
        }
        return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchSet failed, rolled back');
      }
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchSet failed');
    }
  }

  async batchRemove(keys: readonly string[]): Promise<Result<boolean>> {
    try {
      const store: Storage = this.store();
      const rollback: { readonly key: string; readonly value: string | null }[] = [];
      for (const key of keys) {
        if (key.length === 0) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'empty key');
        rollback.push({ key: this.physical(key), value: store.getItem(this.physical(key)) });
      }
      try {
        for (const key of keys) store.removeItem(this.physical(key));
      } catch {
        for (const r of rollback) if (r.value !== null) store.setItem(r.key, r.value);
        return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchRemove failed, rolled back');
      }
      return ok<boolean>(true);
    } catch {
      return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'batchRemove failed');
    }
  }

  /** Preview-only helper: wipe all WordBox keys. */
  clearAll(): void {
    try {
      const store: Storage = this.store();
      const doomed: string[] = [];
      for (let i: number = 0; i < store.length; i++) {
        const k: string | null = store.key(i);
        if (k !== null && k.startsWith(this.prefix)) doomed.push(k);
      }
      for (const k of doomed) store.removeItem(k);
    } catch {
      // ignore: preview reset is best-effort
    }
  }
}

/** Factory for the preview storage adapter. */
export function createLocalStorageAdapter(): LocalStorageAdapter {
  return new LocalStorageAdapter();
}
