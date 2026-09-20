/**
 * IndexedDB 存储工具（机会分析）
 */

import type {
  OpportunityAnalysisResult,
  KLineData,
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

      // v9: 营收/净利润指标独立存储（跨重启复用，且不受分析数据清理影响）
      if (!db.objectStoreNames.contains(STOCK_FINANCE_STORE_NAME)) {
        db.createObjectStore(STOCK_FINANCE_STORE_NAME, { keyPath: 'code' });
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
  /**
   * dailyLines 的复权口径（'qfq' 前复权 / 'hfq' 后复权 / '' 不复权）。
   * 读取时按调用方请求的口径校验，避免「不复权旧缓存」被当作前复权数据使用；
   * 缺省视为 ''（历史遗留数据），此时前复权请求会自动回源并重写缓存。
   */
  dailyLinesAdjust?: 'qfq' | 'hfq' | '';
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
    request.onsuccess = () => {
      invalidateStocksHistoryCache();
      resolve();
    };
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

// ==================== 营收 / 净利润指标管理 ====================

/** 营收/净利润指标记录（带写入时间，供上层做 TTL 判断） */
export interface StockFinanceRecord {
  code: string;
  metrics: StockFinanceMetrics;
  updatedAt: number;
}

/**
 * 批量保存营收/净利润指标（按 code 覆盖）。
 * 写入内容为纯数据对象，体积很小，数千条也只是一次小事务。
 */
export async function saveStockFinanceMetrics(records: StockFinanceRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STOCK_FINANCE_STORE_NAME);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('保存营收净利润数据失败'));
    records.forEach((record) => store.put(record));
  });
}

/**
 * 按股票代码批量读取营收/净利润指标
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
 * 读取全部营收/净利润指标（页面初始化时恢复用）
 */
export async function getAllStockFinanceMetrics(): Promise<StockFinanceRecord[]> {
  const db = await initOpportunityDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readonly');
    const request = transaction.objectStore(STOCK_FINANCE_STORE_NAME).getAll();

    request.onsuccess = () => resolve((request.result || []) as StockFinanceRecord[]);
    request.onerror = () => reject(new Error('获取营收净利润数据失败'));
  });
}

/**
 * 清空全部营收/净利润指标
 */
export async function clearStockFinanceMetrics(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([STOCK_FINANCE_STORE_NAME], 'readwrite');

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('清空营收净利润数据失败'));
    transaction.objectStore(STOCK_FINANCE_STORE_NAME).clear();
  });
}

