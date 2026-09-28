/**
 * IndexedDB 存储工具（机会分析）
 */

import type {
  OpportunityAnalysisResult,
  KLineData,
  StockQuote,
  StockDetail,
  StockFinanceMetrics,
} from '@/types/stock';
import {
  OPPORTUNITY_DB_NAME,
  OPPORTUNITY_DB_VERSION,
  OPPORTUNITY_STORE_NAME,
  WEEKLY_KLINE_STORE_NAME,
  STOCK_HISTORY_STORE_NAME,
  STOCK_FINANCE_STORE_NAME,
} from '../config/constants';
import { mergeStockHistoryRecord } from './stockHistoryMerge';

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化数据库
 */
export async function initOpportunityDB(): Promise<IDBDatabase> {
  // 缓存的连接版本落后（如 HMR 后代码已升到新版本、旧连接仍是旧版本）时，
  // 必须关闭后重开，否则新版本要建的 store 不存在，读写会直接失败。
  if (dbInstance) {
    if (dbInstance.version >= OPPORTUNITY_DB_VERSION) {
      return dbInstance;
    }
    try {
      dbInstance.close();
    } catch {
      // 关闭失败不影响后续重开
    }
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OPPORTUNITY_DB_NAME, OPPORTUNITY_DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开IndexedDB失败'));
    };

    // 有其他连接未关闭时版本升级会被阻塞：显式报错，避免请求静默挂起
    request.onblocked = () => {
      reject(new Error('IndexedDB 版本升级被其他连接阻塞，请关闭其他页面后重试'));
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

      // v8: 周K 数据独立存储（周线选股页面专用，不与日线历史互相覆盖）
      if (!db.objectStoreNames.contains(WEEKLY_KLINE_STORE_NAME)) {
        db.createObjectStore(WEEKLY_KLINE_STORE_NAME, { keyPath: 'code' });
      }

      // v9: 财务指标独立存储（跨重启复用，且不受分析数据清理影响）
      if (!db.objectStoreNames.contains(STOCK_FINANCE_STORE_NAME)) {
        db.createObjectStore(STOCK_FINANCE_STORE_NAME, { keyPath: 'code' });
      }
    };
  });
}

/**
 * 保存分析结果（仅主记录）。
 *
 * K 线不落盘：机会分析固定日线口径，日线由 `getKLineData` 旁路写入 stockHistory，
 * 读取统一由 `services/opportunity/klineSource` 从该表解析。
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
 * 获取最新的分析结果（仅主记录）。
 *
 * 这里不拼装 K 线：K 线统一由 `services/opportunity/klineSource`
 * 从 stockHistory 解析，主记录只存分析结果本身。
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
  return data as OpportunityAnalysisResult;
}

/**
 * 清空机会分析主记录（不影响 stockHistory 等其它存储）
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
 * 清空所有股票历史数据（K线数据）
 */
export async function clearStockHistory(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(new Error('清空股票历史数据失败'));
    transaction.oncomplete = () => {
      invalidateStocksHistoryCache();
      resolve();
    };

    const historyStore = transaction.objectStore(STOCK_HISTORY_STORE_NAME);
    const historyRequest = historyStore.clear();
    historyRequest.onerror = () => reject(new Error('清空股票历史数据失败'));
  });
}

// ==================== 股票历史数据管理 ====================

/**
 * 股票历史记录。
 *
 * 只保留 K 线口径的真正数据来源：行业/概念由股票池与板块映射在展示时解析，
 * 写入时间戳对业务无意义（各写入方各自持有部分字段、按需合并），故均不落盘。
 */
export interface StockHistoryRecord {
  code: string;
  name: string;
  dailyLines: KLineData[];
  latestQuote: StockQuote | null;
  latestDetail?: StockDetail | null; // 最新详情数据
}

/**
 * 保存或更新股票历史数据（字段级合并写入）。
 *
 * 写入方各自只持有部分字段（详情只有 latestDetail、K 线只有 dailyLines），
 * 直接 put 会用空值覆盖对方的数据，故先读旧记录再合并，见 utils/storage/stockHistoryMerge。
 */
export async function saveStockHistory(record: StockHistoryRecord): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(record.code);

    getRequest.onerror = () => reject(new Error('读取股票历史数据失败'));
    getRequest.onsuccess = () => {
      const previous = getRequest.result as StockHistoryRecord | undefined;
      const request = store.put(mergeStockHistoryRecord(previous, record));

      request.onsuccess = () => {
        invalidateStocksHistoryCache();
        resolve();
      };
      request.onerror = () => reject(new Error('保存股票历史数据失败'));
    };
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
 * 全量读取结果缓存。
 * store.getAll() 要把几千只股票、每只几百根 K 线全部结构化克隆进内存，代价极高，
 * 历史回测 / 机会分析 / 分析记录三个页面都会全量读，这里跨页面复用同一份结果。
 * 写入（saveStockHistory）与清空（clearStockHistory）时自动失效。
 */
