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
  if (!klineData || klineData.length < Math.max(period, 20)) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算MA5、MA10、MA20
  const ma5 = calculateMA(klineData, 5);
  const ma10 = calculateMA(klineData, 10);
  const ma20 = calculateMA(klineData, 20);

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

  const lastMA5 = getLastValid(ma5);
  const lastMA10 = getLastValid(ma10);
  const lastMA20 = getLastValid(ma20);

  if (!lastMA5 || !lastMA10 || !lastMA20) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算三条MA的平均值
  const avgMA = (lastMA5 + lastMA10 + lastMA20) / 3;

  if (avgMA <= 0) {
    return {
      isConsolidation: false,
      maSpread: 0,
      strength: 0,
    };
  }

  // 计算每条MA与平均值的最大偏差
  const spread = Math.max(
    Math.abs(lastMA5 - avgMA),
    Math.abs(lastMA10 - avgMA),
    Math.abs(lastMA20 - avgMA)
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
  }
) {
  const { period, priceVolatilityThreshold, maSpreadThreshold, volumeShrinkingThreshold } =
    options;

  // 价格波动率分析
  const priceVolatility = calculatePriceVolatility(klineData, period, priceVolatilityThreshold);

  // MA收敛分析
  const maConvergence = calculateMAConvergence(klineData, period, maSpreadThreshold);

  // 成交量分析
  const volumeAnalysis = analyzeVolume(klineData, period, volumeShrinkingThreshold);

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
  };
}

