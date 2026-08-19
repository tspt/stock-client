/**
 * 机会分析服务
 * - 先批量获取行情
 * - 再按 OPPORTUNITY_CONCURRENT_LIMIT / OPPORTUNITY_BATCH_DELAY 并发获取详情+K线并计算指标
 */

import type { KLinePeriod, StockInfo, StockOpportunityData, KLineData } from '@/types/stock';
import { getKLineData, getStockDetail, getStockQuotes } from '../stocks/api';
import { getStockHistory } from '@/utils/storage/opportunityIndexedDB';
import { calcAllIndicators, formatKDJValues } from '@/utils/analysis/indicators';
import { calculateConsolidationInLookback } from '@/utils/analysis/consolidationAnalysis';
import { analyzeSharpMovePatterns } from '@/utils/analysis/sharpMovePatterns';
import { calculateTrendLineInLookback } from '@/utils/analysis/trendLineAnalysis';
import {
  approximateFundamentalsAsOf,
  formatKLineDate,
  quoteFromAsOfKline,
  truncateKLinesToAsOfDate,
} from '@/utils/analysis/asOfKline';
import { ConcurrencyManager } from '@/utils/business/concurrencyManager';
import {
  OPPORTUNITY_BATCH_DELAY,
  OPPORTUNITY_CONCURRENT_LIMIT,
  QUOTES_BATCH_DELAY,
  QUOTES_CONCURRENT_LIMIT,
  QUOTES_BATCH_SIZE,
  VOLUME_AMOUNT_UNIT_CONVERSION,
  PROGRESS_BASE,
} from '@/utils/config/constants';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
} from '@/utils/config/opportunityAnalysisDefaults';
import { logger } from '@/utils/business/logger';

type StockQuoteLike = {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
};

type OpportunityAiVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';

async function loadPerformAIAnalysis(aiVersion: OpportunityAiVersion) {
  if (aiVersion === 'v7') {
    return (await import('./ai-v7.0')).performAIAnalysis;
  }
  if (aiVersion === 'v6') {
    return (await import('./ai-v6.0')).performAIAnalysis;
  }
  if (aiVersion === 'v5') {
    return (await import('./ai-v5.0')).performAIAnalysis;
  }
  if (aiVersion === 'v3') {
    return (await import('./ai-v3.0')).performAIAnalysis;
  }
  if (aiVersion === 'v2') {
    return (await import('./ai-v2.0')).performAIAnalysis;
  }
  if (aiVersion === 'v4') {
    return (await import('./ai-v4.0')).performAIAnalysis;
  }
  return (await import('./ai')).performAIAnalysis;
}

async function loadKlineForAnalysis(
  code: string,
  period: KLinePeriod,
  count: number,
  asOfDate?: string
): Promise<{ klineData: KLineData[]; referencePrice?: number }> {
  // 截止日 + 日K：优先本地截断，足够则不拉网
  if (asOfDate && period === 'day') {
    try {
      const historyRecord = await getStockHistory(code);
      if (historyRecord?.dailyLines?.length) {
        const raw = historyRecord.dailyLines;
        const lastRaw = raw[raw.length - 1];
        const referencePrice =
          formatKLineDate(lastRaw.time) > asOfDate ? lastRaw.close : undefined;
        const truncated = truncateKLinesToAsOfDate(raw, asOfDate);
        if (truncated.length >= count) {
          return {
            klineData: truncated.slice(-count),
            referencePrice,
          };
        }
        // 本地已覆盖截止日但条数不足 count：仍用本地，避免无意义重拉
        if (truncated.length > 0 && formatKLineDate(lastRaw.time) >= asOfDate) {
          return { klineData: truncated, referencePrice };
        }
      }
    } catch (error) {
      logger.warn(`[${code}] 截止日读取本地K线失败:`, error);
    }
  }

  const fetchCount =
    asOfDate && period === 'day' ? Math.min(1000, count + 40) : count;
  const raw = await getKLineData(code, period, fetchCount);
  if (!raw || raw.length === 0) {
    return { klineData: [] };
  }
  if (!asOfDate || period !== 'day') {
    return {
      klineData: raw.length > count ? raw.slice(-count) : raw,
    };
  }

  const lastRaw = raw[raw.length - 1];
  const referencePrice =
    formatKLineDate(lastRaw.time) > asOfDate ? lastRaw.close : undefined;
  const truncated = truncateKLinesToAsOfDate(raw, asOfDate);
  if (truncated.length === 0) {
    return { klineData: [], referencePrice };
  }
  return {
    klineData: truncated.length > count ? truncated.slice(-count) : truncated,
    referencePrice,
  };
}

