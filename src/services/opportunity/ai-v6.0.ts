/**
 * AI 辅助分析 v6.0
 *
 * 在 v5.0 基础上新增：
 * 1. 共享计算上下文 (Computation Context) - 消除 Worker 与 AI 之间的重复指标计算
 * 2. ADX 市场状态检测 - 替代简单的 ATR Ratio，更精准地区分趋势市与震荡市
 * 3. Pivot Points 支撑阻力 - 提高目标价与风险收益比的计算精度
 */

import type {
  KLineData,
  TrendPrediction,
  SimilarPatternMatch,
  SmartRecommendationScore,
  AIAnalysisResult,
  StockOpportunityData,
} from '@/types/stock';
import {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateADX,
  calculatePivotPoints,
} from '@/utils/analysis/technicalIndicators';
import { detectTrendPatterns } from '@/utils/analysis/trendPatterns';
import { detectCandlestickPatternsInWindow } from '@/utils/analysis/candlestickPatterns';

/**
 * AI 计算上下文，用于共享已计算的指标，避免重复计算
 */
export interface AIComputationContext {
  rsi6?: (number | null)[];
  rsi12?: (number | null)[];
  macd?: {
    dif: (number | null)[];
    dea: (number | null)[];
    macd: (number | null)[];
  };
  bollingerBands?: {
    upper: (number | null)[];
    middle: (number | null)[];
    lower: (number | null)[];
  };
  adx?: (number | null)[];
  ma5?: number[];
  ma10?: number[];
  ma20?: number[];
}

/**
 * 简单的移动平均计算（用于number数组）
 */
function calculateSimpleMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 趋势预测配置
 */
export interface TrendPredictionConfig {
  /** 预测周期（天） */
  predictionPeriod: number;
  /** 使用的技术指标 */
  useRSI: boolean;
  useMACD: boolean;
  useBollingerBands: boolean;
  useMovingAverages: boolean;
}

const DEFAULT_TREND_CONFIG: TrendPredictionConfig = {
  predictionPeriod: 5,
  useRSI: true,
  useMACD: true,
  useBollingerBands: true,
  useMovingAverages: true,
};

// ========== v5.0：动态权重配置 ==========

interface DynamicWeights {
  ma: number;
  macd: number;
  rsi: number;
  bb: number;
  trend: number;
  volume: number;
}

const TRENDING_WEIGHTS: DynamicWeights = {
  ma: 0.3,
  macd: 0.25,
  rsi: 0.15,
  bb: 0.15,
  trend: 0.1,
  volume: 0.05,
};

const RANGING_WEIGHTS: DynamicWeights = {
  ma: 0.2,
  macd: 0.15,
  rsi: 0.3,
  bb: 0.25,
  trend: 0.05,
  volume: 0.05,
};

/**
 * 检测市场状态（趋势市 vs 震荡市）
 * v6.0 升级：使用 ADX 指标
 */
function detectMarketRegime(klineData: KLineData[], context?: AIComputationContext): 'trending' | 'ranging' {
  const len = klineData.length;
  if (len < 30) return 'ranging';

  const adx = context?.adx || calculateADX(klineData, 14);
  const lastADX = adx[len - 1];

  if (lastADX === null || lastADX === undefined) return 'ranging';

  // ADX > 25 表示强趋势，ADX < 20 表示弱趋势/震荡
  if (lastADX > 25) return 'trending';
  if (lastADX < 20) return 'ranging';

  // 中间地带参考原有 ATR 逻辑作为补充
  const closes = klineData.slice(-20).map((k) => k.close);
  const highs = klineData.slice(-20).map((k) => k.high);
  const lows = klineData.slice(-20).map((k) => k.low);

  let trSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trSum += Math.max(hl, hc, lc);
  }

  const atr = trSum / (closes.length - 1);
  const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
  const atrRatio = avgPrice > 0 ? atr / avgPrice : 0;

  return atrRatio < 0.02 ? 'ranging' : 'trending';
}

/**
 * 基于多指标综合判断的趋势预测（v6.0：支持计算上下文与 ADX）
 */
