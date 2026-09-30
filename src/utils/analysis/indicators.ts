/**
 * 技术指标计算工具
 */

import type { KLineData, StockOpportunityData } from '@/types/stock';
import { MA_PERIODS, MACD_PARAMS, KDJ_PARAMS, BOLL_PARAMS, RSI_PERIODS } from '../config/constants';
import { calculateBollingerBands } from './technicalIndicators';

/**
 * 计算移动平均线（MA）
 */
export function calculateMA(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 计算所有MA周期
 */
export function calculateAllMA(data: KLineData[]) {
  const result: Record<string, number[]> = {};
  for (const period of MA_PERIODS) {
    result[`ma${period}`] = calculateMA(data, period);
  }
  return result;
}

/**
 * 计算EMA（指数移动平均）
 */
function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[i]);
    } else {
      result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

/**
 * 计算MACD指标
 */
export function calculateMACD(data: KLineData[]) {
  const closes = data.map((d) => d.close);
  const fastEMA = calculateEMA(closes, MACD_PARAMS.fast);
  const slowEMA = calculateEMA(closes, MACD_PARAMS.slow);

  const dif = fastEMA.map((fast, i) => fast - slowEMA[i]);
  const dea = calculateEMA(dif, MACD_PARAMS.signal);
  const macd = dif.map((d, i) => (d - dea[i]) * 2);

  return { dif, dea, macd };
}

/**
 * 计算RSV（未成熟随机值）
 */
function calculateRSV(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map((d) => d.high));
      const low = Math.min(...slice.map((d) => d.low));
      const close = data[i].close;
      const rsv = ((close - low) / (high - low)) * 100;
      result.push(isNaN(rsv) ? 0 : rsv);
    }
  }
  return result;
}

/**
 * 计算KDJ指标
 */
export function calculateKDJ(data: KLineData[]) {
  const rsv = calculateRSV(data, KDJ_PARAMS.n);
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];

  for (let i = 0; i < rsv.length; i++) {
    if (isNaN(rsv[i])) {
      k.push(NaN);
      d.push(NaN);
      j.push(NaN);
    } else {
      if (i === 0) {
        k.push(50);
        d.push(50);
      } else {
        const prevK = isNaN(k[i - 1]) ? 50 : k[i - 1];
        const prevD = isNaN(d[i - 1]) ? 50 : d[i - 1];
        const newK = (2 * prevK + rsv[i]) / 3;
        const newD = (2 * prevD + newK) / 3;
        k.push(newK);
        d.push(newD);
      }
      const currentK = k[i];
      const currentD = d[i];
      j.push(3 * currentK - 2 * currentD);
    }
  }

  return { k, d, j };
}

/**
 * K 线抽屉用到的四套指标（MA5/10/20/30/60 + 布林带 + MACD + KDJ）
 */
export interface KlineIndicatorSeries {
  ma: { ma5: number[]; ma10: number[]; ma20: number[]; ma30: number[]; ma60: number[] };
  /** 布林带：缺失值（数据不足 period 根）一律归一成 NaN，与 MA 口径一致 */
  boll: { upper: number[]; middle: number[]; lower: number[] };
  macd: { dif: number[]; dea: number[]; macd: number[] };
  kdj: { k: number[]; d: number[]; j: number[] };
}

/**
 * 布林带返回 `number | null`，MA 返回 NaN：
 * 统一转成 NaN，让「断线（ECharts）」「价格区间取值（Number.isFinite）」共用一套判断。
 */
function toFiniteSeries(series: (number | null)[]): number[] {
  return series.map((value) => (value === null ? NaN : value));
}

/**
 * 一次算齐 K 线抽屉需要的全部指标。
 *
 * 统一入口的意义：主图（含布林带）、MACD 副图、KDJ 副图、以及价格区间推导必须共用同一批序列，
 * 分开调用会让 MA 被算两遍，且价格区间与主图有可能取到不同批次的数据。
 */
export function calculateKlineIndicators(data: KLineData[]): KlineIndicatorSeries {
  const boll = calculateBollingerBands(data, BOLL_PARAMS.period, BOLL_PARAMS.stdDev);
  return {
    ma: {
      ma5: calculateMA(data, 5),
      ma10: calculateMA(data, 10),
      ma20: calculateMA(data, 20),
      ma30: calculateMA(data, 30),
      ma60: calculateMA(data, 60),
    },
    boll: {
      upper: toFiniteSeries(boll.upper),
      middle: toFiniteSeries(boll.middle),
      lower: toFiniteSeries(boll.lower),
    },
    macd: calculateMACD(data),
    kdj: calculateKDJ(data),
  };
}