async function analyzeOneStock(
  stock: StockInfo,
  quoteInput: StockQuoteLike | null,
  period: KLinePeriod,
  count: number,
  cancelledRef: { cancelled: boolean },
  asOfDate?: string
): Promise<{ data: StockOpportunityData; klineData: KLineData[] }> {
  const analyzedAt = Date.now();
  const { code } = stock;

  if (cancelledRef.cancelled) {
    throw new Error('已取消');
  }

  const detail = await getStockDetail(code).catch(() => null);

  if (cancelledRef.cancelled) {
    throw new Error('已取消');
  }

  const { klineData, referencePrice } = await loadKlineForAnalysis(
    code,
    period,
    count,
    asOfDate
  );
  if (!klineData || klineData.length === 0) {
    throw new Error(asOfDate ? `截止日 ${asOfDate} 无可用K线` : '获取K线数据失败');
  }

  const quote =
    quoteInput ??
    quoteFromAsOfKline(code, stock.name, klineData);
  if (!quote) {
    throw new Error('无法构造行情数据');
  }

  const { kdj, priceStats, opportunityChangePercent, maFields } = calcAllIndicators(klineData, {
    price: quote.price,
    high: quote.high,
    low: quote.low,
  });

  const { avgPrice, highPrice, lowPrice } = priceStats;
  const formattedKDJ = formatKDJValues(kdj);

  let consolidation;
  try {
    consolidation = calculateConsolidationInLookback(klineData, {
      lookback: OPPORTUNITY_DEFAULT_CONSOLIDATION.lookback,
      consecutive: OPPORTUNITY_DEFAULT_CONSOLIDATION.consecutive,
      threshold: OPPORTUNITY_DEFAULT_CONSOLIDATION.threshold,
      requireClosesAboveMa10: OPPORTUNITY_DEFAULT_CONSOLIDATION.requireClosesAboveMa10,
    });
  } catch (error) {
    logger.warn(`[${code}] 横盘分析失败:`, error);
  }

  let trendLine;
  try {
    trendLine = calculateTrendLineInLookback(klineData, {
      lookback: OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
      consecutive: OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
    });
  } catch (error) {
    logger.warn(`[${code}] 趋势线分析失败:`, error);
  }

  let sharpMovePatterns;
  try {
    sharpMovePatterns = analyzeSharpMovePatterns(
      klineData,
      OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
      OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude
    );
  } catch (error) {
    logger.warn(`[${code}] 单日异动分析失败:`, error);
  }

  const aiAnalysis: StockOpportunityData['aiAnalysis'] = undefined;

  const volume = Number((quote.volume / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2));
  const amount = Number((quote.amount / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2));

  const fundamentals = asOfDate
    ? approximateFundamentalsAsOf(
        detail?.marketCap,
        detail?.circulatingMarketCap,
        quote.price,
        referencePrice
      )
    : {
        marketCap: detail?.marketCap,
        circulatingMarketCap: detail?.circulatingMarketCap,
        totalShares:
          detail?.marketCap && quote.price ? (detail.marketCap * 1e8) / quote.price : undefined,
      };

  return {
    data: {
      code,
      name: quote.name || stock.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      opportunityChangePercent,
      avgPrice,
      highPrice,
      lowPrice,
      volume,
      amount,
      marketCap: fundamentals.marketCap,
      circulatingMarketCap: fundamentals.circulatingMarketCap,
      totalShares: fundamentals.totalShares,
      peRatio: detail?.peRatio,
      turnoverRate: detail?.turnoverRate,
      kdjK: formattedKDJ.kdjK,
      kdjD: formattedKDJ.kdjD,
      kdjJ: formattedKDJ.kdjJ,
      ma5: maFields.ma5,
      ma10: maFields.ma10,
      ma20: maFields.ma20,
      ma30: maFields.ma30,
      ma60: maFields.ma60,
      ma120: maFields.ma120,
      ma240: maFields.ma240,
      ma360: maFields.ma360,
      consolidation,
      trendLine,
      sharpMovePatterns,
      aiAnalysis,
      analyzedAt,
    },
    klineData,
  };
}