export function predictTrend(
  klineData: KLineData[],
  config: TrendPredictionConfig = DEFAULT_TREND_CONFIG,
  context?: AIComputationContext
): TrendPrediction {
  const len = klineData.length;
  if (len < 30) {
    return {
      direction: 'sideways',
      confidence: 0,
      period: config.predictionPeriod,
      reasoning: ['数据不足，无法进行有效预测'],
      signalCount: 0,
      totalSignals: 0,
    };
  }

  const lastClose = klineData[len - 1].close;
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];

  // 检测市场状态并获取动态权重
  const marketRegime = detectMarketRegime(klineData, context);
  const weights = marketRegime === 'trending' ? TRENDING_WEIGHTS : RANGING_WEIGHTS;

  // 1. 移动平均线分析
  if (config.useMovingAverages) {
    const maSignals = analyzeMovingAverages(klineData, context);
    maSignals.forEach((s) => {
      s.weight *= weights.ma / 0.3;
    });
    signals.push(...maSignals);
  }

  // 2. RSI分析
  if (config.useRSI) {
    const rsiSignals = analyzeRSI(klineData, context);
    rsiSignals.forEach((s) => {
      s.weight *= weights.rsi / 0.2;
    });
    signals.push(...rsiSignals);
  }

  // 3. MACD分析
  if (config.useMACD) {
    const macdSignals = analyzeMACD(klineData, context);
    macdSignals.forEach((s) => {
      s.weight *= weights.macd / 0.25;
    });
    signals.push(...macdSignals);
  }

  // 4. 布林带分析
  if (config.useBollingerBands) {
    const bbSignals = analyzeBollingerBands(klineData, context);
    bbSignals.forEach((s) => {
      s.weight *= weights.bb / 0.2;
    });
    signals.push(...bbSignals);
  }

  // 5. 趋势形态分析
  const trendSignals = analyzeTrendPatterns(klineData);
  trendSignals.forEach((s) => {
    s.weight *= weights.trend / 0.25;
  });
  signals.push(...trendSignals);

  // 6. 成交量趋势确认（量价配合）
  const volumeSignals = analyzeVolumeTrend(klineData);
  volumeSignals.forEach((s) => {
    s.weight *= weights.volume / 0.2;
  });
  signals.push(...volumeSignals);

  // 综合评分
  let upScore = 0;
  let downScore = 0;
  let sidewaysScore = 0;
  let signalCount = 0;
  const reasoning: string[] = [];

  signals.forEach((signal) => {
    switch (signal.direction) {
      case 'up':
        upScore += signal.weight;
        break;
      case 'down':
        downScore += signal.weight;
        break;
      case 'sideways':
        sidewaysScore += signal.weight;
        break;
    }
    reasoning.push(signal.reason);
  });

  const totalScore = upScore + downScore + sidewaysScore;
  const totalSignals = signals.length;
  let direction: 'up' | 'down' | 'sideways' = 'sideways';
  let confidence = 0;

  if (totalScore > 0) {
    if (upScore >= downScore && upScore >= sidewaysScore) {
      direction = 'up';
      confidence = upScore / totalScore;
      signalCount = signals.filter((s) => s.direction === 'up').length;
    } else if (downScore >= upScore && downScore >= sidewaysScore) {
      direction = 'down';
      confidence = downScore / totalScore;
      signalCount = signals.filter((s) => s.direction === 'down').length;
    } else {
      direction = 'sideways';
      confidence = sidewaysScore / totalScore;
      signalCount = signals.filter((s) => s.direction === 'sideways').length;
    }
  }

  if (totalSignals > 0 && signalCount >= 4 && signalCount >= totalSignals * 0.6) {
    confidence = Math.min(confidence * 1.2, 0.95);
    reasoning.unshift(`${signalCount}/${totalSignals}个信号达成共识`);
  }

  reasoning.unshift(`市场状态：${marketRegime === 'trending' ? '趋势市' : '震荡市'}`);

  // v6.0 升级：计算支撑位和阻力位（结合 Pivot Points）
  const { supportLevel, resistanceLevel } = calculateSupportResistanceV6(klineData);

  const targetPrice = calculateTargetPrice(lastClose, direction, supportLevel, resistanceLevel);

  let riskRewardRatio: number | undefined;
  if (supportLevel && resistanceLevel && direction !== 'sideways') {
    const potentialReward = Math.abs(resistanceLevel - lastClose);
    const potentialRisk = Math.abs(lastClose - supportLevel);
    if (potentialRisk > 0) {
      riskRewardRatio = potentialReward / potentialRisk;
    }
  }

  return {
    direction,
    confidence: Math.min(confidence, 1),
    targetPrice,
    period: config.predictionPeriod,
    supportLevel,
    resistanceLevel,
    reasoning: reasoning.slice(0, 5),
    signalCount,
    totalSignals,
    riskRewardRatio,
  };
}

/**
 * 移动平均线分析 (v6.0: 支持 context)
 */
function analyzeMovingAverages(
  klineData: KLineData[],
  context?: AIComputationContext
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const ma5 = context?.ma5 || calculateMA(klineData, 5);
  const ma10 = context?.ma10 || calculateMA(klineData, 10);
  const ma20 = context?.ma20 || calculateMA(klineData, 20);

  if (ma5.length === 0 || ma10.length === 0 || ma20.length === 0) {
    return signals;
  }

  const lastMA5 = ma5[ma5.length - 1];
  const lastMA10 = ma10[ma10.length - 1];
  const lastMA20 = ma20[ma20.length - 1];
  const lastClose = klineData[len - 1].close;

  if (lastClose > lastMA5 && lastMA5 > lastMA10 && lastMA10 > lastMA20) {
    signals.push({ direction: 'up', weight: 0.3, reason: '多头排列：价格>MA5>MA10>MA20' });
  } else if (lastClose < lastMA5 && lastMA5 < lastMA10 && lastMA10 < lastMA20) {
    signals.push({ direction: 'down', weight: 0.3, reason: '空头排列：价格<MA5<MA10<MA20' });
  }

  if (ma5.length >= 2 && ma10.length >= 2) {
    const prevMA5 = ma5[ma5.length - 2];
    const prevMA10 = ma10[ma10.length - 2];

    if (prevMA5 <= prevMA10 && lastMA5 > lastMA10) {
      signals.push({ direction: 'up', weight: 0.25, reason: 'MA5上穿MA10形成金叉' });
    } else if (prevMA5 >= prevMA10 && lastMA5 < lastMA10) {
      signals.push({ direction: 'down', weight: 0.25, reason: 'MA5下穿MA10形成死叉' });
    }
  }

  return signals;
}

