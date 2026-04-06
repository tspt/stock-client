/**
 * 趋势形态识别工具函数
 */

import type { KLineData } from '@/types/stock';

/**
 * 判断是否为上升趋势
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @returns 是否为上升趋势
 */
export function isUptrend(klineData: KLineData[], lookback: number = 20): boolean {
  const len = klineData.length;
  if (len < lookback) return false;

  const recent = klineData.slice(-lookback);

  // 简单判断：最近的价格整体呈上升趋势
  // 使用线性回归斜率来判断
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  const n = recent.length;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recent[i].close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  // 计算斜率
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // 如果斜率为正且显著，则认为是上升趋势
  const avgPrice = sumY / n;
  return slope > avgPrice * 0.001; // 斜率大于平均价格的0.1%
}

/**
 * 判断是否为下降趋势
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @returns 是否为下降趋势
 */
export function isDowntrend(klineData: KLineData[], lookback: number = 20): boolean {
  const len = klineData.length;
  if (len < lookback) return false;

  const recent = klineData.slice(-lookback);

  // 使用线性回归斜率来判断
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  const n = recent.length;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recent[i].close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  // 计算斜率
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // 如果斜率为负且显著，则认为是下降趋势
  const avgPrice = sumY / n;
  return slope < -avgPrice * 0.001; // 斜率小于平均价格的-0.1%
}

/**
 * 判断是否为横盘整理
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @param threshold 波动阈值（百分比），默认5%
 * @returns 是否为横盘整理
 */
export function isSideways(
  klineData: KLineData[],
  lookback: number = 20,
  threshold: number = 5
): boolean {
  const len = klineData.length;
  if (len < lookback) return false;

  const recent = klineData.slice(-lookback);

  // 计算价格波动范围
  const highs = recent.map((k) => k.high);
  const lows = recent.map((k) => k.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);

  if (minLow <= 0) return false;

  // 波动幅度
  const volatility = ((maxHigh - minLow) / minLow) * 100;

  // 如果波动幅度小于阈值，则认为是横盘
  return volatility < threshold;
}

/**
 * 判断是否为突破形态
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @returns 是否为突破形态
 */
export function isBreakout(klineData: KLineData[], lookback: number = 20): boolean {
  const len = klineData.length;
  if (len < lookback + 1) return false;

  const recent = klineData.slice(-lookback - 1, -1); // 不包括最后一根
  const lastKline = klineData[len - 1];

  // 计算前期的最高价
  const prevHigh = Math.max(...recent.map((k) => k.high));

  // 如果最新收盘价突破前期高点，且涨幅较大
  const breakoutThreshold = prevHigh * 1.02; // 突破2%以上
  return lastKline.close > breakoutThreshold && lastKline.close > lastKline.open;
}

/**
 * 判断是否为跌破形态
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @returns 是否为跌破形态
 */
export function isBreakdown(klineData: KLineData[], lookback: number = 20): boolean {
  const len = klineData.length;
  if (len < lookback + 1) return false;

  const recent = klineData.slice(-lookback - 1, -1); // 不包括最后一根
  const lastKline = klineData[len - 1];

  // 计算前期的最低价
  const prevLow = Math.min(...recent.map((k) => k.low));

  // 如果最新收盘价跌破前期低点，且跌幅较大
  const breakdownThreshold = prevLow * 0.98; // 跌破2%以上
  return lastKline.close < breakdownThreshold && lastKline.close < lastKline.open;
}

/**
 * 检测趋势形态
 * @param klineData K线数据
 * @param lookback 回溯周期，默认20
 * @returns 趋势形态检测结果
 */
export function detectTrendPatterns(
  klineData: KLineData[],
  lookback: number = 20
): {
  uptrend: boolean;
  downtrend: boolean;
  sideways: boolean;
  breakout: boolean;
  breakdown: boolean;
} {
  const len = klineData.length;

  if (len < lookback) {
    return {
      uptrend: false,
      downtrend: false,
      sideways: false,
      breakout: false,
      breakdown: false,
    };
  }

  return {
    uptrend: isUptrend(klineData, lookback),
    downtrend: isDowntrend(klineData, lookback),
    sideways: isSideways(klineData, lookback),
    breakout: isBreakout(klineData, lookback),
    breakdown: isBreakdown(klineData, lookback),
  };
}
