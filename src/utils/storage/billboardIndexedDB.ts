/**
 * 龙虎榜数据 IndexedDB 缓存存储工具
 * 按统计周期缓存龙虎榜个股统计数据，有效期为当天
 */

import {
  BILLBOARD_CACHE_DB_NAME,
  BILLBOARD_CACHE_DB_VERSION,
  BILLBOARD_CACHE_STORE_NAME,
} from '../config/constants';
import { logger } from '../business/logger';
import type { BillboardStockData, StatisticsCycle } from '@/types/billboard';

export interface BillboardCacheEntry {
  id: string; // statisticsCycle (01/02/03/04)
  statisticsCycle: StatisticsCycle;
  data: BillboardStockData[];
  total: number;
  pages: number;
  cachedAt: number; // 缓存时间戳
}

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BILLBOARD_CACHE_DB_NAME, BILLBOARD_CACHE_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开龙虎榜缓存 IndexedDB 失败'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建存储对象
      if (!db.objectStoreNames.contains(BILLBOARD_CACHE_STORE_NAME)) {
        const store = db.createObjectStore(BILLBOARD_CACHE_STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });
}

/**
 * 保存龙虎榜缓存数据
 * @param cycle 统计周期
 * @param data 数据列表
 * @param total 总记录数
 * @param pages 总页数
 */
export async function saveBillboardCache(
  cycle: StatisticsCycle,
  data: BillboardStockData[],
  total: number,
  pages: number
): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([BILLBOARD_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BILLBOARD_CACHE_STORE_NAME);

    const entry: BillboardCacheEntry = {
      id: cycle,
      statisticsCycle: cycle,
      data,
      total,
      pages,
      cachedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => {
        logger.info(`[BillboardCache] 保存缓存成功: ${cycle}`);
        resolve();
      };
      request.onerror = () => {
        reject(new Error(`保存龙虎榜缓存失败: ${cycle}`));
      };
    });
  } catch (error) {
    logger.error('[BillboardCache] 保存缓存异常:', error);
    throw error;
  }
}

/**
 * 获取龙虎榜缓存数据
 * @param cycle 统计周期
 * @returns 缓存数据，如果不存在则返回 null
 */
export async function getBillboardCache(
  cycle: StatisticsCycle
): Promise<BillboardCacheEntry | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([BILLBOARD_CACHE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(BILLBOARD_CACHE_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(cycle);
      request.onsuccess = () => {
        const result = request.result as BillboardCacheEntry | undefined;
        resolve(result || null);
      };
      request.onerror = () => {
        reject(new Error(`获取龙虎榜缓存失败: ${cycle}`));
      };
    });
  } catch (error) {
    logger.error('[BillboardCache] 获取缓存异常:', error);
    return null;
  }
}

/**
 * 检查缓存是否有效（当天内）
 * @param cachedAt 缓存时间戳
 * @returns 是否有效
 */
export function isCacheValid(cachedAt: number): boolean {
  const now = new Date();
  const cachedDate = new Date(cachedAt);

  // 判断是否为同一天
  return (
    now.getFullYear() === cachedDate.getFullYear() &&
    now.getMonth() === cachedDate.getMonth() &&
    now.getDate() === cachedDate.getDate()
  );
}

/**
 * 清除指定周期的缓存
 * @param cycle 统计周期
 */
export async function clearBillboardCacheByCycle(cycle: StatisticsCycle): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([BILLBOARD_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BILLBOARD_CACHE_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(cycle);
      request.onsuccess = () => {
        logger.info(`[BillboardCache] 清除缓存成功: ${cycle}`);
        resolve();
      };
      request.onerror = () => {
        reject(new Error(`清除龙虎榜缓存失败: ${cycle}`));
      };
    });
  } catch (error) {
    logger.error('[BillboardCache] 清除缓存异常:', error);
    throw error;
  }
}

/**
 * 清除所有龙虎榜缓存
 */
export async function clearAllBillboardCache(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([BILLBOARD_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(BILLBOARD_CACHE_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        logger.info('[BillboardCache] 清除所有缓存成功');
        resolve();
      };
      request.onerror = () => {
        reject(new Error('清除所有龙虎榜缓存失败'));
      };
    });
  } catch (error) {
    logger.error('[BillboardCache] 清除所有缓存异常:', error);
    throw error;
  }
}