/**
 * RSI分析 (v6.0: 支持 context)
 */
function analyzeRSI(
  klineData: KLineData[],
  context?: AIComputationContext
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const rsi6 = context?.rsi6 || calculateRSI(klineData, 6);
  const rsi12 = context?.rsi12 || calculateRSI(klineData, 12);

  if (rsi6.length === 0 || rsi12.length === 0) {
    return signals;
  }

  const lastRSI6 = rsi6[len - 1];
  const lastRSI12 = rsi12[len - 1];

  if (lastRSI6 === null || lastRSI12 === null) {
    return signals;
  }

  if (lastRSI6 < 30) {
    signals.push({
      direction: 'up',
      weight: 0.2,
      reason: `RSI(6)=${lastRSI6.toFixed(1)}进入超卖区`,
    });
  } else if (lastRSI6 > 70) {
    signals.push({
      direction: 'down',
      weight: 0.2,
      reason: `RSI(6)=${lastRSI6.toFixed(1)}进入超买区`,
    });
  }

  if (rsi6.length >= 2 && rsi12.length >= 2) {
    const prevRSI6 = rsi6[len - 2];
    const prevRSI12 = rsi12[len - 2];

    if (prevRSI6 !== null && prevRSI12 !== null) {
      if (prevRSI6 <= prevRSI12 && lastRSI6 > lastRSI12) {
        signals.push({ direction: 'up', weight: 0.15, reason: 'RSI金叉' });
      } else if (prevRSI6 >= prevRSI12 && lastRSI6 < lastRSI12) {
        signals.push({ direction: 'down', weight: 0.15, reason: 'RSI死叉' });
      }
    }
  }

  return signals;
}

/**
 * MACD分析 (v6.0: 支持 context)
 */
function analyzeMACD(
  klineData: KLineData[],
  context?: AIComputationContext
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const macd = context?.macd || calculateMACD(klineData);

  if (macd.dif.length === 0 || macd.dea.length === 0) {
    return signals;
  }

  const lastDIF = macd.dif[len - 1];
  const lastDEA = macd.dea[len - 1];
  const lastMACD = macd.macd[len - 1];

  if (lastDIF === null || lastDEA === null || lastMACD === null) {
    return signals;
  }

  if (macd.dif.length >= 2 && macd.dea.length >= 2) {
    const prevDIF = macd.dif[len - 2];
    const prevDEA = macd.dea[len - 2];

    if (prevDIF !== null && prevDEA !== null) {
      if (prevDIF <= prevDEA && lastDIF > lastDEA) {
        signals.push({ direction: 'up', weight: 0.25, reason: 'MACD金叉' });
      } else if (prevDIF >= prevDEA && lastDIF < lastDEA) {
        signals.push({ direction: 'down', weight: 0.25, reason: 'MACD死叉' });
      }
    }
  }

  if (macd.macd.length >= 2) {
    const prevMACD = macd.macd[len - 2];
    if (prevMACD !== null) {
      if (lastMACD > 0 && lastMACD > prevMACD) {
        signals.push({ direction: 'up', weight: 0.15, reason: 'MACD红柱放大' });
      } else if (lastMACD < 0 && lastMACD < prevMACD) {
        signals.push({ direction: 'down', weight: 0.15, reason: 'MACD绿柱放大' });
      }
    }
  }

  return signals;
}

/**
 * 布林带分析 (v6.0: 支持 context)
 */
function analyzeBollingerBands(
  klineData: KLineData[],
  context?: AIComputationContext
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const bb = context?.bollingerBands || calculateBollingerBands(klineData, 20, 2);

  if (bb.upper.length === 0 || bb.middle.length === 0 || bb.lower.length === 0) {
    return signals;
  }

  const lastClose = klineData[len - 1].close;
  const lastUpper = bb.upper[len - 1];
  const lastMiddle = bb.middle[len - 1];
  const lastLower = bb.lower[len - 1];

  if (lastUpper === null || lastMiddle === null || lastLower === null) {
    return signals;
  }

  const bandwidth = lastUpper - lastLower;
  if (bandwidth <= 0) return signals;

  const position = (lastClose - lastLower) / bandwidth;

  if (position < 0.2) {
    signals.push({ direction: 'up', weight: 0.2, reason: '价格接近布林带下轨' });
  } else if (position > 0.8) {
    signals.push({ direction: 'down', weight: 0.2, reason: '价格接近布林带上轨' });
  } else if (position >= 0.4 && position <= 0.6) {
    signals.push({ direction: 'sideways', weight: 0.15, reason: '价格在布林带中轨附近' });
  }

  return signals;
}

/**
 * 趋势形态分析
 */
