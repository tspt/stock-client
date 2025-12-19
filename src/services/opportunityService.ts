/**
 * 机会分析服务
 * - 先批量获取行情
 * - 再按“每批3只，批次间隔1.2s”并发获取详情+K线并计算指标
 */

import type { KLineData, KLinePeriod, StockInfo, StockOpportunityData } from '@/types/stock';
import { getKLineData, getStockDetail, getStockQuotes } from '@/services/stockApi';
import { calculateKDJ, calculateMA } from '@/utils/indicators';
import { ConcurrencyManager } from '@/utils/concurrencyManager';
import { OPPORTUNITY_BATCH_DELAY, OPPORTUNITY_CONCURRENT_LIMIT } from '@/utils/constants';

const MA_PERIODS = [5, 10, 20, 30, 60, 120, 240, 360] as const;
const RECENT_WINDOWS = {
  change1w: 5,
  change1m: 20,
  change1q: 60,
  change6m: 120,
  change1y: 250,
} as const;

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

function lastFinite(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) {
      return v;
    }
  }
  return undefined;
}

function calcHighLowAvg(
  klineData: KLineData[],
  quote: { price: number; high: number; low: number }
) {
  if (!klineData || klineData.length === 0) {
    return { avgPrice: undefined, highPrice: undefined, lowPrice: undefined };
  }

  let closeSum = 0;
  let count = 0;

  let highInKline = -Infinity;
  let lowInKline = Infinity;

  for (const k of klineData) {
    if (typeof k.close === 'number' && isFinite(k.close)) {
      closeSum += k.close;
      count++;
    }

    const highCandidate = Math.max(k.high, k.close);
    const lowCandidate = Math.min(k.low, k.close);

    if (isFinite(highCandidate)) highInKline = Math.max(highInKline, highCandidate);
    if (isFinite(lowCandidate)) lowInKline = Math.min(lowInKline, lowCandidate);
  }

  const avgPrice = count > 0 ? closeSum / count : undefined;

  const highCandidates = [highInKline, quote.high, quote.price].filter(isFinitePositive);
  const lowCandidates = [lowInKline, quote.low, quote.price].filter(isFinitePositive);

  const highPrice = highCandidates.length > 0 ? Math.max(...highCandidates) : undefined;
  const lowPrice = lowCandidates.length > 0 ? Math.min(...lowCandidates) : undefined;

  return { avgPrice, highPrice, lowPrice };
}

function calcOpportunityChangePercent(price: number, highPrice?: number): number | undefined {
  if (!isFinitePositive(price) || !isFinitePositive(highPrice)) return undefined;
  return ((price - highPrice) / highPrice) * 100;
}

function calcPercentAgainstCurrent(price: number, baseClose?: number): number | undefined {
  if (!isFinitePositive(price) || !isFinitePositive(baseClose)) return undefined;
  return ((price - baseClose) / baseClose) * 100;
}

function getCloseNPeriodsAgo(klineData: KLineData[], n: number): number | undefined {
  const idx = klineData.length - 1 - n;
  if (idx < 0) return undefined;
  const close = klineData[idx]?.close;
  return typeof close === 'number' && isFinite(close) && close > 0 ? close : undefined;
}

function calcRecentChangePercents(price: number, dailyKlines: KLineData[]) {
  const change1w = calcPercentAgainstCurrent(
    price,
    getCloseNPeriodsAgo(dailyKlines, RECENT_WINDOWS.change1w)
  );
  const change1m = calcPercentAgainstCurrent(
    price,
    getCloseNPeriodsAgo(dailyKlines, RECENT_WINDOWS.change1m)
  );
  const change1q = calcPercentAgainstCurrent(
    price,
    getCloseNPeriodsAgo(dailyKlines, RECENT_WINDOWS.change1q)
  );
  const change6m = calcPercentAgainstCurrent(
    price,
    getCloseNPeriodsAgo(dailyKlines, RECENT_WINDOWS.change6m)
  );
  const change1y = calcPercentAgainstCurrent(
    price,
    getCloseNPeriodsAgo(dailyKlines, RECENT_WINDOWS.change1y)
  );

  return { change1w, change1m, change1q, change6m, change1y };
}

