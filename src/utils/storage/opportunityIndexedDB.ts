/**
 * IndexedDB 存储工具（机会分析）
 */

import type { OpportunityAnalysisResult, StockRecord, KLineData, StockQuote } from '@/types/stock';
import {
  OPPORTUNITY_DB_NAME,
  OPPORTUNITY_DB_VERSION,
  OPPORTUNITY_STORE_NAME,
  STOCK_RECORDS_STORE_NAME,
  STOCK_HISTORY_STORE_NAME,
  SIGNAL_BACKTEST_STORE_NAME,
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

      // 创建股票记录存储
      if (!db.objectStoreNames.contains(STOCK_RECORDS_STORE_NAME)) {
        const recordsStore = db.createObjectStore(STOCK_RECORDS_STORE_NAME, {
          keyPath: 'date',
        });
        recordsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 创建股票历史数据存储
      if (!db.objectStoreNames.contains(STOCK_HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(STOCK_HISTORY_STORE_NAME, {
          keyPath: 'code',
        });
      }

      // 信号回测结果存储：直接删除重建，使用 code 作为主键
      if (db.objectStoreNames.contains(SIGNAL_BACKTEST_STORE_NAME)) {
        db.deleteObjectStore(SIGNAL_BACKTEST_STORE_NAME);
      }
      const backtestStore = db.createObjectStore(SIGNAL_BACKTEST_STORE_NAME, {
        keyPath: 'code', // 使用股票代码作为主键
      });
      backtestStore.createIndex('signalDate', 'signalDate', { unique: false });
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
 * 清空所有数据
 */
export async function clearOpportunityData(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([OPPORTUNITY_STORE_NAME], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(new Error('清空数据失败'));
    transaction.oncomplete = () => resolve();

    const mainStore = transaction.objectStore(OPPORTUNITY_STORE_NAME);
    const mainRequest = mainStore.clear();
    mainRequest.onerror = () => reject(new Error('清空主数据失败'));
  });
}

/**
 * 保存股票记录（按日期）
 */
export async function saveStockRecord(record: StockRecord): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_RECORDS_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_RECORDS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存股票记录失败'));
  });
}

/**
 * 获取指定日期的股票记录
 */
export async function getStockRecordByDate(date: string): Promise<StockRecord | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_RECORDS_STORE_NAME], 'readonly');
  const store = transaction.objectStore(STOCK_RECORDS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(date);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(new Error('获取股票记录失败'));
  });
}

/**
 * 获取所有股票记录
 */
export async function getAllStockRecords(): Promise<StockRecord[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_RECORDS_STORE_NAME], 'readonly');
  const store = transaction.objectStore(STOCK_RECORDS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => reject(new Error('获取所有股票记录失败'));
  });
}

/**
 * 删除指定日期的股票记录
 */
export async function deleteStockRecord(date: string): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_RECORDS_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_RECORDS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(date);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('删除股票记录失败'));
  });
}

// ==================== 股票历史数据管理 ====================

export interface StockHistoryRecord {
  code: string;
  name: string;
  dailyLines: KLineData[];
  latestQuote: StockQuote | null;
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

// ==================== 信号回测结果管理 ====================

export interface SignalBacktestResult {
  code: string; // 股票代码 (作为主键)
  name: string; // 股票名称
  signals: Array<{
    signalDate: string; // 信号日期 (YYYY-MM-DD)
    entryPrice: number; // 入场价格
    returns: {
      day3: number | null; // 3日收益率
      day5: number | null; // 5日收益率
      day10: number | null; // 两周(约10个交易日)收益率
      day20: number | null; // 一个月(约20个交易日)收益率
    };
  }>;
  calculatedAt: number; // 计算时间戳
}

/**
 * 保存信号回测结果
 */
export async function saveSignalBacktest(result: SignalBacktestResult): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(result); // 使用 code 作为 key，如果存在则更新，不存在则插入
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存信号回测结果失败'));
  });
}

/**
 * 获取指定股票的信号回测结果
 */
export async function getSignalBacktestsByCode(code: string): Promise<SignalBacktestResult | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readonly');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(code); // 直接通过 code 获取
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('获取信号回测结果失败'));
  });
}

/**
 * 获取所有信号回测结果
 */
export async function getAllSignalBacktests(): Promise<SignalBacktestResult[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readonly');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll(); // 获取所有记录
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('获取所有信号回测结果失败'));
  });
}

/**
 * 清除所有信号回测结果
 */
export async function clearAllSignalBacktests(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('清除所有信号回测结果失败'));
  });
}

/**
 * 批量保存信号回测结果
 */
export async function batchSaveSignalBacktests(results: SignalBacktestResult[]): Promise<void> {
  if (results.length === 0) {
    return;
  }

  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    let completed = 0;
    const total = results.length;

    results.forEach((result) => {
      const request = store.put(result); // 使用 code 作为 key
      request.onsuccess = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };
      request.onerror = () => {
        completed++;
        if (completed === total) {
          // 即使有错误也继续，避免阻塞整个流程
          console.warn('部分信号回测结果保存失败', result);
          resolve();
        }
      };
    });
  });
}
