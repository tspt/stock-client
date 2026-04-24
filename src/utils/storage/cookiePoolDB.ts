/**
 * Cookie池 IndexedDB 存储工具
 */

import type { CookieEntry } from '../../types/cookie.js';
import {
  COOKIE_POOL_DB_NAME,
  COOKIE_POOL_DB_VERSION,
  COOKIE_POOL_STORE_NAME,
} from '../config/constants.js';
import { logger } from '../business/logger.js';

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化Cookie池数据库
 */
export async function initCookiePoolDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(COOKIE_POOL_DB_NAME, COOKIE_POOL_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开Cookie池IndexedDB失败'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建Cookie存储
      if (!db.objectStoreNames.contains(COOKIE_POOL_STORE_NAME)) {
        const store = db.createObjectStore(COOKIE_POOL_STORE_NAME, { keyPath: 'id' });
        store.createIndex('isActive', 'isActive', { unique: false });
        store.createIndex('healthScore', 'healthScore', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * 添加Cookie
 */
export async function addCookie(cookie: CookieEntry): Promise<void> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(cookie);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('添加Cookie失败'));
    };
  });
}

/**
 * 获取所有活跃Cookie
 */
export async function getActiveCookies(): Promise<CookieEntry[]> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readonly');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);
  const index = store.index('isActive');

  return new Promise((resolve, reject) => {
    const request = index.getAll(IDBKeyRange.only(true));

    request.onsuccess = () => {
      resolve(request.result as CookieEntry[]);
    };

    request.onerror = () => {
      reject(new Error('获取活跃Cookie失败'));
    };
  });
}

/**
 * 获取所有Cookie
 */
export async function getAllCookies(): Promise<CookieEntry[]> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readonly');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result as CookieEntry[]);
    };

    request.onerror = () => {
      reject(new Error('获取所有Cookie失败'));
    };
  });
}

/**
 * 更新Cookie健康状态
 */
export async function updateCookieHealth(id: string, success: boolean): Promise<void> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const cookie = getRequest.result as CookieEntry | undefined;
      if (!cookie) {
        reject(new Error(`Cookie ${id} 不存在`));
        return;
      }

      // 更新计数
      if (success) {
        cookie.successCount += 1;
      } else {
        cookie.failureCount += 1;
      }

      // 更新最后使用时间
      cookie.lastUsedAt = Date.now();

      // 重新计算健康评分
      const totalRequests = cookie.successCount + cookie.failureCount;
      let score = 100;

      if (totalRequests > 0) {
        const successRate = cookie.successCount / totalRequests;
        score *= successRate;
      }

      // 年龄衰减：超过24小时每小时减1分
      const ageInHours = (Date.now() - cookie.createdAt) / (1000 * 60 * 60);
      if (ageInHours > 24) {
        score -= ageInHours - 24;
      }

      cookie.healthScore = Math.max(0, Math.min(100, score));

      // 如果失败次数过多，标记为非活跃
      if (cookie.failureCount > 10 && cookie.successCount < 5) {
        cookie.isActive = false;
      }

      const putRequest = store.put(cookie);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(new Error('更新Cookie健康状态失败'));
    };

    getRequest.onerror = () => {
      reject(new Error('获取Cookie失败'));
    };
  });
}

/**
 * 删除Cookie
 */
export async function removeCookie(id: string): Promise<void> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('删除Cookie失败'));
    };
  });
}

/**
 * 根据ID获取Cookie
 */
export async function getCookieById(id: string): Promise<CookieEntry | null> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readonly');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result as CookieEntry | null);
    };

    request.onerror = () => {
      reject(new Error('获取Cookie失败'));
    };
  });
}

/**
 * 清空所有Cookie
 */
export async function clearAllCookies(): Promise<void> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('清空Cookie失败'));
    };
  });
}

/**
 * 获取Cookie总数
 */
export async function getCookieCount(): Promise<number> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readonly');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('获取Cookie数量失败'));
    };
  });
}

/**
 * 导出所有Cookie
 * @param filter 过滤条件：'all' | 'active' | 'inactive'
 */
export async function exportCookies(
  filter: 'all' | 'active' | 'inactive' = 'all'
): Promise<CookieEntry[]> {
  const db = await initCookiePoolDB();
  const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readonly');
  const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      let cookies = request.result as CookieEntry[];

      // 根据过滤条件筛选
      if (filter === 'active') {
        cookies = cookies.filter((c) => c.isActive);
      } else if (filter === 'inactive') {
        cookies = cookies.filter((c) => !c.isActive);
      }

      resolve(cookies);
    };

    request.onerror = () => {
      reject(new Error('导出Cookie失败'));
    };
  });
}

/**
 * 批量导入Cookie
 * @param cookies Cookie数组
 * @param skipDuplicates 是否跳过重复的Cookie（默认true）
 * @returns 成功导入的数量和跳过的数量
 */
export async function importCookies(
  cookies: CookieEntry[],
  skipDuplicates: boolean = true
): Promise<{ successCount: number; skippedCount: number; duplicateIds: string[] }> {
  const db = await initCookiePoolDB();
  let successCount = 0;
  let skippedCount = 0;
  const duplicateIds: string[] = [];

  // 先获取现有的所有Cookie ID
  const existingCookies = await getAllCookies();
  const existingIds = new Set(existingCookies.map((c) => c.id));

  for (const cookie of cookies) {
    try {
      // 验证必要字段
      if (!cookie.id || !cookie.value) {
        skippedCount++;
        continue;
      }

      // 检查是否重复
      if (existingIds.has(cookie.id)) {
        if (skipDuplicates) {
          skippedCount++;
          duplicateIds.push(cookie.id);
          continue;
        } else {
          // 如果不跳过，则覆盖
          logger.info(`[CookiePoolDB] 覆盖重复Cookie: ${cookie.id.substring(0, 8)}...`);
        }
      }

      const transaction = db.transaction([COOKIE_POOL_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(COOKIE_POOL_STORE_NAME);

      await new Promise((resolve, reject) => {
        const request = store.put(cookie);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(new Error(`导入Cookie失败: ${cookie.id}`));
      });

      // 如果不是重复的，添加到现有ID集合
      if (!existingIds.has(cookie.id)) {
        existingIds.add(cookie.id);
      }

      successCount++;
    } catch (error) {
      console.warn(`[CookiePoolDB] 跳过无效Cookie:`, error);
      skippedCount++;
    }
  }

  return { successCount, skippedCount, duplicateIds };
}
