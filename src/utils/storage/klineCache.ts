/**
 * K线数据缓存管理
 * 使用Map缓存最近访问的K线数据，减少API调用
 */

import type { KLineData, KLinePeriod } from '@/types/stock';

interface CacheItem {
  data: KLineData[];
  timestamp: number;
  period: KLinePeriod;
}

/**
 * K线数据缓存类
 */
class KLineCache {
  private cache: Map<string, CacheItem>;
  private readonly maxCacheSize: number;
  private readonly cacheTTL: number; // 缓存有效期（毫秒）

  constructor(maxCacheSize: number = 20, cacheTTL: number = 30 * 60 * 1000) {
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
    this.cacheTTL = cacheTTL; // 默认30分钟
  }

  /**
   * 生成缓存key
   */
  private generateKey(code: string, period: KLinePeriod): string {
    return `${code}_${period}`;
  }

  /**
   * 获取缓存数据
   * @param code 股票代码
   * @param period K线周期
   * @returns 缓存的K线数据，如果不存在或已过期则返回null
   */
  get(code: string, period: KLinePeriod): KLineData[] | null {
    const key = this.generateKey(code, period);
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - item.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 设置缓存数据
   * @param code 股票代码
   * @param period K线周期
   * @param data K线数据
   */
  set(code: string, period: KLinePeriod, data: KLineData[]): void {
    const key = this.generateKey(code, period);

    // 如果缓存已满，删除最旧的缓存
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      period,
    });
  }

  /**
   * 删除指定股票的缓存
   */
  delete(code: string, period?: KLinePeriod): void {
    if (period) {
      const key = this.generateKey(code, period);
      this.cache.delete(key);
    } else {
      // 删除该股票所有周期的缓存
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${code}_`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.cache.delete(key));
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 删除最旧的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.cache.forEach((item, key) => {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 创建全局单例
export const klineCache = new KLineCache(20, 30 * 60 * 1000);

export default klineCache;
