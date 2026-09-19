/**
 * 新浪财经财务报表服务
 *
 * 通过 `CompanyFinanceService.getFinanceReport2022` 获取上市公司「成长能力」分组数据：
 * - 营业总收入、归母净利润（单位：元）
 * - 营业总收入增长率、归属母公司净利润增长率（单位：%，接口原值已是百分数）
 *
 * 接口支持 JSONP，使用 {@link loadJsonp} 直连，避免跨域与代理改造。
 *
 * 缓存策略（三级）：内存 cache → StockOpportunityDB.stockFinanceMetrics → 网络。
 * 持久化层可跨重启复用，且不会被「一键分析」的 apiCache.clear() 清掉。
 */

import { logger } from '@/utils/business/logger';
import { apiCache } from '@/utils/storage/apiCache';
import { getPureCode, getMarketFromCode } from '@/utils/format/format';
import { loadJsonp } from '@/utils/network/jsonp';
import { ConcurrencyManager, type ProgressInfo } from '@/utils/business/concurrencyManager';
import {
  getAllStockFinanceMetrics,
  getStockFinanceMetrics,
  saveStockFinanceMetrics,
  type StockFinanceRecord,
} from '@/utils/storage/opportunityIndexedDB';
import type { StockFinanceMetrics } from '@/types/stock';

const SINA_FINANCE_BASE =
  'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022';

/** 财务数据按季度更新，内存与 IndexedDB 缓存统一 6 小时 */
const SINA_FINANCE_CACHE_TTL = 6 * 60 * 60 * 1000;

/** JSONP 单次请求超时时间（毫秒） */
const SINA_FINANCE_TIMEOUT = 20000;

/** 批量默认并发数（与「一键分析」K 线同水位，避免触发新浪限流） */
const DEFAULT_MAX_CONCURRENCY = 6;

/** 批量默认批次间隔（毫秒） */
const DEFAULT_BATCH_DELAY = 300;

/** 成长能力分组标题 */
const GROWTH_GROUP_TITLE = '成长能力';

/** 各指标在「成长能力」分组内的 item_title */
const TITLE_REVENUE = '营业总收入';
const TITLE_NET_PROFIT = '归母净利润';
const TITLE_REVENUE_GROWTH = '营业总收入增长率';
const TITLE_NET_PROFIT_GROWTH = '归属母公司净利润增长率';

/** 接口原始指标项 */
interface SinaFinanceRawItem {
  item_field?: string;
  item_title?: string;
  item_value?: string | number;
  item_display_type?: number;
  item_precision?: string;
  item_group_no?: number;
  item_tongbi?: string | number;
}

/** 接口单个报告期 */
interface SinaFinanceRawReport {
  publish_date?: string;
  data?: SinaFinanceRawItem[];
}

/** 接口响应体 */
interface SinaFinanceRawResponse {
  result?: {
    status?: { code?: number; msg?: string };
    data?: {
      report_count?: string;
      report_date?: Array<{
        date_value?: string;
        date_description?: string;
        date_type?: number;
      }>;
      report_list?: Record<string, SinaFinanceRawReport> | SinaFinanceRawReport[];
    };
  };
}

/** 安全转数字：空串 / 非法值返回 undefined */
function toNumber(value: string | number | undefined | null): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** 统一代码 → 新浪 paperCode（如 sh603228 / sz000001） */
function buildPaperCode(code: string): string | null {
  const market = getMarketFromCode(code);
  if (!market) return null;
  return `${market === 'SH' ? 'sh' : 'sz'}${getPureCode(code)}`;
}

/** 内存缓存 key */
function buildCacheKey(paperCode: string): string {
  return `sina:finance:${paperCode}`;
}

/** 持久化记录是否仍在有效期内 */
function isPersistFresh(updatedAt: number): boolean {
  return Date.now() - updatedAt <= SINA_FINANCE_CACHE_TTL;
}

/** 归一化 report_list（对象或数组）为「日期 + 报告」列表 */
function normalizeReportEntries(
  reportList: Record<string, SinaFinanceRawReport> | SinaFinanceRawReport[] | undefined
): Array<{ date: string; report: SinaFinanceRawReport }> {
  if (!reportList) return [];
  if (Array.isArray(reportList)) {
    return reportList.filter((report) => !!report).map((report) => ({ date: '', report }));
  }
  return Object.entries(reportList)
    .filter(([, report]) => !!report)
    .map(([date, report]) => ({ date: String(date).trim(), report }));
}

/**
 * 从单个报告期提取「成长能力」四项指标。
 * 优先在「成长能力」分组内按 item_title 匹配，找不到时退化为全数组匹配；
 * 增长率缺失时用对应指标的 item_tongbi（小数）换算为百分比兜底。
 */
function extractGrowthMetrics(report: SinaFinanceRawReport): Omit<
  StockFinanceMetrics,
  'reportDate' | 'reportLabel' | 'publishDate'
