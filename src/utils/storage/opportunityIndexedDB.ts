/**
 * IndexedDB 存储工具（机会分析）
 */

import type {
  OpportunityAnalysisResult,
  KLineData,
  StockQuote,
  StockDetail,
  IndustryInfo,
} from '@/types/stock';
import {
  OPPORTUNITY_DB_NAME,
  OPPORTUNITY_DB_VERSION,
  OPPORTUNITY_STORE_NAME,
  OPPORTUNITY_KLINE_STORE_NAME,
  STOCK_HISTORY_STORE_NAME,
} from '../config/constants';

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

      // 创建股票历史数据存储
      if (!db.objectStoreNames.contains(STOCK_HISTORY_STORE_NAME)) {
        db.createObjectStore(STOCK_HISTORY_STORE_NAME, {
          keyPath: 'code',
        });
      }

      // v5: 移除已废弃的信号回测结果存储
      if (db.objectStoreNames.contains('signalBacktestResults')) {
        db.deleteObjectStore('signalBacktestResults');
      }

      // v6: 机会记录已迁移至本地 JSON，移除 stockRecords
      if (db.objectStoreNames.contains('stockRecords')) {
        db.deleteObjectStore('stockRecords');
      }

      // v7: K 线缓存从主记录拆分为独立存储，避免单条记录过大导致读取缓慢
      if (!db.objectStoreNames.contains(OPPORTUNITY_KLINE_STORE_NAME)) {
        db.createObjectStore(OPPORTUNITY_KLINE_STORE_NAME, { keyPath: 'code' });
      }
    };
  });
}

/** K 线缓存写入分批大小，避免单个事务过大 */
const KLINE_WRITE_BATCH = 500;

/**
 * 保存 K 线缓存（独立存储）：先清空旧数据，再分批写入
 */
export async function saveOpportunityKlines(
  entries: Array<[string, KLineData[]]>
): Promise<void> {
  const db = await initOpportunityDB();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([OPPORTUNITY_KLINE_STORE_NAME], 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('清空K线缓存失败'));
    transaction.objectStore(OPPORTUNITY_KLINE_STORE_NAME).clear();
  });

  for (let index = 0; index < entries.length; index += KLINE_WRITE_BATCH) {
    const batch = entries.slice(index, index + KLINE_WRITE_BATCH);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([OPPORTUNITY_KLINE_STORE_NAME], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error(`写入K线缓存失败：第 ${Math.floor(index / KLINE_WRITE_BATCH) + 1} 批`));
      const store = transaction.objectStore(OPPORTUNITY_KLINE_STORE_NAME);
      batch.forEach(([code, kline]) => {
        store.put({ code, kline });
      });
    });
  }
}

/**
 * 读取全部 K 线缓存（一次性读回，保证与拆分前的数据集合完全一致）
 */
export async function getOpportunityKlines(): Promise<Array<[string, KLineData[]]>> {
  const db = await initOpportunityDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OPPORTUNITY_KLINE_STORE_NAME], 'readonly');
    const request = transaction.objectStore(OPPORTUNITY_KLINE_STORE_NAME).getAll();

    request.onsuccess = () => {
      const rows = (request.result || []) as Array<{ code: string; kline: KLineData[] }>;
      resolve(rows.map((row) => [row.code, row.kline]));
    };
    request.onerror = () => reject(new Error('获取K线缓存失败'));
  });
}

/**
 * 保存分析结果。
 * K 线缓存单独存表：先写 K 线再写主记录，避免主记录已更新而 K 线缺失导致读到不完整数据。
 */
export async function saveOpportunityData(data: OpportunityAnalysisResult): Promise<void> {
  const { klineDataCache, ...rest } = data;

  await saveOpportunityKlines(klineDataCache ?? []);

  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(OPPORTUNITY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put({
      id: 'latest',
      ...rest,
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存数据失败'));
  });
}

/**
 * 获取最新的分析结果。
 * 新版从独立存储读回 K 线；老数据（K 线仍在 `latest` 主记录内）自动回退读取，保证升级前后一致。
 */
export async function getOpportunityData(): Promise<OpportunityAnalysisResult | null> {
  const db = await initOpportunityDB();
  const mainRecord = await new Promise<any>((resolve, reject) => {
    const transaction = db.transaction([OPPORTUNITY_STORE_NAME], 'readonly');
    const request = transaction.objectStore(OPPORTUNITY_STORE_NAME).get('latest');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('获取数据失败'));
  });

  if (!mainRecord) {
    return null;
  }

  const { id: _id, ...data } = mainRecord;
  const result = data as OpportunityAnalysisResult;

  // 新存储有数据时覆盖；否则沿用主记录里旧版自带的 klineDataCache
  const klineEntries = await getOpportunityKlines();
  if (klineEntries.length > 0) {
    result.klineDataCache = klineEntries;
  }

  return result;
}

/**
 * 清空所有数据（含独立存储的 K 线缓存）
 */
export async function clearOpportunityData(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction(
    [OPPORTUNITY_STORE_NAME, OPPORTUNITY_KLINE_STORE_NAME],
    'readwrite'
  );

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(new Error('清空数据失败'));
    transaction.oncomplete = () => resolve();

    const mainStore = transaction.objectStore(OPPORTUNITY_STORE_NAME);
    const mainRequest = mainStore.clear();
    mainRequest.onerror = () => reject(new Error('清空主数据失败'));

    const klineStore = transaction.objectStore(OPPORTUNITY_KLINE_STORE_NAME);
    const klineRequest = klineStore.clear();
    klineRequest.onerror = () => reject(new Error('清空K线缓存失败'));
  });
}

/**
 * 清空所有股票历史数据（K线数据）
 */
export async function clearStockHistory(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(new Error('清空股票历史数据失败'));
    transaction.oncomplete = () => resolve();

    const historyStore = transaction.objectStore(STOCK_HISTORY_STORE_NAME);
    const historyRequest = historyStore.clear();
    historyRequest.onerror = () => reject(new Error('清空股票历史数据失败'));
  });
}

// ==================== 股票历史数据管理 ====================

export interface StockHistoryRecord {
  code: string;
  name: string;
  dailyLines: KLineData[];
  latestQuote: StockQuote | null;
  latestDetail?: StockDetail | null; // 新增：最新详情数据
  industry?: IndustryInfo; // 新增：所属行业信息
  updatedAt: number;
}

/**
 * 保存或更新股票历史数据
 */
export async function saveStockHistory(record: StockHistoryRecord): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存股票历史数据失败'));
  });
}

/**
 * 获取指定股票的历史数据
 */
export async function getStockHistory(code: string): Promise<StockHistoryRecord | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readonly');
  const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(code);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('获取股票历史数据失败'));
  });
}

/**
 * 批量获取股票历史数据
 */
export async function getStocksHistory(codes: string[]): Promise<StockHistoryRecord[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readonly');
  const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    if (codes.length === 0) {
      // 如果 codes 为空，则获取所有记录
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('获取所有股票历史数据失败'));
      return;
    }

    const results: StockHistoryRecord[] = [];
    let completed = 0;

    codes.forEach((code) => {
      const request = store.get(code);
      request.onsuccess = () => {
        if (request.result) {
          results.push(request.result);
        }
        completed++;
        if (completed === codes.length) {
          resolve(results);
        }
      };
      request.onerror = () => {
        completed++;
        if (completed === codes.length) {
          resolve(results);
        }
      };
    });
  });
}

