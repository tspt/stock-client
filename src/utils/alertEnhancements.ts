/**
 * 智能预警系统增强工具
 * 包含支撑阻力位识别、成交量异常检测、技术指标金叉死叉检测等功能
 */

import type { KLineData, IndicatorType } from '@/types/stock';
import { calculateMA, calculateMACD, calculateKDJ, calculateRSI } from './indicators';

/**
 * 支撑阻力位识别结果
 */
export interface SupportResistanceResult {
  /** 支撑位列表（从近到远） */
  supportLevels: number[];
  /** 阻力位列表（从近到远） */
  resistanceLevels: number[];
  /** 当前价格附近的支撑位 */
  nearestSupport?: number;
  /** 当前价格附近的阻力位 */
  nearestResistance?: number;
}

/**
 * 支撑阻力位配置
 */
export interface SupportResistanceConfig {
  /** 回溯周期（天数） */
  lookbackPeriod: number;
  /** 局部极值窗口大小 */
  localExtremumWindow: number;
  /** 聚类容差（百分比） */
  clusteringTolerance: number;
  /** 最小聚类数量 */
  minClusterSize: number;
}

const DEFAULT_SR_CONFIG: SupportResistanceConfig = {
  lookbackPeriod: 60,
  localExtremumWindow: 5,
  clusteringTolerance: 0.02, // 2%
  minClusterSize: 2,
};

/**
 * 识别局部高点
 */
function findLocalHighs(klineData: KLineData[], window: number): number[] {
  const highs: number[] = [];
  const len = klineData.length;

  for (let i = window; i < len - window; i++) {
    const current = klineData[i].high;
    let isLocalHigh = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && klineData[j].high >= current) {
        isLocalHigh = false;
        break;
      }
    }

    if (isLocalHigh) {
      highs.push(current);
    }
  }

  return highs;
}

/**
 * 识别局部低点
 */
function findLocalLows(klineData: KLineData[], window: number): number[] {
  const lows: number[] = [];
  const len = klineData.length;

  for (let i = window; i < len - window; i++) {
    const current = klineData[i].low;
    let isLocalLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && klineData[j].low <= current) {
        isLocalLow = false;
        break;
      }
    }

    if (isLocalLow) {
      lows.push(current);
    }
  }

  return lows;
}

/**
 * 对价格水平进行聚类
 */
function clusterPrices(prices: number[], tolerance: number, minClusterSize: number): number[] {
  if (prices.length === 0) return [];

  // 排序
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: number[][] = [];
  let currentCluster: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevPrice = currentCluster[currentCluster.length - 1];
    const currentPrice = sorted[i];
    const diffPercent = Math.abs(currentPrice - prevPrice) / prevPrice;

    if (diffPercent <= tolerance) {
      currentCluster.push(currentPrice);
    } else {
      if (currentCluster.length >= minClusterSize) {
        clusters.push(currentCluster);
      }
      currentCluster = [currentPrice];
    }
  }

  // 处理最后一个聚类
  if (currentCluster.length >= minClusterSize) {
    clusters.push(currentCluster);
  }

  // 计算每个聚类的平均值
  return clusters.map((cluster) => {
    return cluster.reduce((sum, price) => sum + price, 0) / cluster.length;
  });
}

/**
 * 识别支撑位和阻力位
 * @param klineData K线数据
 * @param config 配置参数
 * @returns 支撑阻力位识别结果
 */
