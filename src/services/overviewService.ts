/**
 * 数据概况分析服务
 */

import type { StockInfo, StockOverviewData, KLinePeriod } from '@/types/stock';
import { getStockQuotes, getStockDetail, getKLineData } from './stockApi';
import { ConcurrencyManager } from '@/utils/concurrencyManager';
import { OVERVIEW_CONCURRENT_LIMIT, OVERVIEW_BATCH_DELAY } from '@/utils/constants';
import { calcAllIndicators, formatKDJValues } from '@/utils/indicators';

/**
 * 分析单只股票
 */
export async function analyzeStock(
  stock: StockInfo,
  period: KLinePeriod,
  count: number = 300
): Promise<StockOverviewData> {
  const { code, name } = stock;
  const analyzedAt = Date.now();

  try {
    // 1. 获取实时行情数据
    const quotes = await getStockQuotes([code]);
    const quote = quotes[0];

    if (!quote) {
      throw new Error('获取行情数据失败');
    }

    // 2. 获取详情数据
    const detail = await getStockDetail(code);

    // 3. 获取K线数据并计算指标
    let kdjK: number | undefined;
    let kdjD: number | undefined;
    let kdjJ: number | undefined;
    let avgPrice: number | undefined;
    let highPrice: number | undefined;
    let lowPrice: number | undefined;
    let opportunityChangePercent: number | undefined;
    let ma5: number | undefined;
    let ma10: number | undefined;
    let ma20: number | undefined;
    let ma30: number | undefined;
    let ma60: number | undefined;
    let ma120: number | undefined;
    let ma240: number | undefined;
    let ma360: number | undefined;

    try {
      const klineData = await getKLineData(code, period, count);
      if (klineData && klineData.length > 0) {
        // 计算所有技术指标
        const {
          kdj,
          priceStats,
          opportunityChangePercent: oppChangePercent,
          maFields,
        } = calcAllIndicators(klineData, {
          price: quote.price,
          high: quote.high,
          low: quote.low,
        });

        // 格式化KDJ值
        const formattedKDJ = formatKDJValues(kdj);
        kdjK = formattedKDJ.kdjK;
        kdjD = formattedKDJ.kdjD;
        kdjJ = formattedKDJ.kdjJ;

        // 价格统计
        avgPrice = priceStats.avgPrice;
        highPrice = priceStats.highPrice;
        lowPrice = priceStats.lowPrice;

        // 回撤比
        opportunityChangePercent = oppChangePercent;

        // MA涨跌幅
        ma5 = maFields.ma5;
        ma10 = maFields.ma10;
        ma20 = maFields.ma20;
        ma30 = maFields.ma30;
        ma60 = maFields.ma60;
        ma120 = maFields.ma120;
        ma240 = maFields.ma240;
        ma360 = maFields.ma360;
      }
    } catch (error) {
      console.warn(`[${code}] 获取K线数据失败:`, error);
      // K线数据获取失败不影响其他数据
    }

    // 4. 合并数据
    const overviewData: StockOverviewData = {
      code,
      name: quote.name || name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      amount: quote.amount,
      marketCap: detail?.marketCap,
      circulatingMarketCap: detail?.circulatingMarketCap,
      peRatio: detail?.peRatio,
      turnoverRate: detail?.turnoverRate,
      kdjK,
      kdjD,
      kdjJ,
      avgPrice,
      highPrice,
      lowPrice,
      opportunityChangePercent,
      ma5,
      ma10,
      ma20,
      ma30,
      ma60,
      ma120,
      ma240,
      ma360,
      analyzedAt,
    };

    return overviewData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${code}] 分析失败:`, errorMessage);

    // 返回错误数据
    return {
      code,
      name,
      price: 0,
      change: 0,
      changePercent: 0,
      volume: 0,
      amount: 0,
      analyzedAt,
      error: errorMessage,
    };
  }
}

/**
 * 分析单只股票的详情和KDJ数据（行情数据已批量获取）
 */
async function analyzeStockDetails(
  stock: StockInfo,
  quote: {
    code: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
  },
  period: KLinePeriod,
  count: number = 300
): Promise<Partial<StockOverviewData>> {
  const { code } = stock;
  const result: Partial<StockOverviewData> = {};

  try {
    // 1. 获取详情数据
    const detail = await getStockDetail(code);
    if (detail) {
      result.marketCap = detail.marketCap;
      result.circulatingMarketCap = detail.circulatingMarketCap;
      result.peRatio = detail.peRatio;
      result.turnoverRate = detail.turnoverRate;
    }

    // 2. 获取K线数据并计算指标
    try {
      const klineData = await getKLineData(code, period, count);
      if (klineData && klineData.length > 0) {
        // 计算所有技术指标
        const { kdj, priceStats, opportunityChangePercent, maFields } = calcAllIndicators(
          klineData,
          {
            price: quote.price,
            high: quote.high,
            low: quote.low,
          }
        );

        // 格式化KDJ值
        const formattedKDJ = formatKDJValues(kdj);
        result.kdjK = formattedKDJ.kdjK;
        result.kdjD = formattedKDJ.kdjD;
        result.kdjJ = formattedKDJ.kdjJ;

        // 价格统计
        result.avgPrice = priceStats.avgPrice;
        result.highPrice = priceStats.highPrice;
        result.lowPrice = priceStats.lowPrice;

        // 回撤比
        result.opportunityChangePercent = opportunityChangePercent;

        // MA涨跌幅
        result.ma5 = maFields.ma5;
        result.ma10 = maFields.ma10;
        result.ma20 = maFields.ma20;
        result.ma30 = maFields.ma30;
        result.ma60 = maFields.ma60;
        result.ma120 = maFields.ma120;
        result.ma240 = maFields.ma240;
        result.ma360 = maFields.ma360;
      }
    } catch (error) {
      console.warn(`[${code}] 获取K线数据失败:`, error);
      // K线数据获取失败不影响其他数据
    }
  } catch (error) {
    console.warn(`[${code}] 获取详情数据失败:`, error);
    // 详情数据获取失败不影响行情数据
  }

  return result;
}

/**
 * 分析所有股票
 * 优化：先批量获取行情数据，再并发获取详情和K线数据
 */
export function analyzeAllStocks(
  stocks: StockInfo[],
  period: KLinePeriod,
  count: number = 300,
  onProgress?: (progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  }) => void,
  _onCancel?: () => boolean
): {
  promise: Promise<{
    results: StockOverviewData[];
    errors: Array<{ stock: StockInfo; error: Error }>;
  }>;
  cancel: () => void;
} {
  if (stocks.length === 0) {
    return {
      promise: Promise.resolve({ results: [], errors: [] }),
      cancel: () => {},
    };
  }

  let cancelled = false;
  let detailManager: ConcurrencyManager<{
    code: string;
    details: Partial<StockOverviewData>;
  }> | null = null;

  const cancelFn = () => {
    cancelled = true;
    if (detailManager) {
      detailManager.cancel();
    }
  };

  const executePromise = (async () => {
    const results: StockOverviewData[] = [];
    const errors: Array<{ stock: StockInfo; error: Error }> = [];
    const analyzedAt = Date.now();

    try {
      // 第一步：批量获取所有股票的行情数据（一次性调用）
      if (cancelled) {
        return { results, errors };
      }

      onProgress?.({
        total: stocks.length,
        completed: 0,
        failed: 0,
        percent: 0,
      });

      const codes = stocks.map((s) => s.code);
      const quotes = await getStockQuotes(codes);

      if (cancelled) {
        return { results, errors };
      }

      // 创建行情数据映射
      const quotesMap = new Map<string, (typeof quotes)[0]>();
      quotes.forEach((quote) => {
        quotesMap.set(quote.code, quote);
      });

      // 第二步：并发获取详情和K线数据
      detailManager = new ConcurrencyManager<{
        code: string;
        details: Partial<StockOverviewData>;
      }>({
        maxConcurrency: OVERVIEW_CONCURRENT_LIMIT,
        batchDelay: OVERVIEW_BATCH_DELAY,
        onProgress: (progress) => {
          if (onProgress && !cancelled) {
            onProgress({
              total: stocks.length,
              completed: progress.completed,
              failed: progress.failed,
              percent: progress.percent,
            });
          }
        },
      });

      // 为每个股票添加详情获取任务
      stocks.forEach((stock) => {
        const quote = quotesMap.get(stock.code);
        if (quote && detailManager) {
          detailManager.addTask({
            fn: async () => {
              const details = await analyzeStockDetails(
                stock,
                {
                  code: quote.code,
                  name: quote.name,
                  price: quote.price,
                  change: quote.change,
                  changePercent: quote.changePercent,
                  volume: quote.volume,
                  amount: quote.amount,
                  high: quote.high,
                  low: quote.low,
                },
                period,
                count
              );
              return {
                code: stock.code,
                details,
              };
            },
            id: stock.code,
          });
        } else {
          // 如果没有行情数据，记录错误
          errors.push({
            stock,
            error: new Error('获取行情数据失败'),
          });
        }
      });

      // 启动详情数据获取
      const { results: detailResults, errors: detailErrors } = await detailManager.start();

      // 转换详情错误格式
      detailErrors.forEach((err) => {
        const stock = stocks.find((s) => s.code === err.task.id);
        if (stock) {
          errors.push({
            stock,
            error: err.error,
          });
        }
      });

      // 合并数据
      stocks.forEach((stock) => {
        const quote = quotesMap.get(stock.code);
        if (!quote) {
          // 没有行情数据，已记录错误，跳过
          return;
        }

        const detailResult = detailResults.find((r) => r.code === stock.code);
        const details = detailResult?.details || {};

        // 检查是否有错误
        const stockError = errors.find((e) => e.stock.code === stock.code);
        if (stockError && !details.marketCap && !details.kdjK) {
          // 如果详情和KDJ都获取失败，记录为错误
          results.push({
            code: stock.code,
            name: quote.name || stock.name,
            price: 0,
            change: 0,
            changePercent: 0,
            volume: 0, // 已经是亿单位（0/10000 = 0）
            amount: 0, // 已经是亿单位（0/10000 = 0）
            analyzedAt,
            error: stockError.error.message,
          });
        } else {
          // 合并数据
          // API返回：volume是"手"，amount是"元"
          // 用户要求：从"元"转为"亿"，需要除以100000000（1亿），并保留两位小数
          results.push({
            code: stock.code,
            name: quote.name || stock.name,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            // 从"元"转为"亿"：除以100000000，并保留两位小数
            volume: Number((quote.volume / 100000000).toFixed(2)), // 从元转为亿，保留两位小数
            amount: Number((quote.amount / 100000000).toFixed(2)), // 从元转为亿，保留两位小数
            marketCap: details.marketCap,
            circulatingMarketCap: details.circulatingMarketCap,
            peRatio: details.peRatio,
            turnoverRate: details.turnoverRate,
            kdjK: details.kdjK !== undefined ? Number(details.kdjK.toFixed(2)) : undefined,
            kdjD: details.kdjD !== undefined ? Number(details.kdjD.toFixed(2)) : undefined,
            kdjJ: details.kdjJ !== undefined ? Number(details.kdjJ.toFixed(2)) : undefined,
            avgPrice: details.avgPrice,
            highPrice: details.highPrice,
            lowPrice: details.lowPrice,
            opportunityChangePercent: details.opportunityChangePercent,
            ma5: details.ma5,
            ma10: details.ma10,
            ma20: details.ma20,
            ma30: details.ma30,
            ma60: details.ma60,
            ma120: details.ma120,
            ma240: details.ma240,
            ma360: details.ma360,
            analyzedAt,
          });
        }
      });

      return { results, errors };
    } catch (error) {
      // 如果批量获取行情数据失败，所有股票都记录错误
      const err = error instanceof Error ? error : new Error(String(error));
      stocks.forEach((stock) => {
        errors.push({ stock, error: err });
      });
      return { results, errors };
    }
  })();

  return {
    promise: executePromise,
    cancel: cancelFn,
  };
}
