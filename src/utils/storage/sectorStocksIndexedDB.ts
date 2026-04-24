/**
 * 板块成分股 IndexedDB 存储工具
 * 用于存储行业板块和概念板块的完整成分股数据
 */

import {
  SECTOR_STOCKS_DB_NAME,
  SECTOR_STOCKS_DB_VERSION,
  SECTOR_STOCKS_INDUSTRY_STORE,
  SECTOR_STOCKS_CONCEPT_STORE,
} from '../config/constants';
import { logger } from '../business/logger';

export interface SectorWithStocks {
  code: string;
  name: string;
  mainNetInflow?: number;
  children: Array<{
    name: string;
    code: string;
  }>;
  total?: number; // 新增:板块成分股总数
  savedAt?: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initSectorStocksDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SECTOR_STOCKS_DB_NAME, SECTOR_STOCKS_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开板块成分股 IndexedDB 失败'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建行业板块存储
      if (!db.objectStoreNames.contains(SECTOR_STOCKS_INDUSTRY_STORE)) {
        const industryStore = db.createObjectStore(SECTOR_STOCKS_INDUSTRY_STORE, {
          keyPath: 'code',
        });
        industryStore.createIndex('savedAt', 'savedAt', { unique: false });
      }

      // 创建概念板块存储
      if (!db.objectStoreNames.contains(SECTOR_STOCKS_CONCEPT_STORE)) {
        const conceptStore = db.createObjectStore(SECTOR_STOCKS_CONCEPT_STORE, {
          keyPath: 'code',
        });
        conceptStore.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
  });
}

/**
 * 保存行业板块数据
 */
export async function saveIndustrySectors(
  data: SectorWithStocks[],
  incremental: boolean = false
): Promise<void> {
  const db = await initSectorStocksDB();
  const transaction = db.transaction([SECTOR_STOCKS_INDUSTRY_STORE], 'readwrite');
  const store = transaction.objectStore(SECTOR_STOCKS_INDUSTRY_STORE);

  return new Promise((resolve, reject) => {
    // 仅在非增量模式下清空旧数据
    if (!incremental) {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => saveData();
      clearRequest.onerror = () => reject(new Error('清空行业板块旧数据失败'));
    } else {
      saveData();
    }

    function saveData() {
      let completed = 0;
      const total = data.length;

      if (total === 0) {
        resolve();
        return;
      }

      data.forEach((item) => {
        const request = store.put(item);
        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };
        request.onerror = () => {
          reject(new Error(`保存行业板块 ${item.name} 失败`));
        };
      });
    }
  });
}

/**
 * 保存概念板块数据
 */
export async function saveConceptSectors(
  data: SectorWithStocks[],
  incremental: boolean = false
): Promise<void> {
  const db = await initSectorStocksDB();
  const transaction = db.transaction([SECTOR_STOCKS_CONCEPT_STORE], 'readwrite');
  const store = transaction.objectStore(SECTOR_STOCKS_CONCEPT_STORE);

  return new Promise((resolve, reject) => {
    // 仅在非增量模式下清空旧数据
    if (!incremental) {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => saveData();
      clearRequest.onerror = () => reject(new Error('清空概念板块旧数据失败'));
    } else {
      saveData();
    }

    function saveData() {
      let completed = 0;
      const total = data.length;

      if (total === 0) {
        resolve();
        return;
      }

      data.forEach((item) => {
        const request = store.put(item);
        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            resolve();
          }
        };
        request.onerror = () => {
          reject(new Error(`保存概念板块 ${item.name} 失败`));
        };
      });
    }
  });
}

/**
 * 获取所有行业板块数据
 */
export async function getIndustrySectors(): Promise<SectorWithStocks[]> {
  const db = await initSectorStocksDB();
  const transaction = db.transaction([SECTOR_STOCKS_INDUSTRY_STORE], 'readonly');
  const store = transaction.objectStore(SECTOR_STOCKS_INDUSTRY_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error('获取行业板块数据失败'));
    };
  });
}

/**
 * 获取所有概念板块数据
 */
export async function getConceptSectors(): Promise<SectorWithStocks[]> {
  const db = await initSectorStocksDB();
  const transaction = db.transaction([SECTOR_STOCKS_CONCEPT_STORE], 'readonly');
  const store = transaction.objectStore(SECTOR_STOCKS_CONCEPT_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error('获取概念板块数据失败'));
    };
  });
}

/**
 * 清空所有板块成分股数据
 */
export async function clearSectorStocksDB(): Promise<void> {
  const db = await initSectorStocksDB();
  const transaction = db.transaction(
    [SECTOR_STOCKS_INDUSTRY_STORE, SECTOR_STOCKS_CONCEPT_STORE],
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
      reject(new Error('清空板块成分股数据失败'));
    };

    const industryStore = transaction.objectStore(SECTOR_STOCKS_INDUSTRY_STORE);
    const industryRequest = industryStore.clear();
    industryRequest.onsuccess = checkComplete;

    const conceptStore = transaction.objectStore(SECTOR_STOCKS_CONCEPT_STORE);
    const conceptRequest = conceptStore.clear();
    conceptRequest.onsuccess = checkComplete;
  });
}

/**
 * 检查单个板块数据是否完整
 */
export function isSectorDataComplete(sector: SectorWithStocks): boolean {
  if (!sector.total || sector.total === 0) {
    return false;
  }
  return sector.children.length >= sector.total;
}

/**
 * 获取需要更新的板块列表(不完整或未缓存的板块)
 */
export async function getIncompleteSectors(
  allSectors: Array<{ code: string; name: string }>,
  cachedSectors: SectorWithStocks[],
  sectorType: 'industry' | 'concept'
): Promise<Array<{ code: string; name: string }>> {
  const cachedMap = new Map(cachedSectors.map((s) => [s.code, s]));

  return allSectors.filter((sector) => {
    const cached = cachedMap.get(sector.code);
    if (!cached) {
      return true; // 未缓存,需要获取
    }
    return !isSectorDataComplete(cached); // 已缓存但不完整,需要重新获取
  });
}