function calcLatestKDJ(klineData: KLineData[]) {
  try {
    const kdj = calculateKDJ(klineData);
    return {
      kdjK: lastFinite(kdj.k),
      kdjD: lastFinite(kdj.d),
      kdjJ: lastFinite(kdj.j),
    };
  } catch {
    return { kdjK: undefined, kdjD: undefined, kdjJ: undefined };
  }
}

function calcLatestMAs(klineData: KLineData[]) {
  const result: Partial<
    Pick<
      StockOpportunityData,
      'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60' | 'ma120' | 'ma240' | 'ma360'
    >
  > = {};

  for (const p of MA_PERIODS) {
    const ma = calculateMA(klineData, p);
    const v = lastFinite(ma);
    (result as any)[`ma${p}`] = v;
  }

  return result;
}

async function analyzeOneStock(
  stock: StockInfo,
  quote: {
    code: string;
    name: string;
    price: number;
    high: number;
    low: number;
    volume: number;
    amount: number;
  },
  period: KLinePeriod,
  count: number,
  cancelledRef: { cancelled: boolean }
): Promise<StockOpportunityData> {
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

  // 近一周/近一月/近一季/近半年/近一年：统一按“日线”计算（与当前价对比）
  // - 当period=day时复用本次K线
  // - 否则额外拉取日线（至少260条，覆盖近一年窗口）
  let dailyKlines: KLineData[] = klineData;
  if (period !== 'day') {
    dailyKlines = await getKLineData(code, 'day', Math.max(260, count)).catch(() => []);
  }
  const recentChange =
    dailyKlines && dailyKlines.length > 0 ? calcRecentChangePercents(quote.price, dailyKlines) : {};

  const { avgPrice, highPrice, lowPrice } = calcHighLowAvg(klineData, {
    price: quote.price,
    high: quote.high,
    low: quote.low,
  });

  const opportunityChangePercent = calcOpportunityChangePercent(quote.price, highPrice);
  const { kdjK, kdjD, kdjJ } = calcLatestKDJ(klineData);
  const maFields = calcLatestMAs(klineData);

  // 与数据概况页保持一致：volume/amount 先转为“亿单位”再显示
  const volume = Number((quote.volume / 100000000).toFixed(2));
  const amount = Number((quote.amount / 100000000).toFixed(2));

  return {
    code,
    name: quote.name || stock.name,
    price: quote.price,
    opportunityChangePercent,
    ...(recentChange as any),
    avgPrice,
    highPrice,
    lowPrice,
    volume,
    amount,
    marketCap: detail?.marketCap,
    circulatingMarketCap: detail?.circulatingMarketCap,
    peRatio: detail?.peRatio,
    turnoverRate: detail?.turnoverRate,
    kdjK: kdjK !== undefined ? Number(kdjK.toFixed(2)) : undefined,
    kdjD: kdjD !== undefined ? Number(kdjD.toFixed(2)) : undefined,
    kdjJ: kdjJ !== undefined ? Number(kdjJ.toFixed(2)) : undefined,
    ma5: maFields.ma5 !== undefined ? Number(maFields.ma5.toFixed(2)) : undefined,
    ma10: maFields.ma10 !== undefined ? Number(maFields.ma10.toFixed(2)) : undefined,
    ma20: maFields.ma20 !== undefined ? Number(maFields.ma20.toFixed(2)) : undefined,
    ma30: maFields.ma30 !== undefined ? Number(maFields.ma30.toFixed(2)) : undefined,
    ma60: maFields.ma60 !== undefined ? Number(maFields.ma60.toFixed(2)) : undefined,
    ma120: maFields.ma120 !== undefined ? Number(maFields.ma120.toFixed(2)) : undefined,
    ma240: maFields.ma240 !== undefined ? Number(maFields.ma240.toFixed(2)) : undefined,
    ma360: maFields.ma360 !== undefined ? Number(maFields.ma360.toFixed(2)) : undefined,
    analyzedAt,
  };
}

