/**
 * 周K数据缓存（IndexedDB，独立于日线 stockHistory）
 *
 * 与机会分析共用同一个数据库，避免新增 DB 带来的连接成本；
 * 周线数据单独建表，保证周线选股不会污染日线历史。
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
  /** 写入时间戳 */
  updatedAt: number;
}

function txDone(tx: IDBTransaction, rejectMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(rejectMessage));
    tx.onabort = () => reject(new Error(rejectMessage));
  });
}

/**
 * 批量保存周K数据（同一事务写入，失败整体回滚）
 */
export async function saveWeeklyKlines(records: WeeklyKlineRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readwrite');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);
  records.forEach((record) => store.put(record));

  await txDone(transaction, '写入周K数据失败');
}

/**
 * 读取单只股票的周K数据
 */
export async function getWeeklyKline(code: string): Promise<WeeklyKlineRecord | null> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readonly');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(code);
    request.onsuccess = () => resolve((request.result as WeeklyKlineRecord) || null);
    request.onerror = () => reject(new Error(`读取周K数据失败：${code}`));
  });
}

/**
 * 读取全部周K数据
 */
export async function getAllWeeklyKlines(): Promise<WeeklyKlineRecord[]> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readonly');
  const store = transaction.objectStore(WEEKLY_KLINE_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as WeeklyKlineRecord[]) || []);
    request.onerror = () => reject(new Error('读取全部周K数据失败'));
  });
}

/**
 * 周K缓存概况（数量 + 最近更新时间）
 */
export async function getWeeklyKlineStats(): Promise<{
  count: number;
  latestUpdatedAt: number | null;
}> {
  const records = await getAllWeeklyKlines();
  if (records.length === 0) {
    return { count: 0, latestUpdatedAt: null };
  }

  let latest = 0;
  records.forEach((record) => {
    if (record.updatedAt > latest) {
      latest = record.updatedAt;
    }
  });

  return { count: records.length, latestUpdatedAt: latest || null };
}

/**
 * 清空周K缓存
 */
export async function clearWeeklyKlines(): Promise<void> {
  const db = await initOpportunityDB();
  const transaction = db.transaction([WEEKLY_KLINE_STORE_NAME], 'readwrite');
  transaction.objectStore(WEEKLY_KLINE_STORE_NAME).clear();

  await txDone(transaction, '清空周K数据失败');
}
