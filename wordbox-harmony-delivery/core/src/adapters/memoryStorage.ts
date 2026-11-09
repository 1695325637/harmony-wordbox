/**
 * In-memory `StorageService` implementation (kernel-owned, used by tests and
 * as a fallback). `batchSet` / `batchRemove` validate the whole batch before
 * committing anything, so a partial failure leaves the store untouched.
 */
import { StorageService } from '../ports/ports';
import { Result, ok, fail, ErrorCode } from '../models/errors';
import { StorageEntry } from '../models/types';

export class MemoryStorageService implements StorageService {
  private readonly data: Map<string, string> = new Map<string, string>();
  private failWrites: boolean = false;

  /** Test hook: force all write operations to fail (simulates storage errors). */
  setFailWrites(failWrites: boolean): void {
    this.failWrites = failWrites;
  }

  async get(key: string): Promise<Result<string | undefined>> {
    return ok<string | undefined>(this.data.get(key));
  }

  async set(key: string, value: string): Promise<Result<boolean>> {
    if (this.failWrites) return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'forced write failure');
    this.data.set(key, value);
    return ok<boolean>(true);
  }

  async remove(key: string): Promise<Result<boolean>> {
    if (this.failWrites) return fail<boolean>(ErrorCode.STORAGE_WRITE_FAILED, 'forced write failure');
    this.data.delete(key);
    return ok<boolean>(true);
  }

  async keys(prefix: string): Promise<Result<readonly string[]>> {
    const out: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) out.push(key);
    }
    out.sort();
    return ok<readonly string[]>(out);
  }

  async batchSet(entries: readonly StorageEntry[]): Promise<Result<boolean>> {
    if (this.failWrites) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'forced batch failure');
    for (const entry of entries) {
      if (entry.key.length === 0 || typeof entry.value !== 'string') {
        return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'invalid entry, nothing committed');
      }
    }
    for (const entry of entries) this.data.set(entry.key, entry.value);
    return ok<boolean>(true);
  }

  async batchRemove(keys: readonly string[]): Promise<Result<boolean>> {
    if (this.failWrites) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'forced batch failure');
    for (const key of keys) {
      if (key.length === 0) return fail<boolean>(ErrorCode.STORAGE_BATCH_PARTIAL, 'invalid key, nothing removed');
    }
    for (const key of keys) this.data.delete(key);
    return ok<boolean>(true);
  }

  /** Test hook: clear the whole store. */
  clear(): void {
    this.data.clear();
    this.failWrites = false;
  }

  /** Diagnostic helper: number of stored keys. */
  size(): number {
    return this.data.size;
  }
}

/** Factory for a fresh in-memory store. */
export function createMemoryStorageService(): MemoryStorageService {
  return new MemoryStorageService();
}
