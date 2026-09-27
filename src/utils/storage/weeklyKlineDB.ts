/**
 * 周K数据缓存（IndexedDB，独立于日线 stockHistory）
 *
 * 与机会分析共用同一个数据库，避免新增 DB 带来的连接成本；
 * 周线数据单独建表，保证周线选股不会污染日线历史。
 *
 * 时间戳不逐条存储：同表另存一条保留主键的元数据记录（见 WEEKLY_KLINE_META_KEY），
 * 与数据在同一个事务里写入，读取时过滤掉；页面「数据时间」直接取自它。
 */

import type { KLineData } from '@/types/stock';
import { initOpportunityDB } from './opportunityIndexedDB';
import { WEEKLY_KLINE_STORE_NAME } from '../config/constants';

export interface WeeklyKlineRecord {
  /** 股票代码（SH600000 / SZ000001） */
  code: string;
  /** 股票名称 */
  name: string;
  /** 周K数据（时间从旧到新） */
  kline: KLineData[];
  /** 缓存结构版本，与 WEEKLY_KLINE_SCHEMA_VERSION 不一致时视为过期 */
  version?: number;
  /** 复权方式（qfq / hfq / ''），用于校验缓存数据可用性 */
  adjust?: string;
  /**
   * 拉取这份数据时请求的根数。
   * 用于判断缓存是否「由足够大的 count 拉取而来」：只要当年请求的根数不少于当前请求，
   * 就说明现有长度已是该股能给到的全部（次新股天然偏短），可直接复用而不必重新拉取。
   */
  requestedCount?: number;
}

/** 元数据记录的保留主键（股票代码不可能等于该值） */
const WEEKLY_KLINE_META_KEY = '__meta__';

/**
 * 周K缓存元数据记录。与股票记录同表存放，用保留主键区分，
 * 只记录「最近一次写入时间」，避免为每只股票各存一个时间戳。
 */
interface WeeklyKlineMetaRecord {
  code: string;
  timestamp: number;
}

function isMetaRecord(record: { code: string }): boolean {
  return record.code === WEEKLY_KLINE_META_KEY;
}

function txDone(tx: IDBTransaction, rejectMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(rejectMessage));
    tx.onabort = () => reject(new Error(rejectMessage));
  });
}

/**
 * 批量保存周K数据（同一事务写入，失败整体回滚）。
 *
 * 同时刷新元数据时间戳：两者同事务，保证「数据已更新」与「数据时间」不会脱节。
 */
export async function saveWeeklyKlines(records: WeeklyKlineRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);
  records.forEach((record) => store.put(record));

  const meta: WeeklyKlineMetaRecord = {
    code: WEEKLY_KLINE_META_KEY,
    timestamp: Date.now(),
  };
  store.put(meta);

  await txDone(transaction, '写入周K数据失败');
}

/**
 * 读取全部周K数据（已滤除元数据记录，调用方只会拿到真实股票记录）
 */
export async function getAllWeeklyKlines(): Promise<WeeklyKlineRecord[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readonly');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = (request.result as Array<WeeklyKlineRecord | WeeklyKlineMetaRecord>) || [];
      resolve(all.filter((record): record is WeeklyKlineRecord => !isMetaRecord(record)));
    };
    request.onerror = () => reject(new Error('读取全部周K数据失败'));
  });
}

/**
 * 读取周K缓存最近一次写入时间；表中还没有元数据记录时返回 null。
 */
export async function getWeeklyKlineTimestamp(): Promise<number | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readonly');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(WEEKLY_KLINE_META_KEY);
    request.onsuccess = () => {
      const record = request.result as WeeklyKlineMetaRecord | undefined;
      resolve(typeof record?.timestamp === 'number' ? record.timestamp : null);
    };
    request.onerror = () => reject(new Error('读取周K缓存时间戳失败'));
  });
}
