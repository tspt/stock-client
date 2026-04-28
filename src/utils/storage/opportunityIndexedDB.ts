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

      // 创建信号回测结果存储
      if (!db.objectStoreNames.contains(SIGNAL_BACKTEST_STORE_NAME)) {
        const backtestStore = db.createObjectStore(SIGNAL_BACKTEST_STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        backtestStore.createIndex('code', 'code', { unique: false });
        backtestStore.createIndex('signalDate', 'signalDate', { unique: false });
        backtestStore.createIndex('code_signalDate', ['code', 'signalDate'], { unique: true });
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
  id?: number;
  code: string;
  signalDate: string; // YYYY-MM-DD
  entryPrice: number;
  filterSnapshot?: any;
  returns: {
    day3: number | null;
    day5: number | null;
    day10: number | null; // 两周约10个交易日
    day20: number | null; // 一个月约20个交易日
  };
  status: 'calculating' | 'completed';
  calculatedAt: number;
}

/**
 * 保存信号回测结果
 */
export async function saveSignalBacktest(result: SignalBacktestResult): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put(result);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('保存信号回测结果失败'));
  });
}

/**
 * 获取指定股票的信号回测结果
 */
export async function getSignalBacktestsByCode(code: string): Promise<SignalBacktestResult[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readonly');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);
  const index = store.index('code');

  return new Promise((resolve, reject) => {
    const request = index.getAll(code);
    request.onsuccess = () => resolve(request.result || []);
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
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('获取所有信号回测结果失败'));
  });
}

/**
 * 检查特定日期的信号是否已存在
 */
export async function getSignalBacktestByCodeAndDate(
  code: string,
  signalDate: string
): Promise<SignalBacktestResult | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([SIGNAL_BACKTEST_STORE_NAME], 'readonly');
  const store = transaction.objectStore(SIGNAL_BACKTEST_STORE_NAME);
  const index = store.index('code_signalDate');

  return new Promise((resolve, reject) => {
    const request = index.get([code, signalDate]);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('查询信号回测结果失败'));
  });
}