let cachedAllHistories: StockHistoryRecord[] | null = null;
let cachedAllHistoriesPromise: Promise<StockHistoryRecord[]> | null = null;

/** 主动失效全量缓存（如外部批量导入后） */
export function invalidateStocksHistoryCache(): void {
  cachedAllHistories = null;
  cachedAllHistoriesPromise = null;
}

function getAllStockHistories(): Promise<StockHistoryRecord[]> {
  return initOpportunityDB().then(
    (db) =>
      new Promise<StockHistoryRecord[]>((resolve, reject) => {
        const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readonly');
        const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(new Error('获取所有股票历史数据失败'));
      })
  );
}

function getStockHistoriesByCodes(codes: string[]): Promise<StockHistoryRecord[]> {
  return initOpportunityDB().then(
    (db) =>
      new Promise<StockHistoryRecord[]>((resolve, _reject) => {
        const transaction = db.transaction([STOCK_HISTORY_STORE_NAME], 'readonly');
        const store = transaction.objectStore(STOCK_HISTORY_STORE_NAME);
        const results: StockHistoryRecord[] = [];
        let completed = 0;

        const settle = () => {
          completed++;
          if (completed === codes.length) resolve(results);
        };

        codes.forEach((code) => {
          const request = store.get(code);
          request.onsuccess = () => {
            if (request.result) results.push(request.result);
            settle();
          };
          request.onerror = settle;
        });
      })
  );
}

/**
 * 批量获取股票历史数据
 */
export async function getStocksHistory(codes: string[]): Promise<StockHistoryRecord[]> {
  if (codes.length === 0) {
    if (cachedAllHistories) return cachedAllHistories;
    if (cachedAllHistoriesPromise) return cachedAllHistoriesPromise;

    cachedAllHistoriesPromise = getAllStockHistories()
      .then((list) => {
        cachedAllHistories = list;
        cachedAllHistoriesPromise = null;
        return list;
      })
      .catch((error) => {
        cachedAllHistoriesPromise = null;
        throw error;
      });

    return cachedAllHistoriesPromise;
  }

  return getStockHistoriesByCodes(codes);
}

// ==================== 财务指标管理 ====================

/**
 * 财务指标记录。
 *
 * 不保留写入时间戳：财务数据按季度更新，持久化命中即直接复用（默认不过期），
 * 过期与否由使用侧按报告期（reportDate / publishDate）自行判定。
 */
export interface StockFinanceRecord {
  code: string;
  metrics: StockFinanceMetrics;
}

/**
 * 批量保存财务指标（按 code 覆盖）。
 * 写入内容为纯数据对象，体积很小，数千条也只是一次小事务。
 */
export async function saveStockFinanceMetrics(records: StockFinanceRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_FINANCE_STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('保存财务指标数据失败'));
    records.forEach((record) => store.put(record));
  });
}

/**
 * 按股票代码批量读取财务指标
 */
export async function getStockFinanceMetrics(codes: string[]): Promise<StockFinanceRecord[]> {
  if (codes.length === 0) return [];
  const db = await initOpportunityDB();

  return new Promise((resolve, _reject) => {
    const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(STOCK_FINANCE_STORE_NAME);
    const results: StockFinanceRecord[] = [];
    let completed = 0;

    const settle = () => {
      completed++;
      if (completed === codes.length) resolve(results);
    };

    codes.forEach((code) => {
      const request = store.get(code);
      request.onsuccess = () => {
        if (request.result) results.push(request.result as StockFinanceRecord);
        settle();
      };
      request.onerror = settle;
    });
  });
}

/**
 * 读取全部财务指标（页面初始化时恢复用）
 */
export async function getAllStockFinanceMetrics(): Promise<StockFinanceRecord[]> {
  const db = await initOpportunityDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readonly');
    const request = transaction.objectStore(STOCK_FINANCE_STORE_NAME).getAll();

    request.onsuccess = () => resolve((request.result || []) as StockFinanceRecord[]);
    request.onerror = () => reject(new Error('获取财务指标数据失败'));
  });
}

/**
 * 清空全部财务指标
 */
export async function clearStockFinanceMetrics(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('清空财务指标数据失败'));
    transaction.objectStore(STOCK_FINANCE_STORE_NAME).clear();
  });
}