function analyzeTrendPatterns(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];

  const trends = detectTrendPatterns(klineData, 20);

  if (trends.uptrend) {
    signals.push({ direction: 'up', weight: 0.25, reason: '检测到上升趋势' });
  }
  if (trends.downtrend) {
    signals.push({ direction: 'down', weight: 0.25, reason: '检测到下降趋势' });
  }
  if (trends.sideways) {
    signals.push({ direction: 'sideways', weight: 0.2, reason: '检测到横盘整理' });
  }
  if (trends.breakout) {
    signals.push({ direction: 'up', weight: 0.3, reason: '检测到突破形态' });
  }
  if (trends.breakdown) {
    signals.push({ direction: 'down', weight: 0.3, reason: '检测到跌破形态' });
  }

  return signals;
}

/**
 * 成交量趋势分析
 */
function analyzeVolumeTrend(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  if (len < 15) return signals;

  const volumes = klineData.map((k) => k.volume);
  const volMa5 = calculateSimpleMA(volumes, 5);
  const volMa10 = calculateSimpleMA(volumes, 10);

  if (volMa5.length < 2 || volMa10.length < 2) return signals;

  const lastVolMa5 = volMa5[volMa5.length - 1];
  const lastVolMa10 = volMa10[volMa10.length - 1];
  const prevVolMa5 = volMa5[volMa5.length - 2];
  const prevVolMa10 = volMa10[volMa10.length - 2];

  if (lastVolMa5 > lastVolMa10 * 1.3) {
    const priceChange = klineData[len - 1].close - klineData[len - 2].close;
    if (priceChange > 0) {
      signals.push({ direction: 'up', weight: 0.2, reason: '放量上涨，量价配合良好' });
    } else {
      signals.push({ direction: 'down', weight: 0.15, reason: '放量下跌，抛压较大' });
    }
  }

  if (lastVolMa5 < lastVolMa10 * 0.7) {
    signals.push({ direction: 'sideways', weight: 0.1, reason: '成交量萎缩，市场观望' });
  }

  if (prevVolMa5 <= prevVolMa10 && lastVolMa5 > lastVolMa10) {
    signals.push({ direction: 'up', weight: 0.15, reason: '成交量MA5上穿MA10' });
  } else if (prevVolMa5 >= prevVolMa10 && lastVolMa5 < lastVolMa10) {
    signals.push({ direction: 'down', weight: 0.15, reason: '成交量MA5下穿MA10' });
  }

  if (len >= 10) {
    const recent5PriceChange =
      (klineData[len - 1].close - klineData[len - 6].close) / klineData[len - 6].close;
    const recent5VolChange =
      (lastVolMa5 - (volMa5.length >= 6 ? volMa5[volMa5.length - 6] : lastVolMa5)) /
      (volMa5.length >= 6 ? volMa5[volMa5.length - 6] : lastVolMa5 || 1);

    if (recent5PriceChange > 0.03 && recent5VolChange < -0.1) {
      signals.push({ direction: 'down', weight: 0.2, reason: '量价背离：上涨缩量，动能不足' });
    } else if (recent5PriceChange < -0.03 && recent5VolChange < -0.1) {
      signals.push({ direction: 'up', weight: 0.15, reason: '下跌缩量，抛压减轻' });
    }
  }

  return signals;
}

/**
 * 计算支撑位和阻力位 (v6.0: 结合 Pivot Points)
 */
function calculateSupportResistanceV6(klineData: KLineData[]): {
  supportLevel?: number;
  resistanceLevel?: number;
} {
  const len = klineData.length;
  if (len < 20) {
    return {};
  }

  // 1. 基础最高/最低价
  const recent = klineData.slice(-20);
  const highs = recent.map((k) => k.high);
  const lows = recent.map((k) => k.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);

  // 2. Pivot Points
  const pivots = calculatePivotPoints(klineData);
  if (!pivots) return { supportLevel: minLow, resistanceLevel: maxHigh };

  const currentPrice = klineData[len - 1].close;

  // 寻找最接近当前价的支撑和阻力
  const resistanceLevels = [maxHigh, pivots.r1, pivots.r2, pivots.r3].filter(v => v > currentPrice);
  const supportLevels = [minLow, pivots.s1, pivots.s2, pivots.s3].filter(v => v < currentPrice);

  const resistanceLevel = resistanceLevels.length > 0 ? Math.min(...resistanceLevels) : maxHigh;
  const supportLevel = supportLevels.length > 0 ? Math.max(...supportLevels) : minLow;

  return { supportLevel, resistanceLevel };
}

/**
 * 计算目标价
 */
function calculateTargetPrice(
  currentPrice: number,
  direction: 'up' | 'down' | 'sideways',
  supportLevel?: number,
  resistanceLevel?: number
): number | undefined {
  if (direction === 'sideways') return undefined;
  if (direction === 'up' && resistanceLevel) return resistanceLevel;
  if (direction === 'down' && supportLevel) return supportLevel;
  return undefined;
}

/**
 * 计算简单移动平均线
 */
function calculateMA(klineData: KLineData[], period: number): number[] {
  const result: number[] = [];
  const len = klineData.length;
  if (len < period) return result;
  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += klineData[i - j].close;
    result.push(sum / period);
  }
  return result;
}

/**
 * 相似形态识别
 */
