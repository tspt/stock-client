/**
 * F10 资料（股东人数 / 十大流通股东 / 机构持仓）IndexedDB 缓存
 *
 * 设计要点：
 * 1. 以「股票代码」为主键存一条记录，三个区块各占一个字段，各自带 `updatedAt`。
 *    这样任一区块单独加载 / 刷新时只需合并自己那一个字段，互不覆盖。
 * 2. 刻意不做 TTL 自动过期：股东类数据是季度级更新，有数据就直接展示，
 *    是否重新拉取交给用户点「刷新」决定（避免打开抽屉就发请求）。
 * 3. 结构照搬 `billboardIndexedDB`，保持项目内 IndexedDB 用法一致。
 */

import {
  F10_CACHE_DB_NAME,
  F10_CACHE_DB_VERSION,
  F10_CACHE_SCHEMA_VERSION,
  F10_CACHE_STORE_NAME,
} from '../config/constants';
import { logger } from '../business/logger';
import type { F10CacheRecord, F10SectionKey } from '@/types/f10';

let dbInstance: IDBDatabase | null = null;

/** 打开（或复用）F10 缓存数据库 */
async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(F10_CACHE_DB_NAME, F10_CACHE_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开 F10 缓存 IndexedDB 失败'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(F10_CACHE_STORE_NAME)) {
        db.createObjectStore(F10_CACHE_STORE_NAME, { keyPath: 'code' });
      }
    };
  });
}

/**
 * 读取某只股票的 F10 缓存
 *
 * 结构版本不一致的记录会被当作「无缓存」（返回 null）：
 * 旧记录缺少新增字段，若继续使用会一直渲染成 '-' 且无法自愈，
 * 丢弃后用户点一次「加载数据」即可按新结构重建。
 *
 * @param code 统一格式股票代码（SH600000 / SZ000001）
 * @returns 缓存记录；不存在、结构过期或读取失败均返回 null
 */
export async function getF10Cache(code: string): Promise<F10CacheRecord | null> {
  if (!code) {
    return null;
  }
  try {
    const db = await initDB();
    const transaction = db.transaction([F10_CACHE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(F10_CACHE_STORE_NAME);

    const record = await new Promise<F10CacheRecord | null>((resolve, reject) => {
      const request = store.get(code);
      request.onsuccess = () => {
        resolve((request.result as F10CacheRecord | undefined) ?? null);
      };
      request.onerror = () => {
        reject(new Error(`获取 F10 缓存失败: ${code}`));
      };
    });

    if (record && record.schemaVersion !== F10_CACHE_SCHEMA_VERSION) {
      logger.info(
        `[F10Cache] ${code} 缓存结构版本过期（${record.schemaVersion ?? '无'} → ${F10_CACHE_SCHEMA_VERSION}），按无缓存处理`
      );
      return null;
    }
    return record;
  } catch (error) {
    logger.error('[F10Cache] 获取缓存异常:', error);
    return null;
  }
}

/**
 * 写入（合并）某个区块的缓存
 *
 * 只覆盖传入的这一个区块，其余区块保持原样——三个区块是独立懒加载的，
 * 全量覆盖会把用户尚未加载的区块数据抹掉。
 *
 * @param code 统一格式股票代码
 * @param section 区块标识
 * @param entry 该区块的缓存条目（含 updatedAt）
 */
export async function saveF10Section<K extends F10SectionKey>(
  code: string,
  section: K,
  entry: NonNullable<F10CacheRecord[K]>
): Promise<void> {
  if (!code) {
    return;
  }
  try {
    const existing = await getF10Cache(code);
    const record: F10CacheRecord = {
      ...(existing ?? { code }),
      code,
      schemaVersion: F10_CACHE_SCHEMA_VERSION,
    };
    record[section] = entry;

    const db = await initDB();
    const transaction = db.transaction([F10_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(F10_CACHE_STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`保存 F10 缓存失败: ${code}/${section}`));
    });
    logger.info(`[F10Cache] 保存成功: ${code}/${section}`);
  } catch (error) {
    logger.error('[F10Cache] 保存缓存异常:', error);
  }
}

/** 删除某只股票的整条 F10 缓存（三个区块一起删除） */
export async function clearF10Cache(code: string): Promise<void> {
  if (!code) {
    return;
  }
  try {
    const db = await initDB();
    const transaction = db.transaction([F10_CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(F10_CACHE_STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(code);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`清除 F10 缓存失败: ${code}`));
    });
    logger.info(`[F10Cache] 清除成功: ${code}`);
  } catch (error) {
    logger.error('[F10Cache] 清除缓存异常:', error);
  }
}
