/**
 * 横盘分析工具函数
 */

import type { KLineData } from '@/types/stock';
import { calculateMA } from './indicators';

/**
 * 价格波动率法分析
 * @param klineData K线数据
 * @param period 分析周期数
 * @param threshold 波动阈值（百分比，如 5 表示5%）
 */
export function calculatePriceVolatility(
  klineData: KLineData[],
  period: number,
  threshold: number
): {
  isConsolidation: boolean;
  volatility: number;
  strength: number;
} {
  if (!klineData || klineData.length < period) {
    return {
      isConsolidation: false,
      volatility: 0,
      strength: 0,
    };
  }

  // 取最近N个周期
  const recent = klineData.slice(-period);

  // 计算最高价、最低价、平均收盘价
  const high = Math.max(...recent.map((k) => k.high));
  const low = Math.min(...recent.map((k) => k.low));
  const avg = recent.reduce((sum, k) => sum + k.close, 0) / recent.length;

  if (avg <= 0) {
    return {
      isConsolidation: false,
      volatility: 0,
      strength: 0,
    };
  }

  // 计算波动率
  const volatility = ((high - low) / avg) * 100;

  // 判断是否横盘
  const isConsolidation = volatility < threshold;

  // 计算强度（波动率越小，强度越高）
  // 当波动率为0时，强度为100；当波动率等于阈值时，强度为0
  const strength = Math.max(0, Math.min(100, 100 - (volatility / threshold) * 100));

  return {
    isConsolidation,
    volatility: Number(volatility.toFixed(2)),
    strength: Number(strength.toFixed(2)),
  };
}

/**
 * MA收敛法分析
 * @param klineData K线数据
 * @param period 分析周期数
 * @param threshold MA离散度阈值（百分比，如 3 表示3%）
 */
export function calculateMAConvergence(
  klineData: KLineData[],
  period: number,
  threshold: number
): {
  isConsolidation: boolean;
  maSpread: number;
  strength: number;
} {
  if (!klineData || klineData.length < period) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 根据period动态选择MA周期
  // 短期（period <= 10）：使用MA5、MA10、MA20
  // 中期（10 < period <= 20）：使用MA10、MA20、MA30
  // 长期（period > 20）：使用MA20、MA30、MA60
  let maPeriods: [number, number, number];
  if (period <= 10) {
    maPeriods = [5, 10, 20];
  } else if (period <= 20) {
    maPeriods = [10, 20, 30];
  } else {
    maPeriods = [20, 30, 60];
  }

  // 确保有足够的数据计算最长的MA
  const maxMAPeriod = Math.max(...maPeriods);
  if (klineData.length < maxMAPeriod) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算选定的MA
  const ma1 = calculateMA(klineData, maPeriods[0]);
  const ma2 = calculateMA(klineData, maPeriods[1]);
  const ma3 = calculateMA(klineData, maPeriods[2]);

  // 获取最后有效的MA值
  const getLastValid = (arr: number[]): number | null => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const val = arr[i];
      if (typeof val === 'number' && isFinite(val) && !isNaN(val) && val > 0) {
        return val;
      }
    }
    return null;
  };

  const lastMA1 = getLastValid(ma1);
  const lastMA2 = getLastValid(ma2);
  const lastMA3 = getLastValid(ma3);

  if (!lastMA1 || !lastMA2 || !lastMA3) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算三条MA的平均值
  const avgMA = (lastMA1 + lastMA2 + lastMA3) / 3;

  if (avgMA <= 0) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算每条MA与平均值的最大偏差
  const spread = Math.max(
    Math.abs(lastMA1 - avgMA),
    Math.abs(lastMA2 - avgMA),
    Math.abs(lastMA3 - avgMA)
  );

  // 计算MA离散度
  const maSpread = (spread / avgMA) * 100;

  // 判断是否横盘
  const isConsolidation = maSpread < threshold;

  // 计算强度（离散度越小，强度越高）
  const strength = Math.max(0, Math.min(100, 100 - (maSpread / threshold) * 100));

  return {
    isConsolidation,
    maSpread: Number(maSpread.toFixed(2)),
    strength: Number(strength.toFixed(2)),
  };
}