> {
  const items = Array.isArray(report.data) ? report.data : [];

  const groupIndex = items.findIndex(
    (item) =>
      item.item_display_type === 1 && (item.item_title || '').trim() === GROWTH_GROUP_TITLE
  );
  const groupNo = groupIndex >= 0 ? items[groupIndex]?.item_group_no : undefined;
  const scoped =
    groupIndex >= 0
      ? items.filter(
          (item, index) =>
            index > groupIndex &&
            item.item_display_type !== 1 &&
            (groupNo === undefined || item.item_group_no === groupNo)
        )
      : items;

  const findByTitle = (title: string): SinaFinanceRawItem | undefined =>
    scoped.find((item) => (item.item_title || '').trim() === title) ??
    items.find((item) => (item.item_title || '').trim() === title);

  const revenueItem = findByTitle(TITLE_REVENUE);
  const netProfitItem = findByTitle(TITLE_NET_PROFIT);
  const revenueGrowthItem = findByTitle(TITLE_REVENUE_GROWTH);
  const netProfitGrowthItem = findByTitle(TITLE_NET_PROFIT_GROWTH);

  // 增长率项的 item_value 已是百分比；缺失时用 item_tongbi(小数) * 100 兜底
  const fallbackGrowth = (item?: SinaFinanceRawItem): number | undefined => {
    const tongbi = toNumber(item?.item_tongbi);
    return tongbi === undefined ? undefined : tongbi * 100;
  };

  return {
    revenue: toNumber(revenueItem?.item_value),
    netProfit: toNumber(netProfitItem?.item_value),
    revenueYoy: toNumber(revenueGrowthItem?.item_value) ?? fallbackGrowth(revenueItem),
    netProfitYoy: toNumber(netProfitGrowthItem?.item_value) ?? fallbackGrowth(netProfitItem),
  };
}

/**
 * 仅走网络获取单只股票最新报告期的营收 / 净利润及增长率（不做任何缓存读写）
 */
async function fetchSinaFinanceMetricsFromNetwork(
  code: string,
  options: { num?: number; signal?: AbortSignal } = {}
): Promise<StockFinanceMetrics | null> {
  const { num = 10, signal } = options;

  const paperCode = buildPaperCode(code);
  if (!paperCode) {
    logger.warn('[SinaFinance] 无法识别股票代码所属市场:', code);
    return null;
  }

  const url =
    `${SINA_FINANCE_BASE}?paperCode=${paperCode}` +
    `&source=gjzb&type=0&page=1&num=${num}`;

  try {
    const raw = await loadJsonp<SinaFinanceRawResponse>(url, {
      callbackParam: 'callback',
      timeout: SINA_FINANCE_TIMEOUT,
      signal,
    });

    const status = raw?.result?.status;
    if (status && status.code !== 0) {
      logger.warn(`[SinaFinance] ${paperCode} 接口返回异常 code=${status.code}`);
      return null;
    }

    const data = raw?.result?.data;
    const entries = normalizeReportEntries(data?.report_list);
    if (entries.length === 0) {
      logger.warn(`[SinaFinance] ${paperCode} 未返回报告数据`);
      return null;
    }

    // 最新报告期：优先按日期键倒序
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];

    const reportDate = latest.date || String(data?.report_date?.[0]?.date_value ?? '').trim();
    const matchedDate = (data?.report_date || []).find(
      (d) => String(d.date_value ?? '').trim() === reportDate
    );

    return {
      reportDate: reportDate || undefined,
      reportLabel: matchedDate?.date_description || undefined,
      publishDate: latest.report.publish_date || undefined,
      ...extractGrowthMetrics(latest.report),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    logger.warn(`[SinaFinance] 获取 ${paperCode} 财务数据失败:`, error);
    return null;
  }
}

/**
 * 获取单只股票最新报告期的营收 / 净利润及增长率。
 * 查找顺序：内存 cache → IndexedDB → 网络。
 *
 * @param code 统一格式代码（SH600000 / SZ000001）
 * @param options.num 拉取报告期数量，默认 10
 * @param options.signal 取消信号
 * @param options.force 为 true 时忽略所有缓存
 */
export async function getSinaFinanceMetrics(
  code: string,
  options: { num?: number; signal?: AbortSignal; force?: boolean } = {}
): Promise<StockFinanceMetrics | null> {
  const { num = 10, signal, force = false } = options;

  const paperCode = buildPaperCode(code);
  if (!paperCode) {
    logger.warn('[SinaFinance] 无法识别股票代码所属市场:', code);
    return null;
  }

  const cacheKey = buildCacheKey(paperCode);

  if (!force) {
    const cached = apiCache.get<StockFinanceMetrics>(cacheKey);
    if (cached) return cached;

    try {
      const records = await getStockFinanceMetrics([code]);
      const hit = records.find((record) => record.code === code && isPersistFresh(record.updatedAt));
      if (hit) {
        apiCache.set(cacheKey, hit.metrics, SINA_FINANCE_CACHE_TTL);
        return hit.metrics;
      }
    } catch (error) {
      logger.warn('[SinaFinance] 读取本地营收净利润缓存失败，忽略:', error);
    }
  }

  const metrics = await fetchSinaFinanceMetricsFromNetwork(code, { num, signal });
  if (metrics) {
    apiCache.set(cacheKey, metrics, SINA_FINANCE_CACHE_TTL);
    void saveStockFinanceMetrics([{ code, metrics, updatedAt: Date.now() }]).catch((error) => {
      logger.warn('[SinaFinance] 写入本地营收净利润缓存失败:', error);
    });
  }
  return metrics;
}