export function findSimilarPatterns(
  currentCode: string,
  currentKLineData: KLineData[],
  allStockData: Map<string, { code: string; name: string; klineData: KLineData[] }>,
  config = { searchScope: 500, minSimilarity: 0.7, maxResults: 5, observationPeriod: 10 }
): SimilarPatternMatch[] {
  const results: SimilarPatternMatch[] = [];
  if (currentKLineData.length < 20) return results;

  const currentFeatures = extractPatternFeatures(currentKLineData);
  const sortedStocks = Array.from(allStockData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let searchedCount = 0;
  for (const [code, stockData] of sortedStocks) {
    if (searchedCount >= config.searchScope) break;
    if (code === currentCode) continue;

    const features = extractPatternFeatures(stockData.klineData);
    const similarity = calculateSimilarity(currentFeatures, features);

    if (similarity >= config.minSimilarity) {
      const historicalPerformance = calculateHistoricalPerformance(stockData.klineData, config.observationPeriod);
      results.push({
        code: stockData.code,
        name: stockData.name,
        similarity,
        historicalPerformance,
        matchPeriod: {
          start: stockData.klineData[0].time,
          end: stockData.klineData[stockData.klineData.length - 1].time,
        },
      });
    }
    searchedCount++;
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, config.maxResults);
}

function extractPatternFeatures(klineData: KLineData[]) {
  const len = klineData.length;
  const lookback = Math.min(20, len);
  const recent = klineData.slice(-lookback);

  const priceChanges: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    priceChanges.push(((recent[i].close - recent[i - 1].close) / recent[i - 1].close) * 100);
  }

  const volumeChanges: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].volume > 0) {
      volumeChanges.push(((recent[i].volume - recent[i - 1].volume) / recent[i - 1].volume) * 100);
    }
  }

  const closes = recent.map((k) => k.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / closes.length;
  const volatility = Math.sqrt(variance) / (mean || 1);

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = recent.length;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recent[i].close;
    sumXY += i * recent[i].close;
    sumX2 += i * i;
  }
  const trend = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);

  return { priceChanges, volumeChanges, volatility, trend };
}

function calculateSimilarity(f1: any, f2: any): number {
  const priceSim = calculateArraySimilarity(f1.priceChanges, f2.priceChanges) * 0.4;
  const volSim = calculateArraySimilarity(f1.volumeChanges, f2.volumeChanges) * 0.2;
  const volaSim = Math.max(0, 1 - Math.abs(f1.volatility - f2.volatility) * 10) * 0.2;
  const trendSim = Math.max(0, 1 - Math.abs(f1.trend - f2.trend) / (Math.abs(f1.trend + f2.trend) / 2 || 1)) * 0.2;
  return priceSim + volSim + volaSim + trendSim;
}

function calculateArraySimilarity(arr1: number[], arr2: number[]): number {
  const len = Math.min(arr1.length, arr2.length);
  if (len === 0) return 0;
  let dot = 0, m1 = 0, m2 = 0;
  for (let i = 0; i < len; i++) {
    dot += arr1[i] * arr2[i];
    m1 += arr1[i] * arr1[i];
    m2 += arr2[i] * arr2[i];
  }
  return dot / (Math.sqrt(m1) * Math.sqrt(m2) || 1);
}

function calculateHistoricalPerformance(klineData: KLineData[], period: number) {
  const len = klineData.length;
  if (len < period + 1) return undefined;
  const start = klineData[len - period - 1].close;
  const end = klineData[len - 1].close;
  return { changePercent: ((end - start) / start) * 100, period };
}

/**
 * 计算智能选股推荐评分
 */
export function calculateRecommendationScore(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  config = { technicalWeight: 0.3, patternWeight: 0.25, trendWeight: 0.25, riskWeight: 0.2 }
): SmartRecommendationScore {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const technicalScore = calculateTechnicalScore(klineData, opportunityData, reasons, warnings);
  const patternScore = calculatePatternScore(klineData, opportunityData, reasons, warnings);
  const trendScore = calculateTrendScore(klineData, opportunityData, reasons, warnings);
  const riskScore = calculateRiskScore(klineData, opportunityData, reasons, warnings);

  const totalScore = Math.round(
    technicalScore * config.technicalWeight +
      patternScore * config.patternWeight +
      trendScore * config.trendWeight +
      riskScore * config.riskWeight
  );

  return {
    totalScore: Math.min(Math.max(totalScore, 0), 100),
    technicalScore: Math.round(technicalScore),
    patternScore: Math.round(patternScore),
    trendScore: Math.round(trendScore),
    riskScore: Math.round(riskScore),
    reasons: reasons.slice(0, 5),
    warnings: warnings.slice(0, 3),
  };
}

function calculateTechnicalScore(klineData: KLineData[], data: StockOpportunityData, reasons: string[], warnings: string[]) {
  let score = 50;
  if (data.kdjJ !== undefined) {
    if (data.kdjJ < 20) { score += 15; reasons.push('KDJ-J值处于低位，可能超卖'); }
    else if (data.kdjJ > 80) { score -= 10; warnings.push('KDJ-J值处于高位，注意回调风险'); }
  }
  if (data.ma5 !== undefined && data.ma10 !== undefined && data.ma20 !== undefined) {
    if (data.ma5 > data.ma10 && data.ma10 > data.ma20) { score += 15; reasons.push('均线多头排列'); }
    else if (data.ma5 < data.ma10 && data.ma10 < data.ma20) { score -= 15; warnings.push('均线空头排列'); }
  }
  if (klineData.length >= 10) {
    const recentVol = klineData.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
    const prevVol = klineData.slice(-10, -5).reduce((s, k) => s + k.volume, 0) / 5;
    if (prevVol > 0 && recentVol > prevVol * 1.5) { score += 10; reasons.push('成交量明显放大'); }
  }
  return Math.min(Math.max(score, 0), 100);
}

