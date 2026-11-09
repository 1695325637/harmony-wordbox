/**
 * 内存存储测试替身 —— 直接复用内核自带的 MemoryStorageService，
 * 保证「被测的就是真实存储实现」，而不是另写一份假实现。
 */
import {
  MemoryStorageService,
  createMemoryStorageService,
} from '@core/adapters/memoryStorage';

/** 每个用例创建全新空存储，保证用例相互独立、可重复运行。 */
export function createTestStorage(): MemoryStorageService {
  return createMemoryStorageService();
}

/** 清空存储并复位强制写失败开关。 */
export function resetStorage(storage: MemoryStorageService): void {
  storage.clear();
}

export { MemoryStorageService };
