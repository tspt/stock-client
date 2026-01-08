/**
 * IndexedDB 存储工具（机会分析）
 * 用于存储机会分析结果，避免与数据概况（overview）互相覆盖
 */

import type { OpportunityAnalysisResult } from '@/types/stock';
import {
  OPPORTUNITY_DB_NAME,
  OPPORTUNITY_DB_VERSION,
  OPPORTUNITY_STORE_NAME,
  OPPORTUNITY_HISTORY_STORE_NAME,
} from './constants';

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initOpportunityDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OPPORTUNITY_DB_NAME, OPPORTUNITY_DB_VERSION);

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
      if (!db.objectStoreNames.contains(OPPORTUNITY_STORE_NAME)) {
        const store = db.createObjectStore(OPPORTUNITY_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 创建历史数据存储
      if (!db.objectStoreNames.contains(OPPORTUNITY_HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(OPPORTUNITY_HISTORY_STORE_NAME, {
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
export async function saveOpportunityData(data: OpportunityAnalysisResult): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(OPPORTUNITY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put({
      id: 'latest',
      ...data,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存数据失败'));
  });
}

/**
 * 获取最新的分析结果
 */
export async function getOpportunityData(): Promise<OpportunityAnalysisResult | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_STORE_NAME], 'readonly');
  const store = transaction.objectStore(OPPORTUNITY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get('latest');

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const { id, ...data } = result;
        resolve(data as OpportunityAnalysisResult);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(new Error('获取数据失败'));
  });
}

/**
 * 保存历史快照
 */
export async function saveOpportunityHistory(data: OpportunityAnalysisResult): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_HISTORY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(OPPORTUNITY_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.add({
      id: `history_${data.timestamp}`,
      ...data,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存历史数据失败'));
  });
}

/**
 * 获取历史记录列表
 */
export async function getOpportunityHistory(limit: number = 10): Promise<OpportunityAnalysisResult[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_HISTORY_STORE_NAME], 'readonly');
  const store = transaction.objectStore(OPPORTUNITY_HISTORY_STORE_NAME);
  const index = store.index('timestamp');

  return new Promise((resolve, reject) => {
    const request = index.openCursor(null, 'prev');
    const results: OpportunityAnalysisResult[] = [];
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && count < limit) {
        const { id, ...data } = cursor.value;
        results.push(data as OpportunityAnalysisResult);
        count++;
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(new Error('获取历史数据失败'));
  });
}

/**
 * 清空所有数据
 */
export async function clearOpportunityData(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction(
    [OPPORTUNITY_STORE_NAME, OPPORTUNITY_HISTORY_STORE_NAME],
    'readwrite'
  );

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(new Error('清空数据失败'));
    transaction.oncomplete = () => resolve();

    const mainStore = transaction.objectStore(OPPORTUNITY_STORE_NAME);
    const mainRequest = mainStore.clear();
    mainRequest.onerror = () => reject(new Error('清空主数据失败'));

    const historyStore = transaction.objectStore(OPPORTUNITY_HISTORY_STORE_NAME);
    const historyRequest = historyStore.clear();
    historyRequest.onerror = () => reject(new Error('清空历史数据失败'));
  });
}