/**
 * 成交量分析
 * @param klineData K线数据
 * @param period 分析周期数
 * @param shrinkingThreshold 缩量阈值（百分比，如 80 表示80%）
 */
export function analyzeVolume(
  klineData: KLineData[],
  period: number,
  shrinkingThreshold: number
): {
  avgVolumeRatio: number;
  isVolumeShrinking: boolean;
} {
  if (!klineData || klineData.length < period * 2) {
    return {
      avgVolumeRatio: 100,
      isVolumeShrinking: false,
    };
  }

  // 最近N个周期的平均成交量
  const recent = klineData.slice(-period);
  const avgRecentVolume = recent.reduce((sum, k) => sum + k.volume, 0) / recent.length;

  // 更长期（2倍周期）的平均成交量
  const longTerm = klineData.slice(-period * 2, -period);
  const avgLongTermVolume =
    longTerm.length > 0
      ? longTerm.reduce((sum, k) => sum + k.volume, 0) / longTerm.length
      : avgRecentVolume;

  if (avgLongTermVolume <= 0) {
    return {
      avgVolumeRatio: 100,
      isVolumeShrinking: false,
    };
  }

  // 成交量比率
  const volumeRatio = (avgRecentVolume / avgLongTermVolume) * 100;

  // 是否缩量
  const isVolumeShrinking = volumeRatio < shrinkingThreshold;

  return {
    avgVolumeRatio: Number(volumeRatio.toFixed(2)),
    isVolumeShrinking,
  };
}

/**
 * 价格位置分析
 * @param klineData K线数据
 * @param period 分析周期数
 * @param currentPrice 当前价格
 */
export function calculatePricePosition(
  klineData: KLineData[],
  period: number,
  currentPrice: number
): {
  relativeToHigh: number;
  relativeToLow: number;
  positionInRange: number;
  recentHigh: number;
  recentLow: number;
} {
  if (!klineData || klineData.length < period || currentPrice <= 0) {
    return {
      relativeToHigh: 0,
      relativeToLow: 0,
      positionInRange: 50,
      recentHigh: currentPrice,
      recentLow: currentPrice,
    };
  }

  // 取最近N个周期
  const recent = klineData.slice(-period);

  // 计算最高价和最低价
  const recentHigh = Math.max(...recent.map((k) => k.high));
  const recentLow = Math.min(...recent.map((k) => k.low));

  if (recentHigh <= 0 || recentLow <= 0 || recentHigh < recentLow) {
    return {
      relativeToHigh: 0,
      relativeToLow: 0,
      positionInRange: 50,
      recentHigh: currentPrice,
      recentLow: currentPrice,
    };
  }

  // 相对高点位置（从最高点下跌的幅度）
  const relativeToHigh = ((recentHigh - currentPrice) / recentHigh) * 100;

  // 相对低点位置（从最低点上涨的幅度）
  const relativeToLow = ((currentPrice - recentLow) / recentLow) * 100;

  // 当前价在价格区间的位置（0-100）
  const priceRange = recentHigh - recentLow;
  const positionInRange = priceRange > 0 ? ((currentPrice - recentLow) / priceRange) * 100 : 50;

  return {
    relativeToHigh: Number(relativeToHigh.toFixed(2)),
    relativeToLow: Number(relativeToLow.toFixed(2)),
    positionInRange: Number(positionInRange.toFixed(2)),
    recentHigh: Number(recentHigh.toFixed(2)),
    recentLow: Number(recentLow.toFixed(2)),
  };
}

/**
 * 分析横盘前趋势
 * @param klineData K线数据
 * @param period 横盘周期数
 * @param trendPeriod 分析趋势的周期数（默认30天）
 */