/**
 * 分析股票列表（机会分析）
 * 支持分批处理，每批最多100只股票（接口限制）
 */
export function analyzeAllStocksOpportunity(
  stocks: StockInfo[],
  period: KLinePeriod,
  count: number,
  options?: {
    onProgress?: (progress: {
      total: number;
      completed: number;
      failed: number;
      percent: number;
    }) => void;
    aiVersion?: OpportunityAiVersion;
    /** 截止日 YYYY-MM-DD；设置后按该日收盘复盘，跳过实时行情 */
    asOfDate?: string;
  }
): {
  promise: Promise<{
    results: StockOpportunityData[];
    errors: Array<{ stock: StockInfo; error: Error }>;
    klineDataMap: Map<string, KLineData[]>;
  }>;
  cancel: () => void;
} {
  if (stocks.length === 0) {
    return {
      promise: Promise.resolve({ results: [], errors: [], klineDataMap: new Map() }),
      cancel: () => {},
    };
  }

  const cancelledRef = { cancelled: false };
  const managers: ConcurrencyManager<{ code: string; data: StockOpportunityData }>[] = [];

  const cancel = () => {
    cancelledRef.cancelled = true;
    managers.forEach((manager) => manager.cancel());
  };

  const promise = (async () => {
    const onProgress = options?.onProgress;
    const aiVersion: OpportunityAiVersion = options?.aiVersion ?? 'v1';
    const asOfDate = options?.asOfDate;
    const performAIAnalysis = await loadPerformAIAnalysis(aiVersion);
    const errors: Array<{ stock: StockInfo; error: Error }> = [];
    const results: StockOpportunityData[] = [];
    const klineDataMap = new Map<string, KLineData[]>();
    const totalStocks = stocks.length;

    onProgress?.({ total: totalStocks, completed: 0, failed: 0, percent: 0 });

    const batches: StockInfo[][] = [];
    for (let i = 0; i < stocks.length; i += QUOTES_BATCH_SIZE) {
      batches.push(stocks.slice(i, i + QUOTES_BATCH_SIZE));
    }

    let previousBatchesCompleted = 0;
    let previousBatchesFailed = 0;

    const quotesByBatch = new Map<number, Awaited<ReturnType<typeof getStockQuotes>>>();
    const failedBatchIndices = new Set<number>();

    // 截止日模式跳过实时行情；现价等由截止日 K 线推导
    if (!asOfDate) {
      const quotesManager = new ConcurrencyManager<{
        batchIndex: number;
        quotes: Awaited<ReturnType<typeof getStockQuotes>>;
      }>({
        maxConcurrency: QUOTES_CONCURRENT_LIMIT,
        batchDelay: QUOTES_BATCH_DELAY,
      });

      batches.forEach((batch, batchIndex) => {
        const codes = batch.map((s) => s.code);
        quotesManager.addTask({
          id: `quotes_${batchIndex}`,
          fn: async () => {
            const quotes = await getStockQuotes(codes);
            return { batchIndex, quotes };
          },
        });
      });

      const { results: quotesResults, errors: quotesErrors } = await quotesManager.start();

      if (cancelledRef.cancelled) {
        return { results, errors, klineDataMap };
      }

      quotesResults.sort((a, b) => a.batchIndex - b.batchIndex);
      quotesResults.forEach((result) => {
        quotesByBatch.set(result.batchIndex, result.quotes);
      });

      quotesErrors.forEach((err) => {
        const match = err.task.id?.match(/^quotes_(\d+)$/);
        if (match) {
          failedBatchIndices.add(parseInt(match[1], 10));
        }
      });
    } else {
      logger.info(`[机会分析] 截止日模式 asOfDate=${asOfDate}，跳过实时行情`);
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (cancelledRef.cancelled) {
        break;
      }

      const batch = batches[batchIndex];
      let batchQuoteFailed = 0;

      const quotes = asOfDate ? [] : quotesByBatch.get(batchIndex) || [];

      if (cancelledRef.cancelled) {
        break;
      }

      const quotesMap = new Map<string, (typeof quotes)[0]>();
      quotes.forEach((q) => quotesMap.set(q.code, q));

      if (!asOfDate && (failedBatchIndices.has(batchIndex) || quotes.length === 0)) {
        const analyzedAt = Date.now();
        batch.forEach((stock) => {
          const error = new Error('获取行情数据失败');
          errors.push({ stock, error });
          results.push({
            code: stock.code,
            name: stock.name,
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0,
            amount: 0,
            analyzedAt,
            error: error.message,
          });
          batchQuoteFailed++;
        });
        previousBatchesFailed += batchQuoteFailed;
        onProgress?.({
          total: totalStocks,
          completed: previousBatchesCompleted,
          failed: previousBatchesFailed,
          percent: totalStocks > 0 ? (previousBatchesCompleted / totalStocks) * PROGRESS_BASE : 0,
        });
        continue;
      }

      const manager = new ConcurrencyManager<{ code: string; data: StockOpportunityData }>({
        maxConcurrency: OPPORTUNITY_CONCURRENT_LIMIT,
        batchDelay: OPPORTUNITY_BATCH_DELAY,
        taskTimeout: asOfDate ? 15000 : 5000,
        onProgress: (p) => {
          const currentGlobalCompleted = previousBatchesCompleted + p.completed;
          const currentGlobalFailed = previousBatchesFailed + batchQuoteFailed + p.failed;

          onProgress?.({
            total: totalStocks,
            completed: currentGlobalCompleted,
            failed: currentGlobalFailed,
            percent: totalStocks > 0 ? (currentGlobalCompleted / totalStocks) * PROGRESS_BASE : 0,
          });
        },
      });

      managers.push(manager);

      batch.forEach((stock) => {
        if (!asOfDate) {
          const quote = quotesMap.get(stock.code);
          if (!quote) {
            errors.push({ stock, error: new Error('获取行情数据失败') });
            batchQuoteFailed++;
            return;
          }

          manager.addTask({
            id: stock.code,
            fn: async () => {
              const { data, klineData } = await analyzeOneStock(
                stock,
                {
                  code: quote.code,
                  name: quote.name,
                  price: quote.price,
                  change: quote.change,
                  changePercent: quote.changePercent,
                  high: quote.high,
                  low: quote.low,
                  volume: quote.volume,
                  amount: quote.amount,
                },
                period,
                count,
                cancelledRef,
                undefined
              );
              klineDataMap.set(stock.code, klineData);
              return { code: stock.code, data };
            },
          });
          return;
        }

        manager.addTask({
          id: stock.code,
          fn: async () => {
            const { data, klineData } = await analyzeOneStock(
              stock,
              null,
              period,
              count,
              cancelledRef,
              asOfDate
            );
            klineDataMap.set(stock.code, klineData);
            return { code: stock.code, data };
          },
        });
      });

      const { results: taskResults, errors: taskErrors } = await manager.start();

      taskErrors.forEach((err) => {
        const stock = batch.find((s) => s.code === err.task.id);
        if (stock) {
          errors.push({ stock, error: err.error });
        }
      });

      const analyzedAt = Date.now();
      let batchCompleted = 0;
      let batchFailed = 0;

      batch.forEach((stock) => {
        if (!asOfDate) {
          const quote = quotesMap.get(stock.code);
          if (!quote) {
            batchFailed++;
            return;
          }

          const task = taskResults.find((r) => r.code === stock.code);
          if (task?.data) {
            results.push(task.data);
            batchCompleted++;
            return;
          }

          const err = errors.find((e) => e.stock.code === stock.code);
          results.push({
            code: stock.code,
            name: quote.name || stock.name,
            price: quote.price || 0,
            change: quote.change || 0,
            changePercent: quote.changePercent || 0,
            volume: Number(((quote.volume || 0) / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2)),
            amount: Number(((quote.amount || 0) / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2)),
            analyzedAt,
            error: err?.error.message || '分析失败',
          });
          batchFailed++;
          return;
        }

        const task = taskResults.find((r) => r.code === stock.code);
        if (task?.data) {
          results.push(task.data);
          batchCompleted++;
          return;
        }

        const err = errors.find((e) => e.stock.code === stock.code);
        results.push({
          code: stock.code,
          name: stock.name,
          price: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          amount: 0,
          analyzedAt,
          error: err?.error.message || '分析失败',
        });
        batchFailed++;
      });

      previousBatchesCompleted += batchCompleted;
      previousBatchesFailed += batchQuoteFailed + batchFailed;

      onProgress?.({
        total: totalStocks,
        completed: previousBatchesCompleted,
        failed: previousBatchesFailed,
        percent: totalStocks > 0 ? (previousBatchesCompleted / totalStocks) * PROGRESS_BASE : 0,
      });
    }

    logger.info(`[AI分析] 开始批量计算相似形态，股票池大小: ${klineDataMap.size}`);
    let aiUpdatedCount = 0;
    const allStockDataForAI = new Map<
      string,
      { code: string; name: string; klineData: KLineData[] }
    >();

    results.forEach((result) => {
      if (result.code && !result.error && klineDataMap.has(result.code)) {
        const klineData = klineDataMap.get(result.code)!;
        if (klineData && klineData.length >= 100) {
          allStockDataForAI.set(result.code, {
            code: result.code,
            name: result.name,
            klineData: klineData,
          });
        }
      }
    });

    const sortedEntries = Array.from(allStockDataForAI.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const sortedStockDataForAI = new Map(sortedEntries);

    logger.info(`[AI分析] 有效股票池大小: ${sortedStockDataForAI.size}`);

    results.forEach((result) => {
      if (result.code && !result.error && klineDataMap.has(result.code)) {
        const klineData = klineDataMap.get(result.code)!;
        if (klineData && klineData.length >= 100) {
          try {
            const aiAnalysis = performAIAnalysis(klineData, result, sortedStockDataForAI);
            result.aiAnalysis = aiAnalysis;
            aiUpdatedCount++;

            if (aiAnalysis.similarPatterns && aiAnalysis.similarPatterns.length > 0) {
              logger.debug(`[${result.code}] 找到 ${aiAnalysis.similarPatterns.length} 个相似形态`);
            }
          } catch (error) {
            logger.warn(`[${result.code}] AI分析失败:`, error);
          }
        }
      }
    });

    logger.info(`[AI分析] 批量计算完成，更新 ${aiUpdatedCount} 只股票`);

    return { results, errors, klineDataMap };
  })().catch((e) => {
    const err = e instanceof Error ? e : new Error(String(e));
    const errors: Array<{ stock: StockInfo; error: Error }> = stocks.map((s) => ({
      stock: s,
      error: err,
    }));
    return { results: [], errors, klineDataMap: new Map() };
  });

  return { promise, cancel };
}