export function identifySupportResistance(
  klineData: KLineData[],
  config: Partial<SupportResistanceConfig> = {}
): SupportResistanceResult {
  const cfg = { ...DEFAULT_SR_CONFIG, ...config };
  const len = klineData.length;

  if (len < cfg.lookbackPeriod) {
    return { supportLevels: [], resistanceLevels: [] };
  }

  // 获取最近N天的数据
  const recentData = klineData.slice(-cfg.lookbackPeriod);
  const currentPrice = klineData[len - 1].close;

  // 识别局部高点和低点
  const localHighs = findLocalHighs(recentData, cfg.localExtremumWindow);
  const localLows = findLocalLows(recentData, cfg.localExtremumWindow);

  // 聚类
  const resistanceLevels = clusterPrices(localHighs, cfg.clusteringTolerance, cfg.minClusterSize);
  const supportLevels = clusterPrices(localLows, cfg.clusteringTolerance, cfg.minClusterSize);

  // 按距离当前价格的远近排序
  resistanceLevels.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
  supportLevels.sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));

  // 过滤：阻力位应该在当前价格上方，支撑位应该在当前价格下方
  const validResistance = resistanceLevels.filter((level) => level > currentPrice);
  const validSupport = supportLevels.filter((level) => level < currentPrice);

  return {
    supportLevels: validSupport,
    resistanceLevels: validResistance,
    nearestSupport: validSupport.length > 0 ? validSupport[0] : undefined,
    nearestResistance: validResistance.length > 0 ? validResistance[0] : undefined,
  };
}

/**
 * 成交量异常检测结果
 */
export interface VolumeAnomalyResult {
  /** 是否检测到异常 */
  isAnomaly: boolean;
  /** 当前成交量 */
  currentVolume: number;
  /** 历史平均成交量 */
  avgVolume: number;
  /** 成交量倍数 */
  volumeRatio: number;
  /** 异常类型：'spike'(放量) | 'shrink'(缩量) */
  anomalyType?: 'spike' | 'shrink';
}

/**
 * 检测成交量异常
 * @param klineData K线数据
 * @param period 检测周期（天数）
 * @param multiplier 倍数阈值
 * @returns 成交量异常检测结果
 */
export function detectVolumeAnomaly(
  klineData: KLineData[],
  period: number = 20,
  multiplier: number = 2.0
): VolumeAnomalyResult {
  const len = klineData.length;

  if (len < period + 1) {
    return {
      isAnomaly: false,
      currentVolume: 0,
      avgVolume: 0,
      volumeRatio: 0,
    };
  }

  const currentVolume = klineData[len - 1].volume;
  const historicalVolumes = klineData.slice(len - period - 1, len - 1).map((k) => k.volume);
  const avgVolume = historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;

  if (avgVolume === 0) {
    return {
      isAnomaly: false,
      currentVolume,
      avgVolume,
      volumeRatio: 0,
    };
  }

  const volumeRatio = currentVolume / avgVolume;
  const isAnomaly = volumeRatio >= multiplier || volumeRatio <= 1 / multiplier;
  const anomalyType =
    volumeRatio >= multiplier ? 'spike' : volumeRatio <= 1 / multiplier ? 'shrink' : undefined;

  return {
    isAnomaly,
    currentVolume,
    avgVolume,
    volumeRatio,
    anomalyType,
  };
}

/**
 * 技术指标金叉/死叉检测结果
 */
export interface IndicatorCrossResult {
  /** 是否发生金叉 */
  isGoldenCross: boolean;
  /** 是否发生死叉 */
  isDeathCross: boolean;
  /** 快线当前值 */
  fastValue: number;
  /** 慢线当前值 */
  slowValue: number;
  /** 快线前值 */
  prevFastValue: number;
  /** 慢线前值 */
  prevSlowValue: number;
}

/**
 * 检测MACD金叉/死叉
 */
