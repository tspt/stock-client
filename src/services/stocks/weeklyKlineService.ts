/**
 * 周K数据服务：接口拉取 + IndexedDB 持久化
 *
 * 数据来源与日线一致（腾讯财经 newfqkline 接口，period=week），
 * 但只写入独立的周K存储，不影响机会分析使用的日线历史。
 */

import type { KLineData, StockInfo } from '@/types/stock';
import { getKLineData } from './api';
import {
  clearWeeklyKlines,
  getAllWeeklyKlines,
  saveWeeklyKlines,
  type WeeklyKlineRecord,
} from '@/utils/storage/weeklyKlineDB';
import {
  OPPORTUNITY_CONCURRENT_LIMIT,
  WEEKLY_KLINE_BATCH_DELAY,
  WEEKLY_KLINE_DEFAULT_COUNT,
} from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';

export interface WeeklyFetchProgress {
  completed: number;
  total: number;
  failed: number;
}

export interface WeeklyFetchOptions {
  /** 拉取周K根数 */
  count?: number;
  /** 忽略 IndexedDB 缓存，强制重新拉取 */
  forceRefresh?: boolean;
  /** 进度回调 */
  onProgress?: (progress: WeeklyFetchProgress) => void;
  /** 取消判定（返回 true 时中止后续请求） */
  shouldCancel?: () => boolean;
  /** 并发数 */
  concurrency?: number;
  /** 批次间延迟（毫秒） */
  batchDelay?: number;
}

export interface WeeklyFetchFailure {
  code: string;
  name: string;
  error: string;
}

export interface WeeklyFetchResult {
  /** code -> 周K数据 */
  klines: Map<string, KLineData[]>;
  /** code -> 股票名称 */
  names: Map<string, string>;
  failures: WeeklyFetchFailure[];
  /** 本次数据写入/读取时间戳 */
  updatedAt: number;
  /** 是否因取消而提前结束 */
  cancelled: boolean;
  /** 写入 IndexedDB 是否失败（失败时下次进入页面无法恢复缓存） */
  persistFailed: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 读取 IndexedDB 中的全部周K缓存 */
export async function loadCachedWeeklyKlines(): Promise<{
  klines: Map<string, KLineData[]>;
  names: Map<string, string>;
  updatedAt: number | null;
}> {
  const records = await getAllWeeklyKlines();
  const klines = new Map<string, KLineData[]>();
  const names = new Map<string, string>();
  let updatedAt: number | null = null;

  records.forEach((record) => {
    if (!record.kline || record.kline.length === 0) {
      return;
    }
    klines.set(record.code, record.kline);
    names.set(record.code, record.name || '');
    if (updatedAt === null || record.updatedAt > updatedAt) {
      updatedAt = record.updatedAt;
    }
  });

  return { klines, names, updatedAt };
}

/** 清空周K缓存 */
export async function clearWeeklyKlineCache(): Promise<void> {
  await clearWeeklyKlines();
}

/**
 * 批量拉取周K数据
 *
 * - 默认优先使用 IndexedDB 缓存，只有缺失的股票才走接口
 * - 支持并发控频与取消
 */
export async function fetchWeeklyKlines(
  stocks: StockInfo[],
  options: WeeklyFetchOptions = {}
): Promise<WeeklyFetchResult> {
  const count = options.count ?? WEEKLY_KLINE_DEFAULT_COUNT;
  const concurrency = Math.max(1, options.concurrency ?? OPPORTUNITY_CONCURRENT_LIMIT);
  const batchDelay = options.batchDelay ?? WEEKLY_KLINE_BATCH_DELAY;
  const { forceRefresh = false, onProgress, shouldCancel } = options;

  const klines = new Map<string, KLineData[]>();
  const names = new Map<string, string>();
  const failures: WeeklyFetchFailure[] = [];

  if (!forceRefresh) {
    const cached = await loadCachedWeeklyKlines();
    cached.klines.forEach((kline, code) => {
      // 缓存根数不足目标根数时重新拉取
      if (kline.length >= Math.min(count, 60)) {
        klines.set(code, kline);
        names.set(code, cached.names.get(code) || '');
      }
    });
  }

  const pending = stocks.filter((stock) => !klines.has(stock.code));
  let completed = 0;
  let cancelled = false;
  let persistFailed = false;
  const total = pending.length;

  onProgress?.({ completed: 0, total, failed: failures.length });

  for (let i = 0; i < pending.length; i += concurrency) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const batch = pending.slice(i, i + concurrency);
    const batchRecords: WeeklyKlineRecord[] = [];
    const now = Date.now();

    await Promise.all(
      batch.map(async (stock) => {
        try {
          const kline = await getKLineData(stock.code, 'week', count);
          if (kline.length > 0) {
            klines.set(stock.code, kline);
            names.set(stock.code, stock.name);
            batchRecords.push({
              code: stock.code,
              name: stock.name,
              kline,
              updatedAt: now,
            });
          } else {
            failures.push({ code: stock.code, name: stock.name, error: '接口返回空数据' });
          }
        } catch (error) {
          failures.push({
            code: stock.code,
            name: stock.name,
            error: error instanceof Error ? error.message : '未知错误',
          });
        } finally {
          completed += 1;
          onProgress?.({ completed, total, failed: failures.length });
        }
      })
    );

    if (batchRecords.length > 0) {
      try {
        await saveWeeklyKlines(batchRecords);
      } catch (error) {
        persistFailed = true;
        logger.error('[weeklyKlineService] 写入周K缓存失败:', error);
      }
    }

    if (i + concurrency < pending.length) {
      await delay(batchDelay);
    }
  }

  return { klines, names, failures, updatedAt: Date.now(), cancelled, persistFailed };
}