export function analyzeTrendBefore(
  klineData: KLineData[],
  period: number,
  trendPeriod: number = 30
): {
  direction: 'up' | 'down' | 'sideways' | 'volatile';
  changePercent: number;
  daysBefore: number;
  hasDeepDrop: boolean;
  hasRebound: boolean;
  isVolatile: boolean;
  volatileType?: 'up_down' | 'down_up' | 'sideways_up' | 'sideways_down' | 'multiple';
} {
  if (!klineData || klineData.length < period + trendPeriod) {
    return {
      direction: 'sideways',
      changePercent: 0,
      daysBefore: 0,
      hasDeepDrop: false,
      hasRebound: false,
      isVolatile: false,
    };
  }

  // 横盘区间：最近period个周期
  const consolidationRange = klineData.slice(-period);
  const consolidationStart = consolidationRange[0];
  const consolidationEnd = consolidationRange[consolidationRange.length - 1];

  // 横盘前趋势区间：往前推trendPeriod个周期
  const trendRange = klineData.slice(-period - trendPeriod, -period);
  if (trendRange.length === 0) {
    return {
      direction: 'sideways',
      changePercent: 0,
      daysBefore: 0,
      hasDeepDrop: false,
      hasRebound: false,
      isVolatile: false,
    };
  }

  const trendStart = trendRange[0];
  const trendEnd = trendRange[trendRange.length - 1];

  // 计算横盘前涨跌幅
  const changePercent = ((trendEnd.close - trendStart.close) / trendStart.close) * 100;

  // 分析趋势方向
  // 计算趋势区间的最高价和最低价
  const trendHigh = Math.max(...trendRange.map((k) => k.high));
  const trendLow = Math.min(...trendRange.map((k) => k.low));
  const trendRangeSize = ((trendHigh - trendLow) / trendStart.close) * 100;

  // 判断趋势方向
  let direction: 'up' | 'down' | 'sideways' | 'volatile';
  const absChange = Math.abs(changePercent);

  // 如果波动较大（>15%），可能是震荡
  if (trendRangeSize > 15) {
    direction = 'volatile';
  } else if (absChange < 3) {
    // 涨跌幅小于3%，认为是横盘
    direction = 'sideways';
  } else if (changePercent > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  // 检测深跌：寻找趋势区间内的最大跌幅
  let hasDeepDrop = false;
  let maxDrop = 0;
  let deepDropIndex = -1;
  for (let i = 1; i < trendRange.length; i++) {
    const prevHigh = Math.max(...trendRange.slice(0, i).map((k) => k.high));
    const currentLow = trendRange[i].low;
    if (prevHigh > 0 && currentLow < prevHigh) {
      const drop = ((prevHigh - currentLow) / prevHigh) * 100;
      if (drop > maxDrop) {
        maxDrop = drop;
        deepDropIndex = i;
      }
    }
  }
  // 如果最大跌幅>8%，认为有深跌
  hasDeepDrop = maxDrop > 8;

  // 检测反弹：在深跌后是否有明显上涨
  let hasRebound = false;
  if (hasDeepDrop && deepDropIndex >= 0) {
    // 从深跌点往后看，是否有反弹
    const afterDrop = trendRange.slice(deepDropIndex);
    if (afterDrop.length > 1) {
      const dropLow = Math.min(...afterDrop.map((k) => k.low));
      const reboundHigh = Math.max(...afterDrop.map((k) => k.high));
      if (reboundHigh > dropLow) {
        const rebound = ((reboundHigh - dropLow) / dropLow) * 100;
        // 反弹超过5%，认为有反弹
        hasRebound = rebound > 5;
      }
    }
  }

  // 检测是否有上涨阶段（用于情况1：横盘→上涨→下跌→横盘）
  // 将趋势区间分成3段，检测是否有上涨→下跌的模式
  let hasUpThenDown = false;
  if (trendRange.length >= 6) {
    const segmentSize = Math.floor(trendRange.length / 3);
    const segment1 = trendRange.slice(0, segmentSize);
    const segment2 = trendRange.slice(segmentSize, segmentSize * 2);
    const segment3 = trendRange.slice(segmentSize * 2);

    const getSegmentChange = (seg: KLineData[]): number => {
      if (seg.length < 2) return 0;
      return ((seg[seg.length - 1].close - seg[0].close) / seg[0].close) * 100;
    };

    const change1 = getSegmentChange(segment1);
    const change2 = getSegmentChange(segment2);
    const change3 = getSegmentChange(segment3);

    // 如果有上涨阶段（change1或change2>3%）然后下跌（change3<-3%），认为有上涨→下跌
    if ((change1 > 3 || change2 > 3) && change3 < -3) {
      hasUpThenDown = true;
    }
  }

  // 检测反复震荡
  let isVolatile = false;
  let volatileType: 'up_down' | 'down_up' | 'sideways_up' | 'sideways_down' | 'multiple' | undefined;

  if (direction === 'volatile' || trendRangeSize > 12) {
    isVolatile = true;

    // 分析震荡类型
    // 将趋势区间分成3段，分析每段的趋势
    const segmentSize = Math.floor(trendRange.length / 3);
    const segment1 = trendRange.slice(0, segmentSize);
    const segment2 = trendRange.slice(segmentSize, segmentSize * 2);
    const segment3 = trendRange.slice(segmentSize * 2);

    const getSegmentTrend = (seg: KLineData[]): 'up' | 'down' | 'sideways' => {
      if (seg.length < 2) return 'sideways';
      const segChange = ((seg[seg.length - 1].close - seg[0].close) / seg[0].close) * 100;
      if (Math.abs(segChange) < 2) return 'sideways';
      return segChange > 0 ? 'up' : 'down';
    };

    const trend1 = getSegmentTrend(segment1);
    const trend2 = getSegmentTrend(segment2);
    const trend3 = getSegmentTrend(segment3);

    // 判断震荡类型
    if (trend1 === 'up' && trend2 === 'down' && trend3 === 'up') {
      volatileType = 'up_down';
    } else if (trend1 === 'down' && trend2 === 'up' && trend3 === 'down') {
      volatileType = 'down_up';
    } else if (trend1 === 'sideways' && (trend2 === 'up' || trend3 === 'up')) {
      volatileType = 'sideways_up';
    } else if (trend1 === 'sideways' && (trend2 === 'down' || trend3 === 'down')) {
      volatileType = 'sideways_down';
    } else {
      volatileType = 'multiple';
    }
  }

  return {
    direction,
    changePercent: Number(changePercent.toFixed(2)),
    daysBefore: trendRange.length,
    hasDeepDrop,
    hasRebound,
    isVolatile,
    volatileType,
    hasUpThenDown,
  };
}

/**
 * 综合横盘分析
 * @param klineData K线数据
 * @param options 分析选项
 */
export function calculateConsolidation(
  klineData: KLineData[],
  options: {
    period: number;
    priceVolatilityThreshold: number;
    maSpreadThreshold: number;
    volumeShrinkingThreshold: number;
    currentPrice?: number;
    trendPeriod?: number;
  }
) {
  const {
    period,
    priceVolatilityThreshold,
    maSpreadThreshold,
    volumeShrinkingThreshold,
    currentPrice,
    trendPeriod = 30,
  } = options;

  // 价格波动率分析
  const priceVolatility = calculatePriceVolatility(klineData, period, priceVolatilityThreshold);

  // MA收敛分析
  const maConvergence = calculateMAConvergence(klineData, period, maSpreadThreshold);

  // 成交量分析
  const volumeAnalysis = analyzeVolume(klineData, period, volumeShrinkingThreshold);

  // 价格位置分析（如果有当前价格）
  let pricePosition;
  if (currentPrice && currentPrice > 0) {
    pricePosition = calculatePricePosition(klineData, period, currentPrice);
  }

  // 横盘前趋势分析
  const trendBefore = analyzeTrendBefore(klineData, period, trendPeriod);

  // 综合判断
  // 如果两种方法都满足，则综合判断为横盘
  const isCombinedConsolidation = priceVolatility.isConsolidation && maConvergence.isConsolidation;

  // 综合强度：取两种方法的强度平均值
  const combinedStrength =
    (priceVolatility.strength + maConvergence.strength) / 2;

  return {
    priceVolatility,
    maConvergence,
    combined: {
      isConsolidation: isCombinedConsolidation,
      strength: Number(combinedStrength.toFixed(2)),
    },
    volumeAnalysis,
    pricePosition,
    trendBefore,
  };
}

