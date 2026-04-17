/**
 * 机会分析服务
 * - 先批量获取行情
 * - 再按 OPPORTUNITY_CONCURRENT_LIMIT / OPPORTUNITY_BATCH_DELAY 并发获取详情+K线并计算指标
 */

import type { KLinePeriod, StockInfo, StockOpportunityData, KLineData } from '@/types/stock';
import { getKLineData, getStockDetail, getStockQuotes } from '../stocks/api';
import { calcAllIndicators, formatKDJValues } from '@/utils/indicators';
import { calculateConsolidationInLookback } from '@/utils/consolidationAnalysis';
import { analyzeSharpMovePatterns } from '@/utils/sharpMovePatterns';
import { calculateTrendLineInLookback } from '@/utils/trendLineAnalysis';
import { performAIAnalysis } from './ai';
import { ConcurrencyManager } from '@/utils/concurrencyManager';
import {
  OPPORTUNITY_BATCH_DELAY,
  OPPORTUNITY_CONCURRENT_LIMIT,
  QUOTES_BATCH_DELAY,
  QUOTES_CONCURRENT_LIMIT,
  QUOTES_BATCH_SIZE,
} from '@/utils/constants';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
} from '@/utils/opportunityAnalysisDefaults';
import { logger } from '@/utils/logger';
import { VOLUME_AMOUNT_UNIT_CONVERSION, PROGRESS_BASE } from '@/utils/constants';

