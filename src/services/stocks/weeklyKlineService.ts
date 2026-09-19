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
  WEEKLY_KLINE_ADJUST,
  WEEKLY_KLINE_BATCH_DELAY,
  WEEKLY_KLINE_DEFAULT_COUNT,
  WEEKLY_KLINE_SCHEMA_VERSION,
} from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';

/**
 * 周K缓存复用的最少根数。
 *
 * 仅作为「没有记录 requestedCount 的历史缓存」的兜底判断：低于该值时重新拉取，
 * 避免旧参数拉到的短历史被长期复用。
 */
const MIN_WEEKLY_CACHE_BARS = 120;

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

/** 判断周K缓存记录是否与当前结构版本/复权方式兼容 */
function isCacheUsable(record: WeeklyKlineRecord): boolean {
  if (!record.kline || record.kline.length === 0) {
    return false;
  }
  if (record.version !== undefined && record.version !== WEEKLY_KLINE_SCHEMA_VERSION) {
    return false;
  }
  if (record.adjust !== undefined && record.adjust !== WEEKLY_KLINE_ADJUST) {
    return false;
  }
  return true;
}

/**
 * 缓存根数是否足够，可以直接复用。
 *
 * - 新缓存记录了 requestedCount：只要当年请求的根数不少于当前请求，就说明现有长度
 *   已是该股能给到的全部（次新股天然偏短），可以直接复用；
 * - 旧缓存没有该字段：退回按长度判断，避免复用小 count 拉到的短历史。
 */
function hasEnoughBars(record: WeeklyKlineRecord, requestedCount: number): boolean {
  if (record.requestedCount !== undefined && record.requestedCount > 0) {
    return record.requestedCount >= requestedCount;
  }
  return record.kline.length >= Math.min(requestedCount, MIN_WEEKLY_CACHE_BARS);
}

export interface LoadCachedWeeklyKlinesOptions {
  /** 当前请求的周K根数，用于判断缓存是否由足够大的 count 拉取而来 */
  count?: number;
}

export interface CachedWeeklyKlines {
  klines: Map<string, KLineData[]>;
  names: Map<string, string>;
  updatedAt: number | null;
  /** 因结构版本/复权方式不兼容而被丢弃的条数（真正需要重新分析的旧缓存） */
  stale: number;
  /** 因历史根数不足而被跳过的条数（次新股等，属正常现象，不算过期） */
  shortHistory: number;
}

/** 读取 IndexedDB 中的全部周K缓存（自动忽略结构版本/复权方式不兼容的旧数据） */
export async function loadCachedWeeklyKlines(
  options: LoadCachedWeeklyKlinesOptions = {}
): Promise<CachedWeeklyKlines> {
  const requestedCount = options.count ?? WEEKLY_KLINE_DEFAULT_COUNT;
  const records = await getAllWeeklyKlines();
  const klines = new Map<string, KLineData[]>();
  const names = new Map<string, string>();
  let updatedAt: number | null = null;
  let stale = 0;
  let shortHistory = 0;

  records.forEach((record) => {
    if (!isCacheUsable(record)) {
      // 结构版本或复权方式已变更：这才是「不兼容的旧缓存」
      stale += 1;
      return;
    }
    if (!hasEnoughBars(record, requestedCount)) {
      // 历史根数不足：多为次新股，或当年用小 count 拉的，属正常跳过
      shortHistory += 1;
      return;
    }
    klines.set(record.code, record.kline);
    names.set(record.code, record.name || '');
    if (updatedAt === null || record.updatedAt > updatedAt) {
      updatedAt = record.updatedAt;
    }
  });

  return { klines, names, updatedAt, stale, shortHistory };
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
    // 可用性（版本/复权/根数）已在 loadCachedWeeklyKlines 内按当前 count 判定，这里直接复用
    const cached = await loadCachedWeeklyKlines({ count });
    cached.klines.forEach((kline, code) => {
      klines.set(code, kline);
      names.set(code, cached.names.get(code) || '');
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
          const kline = await getKLineData(stock.code, 'week', count, {
            adjust: WEEKLY_KLINE_ADJUST as 'qfq',
          });
          if (kline.length > 0) {
            klines.set(stock.code, kline);
            names.set(stock.code, stock.name);
            batchRecords.push({
              code: stock.code,
              name: stock.name,
              kline,
              updatedAt: now,
              version: WEEKLY_KLINE_SCHEMA_VERSION,
              adjust: WEEKLY_KLINE_ADJUST,
              requestedCount: count,
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