export interface SinaFinanceBatchOptions {
  /** 进度回调（total 为传入股票总数，completed 含缓存命中数） */
  onProgress?: (progress: ProgressInfo) => void;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 最大并发数，默认 6 */
  maxConcurrency?: number;
  /** 批次间延迟（毫秒），默认 300 */
  batchDelay?: number;
  /** 拉取报告期数量，默认 10 */
  num?: number;
  /** 为 true 时忽略所有缓存，强制联网 */
  force?: boolean;
}

/**
 * 批量获取营收 / 净利润数据。
 *
 * - 优先命中内存缓存与 IndexedDB（TTL 6 小时），命中者不发请求
 * - 单只失败不影响整体；已成功结果统一回写 IndexedDB
 *
 * @returns Map<原始 code, 财务指标>
 */
export async function getSinaFinanceMetricsBatch(
  stocks: Array<{ code: string }>,
  options: SinaFinanceBatchOptions = {}
): Promise<Map<string, StockFinanceMetrics>> {
  const {
    onProgress,
    signal,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    batchDelay = DEFAULT_BATCH_DELAY,
    num = 10,
    force = false,
  } = options;

  const result = new Map<string, StockFinanceMetrics>();
  if (stocks.length === 0) return result;

  // 1) 一次性读入持久化缓存，避免逐只索引
  const persistedMap = new Map<string, StockFinanceMetrics>();
  if (!force) {
    try {
      const records = await getAllStockFinanceMetrics();
      records.forEach((record) => {
        if (isPersistFresh(record.updatedAt)) {
          persistedMap.set(record.code, record.metrics);
        }
      });
    } catch (error) {
      logger.warn('[SinaFinance] 读取本地营收净利润缓存失败，忽略:', error);
    }
  }

  // 2) 命中内存 / IndexedDB 的股票直接返回，剩余进入网络队列
  const pending: Array<{ code: string }> = [];
  stocks.forEach((stock) => {
    const paperCode = buildPaperCode(stock.code);
    if (!paperCode) return;

    if (!force) {
      const cacheKey = buildCacheKey(paperCode);
      const fromMemory = apiCache.get<StockFinanceMetrics>(cacheKey);
      if (fromMemory) {
        result.set(stock.code, fromMemory);
        return;
      }
      const fromPersist = persistedMap.get(stock.code);
      if (fromPersist) {
        apiCache.set(cacheKey, fromPersist, SINA_FINANCE_CACHE_TTL);
        result.set(stock.code, fromPersist);
        return;
      }
    }
    pending.push(stock);
  });

  const cachedCount = result.size;

  if (pending.length === 0) {
    onProgress?.({ total: stocks.length, completed: stocks.length, failed: 0, percent: 100 });
    return result;
  }

  // 3) 仅对未命中的股票联网拉取
  const manager = new ConcurrencyManager<StockFinanceMetrics | null>({
    maxConcurrency,
    batchDelay,
    onProgress: (p) => {
      const completed = cachedCount + p.completed;
      const percent =
        stocks.length > 0 ? Math.round((completed / stocks.length) * 10000) / 100 : 0;
      onProgress?.({ total: stocks.length, completed, failed: p.failed, percent });
    },
  });

  const onAbort = () => manager.cancel();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const tasks = pending.map((stock) => ({
      code: stock.code,
      promise: manager.addTask({
        id: stock.code,
        fn: () => fetchSinaFinanceMetricsFromNetwork(stock.code, { num, signal }),
      }),
    }));

    const startPromise = manager.start();
    const settled = await Promise.allSettled(tasks.map((t) => t.promise));
    await startPromise;

    // 4) 汇总结果并回写缓存
    const freshRecords: StockFinanceRecord[] = [];
    tasks.forEach((task, index) => {
      const item = settled[index];
      if (item.status !== 'fulfilled' || !item.value) return;

      const metrics = item.value;
      result.set(task.code, metrics);

      const paperCode = buildPaperCode(task.code);
      if (paperCode) {
        apiCache.set(buildCacheKey(paperCode), metrics, SINA_FINANCE_CACHE_TTL);
      }
      freshRecords.push({ code: task.code, metrics, updatedAt: Date.now() });
    });

    if (freshRecords.length > 0) {
      try {
        await saveStockFinanceMetrics(freshRecords);
      } catch (error) {
        logger.warn('[SinaFinance] 写入本地营收净利润缓存失败:', error);
      }
    }

    if (signal?.aborted) {
      throw new DOMException('请求已取消', 'AbortError');
    }

    return result;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
