/**
 * 技术指标计算工具函数
 */

import type { KLineData } from '@/types/stock';

/**
 * 计算RSI指标（相对强弱指数）
 * @param klineData K线数据
 * @param period RSI周期，默认14
 * @returns RSI值数组，前period个值为null
 */
export function calculateRSI(klineData: KLineData[], period: number = 14): (number | null)[] {
  const len = klineData.length;
  const rsi: (number | null)[] = new Array(len).fill(null);

  if (len < period + 1) {
    return rsi;
  }

  // 计算价格变化
  const changes: number[] = [];
  for (let i = 1; i < len; i++) {
    changes.push(klineData[i].close - klineData[i - 1].close);
  }

  // 计算初始平均 gains 和 losses
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // 计算第一个RSI
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);
  }

  // 计算后续RSI
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return rsi;
}

/**
 * 计算MACD指标
 * @param klineData K线数据
 * @param fastPeriod 快线周期，默认12
 * @param slowPeriod 慢线周期，默认26
 * @param signalPeriod 信号线周期，默认9
 * @returns MACD指标对象
 */
export function calculateMACD(
  klineData: KLineData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  dif: (number | null)[];
  dea: (number | null)[];
  macd: (number | null)[];
} {
  const len = klineData.length;
  const closes = klineData.map((k) => k.close);

  // 计算EMA
  function calculateEMA(data: number[], period: number): (number | null)[] {
    const ema: (number | null)[] = new Array(data.length).fill(null);
    if (data.length < period) {
      return ema;
    }

    // 第一个EMA值是简单移动平均
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    ema[period - 1] = sum / period;

    // 后续EMA值
    const multiplier = 2 / (period + 1);
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i] - (ema[i - 1] as number)) * multiplier + (ema[i - 1] as number);
    }

    return ema;
  }

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  // 计算DIF (快线 - 慢线)
  const dif: (number | null)[] = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif[i] = (emaFast[i] as number) - (emaSlow[i] as number);
    }
  }

  // 计算DEA (DIF的EMA)
  const validDif = dif.filter((v): v is number => v !== null);
  const deaRaw = calculateEMA(validDif, signalPeriod);

  const dea: (number | null)[] = new Array(len).fill(null);
  let deaIndex = 0;
  for (let i = 0; i < len; i++) {
    if (dif[i] !== null) {
      if (deaIndex < deaRaw.length && deaRaw[deaIndex] !== null) {
        dea[i] = deaRaw[deaIndex];
      }
      deaIndex++;
    }
  }

  // 计算MACD柱 (DIF - DEA) * 2
  const macd: (number | null)[] = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (dif[i] !== null && dea[i] !== null) {
      macd[i] = ((dif[i] as number) - (dea[i] as number)) * 2;
    }
  }

  return { dif, dea, macd };
}

/**
 * 检测MACD金叉
 * @param dif DIF数组
 * @param dea DEA数组
 * @param index 当前索引
 * @returns 是否金叉
 */
export function isMACDGoldenCross(
  dif: (number | null)[],
  dea: (number | null)[],
  index: number
): boolean {
  if (index < 1 || !dif[index] || !dea[index] || !dif[index - 1] || !dea[index - 1]) {
    return false;
  }

  const currentDif = dif[index] as number;
  const currentDea = dea[index] as number;
  const prevDif = dif[index - 1] as number;
  const prevDea = dea[index - 1] as number;

  // 金叉：DIF从下向上穿越DEA
  return prevDif <= prevDea && currentDif > currentDea;
}

/**
 * 检测MACD死叉
 * @param dif DIF数组
 * @param dea DEA数组
 * @param index 当前索引
 * @returns 是否死叉
 */
export function isMACDDeathCross(
  dif: (number | null)[],
  dea: (number | null)[],
  index: number
): boolean {
  if (index < 1 || !dif[index] || !dea[index] || !dif[index - 1] || !dea[index - 1]) {
    return false;
  }

  const currentDif = dif[index] as number;
  const currentDea = dea[index] as number;
  const prevDif = dif[index - 1] as number;
  const prevDea = dea[index - 1] as number;

  // 死叉：DIF从上向下穿越DEA
  return prevDif >= prevDea && currentDif < currentDea;
}

/**
 * 检测MACD背离（使用局部极值点）
 * @param klineData K线数据
 * @param dif DIF数组
 * @param lookback 回溯周期
 * @returns 是否存在背离
 */
