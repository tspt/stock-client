/**
 * API 缓存管理器
 * 基于统一的 CacheManager 实现，保持向后兼容
 */

import { cacheManager } from '@/services/core/cache';

/**
 * @deprecated 请使用 cacheManager 替代
 * 为了向后兼容，保留原有的 apiCache 接口
 */
export const apiCache = {
  get: <T>(key: string): T | null => cacheManager.get<T>(key),
  set: <T>(key: string, data: T, ttl?: number): void => cacheManager.set<T>(key, data, { ttl }),
  delete: (key: string): void => cacheManager.delete(key),
  clear: (): void => cacheManager.clear('memory'),
  size: (): number => cacheManager.getStats().memorySize,
};

// 导出类以便需要时创建自定义实例（已废弃）
export class ApiCacheManager {
  constructor(private defaultTTL: number = 5 * 60 * 1000) {
    console.warn('[ApiCacheManager] 已废弃，请使用 cacheManager');
  }

  get<T>(key: string): T | null {
    return cacheManager.get<T>(key);
  }

  set<T>(key: string, data: T, ttl?: number): void {
    cacheManager.set<T>(key, data, { ttl });
  }

  delete(key: string): void {
    cacheManager.delete(key);
  }

  clear(): void {
    cacheManager.clear('memory');
  }

  size(): number {
    return cacheManager.getStats().memorySize;
  }

  destroy(): void {
    cacheManager.clear('memory');
  }
}

// 重新导出新的缓存管理器
export { cacheManager };
