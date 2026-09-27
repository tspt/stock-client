/**
 * IndexedDB 存储工具（机会分析）
 */

import type {
  OpportunityAnalysisResult,
  KLineData,
  KLinePeriod,
  StockQuote,
  StockDetail,
  IndustryInfo,
  StockFinanceMetrics,
} from '@/types/stock';
import {
  OPPORTUNITY_DB_NAME,
  OPPORTUNITY_DB_VERSION,
  OPPORTUNITY_STORE_NAME,
  OPPORTUNITY_KLINE_STORE_NAME,
  WEEKLY_KLINE_STORE_NAME,
  STOCK_HISTORY_STORE_NAME,
  STOCK_FINANCE_STORE_NAME,
} from '../config/constants';
import { needsDedicatedKlineStore } from '../analysis/opportunityKlinePolicy';
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

      // v7: K 线缓存从主记录拆分为独立存储，避免单条记录过大导致读取缓慢
      if (!db.objectStoreNames.contains(OPPORTUNITY_KLINE_STORE_NAME)) {
        db.createObjectStore(OPPORTUNITY_KLINE_STORE_NAME, { keyPath: 'code' });
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

/** K 线缓存写入分批大小，避免单个事务过大 */
const KLINE_WRITE_BATCH = 500;

/**
 * 保存 K 线缓存（独立存储）：先清空旧数据，再分批写入。
 *
 * 只承载「日线以外的周期」与「带截止日的日线（回测）」——普通日线分析复用 stockHistory，
 * 传空数组即表示本次不落盘（仅清空，避免上一次其它周期的数据被误读）。
 * 每条记录带上 period，供读取侧校验周期是否与当前分析一致。
 */
export async function saveOpportunityKlines(
  entries: Array<[string, KLineData[]]>,
  period?: KLinePeriod
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
        store.put({ code, kline, period });
      });
    });
  }
}

/** 独立 K 线表快照：条目 + 写入时的周期（旧数据无 period） */
export interface OpportunityKlineSnapshot {
  /** 写入该批数据时的分析周期；改造前写入的旧数据没有该字段 */
  period?: KLinePeriod;
  entries: Array<[string, KLineData[]]>;
}

/**
 * 读取独立表全部 K 线（一次性读回，保证与拆分前的数据集合完全一致）
 */
export async function getOpportunityKlineSnapshot(): Promise<OpportunityKlineSnapshot> {
  const db = await initOpportunityDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([OPPORTUNITY_KLINE_STORE_NAME], 'readonly');
    const request = transaction.objectStore(OPPORTUNITY_KLINE_STORE_NAME).getAll();

    request.onsuccess = () => {
      const rows = (request.result || []) as Array<{
        code: string;
        kline: KLineData[];
        period?: KLinePeriod;
      }>;
      resolve({
        period: rows.find((row) => row.period)?.period,
        entries: rows.map((row) => [row.code, row.kline]),
      });
    };
    request.onerror = () => reject(new Error('获取K线缓存失败'));
  });
}

/**
 * 保存分析结果。
 * - K 线优先落盘：先写 K 线再写主记录，避免主记录已更新而 K 线缺失导致读到不完整数据；
 * - 但只有「非日线周期」或「带截止日的日线（回测）」才落独立表，
 *   普通日线分析复用 getKLineData 旁路写入的 stockHistory（见 needsDedicatedKlineStore）。
 */
export async function saveOpportunityData(data: OpportunityAnalysisResult): Promise<void> {
  const { klineDataCache, ...rest } = data;
  const dedicated = needsDedicatedKlineStore(data.period, data.asOfDate);

  await saveOpportunityKlines(dedicated ? klineDataCache ?? [] : [], data.period);

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
 * 获取最新的分析结果（仅主记录）。
 *
 * 这里不拼装 K 线：日线复用 stockHistory、周/月/年与回测读独立表，
 * 统一由 `services/opportunity/klineSource` 按周期策略解析；
 * 主记录里自带的 klineDataCache 仅作为老版本数据的兜底（由调用方决定是否采用）。
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
      new Promise<StockHistoryRecord[]>((resolve, reject) => {
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

/** 财务指标记录（带写入时间，供上层做 TTL 判断） */
export interface StockFinanceRecord {
  code: string;
  metrics: StockFinanceMetrics;
  updatedAt: number;
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

  return new Promise((resolve, reject) => {
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