function calculatePatternScore(klineData: KLineData[], data: StockOpportunityData, reasons: string[], warnings: string[]) {
  let score = 50;
  if (data.sharpMovePatterns) {
    if (data.sharpMovePatterns.dropThenFlatThenRise) { score += 20; reasons.push('出现急跌-横盘-急涨形态'); }
    if (data.sharpMovePatterns.onlyDrop) { score -= 10; warnings.push('近期有急跌，注意风险'); }
  }
  if (data.consolidation?.isConsolidation) {
    score += 15;
    reasons.push(`处于横盘整理状态（${data.consolidation.matchedTypeLabels.join(', ')}）`);
  }
  return Math.min(Math.max(score, 0), 100);
}

function calculateTrendScore(klineData: KLineData[], data: StockOpportunityData, reasons: string[], warnings: string[]) {
  let score = 50;
  if (data.trendLine?.isHit) { score += 20; reasons.push('沿趋势线运行，走势稳健'); }
  if (data.changePercent !== undefined) {
    if (data.changePercent > 3 && data.changePercent < 7) { score += 10; reasons.push('今日涨幅适中'); }
    else if (data.changePercent > 9) { score -= 5; warnings.push('今日涨幅过大'); }
    else if (data.changePercent < -5) { score -= 10; warnings.push('今日跌幅较大'); }
  }
  return Math.min(Math.max(score, 0), 100);
}

function calculateRiskScore(klineData: KLineData[], data: StockOpportunityData, reasons: string[], warnings: string[]) {
  let score = 50;
  if (data.name.includes('ST')) { score -= 20; warnings.push('ST股票，风险较高'); }
  if (data.peRatio !== undefined) {
    if (data.peRatio > 100) { score -= 15; warnings.push(`市盈率过高(${data.peRatio.toFixed(1)})`); }
    else if (data.peRatio > 0 && data.peRatio < 50) { score += 10; reasons.push('市盈率合理'); }
  }
  if (data.turnoverRate !== undefined) {
    if (data.turnoverRate > 20) { score -= 10; warnings.push('换手率过高'); }
    else if (data.turnoverRate > 5 && data.turnoverRate <= 20) { score += 5; reasons.push('换手率活跃'); }
  }
  return Math.min(Math.max(score, 0), 100);
}

// ========== v4.0：短周期结构校正 (保留) ==========
function v4ClampIntScore(n: number): number { return Math.min(100, Math.max(0, Math.round(n))); }
function v4RecomputeTotal(rec: SmartRecommendationScore): number {
  return v4ClampIntScore(rec.technicalScore * 0.3 + rec.patternScore * 0.25 + rec.trendScore * 0.25 + rec.riskScore * 0.2);
}

function v4ApplyStructuralAdjust(klineData: KLineData[], base: AIAnalysisResult): AIAnalysisResult {
  const rec = { ...base.recommendation!, reasons: [...(base.recommendation!.reasons || [])], warnings: [...(base.recommendation!.warnings || [])] };
  const tp = { ...base.trendPrediction, reasoning: [...(base.trendPrediction.reasoning || [])] };
  const len = klineData.length;
  if (len < 10) return base;

  const closes = klineData.map(k => k.close);
  const lastClose = closes[len - 1];
  let trailingDown = 0;
  for (let i = len - 1; i >= 1; i--) { if (closes[i] < closes[i - 1]) trailingDown++; else break; }

  let confMul = 1;
  if (tp.direction === 'up') {
    if (trailingDown >= 3) { rec.trendScore -= 14; rec.riskScore -= 6; confMul *= 0.82; rec.warnings.push('v4：近端连续走低'); }
    else if (trailingDown >= 2) { rec.trendScore -= 8; rec.riskScore -= 3; confMul *= 0.88; rec.warnings.push('v4：近端连阴'); }
  }

  rec.trendScore = v4ClampIntScore(rec.trendScore);
  rec.riskScore = v4ClampIntScore(rec.riskScore);
  rec.totalScore = v4RecomputeTotal(rec);
  tp.confidence = Math.min(0.95, tp.confidence * confMul);

  return { ...base, trendPrediction: tp, recommendation: rec, analyzedAt: Date.now() };
}

// ========== v5.0：假突破过滤 (完整版) ==========

interface FalseBreakoutResult {
  isFalseBreakout: boolean;
  breakoutType: 'up' | 'down' | null;
  severity: number; // 0-1，严重程度
}

