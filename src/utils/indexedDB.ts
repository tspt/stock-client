/**
 * IndexedDB 存储工具
 * 用于存储股票数据概况分析结果
 */

import type { OverviewAnalysisResult } from '@/types/stock';
import {
  OVERVIEW_DB_NAME,
  OVERVIEW_DB_VERSION,
  OVERVIEW_STORE_NAME,
  OVERVIEW_HISTORY_STORE_NAME,
} from './constants';

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OVERVIEW_DB_NAME, OVERVIEW_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开IndexedDB失败'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建主数据存储
      if (!db.objectStoreNames.contains(OVERVIEW_STORE_NAME)) {
        const store = db.createObjectStore(OVERVIEW_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 创建历史数据存储
      if (!db.objectStoreNames.contains(OVERVIEW_HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(OVERVIEW_HISTORY_STORE_NAME, {
          keyPath: 'id',
        });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * 保存分析结果
 */
export async function saveOverviewData(
  data: OverviewAnalysisResult
): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction([OVERVIEW_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(OVERVIEW_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put({
      id: 'latest',
      ...data,
    });

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('保存数据失败'));
    };
  });
}

/**
 * 获取最新的分析结果
 */
export async function getOverviewData(): Promise<OverviewAnalysisResult | null> {
  const db = await initDB();
  const transaction = db.transaction([OVERVIEW_STORE_NAME], 'readonly');
  const store = transaction.objectStore(OVERVIEW_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get('latest');

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        // 移除id字段
        const { id, ...data } = result;
        resolve(data as OverviewAnalysisResult);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(new Error('获取数据失败'));
    };
  });
}

/**
 * 保存历史快照
 */
export async function saveOverviewHistory(
  data: OverviewAnalysisResult
): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction([OVERVIEW_HISTORY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(OVERVIEW_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.add({
      id: `history_${data.timestamp}`,
      ...data,
    });

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('保存历史数据失败'));
    };
  });
}

/**
 * 获取历史记录列表
 */
export async function getOverviewHistory(
  limit: number = 10
): Promise<OverviewAnalysisResult[]> {
  const db = await initDB();
  const transaction = db.transaction([OVERVIEW_HISTORY_STORE_NAME], 'readonly');
  const store = transaction.objectStore(OVERVIEW_HISTORY_STORE_NAME);
  const index = store.index('timestamp');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, 'prev'); // 降序
    const results: OverviewAnalysisResult[] = [];
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && count < limit) {
        const { id, ...data } = cursor.value;
        results.push(data as OverviewAnalysisResult);
        count++;
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => {
      reject(new Error('获取历史数据失败'));
    };
  });
}

/**
 * 清空所有数据
 */
export async function clearOverviewData(): Promise<void> {
  const db = await initDB();
  const transaction = db.transaction(
    [OVERVIEW_STORE_NAME, OVERVIEW_HISTORY_STORE_NAME],
    'readwrite'
  );

  return new Promise((resolve, reject) => {
    let completed = 0;
    const total = 2;

    const checkComplete = () => {
      completed++;
      if (completed === total) {
        resolve();
      }
    };

    transaction.onerror = () => {
      reject(new Error('清空数据失败'));
    };

    transaction.oncomplete = () => {
      resolve();
    };

    const mainStore = transaction.objectStore(OVERVIEW_STORE_NAME);
    const mainRequest = mainStore.clear();
    mainRequest.onsuccess = checkComplete;
    mainRequest.onerror = () => reject(new Error('清空主数据失败'));

    const historyStore = transaction.objectStore(OVERVIEW_HISTORY_STORE_NAME);
    const historyRequest = historyStore.clear();
    historyRequest.onsuccess = checkComplete;
    historyRequest.onerror = () => reject(new Error('清空历史数据失败'));
  });
}