export function detectMACDCross(klineData: KLineData[]): IndicatorCrossResult {
  const len = klineData.length;

  if (len < 35) {
    // MACD需要足够的数据
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const macd = calculateMACD(klineData);
  const dif = macd.dif;
  const dea = macd.dea;

  const currentDIF = dif[len - 1];
  const currentDEA = dea[len - 1];
  const prevDIF = dif[len - 2];
  const prevDEA = dea[len - 2];

  if (currentDIF === null || currentDEA === null || prevDIF === null || prevDEA === null) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const isGoldenCross = prevDIF <= prevDEA && currentDIF > currentDEA;
  const isDeathCross = prevDIF >= prevDEA && currentDIF < currentDEA;

  return {
    isGoldenCross,
    isDeathCross,
    fastValue: currentDIF,
    slowValue: currentDEA,
    prevFastValue: prevDIF,
    prevSlowValue: prevDEA,
  };
}

/**
 * 检测KDJ金叉/死叉
 */
export function detectKDJCross(klineData: KLineData[]): IndicatorCrossResult {
  const len = klineData.length;

  if (len < 10) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const kdj = calculateKDJ(klineData);
  const k = kdj.k;
  const d = kdj.d;

  const currentK = k[len - 1];
  const currentD = d[len - 1];
  const prevK = k[len - 2];
  const prevD = d[len - 2];

  if (currentK === null || currentD === null || prevK === null || prevD === null) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const isGoldenCross = prevK <= prevD && currentK > currentD;
  const isDeathCross = prevK >= prevD && currentK < currentD;

  return {
    isGoldenCross,
    isDeathCross,
    fastValue: currentK,
    slowValue: currentD,
    prevFastValue: prevK,
    prevSlowValue: prevD,
  };
}

/**
 * 检测RSI金叉/死叉（使用RSI6和RSI12）
 */
export function detectRSICross(klineData: KLineData[]): IndicatorCrossResult {
  const len = klineData.length;

  if (len < 13) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const rsi6 = calculateRSI(klineData, 6);
  const rsi12 = calculateRSI(klineData, 12);

  const currentRSI6 = rsi6[len - 1];
  const currentRSI12 = rsi12[len - 1];
  const prevRSI6 = rsi6[len - 2];
  const prevRSI12 = rsi12[len - 2];

  if (currentRSI6 === null || currentRSI12 === null || prevRSI6 === null || prevRSI12 === null) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const isGoldenCross = prevRSI6 <= prevRSI12 && currentRSI6 > currentRSI12;
  const isDeathCross = prevRSI6 >= prevRSI12 && currentRSI6 < currentRSI12;

  return {
    isGoldenCross,
    isDeathCross,
    fastValue: currentRSI6,
    slowValue: currentRSI12,
    prevFastValue: prevRSI6,
    prevSlowValue: prevRSI12,
  };
}

/**
 * 检测MA金叉/死叉
 */
export function detectMACross(
  klineData: KLineData[],
  fastPeriod: number = 5,
  slowPeriod: number = 20
): IndicatorCrossResult {
  const len = klineData.length;

  if (len < slowPeriod + 1) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const fastMA = calculateMA(klineData, fastPeriod);
  const slowMA = calculateMA(klineData, slowPeriod);

  const currentFast = fastMA[len - 1];
  const currentSlow = slowMA[len - 1];
  const prevFast = fastMA[len - 2];
  const prevSlow = slowMA[len - 2];

  if (isNaN(currentFast) || isNaN(currentSlow) || isNaN(prevFast) || isNaN(prevSlow)) {
    return {
      isGoldenCross: false,
      isDeathCross: false,
      fastValue: 0,
      slowValue: 0,
      prevFastValue: 0,
      prevSlowValue: 0,
    };
  }

  const isGoldenCross = prevFast <= prevSlow && currentFast > currentSlow;
  const isDeathCross = prevFast >= prevSlow && currentFast < currentSlow;

  return {
    isGoldenCross,
    isDeathCross,
    fastValue: currentFast,
    slowValue: currentSlow,
    prevFastValue: prevFast,
    prevSlowValue: prevSlow,
  };
}

/**
 * 通用技术指标金叉/死叉检测
 * @param klineData K线数据
 * @param indicatorType 指标类型
 * @param maFastPeriod MA快速周期（仅当indicatorType为MA时使用）
 * @param maSlowPeriod MA慢速周期（仅当indicatorType为MA时使用）
 * @returns 金叉/死叉检测结果
 */
export function detectIndicatorCross(
  klineData: KLineData[],
  indicatorType: IndicatorType,
  maFastPeriod: number = 5,
  maSlowPeriod: number = 20
): IndicatorCrossResult {
  switch (indicatorType) {
    case 'MACD':
      return detectMACDCross(klineData);
    case 'KDJ':
      return detectKDJCross(klineData);
    case 'RSI':
      return detectRSICross(klineData);
    case 'MA':
      return detectMACross(klineData, maFastPeriod, maSlowPeriod);
    default:
      return {
        isGoldenCross: false,
        isDeathCross: false,
        fastValue: 0,
        slowValue: 0,
        prevFastValue: 0,
        prevSlowValue: 0,
      };
  }
}