async function analyzeOneStock(
  stock: StockInfo,
  quote: {
    code: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    volume: number;
    amount: number;
  },
  period: KLinePeriod,
  count: number,
  cancelledRef: { cancelled: boolean }
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

  const klineData = await getKLineData(code, period, count);
  if (!klineData || klineData.length === 0) {
    throw new Error('获取K线数据失败');
  }

  const { kdj, priceStats, opportunityChangePercent, maFields } = calcAllIndicators(klineData, {
    price: quote.price,
    high: quote.high,
    low: quote.low,
  });

  const { avgPrice, highPrice, lowPrice } = priceStats;
  const formattedKDJ = formatKDJValues(kdj);

  // 横盘分析：与机会页筛选面板默认（opportunityAnalysisDefaults）一致
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
    // 横盘分析失败不影响其他数据
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

  // AI辅助分析（可选，避免影响主要流程）
  let aiAnalysis;
  try {
    const tempOpportunityData: StockOpportunityData = {
      code,
      name: quote.name || stock.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: Number((quote.volume / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2)),
      amount: Number((quote.amount / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2)),
      marketCap: detail?.marketCap,
      circulatingMarketCap: detail?.circulatingMarketCap,
      peRatio: detail?.peRatio,
      turnoverRate: detail?.turnoverRate,
      kdjJ: formattedKDJ.kdjJ,
      ma5: maFields.ma5,
      ma10: maFields.ma10,
      ma20: maFields.ma20,
      consolidation,
      trendLine,
      sharpMovePatterns,
      analyzedAt,
    };
    aiAnalysis = performAIAnalysis(klineData, tempOpportunityData);
  } catch (error) {
    logger.warn(`[${code}] AI分析失败:`, error);
  }

  // 与数据概况页保持一致：volume/amount 先转为"亿单位"再显示
  const volume = Number((quote.volume / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2));
  const amount = Number((quote.amount / VOLUME_AMOUNT_UNIT_CONVERSION).toFixed(2));

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
      marketCap: detail?.marketCap,
      circulatingMarketCap: detail?.circulatingMarketCap,
      // marketCap 单位是亿，转换为股：totalShares(股) = marketCap(亿) * 1e8 / price(元/股)
      totalShares:
        detail?.marketCap && quote.price ? (detail.marketCap * 1e8) / quote.price : undefined,
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
  onProgress?: (progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  }) => void
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
    const errors: Array<{ stock: StockInfo; error: Error }> = [];
    const results: StockOpportunityData[] = [];
    const klineDataMap = new Map<string, KLineData[]>();
    const totalStocks = stocks.length;

    onProgress?.({ total: totalStocks, completed: 0, failed: 0, percent: 0 });

    // 将股票列表按100个一组分批
    const batches: StockInfo[][] = [];
    for (let i = 0; i < stocks.length; i += QUOTES_BATCH_SIZE) {
      batches.push(stocks.slice(i, i + QUOTES_BATCH_SIZE));
    }

    let previousBatchesCompleted = 0;
    let previousBatchesFailed = 0;

    // Step 1：并发获取所有批次的行情数据
    const quotesManager = new ConcurrencyManager<{
      batchIndex: number;
      quotes: Awaited<ReturnType<typeof getStockQuotes>>;
    }>({
      maxConcurrency: QUOTES_CONCURRENT_LIMIT,
      batchDelay: QUOTES_BATCH_DELAY,
    });

    // 为每个批次添加获取行情的任务
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

    // 执行所有行情获取任务
    const { results: quotesResults, errors: quotesErrors } = await quotesManager.start();

    if (cancelledRef.cancelled) {
      return { results, errors, klineDataMap };
    }

    // 将行情结果按批次索引排序并创建映射
    quotesResults.sort((a, b) => a.batchIndex - b.batchIndex);
    const quotesByBatch = new Map<number, Awaited<ReturnType<typeof getStockQuotes>>>();
    quotesResults.forEach((result) => {
      quotesByBatch.set(result.batchIndex, result.quotes);
    });

    // 记录获取行情失败的批次
    const failedBatchIndices = new Set<number>();
    quotesErrors.forEach((err) => {
      const match = err.task.id?.match(/^quotes_(\d+)$/);
      if (match) {
        failedBatchIndices.add(parseInt(match[1], 10));
      }
    });

    // 逐批处理分析
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (cancelledRef.cancelled) {
        break;
      }

      const batch = batches[batchIndex];
      let batchQuoteFailed = 0; // 获取行情失败的股票数

      // 获取当前批次的行情数据
      const quotes = quotesByBatch.get(batchIndex) || [];

      if (cancelledRef.cancelled) {
        break;
      }

      const quotesMap = new Map<string, (typeof quotes)[0]>();
      quotes.forEach((q) => quotesMap.set(q.code, q));

      // 如果该批次获取行情失败，记录所有股票为失败
      if (failedBatchIndices.has(batchIndex) || quotes.length === 0) {
        const analyzedAt = Date.now();
        batch.forEach((stock) => {
          const error = new Error('获取行情数据失败');
          errors.push({ stock, error });
          // 在 results 中也要添加失败条目
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
        // 更新全局进度
        onProgress?.({
          total: totalStocks,
          completed: previousBatchesCompleted,
          failed: previousBatchesFailed,
          percent: totalStocks > 0 ? (previousBatchesCompleted / totalStocks) * PROGRESS_BASE : 0,
        });
        continue;
      }

      // Step 2：按批处理并发分析（并发与间隔见 constants）
      const manager = new ConcurrencyManager<{ code: string; data: StockOpportunityData }>({
        maxConcurrency: OPPORTUNITY_CONCURRENT_LIMIT,
        batchDelay: OPPORTUNITY_BATCH_DELAY,
        onProgress: (p) => {
          // 计算全局进度：前面所有批次的总数 + 当前批次的进度 + 当前批次获取行情失败的数
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
              cancelledRef
            );
            // 保存K线数据到Map
            klineDataMap.set(stock.code, klineData);
            return { code: stock.code, data };
          },
        });
      });

      const { results: taskResults, errors: taskErrors } = await manager.start();

      // 任务错误转换
      taskErrors.forEach((err) => {
        const stock = batch.find((s) => s.code === err.task.id);
        if (stock) {
          errors.push({ stock, error: err.error });
        }
      });

      // 合并当前批次的结果
      const analyzedAt = Date.now();
      let batchCompleted = 0;
      let batchFailed = 0;

      batch.forEach((stock) => {
        const quote = quotesMap.get(stock.code);
        if (!quote) {
          // 已记录错误，计入失败数
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
        // 同样保持 volume/amount 的"亿单位"转换逻辑
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
      });

      // 更新前面批次的总数（用于下一批的进度计算）
      previousBatchesCompleted += batchCompleted;
      previousBatchesFailed += batchQuoteFailed + batchFailed;

      // 更新全局进度
      onProgress?.({
        total: totalStocks,
        completed: previousBatchesCompleted,
        failed: previousBatchesFailed,
        percent: totalStocks > 0 ? (previousBatchesCompleted / totalStocks) * PROGRESS_BASE : 0,
      });
    }

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