function detectFalseBreakout(klineData: KLineData[]): FalseBreakoutResult {
  const len = klineData.length;
  if (len < 10) {
    return { isFalseBreakout: false, breakoutType: null, severity: 0 };
  }

  const recent5 = klineData.slice(-5);
  const highs = recent5.map((k) => k.high);
  const lows = recent5.map((k) => k.low);
  const closes = recent5.map((k) => k.close);
  const volumes = recent5.map((k) => k.volume);

  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const currentClose = closes[closes.length - 1];

  // 检查向上假突破
  const daysSinceHigh = highs.lastIndexOf(maxHigh);
  if (daysSinceHigh >= 1 && daysSinceHigh <= 2) {
    const pullback = (maxHigh - currentClose) / maxHigh;
    if (pullback > 0.03) {
      // 检查突破时的成交量是否异常
      const breakoutVol = volumes[daysSinceHigh];
      const avgVol = volumes.slice(0, daysSinceHigh).reduce((a, b) => a + b, 0) / daysSinceHigh;
      const volRatio = avgVol > 0 ? breakoutVol / avgVol : 1;

      // 无量突破更可能是假的
      const severity = pullback * (volRatio < 0.8 ? 1.3 : 1.0);
      return {
        isFalseBreakout: true,
        breakoutType: 'up',
        severity: Math.min(severity, 1),
      };
    }
  }

  // 检查向下假突破
  const daysSinceLow = lows.lastIndexOf(minLow);
  if (daysSinceLow >= 1 && daysSinceLow <= 2) {
    const bounce = (currentClose - minLow) / minLow;
    if (bounce > 0.03) {
      const breakoutVol = volumes[daysSinceLow];
      const avgVol = volumes.slice(0, daysSinceLow).reduce((a, b) => a + b, 0) / daysSinceLow;
      const volRatio = avgVol > 0 ? breakoutVol / avgVol : 1;

      const severity = bounce * (volRatio < 0.8 ? 1.3 : 1.0);
      return {
        isFalseBreakout: true,
        breakoutType: 'down',
        severity: Math.min(severity, 1),
      };
    }
  }

  return { isFalseBreakout: false, breakoutType: null, severity: 0 };
}

// ========== v5.0：动能衰竭检测 (完整版) ==========

interface MomentumExhaustionResult {
  exhausted: boolean;
  direction: 'up' | 'down' | null;
  exhaustionLevel: number; // 0-1，衰竭程度
}

function detectMomentumExhaustion(klineData: KLineData[]): MomentumExhaustionResult {
  const len = klineData.length;
  if (len < 15) {
    return { exhausted: false, direction: null, exhaustionLevel: 0 };
  }

  const closes = klineData.map((k) => k.close);

  // 1. 检查近5天涨跌幅是否递减
  const recentChanges: number[] = [];
  for (let i = len - 5; i < len; i++) {
    const change = (closes[i] - closes[i - 1]) / closes[i - 1];
    recentChanges.push(change);
  }

  let decreasingMomentum = false;
  if (recentChanges.every((c) => c > 0)) {
    // 全部上涨，检查是否递减
    decreasingMomentum = recentChanges.every((c, i) => i === 0 || c <= recentChanges[i - 1]);
  } else if (recentChanges.every((c) => c < 0)) {
    // 全部下跌，检查是否递减（绝对值）
    decreasingMomentum = recentChanges.every(
      (c, i) => i === 0 || Math.abs(c) <= Math.abs(recentChanges[i - 1])
    );
  }

  // 2. 检查 RSI 是否从极端区域回归
  const rsi6 = calculateRSI(klineData, 6);
  const lastRSI = rsi6[rsi6.length - 1];
  const prevRSI = rsi6.length >= 2 ? rsi6[rsi6.length - 2] : null;

  let rsiReversal = false;
  let reversalDirection: 'up' | 'down' | null = null;

  if (lastRSI !== null && prevRSI !== null) {
    if (prevRSI > 80 && lastRSI < prevRSI) {
      rsiReversal = true;
      reversalDirection = 'down';
    } else if (prevRSI < 20 && lastRSI > prevRSI) {
      rsiReversal = true;
      reversalDirection = 'up';
    }
  }

  // 3. 检查 MACD 柱状图是否缩小
  const macd = calculateMACD(klineData);
  let macdShrinking = false;
  let macdDirection: 'up' | 'down' | null = null;

  if (macd.macd.length >= 2) {
    const lastMACD = macd.macd[macd.macd.length - 1];
    const prevMACD = macd.macd[macd.macd.length - 2];

    if (lastMACD !== null && prevMACD !== null) {
      if (lastMACD > 0 && lastMACD < prevMACD) {
        macdShrinking = true;
        macdDirection = 'down';
      } else if (lastMACD < 0 && lastMACD > prevMACD) {
        macdShrinking = true;
        macdDirection = 'up';
      }
    }
  }

  // 综合判断：满足2个以上条件则判定为动能衰竭
  let conditionsMet = 0;
  let finalDirection: 'up' | 'down' | null = null;

  if (decreasingMomentum) {
    conditionsMet++;
    finalDirection = recentChanges[0] > 0 ? 'up' : 'down';
  }

  if (rsiReversal) {
    conditionsMet++;
    finalDirection = reversalDirection;
  }

  if (macdShrinking) {
    conditionsMet++;
    finalDirection = macdDirection;
  }

  const exhausted = conditionsMet >= 2;
  const exhaustionLevel = conditionsMet / 3;

  return {
    exhausted,
    direction: finalDirection,
    exhaustionLevel,
  };
}

// ========== v5.0：增强版结构调整（整合 v4.0 + 假突破 + 动能衰竭） ==========