/**
 * 分析股票列表（机会分析）
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
  }>;
  cancel: () => void;
} {
  if (stocks.length === 0) {
    return {
      promise: Promise.resolve({ results: [], errors: [] }),
      cancel: () => {},
    };
  }

  const cancelledRef = { cancelled: false };
  let manager: ConcurrencyManager<{ code: string; data: StockOpportunityData }> | null = null;

  const cancel = () => {
    cancelledRef.cancelled = true;
    if (manager) {
      manager.cancel();
    }
  };

  const promise = (async () => {
    const errors: Array<{ stock: StockInfo; error: Error }> = [];
    const results: StockOpportunityData[] = [];

    onProgress?.({ total: stocks.length, completed: 0, failed: 0, percent: 0 });

    // Step 1：批量行情
    const codes = stocks.map((s) => s.code);
    const quotes = await getStockQuotes(codes);

    if (cancelledRef.cancelled) {
      return { results, errors };
    }

    const quotesMap = new Map<string, (typeof quotes)[0]>();
    quotes.forEach((q) => quotesMap.set(q.code, q));

    // Step 2：按批处理并发分析（每批3只，批次间隔1.2s）
    manager = new ConcurrencyManager<{ code: string; data: StockOpportunityData }>({
      maxConcurrency: OPPORTUNITY_CONCURRENT_LIMIT,
      batchDelay: OPPORTUNITY_BATCH_DELAY,
      onProgress: (p) => {
        onProgress?.({
          total: stocks.length,
          completed: p.completed,
          failed: p.failed,
          percent: p.percent,
        });
      },
    });

    stocks.forEach((stock) => {
      const quote = quotesMap.get(stock.code);
      if (!quote) {
        errors.push({ stock, error: new Error('获取行情数据失败') });
        return;
      }

      manager!.addTask({
        id: stock.code,
        fn: async () => {
          const data = await analyzeOneStock(
            stock,
            {
              code: quote.code,
              name: quote.name,
              price: quote.price,
              high: quote.high,
              low: quote.low,
              volume: quote.volume,
              amount: quote.amount,
            },
            period,
            count,
            cancelledRef
          );
          return { code: stock.code, data };
        },
      });
    });

    const { results: taskResults, errors: taskErrors } = await manager.start();

    // 任务错误转换
    taskErrors.forEach((err) => {
      const stock = stocks.find((s) => s.code === err.task.id);
      if (stock) {
        errors.push({ stock, error: err.error });
      }
    });

    // 合并成最终列表（每只股票一行）
    const analyzedAt = Date.now();
    stocks.forEach((stock) => {
      const quote = quotesMap.get(stock.code);
      if (!quote) {
        // 已记录错误
        return;
      }

      const task = taskResults.find((r) => r.code === stock.code);
      if (task?.data) {
        results.push(task.data);
        return;
      }

      const err = errors.find((e) => e.stock.code === stock.code);
      // 同样保持 volume/amount 的“亿单位”转换逻辑
      results.push({
        code: stock.code,
        name: quote.name || stock.name,
        price: quote.price || 0,
        volume: Number(((quote.volume || 0) / 100000000).toFixed(2)),
        amount: Number(((quote.amount || 0) / 100000000).toFixed(2)),
        analyzedAt,
        error: err?.error.message || '分析失败',
      });
    });

    return { results, errors };
  })().catch((e) => {
    const err = e instanceof Error ? e : new Error(String(e));
    const errors: Array<{ stock: StockInfo; error: Error }> = stocks.map((s) => ({
      stock: s,
      error: err,
    }));
    return { results: [], errors };
  });

  return { promise, cancel };
}