/**
 * 计算RSI指标
 */
export function calculateRSI(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  const closes = data.map((d) => d.close);

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let gainSum = 0;
      let lossSum = 0;

      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) {
          gainSum += change;
        } else {
          lossSum += Math.abs(change);
        }
      }

      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push(rsi);
    }
  }

  return result;
}

/**
 * 计算所有RSI周期
 */
export function calculateAllRSI(data: KLineData[]) {
  const result: Record<string, number[]> = {};
  for (const period of RSI_PERIODS) {
    result[`rsi${period}`] = calculateRSI(data, period);
  }
  return result;
}

/**
 * 辅助函数：判断是否为有限正数
 */
export function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

/**
 * 辅助函数：获取数组中最后一个有限数值
 */
export function lastFinite(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (typeof v === 'number' && isFinite(v) && !isNaN(v)) {
      return v;
    }
  }
  return undefined;
}

/**
 * 计算区间价格统计（平均价、最高价、最低价）
 */
export function calcHighLowAvg(
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

/**
 * 计算区间最大值回撤比（保留两位小数）
 */
export function calcOpportunityChangePercent(
  price: number,
  highPrice?: number
): number | undefined {
  if (!isFinitePositive(price) || !isFinitePositive(highPrice)) return undefined;
  const percent = ((price - highPrice) / highPrice) * 100;
  return Number(percent.toFixed(2));
}

/**
 * 计算最新的KDJ值
 */
export function calcLatestKDJ(klineData: KLineData[]) {
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

/**
 * 格式化KDJ值（保留两位小数）
 */
export function formatKDJValues(kdj: { kdjK?: number; kdjD?: number; kdjJ?: number }): {
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
} {
  return {
    kdjK: kdj.kdjK !== undefined ? Number(kdj.kdjK.toFixed(2)) : undefined,
    kdjD: kdj.kdjD !== undefined ? Number(kdj.kdjD.toFixed(2)) : undefined,
    kdjJ: kdj.kdjJ !== undefined ? Number(kdj.kdjJ.toFixed(2)) : undefined,
  };
}

/**
 * 计算各MA周期的涨跌幅
 */
export function calcLatestMAs(klineData: KLineData[], currentPrice: number) {
  const result: Partial<
    Pick<
      StockOpportunityData,
      'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60' | 'ma120' | 'ma240' | 'ma360'
    >
  > = {};

  if (!isFinitePositive(currentPrice)) {
    return result;
  }

  for (const p of MA_PERIODS) {
    const ma = calculateMA(klineData, p);
    const maValue = lastFinite(ma);
    if (maValue !== undefined && isFinitePositive(maValue)) {
      // 计算涨跌幅百分比：(当前价 / MA值 - 1) * 100
      const changePercent = (currentPrice / maValue - 1) * 100;
      (result as any)[`ma${p}`] = Number(changePercent.toFixed(2));
    }
  }

  return result;
}

/**
 * 计算所有技术指标（KDJ、价格统计、回撤比、MA）
 */
export function calcAllIndicators(
  klineData: KLineData[],
  quote: { price: number; high: number; low: number }
): {
  kdj: { kdjK?: number; kdjD?: number; kdjJ?: number };
  priceStats: { avgPrice?: number; highPrice?: number; lowPrice?: number };
  opportunityChangePercent?: number;
  maFields: Partial<
    Pick<
      StockOpportunityData,
      'ma5' | 'ma10' | 'ma20' | 'ma30' | 'ma60' | 'ma120' | 'ma240' | 'ma360'
    >
  >;
} {
  const kdj = calcLatestKDJ(klineData);
  const priceStats = calcHighLowAvg(klineData, quote);
  const opportunityChangePercent = calcOpportunityChangePercent(quote.price, priceStats.highPrice);
  const maFields = calcLatestMAs(klineData, quote.price);

  return {
    kdj,
    priceStats,
    opportunityChangePercent,
    maFields,
  };
}
