/**
 * 统一缓存管理器
 * 提供内存、localStorage、IndexedDB 多种存储策略
 */

import { logger } from '@/utils/logger';
import { DEFAULT_CACHE_TTL } from '@/utils/constants';

interface CacheItem<T> {
  data: T;
  expiry: number; // 过期时间戳
}

export interface CacheConfig {
  /** 缓存过期时间（毫秒） */
  ttl?: number;
  /** 存储类型 */
  storage?: 'memory' | 'localStorage' | 'indexedDB';
  /** 自定义缓存key前缀 */
  keyPrefix?: string;
}

const DEFAULT_STORAGE: CacheConfig['storage'] = 'memory';

class CacheManager {
  private memoryCache = new Map<string, CacheItem<any>>();

  /**
   * 生成缓存key
   */
  private generateKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() > item.expiry;
  }

  /**
   * 从内存缓存获取数据
   */
  private getFromMemory<T>(key: string): T | null {
    const item = this.memoryCache.get(key);
    if (!item) return null;

    if (this.isExpired(item)) {
      this.memoryCache.delete(key);
      return null;
    }

    return item.data as T;
  }

  /**
   * 从localStorage获取数据
   */
  private getFromLocalStorage<T>(key: string): T | null {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      const item: CacheItem<T> = JSON.parse(itemStr);
      if (this.isExpired(item)) {
        localStorage.removeItem(key);
        return null;
      }

      return item.data;
    } catch (error) {
      logger.warn(`[Cache] 读取localStorage失败: ${key}`, error);
      return null;
    }
  }

  /**
   * 存储到内存缓存
   */
  private setToMemory<T>(key: string, value: T, ttl: number): void {
    this.memoryCache.set(key, {
      data: value,
      expiry: Date.now() + ttl,
    });
  }

  /**
   * 存储到localStorage
   */
  private setToLocalStorage<T>(key: string, value: T, ttl: number): void {
    try {
      const item: CacheItem<T> = {
        data: value,
        expiry: Date.now() + ttl,
      };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      logger.warn(`[Cache] 写入localStorage失败: ${key}`, error);
    }
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @param config 缓存配置
   * @returns 缓存的数据，不存在或已过期返回null
   */
  get<T>(key: string, config?: CacheConfig): T | null {
    const storage = config?.storage ?? DEFAULT_STORAGE;
    const cacheKey = this.generateKey(key, config?.keyPrefix);

    switch (storage) {
      case 'memory':
        return this.getFromMemory<T>(cacheKey);
      case 'localStorage':
        return this.getFromLocalStorage<T>(cacheKey);
      case 'indexedDB':
        // TODO: 实现IndexedDB存储
        logger.warn('[Cache] IndexedDB存储暂未实现，降级为memory');
        return this.getFromMemory<T>(cacheKey);
      default:
        return null;
    }
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param value 缓存值
   * @param config 缓存配置
   */
  set<T>(key: string, value: T, config?: CacheConfig): void {
    const ttl = config?.ttl ?? DEFAULT_CACHE_TTL;
    const storage = config?.storage ?? DEFAULT_STORAGE;
    const cacheKey = this.generateKey(key, config?.keyPrefix);

    switch (storage) {
      case 'memory':
        this.setToMemory<T>(cacheKey, value, ttl);
        break;
      case 'localStorage':
        this.setToLocalStorage<T>(cacheKey, value, ttl);
        break;
      case 'indexedDB':
        // TODO: 实现IndexedDB存储
        logger.warn('[Cache] IndexedDB存储暂未实现，降级为memory');
        this.setToMemory<T>(cacheKey, value, ttl);
        break;
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   * @param config 缓存配置
   */
  delete(key: string, config?: CacheConfig): void {
    const storage = config?.storage ?? DEFAULT_STORAGE;
    const cacheKey = this.generateKey(key, config?.keyPrefix);

    switch (storage) {
      case 'memory':
        this.memoryCache.delete(cacheKey);
        break;
      case 'localStorage':
        localStorage.removeItem(cacheKey);
        break;
      case 'indexedDB':
        // TODO: 实现IndexedDB删除
        break;
    }
  }

  /**
   * 清除所有缓存
   * @param storage 指定存储类型，不传则清除所有
   */
  clear(storage?: CacheConfig['storage']): void {
    if (!storage || storage === 'memory') {
      this.memoryCache.clear();
    }

    if (!storage || storage === 'localStorage') {
      // 只清除以缓存前缀开头的项
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.includes(':')) {
          localStorage.removeItem(key);
        }
      });
    }

    // TODO: 清除IndexedDB
  }

  /**
   * 根据模式清除缓存
   * @param pattern key匹配模式（支持通配符*）
   * @param storage 存储类型
   */
  invalidate(pattern: string, storage?: CacheConfig['storage']): void {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');

    if (!storage || storage === 'memory') {
      const keysToDelete: string[] = [];
      this.memoryCache.forEach((_, key) => {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.memoryCache.delete(key));
    }

    if (!storage || storage === 'localStorage') {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (regex.test(key)) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    memorySize: number;
    localStorageSize: number;
  } {
    return {
      memorySize: this.memoryCache.size,
      localStorageSize: Object.keys(localStorage).filter((k) => k.includes(':')).length,
    };
  }
}

// 导出单例实例
export const cacheManager = new CacheManager();

// 为了向后兼容，保留原有的apiCache接口
export const apiCache = {
  get: <T>(key: string): T | null => cacheManager.get<T>(key),
  set: <T>(key: string, value: T, ttl?: number): void => cacheManager.set<T>(key, value, { ttl }),
  delete: (key: string): void => cacheManager.delete(key),
  clear: (): void => cacheManager.clear(),
};