function v5ApplyEnhancedAdjust(klineData: KLineData[], base: AIAnalysisResult): AIAnalysisResult {
  // 先应用 v4.0 的短周期结构校正
  let result = v4ApplyStructuralAdjust(klineData, base);

  const rec = result.recommendation;
  const tp = result.trendPrediction;

  if (!rec || !tp) {
    return result;
  }

  let dTrend = 0;
  let dRisk = 0;
  let confMul = 1;

  // 应用假突破过滤
  const falseBreakout = detectFalseBreakout(klineData);
  if (falseBreakout.isFalseBreakout) {
    const severityPenalty = falseBreakout.severity * 20; // 最多扣20分

    if (falseBreakout.breakoutType === 'up' && tp.direction === 'up') {
      // 看涨但出现向上假突破
      dTrend -= severityPenalty;
      dRisk -= severityPenalty * 0.5;
      confMul *= 1 - falseBreakout.severity * 0.3;
      rec.warnings.push(
        `v5：检测到向上假突破（严重程度${(falseBreakout.severity * 100).toFixed(
          0
        )}%），已大幅下调评分`
      );
    } else if (falseBreakout.breakoutType === 'down' && tp.direction === 'down') {
      // 看跌但出现向下假突破
      dTrend -= severityPenalty;
      dRisk -= severityPenalty * 0.5;
      confMul *= 1 - falseBreakout.severity * 0.3;
      rec.warnings.push(
        `v5：检测到向下假突破（严重程度${(falseBreakout.severity * 100).toFixed(
          0
        )}%），已大幅下调评分`
      );
    }
  }

  // 应用动能衰竭检测
  const momentum = detectMomentumExhaustion(klineData);
  if (momentum.exhausted) {
    const exhaustionPenalty = momentum.exhaustionLevel * 15; // 最多扣15分

    if (momentum.direction === 'up' && tp.direction === 'up') {
      // 上涨动能衰竭
      dTrend -= exhaustionPenalty;
      confMul *= 1 - momentum.exhaustionLevel * 0.2;
      rec.warnings.push(
        `v5：上涨动能衰竭（程度${(momentum.exhaustionLevel * 100).toFixed(0)}%），警惕回调`
      );
    } else if (momentum.direction === 'down' && tp.direction === 'down') {
      // 下跌动能衰竭
      dTrend -= exhaustionPenalty;
      confMul *= 1 - momentum.exhaustionLevel * 0.2;
      rec.warnings.push(
        `v5：下跌动能衰竭（程度${(momentum.exhaustionLevel * 100).toFixed(0)}%），可能反弹`
      );
    }
  }

  // 应用调整
  rec.trendScore = v4ClampIntScore(rec.trendScore + dTrend);
  rec.riskScore = v4ClampIntScore(rec.riskScore + dRisk);
  rec.totalScore = v4RecomputeTotal(rec);

  tp.confidence = Math.min(0.95, Math.max(0, tp.confidence * confMul));

  if (confMul < 0.999) {
    tp.reasoning.unshift(`v5：增强校正，置信度系数×${confMul.toFixed(2)}`);
    tp.reasoning = tp.reasoning.slice(0, 5);
  }

  rec.reasons = rec.reasons.slice(0, 5);
  rec.warnings = rec.warnings.slice(0, 5);

  return {
    ...result,
    trendPrediction: tp,
    recommendation: rec,
    analyzedAt: Date.now(),
  };
}

/**
 * 完整的AI辅助分析 v6.0
 */
export function performAIAnalysis(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  allStockData?: Map<string, { code: string; name: string; klineData: KLineData[] }>,
  context?: AIComputationContext
): AIAnalysisResult {
  const trendPrediction = predictTrend(klineData, DEFAULT_TREND_CONFIG, context);

  let similarPatterns: SimilarPatternMatch[] | undefined;
  if (allStockData && allStockData.size > 0) {
    similarPatterns = findSimilarPatterns(opportunityData.code, klineData, allStockData);
  }

  const recommendation = calculateRecommendationScore(klineData, opportunityData);

  const signalConfluence = trendPrediction.totalSignals > 0 && trendPrediction.signalCount >= 4 && trendPrediction.signalCount >= trendPrediction.totalSignals * 0.6;

  let patternWinRate: number | undefined;
  if (similarPatterns && similarPatterns.length > 0) {
    const withPerf = similarPatterns.filter(p => p.historicalPerformance !== undefined);
    if (withPerf.length > 0) {
      const wins = withPerf.filter(p => (p.historicalPerformance?.changePercent ?? 0) > 0).length;
      patternWinRate = wins / withPerf.length;
    }
  }

  return v5ApplyEnhancedAdjust(klineData, {
    trendPrediction,
    similarPatterns,
    recommendation,
    analyzedAt: Date.now(),
    signalConfluence,
    patternWinRate,
  });
}

export function performAIAnalysisWithTimestamp(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  allStockData?: Map<string, { code: string; name: string; klineData: KLineData[] }>,
  context?: AIComputationContext
): { result: AIAnalysisResult; timestamp: number } {
  return { result: performAIAnalysis(klineData, opportunityData, allStockData, context), timestamp: Date.now() };
}