export function hasMACDDivergence(
  klineData: KLineData[],
  dif: (number | null)[],
  lookback: number = 20
): boolean {
  const len = klineData.length;
  if (len < lookback + 10) {
    return false;
  }

  // 提取有效数据
  const closes = klineData.map((k) => k.close);
  const validDif = dif.map((d) => d ?? 0); // 将null替换为0

  // 查找局部极值点的辅助函数
  function findLocalPeaks(data: number[], windowSize: number): number[] {
    const peaks: number[] = [];
    for (let i = windowSize; i < data.length - windowSize; i++) {
      let isPeak = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j !== i && data[j] >= data[i]) {
          isPeak = false;
          break;
        }
      }
      if (isPeak) peaks.push(i);
    }
    return peaks;
  }

  function findLocalValleys(data: number[], windowSize: number): number[] {
    const valleys: number[] = [];
    for (let i = windowSize; i < data.length - windowSize; i++) {
      let isValley = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j !== i && data[j] <= data[i]) {
          isValley = false;
          break;
        }
      }
      if (isValley) valleys.push(i);
    }
    return valleys;
  }

  // 在回溯窗口内查找最近的两个波峰和波谷
  const windowStart = Math.max(0, len - lookback);
  const windowCloses = closes.slice(windowStart);
  const windowDif = validDif.slice(windowStart);

  const pricePeaks = findLocalPeaks(windowCloses, 2).slice(-2);
  const priceValleys = findLocalValleys(windowCloses, 2).slice(-2);
  const difPeaks = findLocalPeaks(windowDif, 2).slice(-2);
  const difValleys = findLocalValleys(windowDif, 2).slice(-2);

  // 顶背离：价格第二个峰更高，但DIF第二个峰更低
  if (pricePeaks.length >= 2 && difPeaks.length >= 2) {
    const priceHigher = windowCloses[pricePeaks[1]] > windowCloses[pricePeaks[0]];
    const difLower = windowDif[difPeaks[1]] < windowDif[difPeaks[0]];
    if (priceHigher && difLower) {
      return true;
    }
  }

  // 底背离：价格第二个谷更低，但DIF第二个谷更高
  if (priceValleys.length >= 2 && difValleys.length >= 2) {
    const priceLower = windowCloses[priceValleys[1]] < windowCloses[priceValleys[0]];
    const difHigher = windowDif[difValleys[1]] > windowDif[difValleys[0]];
    if (priceLower && difHigher) {
      return true;
    }
  }

  return false;
}

/**
 * 计算布林带
 * @param klineData K线数据
 * @param period 周期，默认20
 * @param stdDev 标准差倍数，默认2
 * @returns 布林带上中下轨
 */
export function calculateBollingerBands(
  klineData: KLineData[],
  period: number = 20,
  stdDev: number = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const len = klineData.length;
  const upper: (number | null)[] = new Array(len).fill(null);
  const middle: (number | null)[] = new Array(len).fill(null);
  const lower: (number | null)[] = new Array(len).fill(null);

  if (len < period) {
    return { upper, middle, lower };
  }

  for (let i = period - 1; i < len; i++) {
    // 计算中轨（简单移动平均）
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += klineData[j].close;
    }
    const sma = sum / period;
    middle[i] = sma;

    // 计算标准差
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(klineData[j].close - sma, 2);
    }
    const standardDeviation = Math.sqrt(variance / period);

    // 计算上下轨
    upper[i] = sma + stdDev * standardDeviation;
    lower[i] = sma - stdDev * standardDeviation;
  }

  return { upper, middle, lower };
}

/**
 * 判断价格是否在布林带上轨附近
 * @param close 收盘价
 * @param upper 上轨值
 * @param middle 中轨值
 * @param lower 下轨值
 * @param threshold 阈值比例，默认0.05（5%）
 * @returns 是否在上轨附近
 */
export function isNearUpperBand(
  close: number,
  upper: number | null,
  middle: number | null,
  lower: number | null,
  threshold: number = 0.05
): boolean {
  if (!upper || !middle || !lower) {
    return false;
  }

  const bandWidth = upper - lower;
  if (bandWidth <= 0) {
    return false;
  }

  // 价格在上轨的threshold范围内
  return close >= upper * (1 - threshold);
}

/**
 * 判断价格是否在布林带中轨附近
 * @param close 收盘价
 * @param upper 上轨值
 * @param middle 中轨值
 * @param lower 下轨值
 * @param threshold 阈值比例，默认0.05（5%）
 * @returns 是否在中轨附近
 */
export function isNearMiddleBand(
  close: number,
  upper: number | null,
  middle: number | null,
  lower: number | null,
  threshold: number = 0.05
): boolean {
  if (!middle || !upper || !lower) {
    return false;
  }

  const bandWidth = upper - lower;
  if (bandWidth <= 0) {
    return false;
  }

  // 价格在中轨的threshold范围内
  return Math.abs(close - middle) <= bandWidth * threshold;
}

/**
 * 判断价格是否在布林带下轨附近
 * @param close 收盘价
 * @param upper 上轨值
 * @param middle 中轨值
 * @param lower 下轨值
 * @param threshold 阈值比例，默认0.05（5%）
 * @returns 是否在下轨附近
 */
export function isNearLowerBand(
  close: number,
  upper: number | null,
  middle: number | null,
  lower: number | null,
  threshold: number = 0.05
): boolean {
  if (!lower || !middle || !upper) {
    return false;
  }

  const bandWidth = upper - lower;
  if (bandWidth <= 0) {
    return false;
  }

  // 价格在下轨的threshold范围内
  return close <= lower * (1 + threshold);
}
