/**
 * AI 辅助分析 v4.0
 *
 * 由 v1.0（ai.ts）完整拷贝后独立演进：不使用 import ./ai。
 * 在 v1.0 相同逻辑基础上，于 performAIAnalysis 末尾增加「短周期结构」校正（连阴、短期均线、回撤等），
 * 用于缓解看多结论与近端走弱并存等情况。v1.0 源文件保持不变。
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
} from '@/utils/analysis/technicalIndicators';
import { detectTrendPatterns } from '@/utils/analysis/trendPatterns';
import { detectCandlestickPatternsInWindow } from '@/utils/analysis/candlestickPatterns';

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

/**
 * 基于多指标综合判断的趋势预测
 */
export function predictTrend(
  klineData: KLineData[],
  config: TrendPredictionConfig = DEFAULT_TREND_CONFIG
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

  // 1. 移动平均线分析
  if (config.useMovingAverages) {
    const maSignals = analyzeMovingAverages(klineData);
    signals.push(...maSignals);
  }

  // 2. RSI分析
  if (config.useRSI) {
    const rsiSignals = analyzeRSI(klineData);
    signals.push(...rsiSignals);
  }

  // 3. MACD分析
  if (config.useMACD) {
    const macdSignals = analyzeMACD(klineData);
    signals.push(...macdSignals);
  }

  // 4. 布林带分析
  if (config.useBollingerBands) {
    const bbSignals = analyzeBollingerBands(klineData);
    signals.push(...bbSignals);
  }

  // 5. 趋势形态分析
  const trendSignals = analyzeTrendPatterns(klineData);
  signals.push(...trendSignals);

  // 6. 成交量趋势确认（量价配合）
  const volumeSignals = analyzeVolumeTrend(klineData);
  signals.push(...volumeSignals);

  // 综合评分
  let upScore = 0;
  let downScore = 0;
  let sidewaysScore = 0;
  let signalCount = 0; // 与最终方向一致的信号数
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

  // 信号共识增强：当4+信号一致时提升置信度
  const signalConfluence =
    totalSignals > 0 && signalCount >= 4 && signalCount >= totalSignals * 0.6;
  if (signalConfluence) {
    confidence = Math.min(confidence * 1.2, 0.95); // 最多提升20%，上限95%
    reasoning.unshift(`${signalCount}/${totalSignals}个信号达成共识`);
  }

  // 计算支撑位和阻力位
  const { supportLevel, resistanceLevel } = calculateSupportResistance(klineData);

  // 预测目标价
  const targetPrice = calculateTargetPrice(lastClose, direction, supportLevel, resistanceLevel);

  // 计算风险收益比
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
 * 移动平均线分析
 */
function analyzeMovingAverages(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  // 计算MA5, MA10, MA20
  const ma5 = calculateMA(klineData, 5);
  const ma10 = calculateMA(klineData, 10);
  const ma20 = calculateMA(klineData, 20);

  if (ma5.length === 0 || ma10.length === 0 || ma20.length === 0) {
    return signals;
  }

  const lastMA5 = ma5[ma5.length - 1];
  const lastMA10 = ma10[ma10.length - 1];
  const lastMA20 = ma20[ma20.length - 1];
  const lastClose = klineData[len - 1].close;

  // 价格与均线关系
  if (lastClose > lastMA5 && lastMA5 > lastMA10 && lastMA10 > lastMA20) {
    signals.push({ direction: 'up', weight: 0.3, reason: '多头排列：价格>MA5>MA10>MA20' });
  } else if (lastClose < lastMA5 && lastMA5 < lastMA10 && lastMA10 < lastMA20) {
    signals.push({ direction: 'down', weight: 0.3, reason: '空头排列：价格<MA5<MA10<MA20' });
  }

  // 金叉死叉
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
 * RSI分析
 */
function analyzeRSI(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const rsi6 = calculateRSI(klineData, 6);
  const rsi12 = calculateRSI(klineData, 12);

  if (rsi6.length === 0 || rsi12.length === 0) {
    return signals;
  }

  const lastRSI6 = rsi6[len - 1];
  const lastRSI12 = rsi12[len - 1];

  if (lastRSI6 === null || lastRSI12 === null) {
    return signals;
  }

  // RSI超买超卖
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

  // RSI金叉死叉
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
 * MACD分析
 */
function analyzeMACD(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const macd = calculateMACD(klineData);

  if (macd.dif.length === 0 || macd.dea.length === 0) {
    return signals;
  }

  const lastDIF = macd.dif[len - 1];
  const lastDEA = macd.dea[len - 1];
  const lastMACD = macd.macd[len - 1];

  if (lastDIF === null || lastDEA === null || lastMACD === null) {
    return signals;
  }

  // MACD金叉死叉
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

  // MACD柱状图
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
 * 布林带分析
 */
function analyzeBollingerBands(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  const bb = calculateBollingerBands(klineData, 20, 2);

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

  // 价格位置
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
 * 成交量趋势分析（量价配合信号）
 */
function analyzeVolumeTrend(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  if (len < 15) return signals;

  // 计算成交量MA5和MA10
  const volumes = klineData.map((k) => k.volume);
  const volMa5 = calculateSimpleMA(volumes, 5);
  const volMa10 = calculateSimpleMA(volumes, 10);

  if (volMa5.length < 2 || volMa10.length < 2) return signals;

  const lastVolMa5 = volMa5[volMa5.length - 1];
  const lastVolMa10 = volMa10[volMa10.length - 1];
  const prevVolMa5 = volMa5[volMa5.length - 2];
  const prevVolMa10 = volMa10[volMa10.length - 2];

  // 量能放大趋势
  if (lastVolMa5 > lastVolMa10 * 1.3) {
    // 放量，结合价格方向判断
    const priceChange = klineData[len - 1].close - klineData[len - 2].close;
    if (priceChange > 0) {
      signals.push({ direction: 'up', weight: 0.2, reason: '放量上涨，量价配合良好' });
    } else {
      signals.push({ direction: 'down', weight: 0.15, reason: '放量下跌，抛压较大' });
    }
  }

  // 缩量趋势
  if (lastVolMa5 < lastVolMa10 * 0.7) {
    signals.push({ direction: 'sideways', weight: 0.1, reason: '成交量萎缩，市场观望' });
  }

  // 量能金叉/死叉
  if (prevVolMa5 <= prevVolMa10 && lastVolMa5 > lastVolMa10) {
    signals.push({ direction: 'up', weight: 0.15, reason: '成交量MA5上穿MA10' });
  } else if (prevVolMa5 >= prevVolMa10 && lastVolMa5 < lastVolMa10) {
    signals.push({ direction: 'down', weight: 0.15, reason: '成交量MA5下穿MA10' });
  }

  // 量价背离：价格上涨但成交量下降
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
 * 计算支撑位和阻力位
 */
function calculateSupportResistance(klineData: KLineData[]): {
  supportLevel?: number;
  resistanceLevel?: number;
} {
  const len = klineData.length;
  if (len < 20) {
    return {};
  }

  const recent = klineData.slice(-20);
  const highs = recent.map((k) => k.high);
  const lows = recent.map((k) => k.low);

  const resistanceLevel = Math.max(...highs);
  const supportLevel = Math.min(...lows);

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
  if (direction === 'sideways') {
    return undefined;
  }

  if (direction === 'up' && resistanceLevel) {
    // 上涨目标价为阻力位
    return resistanceLevel;
  }

  if (direction === 'down' && supportLevel) {
    // 下跌目标价为支撑位
    return supportLevel;
  }

  return undefined;
}

/**
 * 计算简单移动平均线
 */
function calculateMA(klineData: KLineData[], period: number): number[] {
  const result: number[] = [];
  const len = klineData.length;

  if (len < period) {
    return result;
  }

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += klineData[i - j].close;
    }
    result.push(sum / period);
  }

  return result;
}

/**
 * 相似形态识别配置
 */
export interface PatternRecognitionConfig {
  /** 搜索范围（股票数量） */
  searchScope: number;
  /** 最小相似度阈值 */
  minSimilarity: number;
  /** 最大返回结果数 */
  maxResults: number;
  /** 观察周期（天） */
  observationPeriod: number;
}

const DEFAULT_PATTERN_CONFIG: PatternRecognitionConfig = {
  searchScope: 500,
  minSimilarity: 0.7,
  maxResults: 5,
  observationPeriod: 10,
};

/**
 * 在当前股票池中查找相似形态
 */
export function findSimilarPatterns(
  currentCode: string,
  currentKLineData: KLineData[],
  allStockData: Map<string, { code: string; name: string; klineData: KLineData[] }>,
  config: PatternRecognitionConfig = DEFAULT_PATTERN_CONFIG
): SimilarPatternMatch[] {
  const results: SimilarPatternMatch[] = [];
  const currentLen = currentKLineData.length;

  if (currentLen < 20) {
    return results;
  }

  // 提取当前股票的形态特征
  const currentFeatures = extractPatternFeatures(currentKLineData);

  // 将Map转换为数组并按股票代码排序，确保遍历顺序一致
  const sortedStocks = Array.from(allStockData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // 遍历所有股票数据
  let searchedCount = 0;
  for (const [code, stockData] of sortedStocks) {
    if (searchedCount >= config.searchScope) {
      break;
    }

    // 跳过自己（通过股票代码判断）
    if (code === currentCode) {
      continue;
    }

    const features = extractPatternFeatures(stockData.klineData);
    const similarity = calculateSimilarity(currentFeatures, features);

    if (similarity >= config.minSimilarity) {
      // 计算历史表现
      const historicalPerformance = calculateHistoricalPerformance(
        stockData.klineData,
        config.observationPeriod
      );

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

  // 按相似度排序并返回前N个
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, config.maxResults);
}

/**
 * 提取形态特征
 */
function extractPatternFeatures(klineData: KLineData[]): {
  priceChanges: number[];
  volumeChanges: number[];
  volatility: number;
  trend: number;
} {
  const len = klineData.length;
  const lookback = Math.min(20, len);
  const recent = klineData.slice(-lookback);

  // 价格变化率
  const priceChanges: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const change = ((recent[i].close - recent[i - 1].close) / recent[i - 1].close) * 100;
    priceChanges.push(change);
  }

  // 成交量变化率
  const volumeChanges: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].volume > 0) {
      const change = ((recent[i].volume - recent[i - 1].volume) / recent[i - 1].volume) * 100;
      volumeChanges.push(change);
    }
  }

  // 波动率
  const closes = recent.map((k) => k.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / closes.length;
  const volatility = Math.sqrt(variance) / mean;

  // 趋势（线性回归斜率）
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
  const trend = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  return {
    priceChanges,
    volumeChanges,
    volatility,
    trend,
  };
}

/**
 * 计算两个形态特征的相似度
 */
function calculateSimilarity(
  features1: ReturnType<typeof extractPatternFeatures>,
  features2: ReturnType<typeof extractPatternFeatures>
): number {
  let similarity = 0;
  let weightSum = 0;

  // 价格变化相似度（权重0.4）
  const priceSimilarity = calculateArraySimilarity(features1.priceChanges, features2.priceChanges);
  similarity += priceSimilarity * 0.4;
  weightSum += 0.4;

  // 成交量变化相似度（权重0.2）
  const volumeSimilarity = calculateArraySimilarity(
    features1.volumeChanges,
    features2.volumeChanges
  );
  similarity += volumeSimilarity * 0.2;
  weightSum += 0.2;

  // 波动率相似度（权重0.2）
  const volatilityDiff = Math.abs(features1.volatility - features2.volatility);
  const volatilitySimilarity = Math.max(0, 1 - volatilityDiff * 10);
  similarity += volatilitySimilarity * 0.2;
  weightSum += 0.2;

  // 趋势相似度（权重0.2）
  const trendDiff = Math.abs(features1.trend - features2.trend);
  const avgPrice = Math.abs(features1.trend + features2.trend) / 2 || 1;
  const trendSimilarity = Math.max(0, 1 - trendDiff / avgPrice);
  similarity += trendSimilarity * 0.2;
  weightSum += 0.2;

  return weightSum > 0 ? similarity / weightSum : 0;
}

/**
 * 计算两个数组的相似度（使用余弦相似度）
 */
function calculateArraySimilarity(arr1: number[], arr2: number[]): number {
  const len = Math.min(arr1.length, arr2.length);
  if (len === 0) return 0;

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += arr1[i] * arr2[i];
    magnitude1 += arr1[i] * arr1[i];
    magnitude2 += arr2[i] * arr2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 计算历史表现
 */
function calculateHistoricalPerformance(
  klineData: KLineData[],
  observationPeriod: number
): { changePercent: number; period: number } | undefined {
  const len = klineData.length;
  if (len < observationPeriod + 1) {
    return undefined;
  }

  const startIndex = len - observationPeriod - 1;
  const startPrice = klineData[startIndex].close;
  const endPrice = klineData[len - 1].close;

  const changePercent = ((endPrice - startPrice) / startPrice) * 100;

  return {
    changePercent,
    period: observationPeriod,
  };
}

/**
 * 智能选股推荐配置
 */
export interface RecommendationConfig {
  /** 技术面权重 */
  technicalWeight: number;
  /** 形态权重 */
  patternWeight: number;
  /** 趋势权重 */
  trendWeight: number;
  /** 风险权重 */
  riskWeight: number;
}

const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  technicalWeight: 0.3,
  patternWeight: 0.25,
  trendWeight: 0.25,
  riskWeight: 0.2,
};

/**
 * 计算智能选股推荐评分
 */
export function calculateRecommendationScore(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  config: RecommendationConfig = DEFAULT_RECOMMENDATION_CONFIG
): SmartRecommendationScore {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // 技术面评分
  const technicalScore = calculateTechnicalScore(klineData, opportunityData, reasons, warnings);

  // 形态评分
  const patternScore = calculatePatternScore(klineData, opportunityData, reasons, warnings);

  // 趋势评分
  const trendScore = calculateTrendScore(klineData, opportunityData, reasons, warnings);

  // 安全评分
  const riskScore = calculateRiskScore(klineData, opportunityData, reasons, warnings);

  // 综合评分
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

/**
 * 技术面评分
 */
function calculateTechnicalScore(
  klineData: KLineData[],
  data: StockOpportunityData,
  reasons: string[],
  warnings: string[]
): number {
  let score = 50; // 基础分
  const len = klineData.length;

  // RSI评分
  if (data.kdjJ !== undefined) {
    if (data.kdjJ < 20) {
      score += 15;
      reasons.push('KDJ-J值处于低位，可能超卖');
    } else if (data.kdjJ > 80) {
      score -= 10;
      warnings.push('KDJ-J值处于高位，注意回调风险');
    }
  }

  // 均线评分
  if (data.ma5 !== undefined && data.ma10 !== undefined && data.ma20 !== undefined) {
    if (data.ma5 > data.ma10 && data.ma10 > data.ma20) {
      score += 15;
      reasons.push('均线多头排列');
    } else if (data.ma5 < data.ma10 && data.ma10 < data.ma20) {
      score -= 15;
      warnings.push('均线空头排列');
    }
  }

  // 成交量评分
  if (len >= 10) {
    const recentVolume = klineData.slice(-5).reduce((sum, k) => sum + k.volume, 0) / 5;
    const prevVolume = klineData.slice(-10, -5).reduce((sum, k) => sum + k.volume, 0) / 5;

    if (prevVolume > 0 && recentVolume > prevVolume * 1.5) {
      score += 10;
      reasons.push('成交量明显放大');
    }
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * 形态评分
 */
function calculatePatternScore(
  klineData: KLineData[],
  data: StockOpportunityData,
  reasons: string[],
  warnings: string[]
): number {
  let score = 50;

  // K线形态评分
  if (data.sharpMovePatterns) {
    const patterns = data.sharpMovePatterns;

    if (patterns.dropThenFlatThenRise) {
      score += 20;
      reasons.push('出现急跌-横盘-急涨形态，可能是底部反转信号');
    }

    if (patterns.onlyDrop) {
      score -= 10;
      warnings.push('近期有急跌，注意风险');
    }
  }

  // 横盘形态评分
  if (data.consolidation?.isConsolidation) {
    score += 15;
    reasons.push(`处于横盘整理状态（${data.consolidation.matchedTypeLabels.join(', ')}）`);
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * 趋势评分
 */
function calculateTrendScore(
  klineData: KLineData[],
  data: StockOpportunityData,
  reasons: string[],
  warnings: string[]
): number {
  let score = 50;

  // 趋势形态评分
  if (data.trendLine?.isHit) {
    score += 20;
    reasons.push('沿趋势线运行，走势稳健');
  }

  // 涨跌幅评分
  if (data.changePercent !== undefined) {
    if (data.changePercent > 3 && data.changePercent < 7) {
      score += 10;
      reasons.push('今日涨幅适中，动能良好');
    } else if (data.changePercent > 9) {
      score -= 5;
      warnings.push('今日涨幅过大，警惕回调');
    } else if (data.changePercent < -5) {
      score -= 10;
      warnings.push('今日跌幅较大');
    }
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * 安全评分
 */
function calculateRiskScore(
  klineData: KLineData[],
  data: StockOpportunityData,
  reasons: string[],
  warnings: string[]
): number {
  let score = 50; // 分数越高风险越低

  // ST股票风险
  if (data.name.includes('ST')) {
    score -= 20;
    warnings.push('ST股票，风险较高');
  }

  // 市盈率风险
  if (data.peRatio !== undefined) {
    if (data.peRatio > 100) {
      score -= 15;
      warnings.push(`市盈率过高(${data.peRatio.toFixed(1)})`);
    } else if (data.peRatio > 0 && data.peRatio < 50) {
      score += 10;
      reasons.push('市盈率合理');
    }
  }

  // 换手率风险
  if (data.turnoverRate !== undefined) {
    if (data.turnoverRate > 20) {
      score -= 10;
      warnings.push('换手率过高，筹码不稳定');
    } else if (data.turnoverRate > 5 && data.turnoverRate <= 20) {
      score += 5;
      reasons.push('换手率活跃');
    }
  }

  // 波动率风险
  const len = klineData.length;
  if (len >= 20) {
    const recent = klineData.slice(-20);
    const closes = recent.map((k) => k.close);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / closes.length;
    const volatility = Math.sqrt(variance) / mean;

    if (volatility > 0.05) {
      score -= 10;
      warnings.push('近期波动率较高');
    }
  }

  return Math.min(Math.max(score, 0), 100);
}

// ========== v4.0：短周期结构校正（独立于 v1.0 源文件，仅存在于本模块） ==========

const V4_REC_WEIGHT = {
  technical: 0.3,
  pattern: 0.25,
  trend: 0.25,
  risk: 0.2,
} as const;

function v4ClampIntScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function v4RecomputeTotal(rec: SmartRecommendationScore): number {
  return v4ClampIntScore(
    rec.technicalScore * V4_REC_WEIGHT.technical +
      rec.patternScore * V4_REC_WEIGHT.pattern +
      rec.trendScore * V4_REC_WEIGHT.trend +
      rec.riskScore * V4_REC_WEIGHT.risk
  );
}

function v4CountTrailingLowerCloses(closes: number[]): number {
  if (closes.length < 2) return 0;
  let n = 0;
  for (let i = closes.length - 1; i >= 1; i--) {
    if (closes[i] < closes[i - 1]) n++;
    else break;
  }
  return n;
}

function v4SmaLast(closes: number[], period: number): number | undefined {
  if (closes.length < period) return undefined;
  const slice = closes.slice(-period);
  let s = 0;
  for (let i = 0; i < slice.length; i++) s += slice[i];
  return s / period;
}

function v4WindowReturnPct(closes: number[], window: number): number | undefined {
  if (closes.length < window + 1) return undefined;
  const a = closes[closes.length - 1 - window];
  const b = closes[closes.length - 1];
  if (a <= 0) return undefined;
  return ((b - a) / a) * 100;
}

interface V4ShortRead {
  trailingDownCloses: number;
  lastClose: number;
  ma5?: number;
  ma10?: number;
  high20?: number;
  ret5?: number;
}

function v4ReadShortStructure(klineData: KLineData[]): V4ShortRead | null {
  const len = klineData.length;
  if (len < 10) return null;
  const closes = klineData.map((k) => k.close);
  const lastClose = closes[len - 1];
  const ma5 = v4SmaLast(closes, 5);
  const ma10 = v4SmaLast(closes, 10);
  let high20: number | undefined;
  if (closes.length >= 20) {
    high20 = Math.max(...closes.slice(-20));
  }
  const ret5 = v4WindowReturnPct(closes, 5);
  return {
    trailingDownCloses: v4CountTrailingLowerCloses(closes),
    lastClose,
    ma5,
    ma10,
    high20,
    ret5,
  };
}

function v4PullbackFromHigh(high: number, last: number): number {
  if (high <= 0) return 0;
  return (high - last) / high;
}

function v4ApplyStructuralAdjust(klineData: KLineData[], base: AIAnalysisResult): AIAnalysisResult {
  const recIn = base.recommendation;
  const tpIn = base.trendPrediction;
  if (!recIn || !tpIn) {
    return {
      ...base,
      analyzedAt: Date.now(),
    };
  }

  const rec: SmartRecommendationScore = {
    technicalScore: recIn.technicalScore,
    patternScore: recIn.patternScore,
    trendScore: recIn.trendScore,
    riskScore: recIn.riskScore,
    totalScore: recIn.totalScore,
    reasons: [...(recIn.reasons || [])],
    warnings: [...(recIn.warnings || [])],
  };

  const tp: TrendPrediction = {
    ...tpIn,
    reasoning: [...(tpIn.reasoning || [])],
  };

  const rd = v4ReadShortStructure(klineData);
  let confMul = 1;
  let dTrend = 0;
  let dRisk = 0;

  if (rd) {
    const weakShortMA =
      rd.ma5 !== undefined &&
      rd.ma10 !== undefined &&
      rd.lastClose < rd.ma5 &&
      rd.ma5 < rd.ma10;
    const bullishShortMA =
      rd.ma5 !== undefined &&
      rd.ma10 !== undefined &&
      rd.lastClose > rd.ma5 &&
      rd.ma5 > rd.ma10;

    const pull =
      rd.high20 !== undefined ? v4PullbackFromHigh(rd.high20, rd.lastClose) : 0;

    if (tp.direction === 'up') {
      if (rd.trailingDownCloses >= 3) {
        dTrend -= 14;
        dRisk -= 6;
        confMul *= 0.82;
        rec.warnings.push('v4：近端连续多根收盘价走低，与看涨结论冲突，已下调评分与置信度');
      } else if (rd.trailingDownCloses >= 2) {
        dTrend -= 8;
        dRisk -= 3;
        confMul *= 0.88;
        rec.warnings.push('v4：近端连阴，弱势确认中，已适度下调评分');
      }

      if (weakShortMA) {
        dTrend -= 10;
        confMul *= 0.9;
        rec.warnings.push('v4：价在短期均线之下且均线空头，追高风险较高');
      }

      if (rd.ret5 !== undefined && rd.ret5 < -4) {
        dTrend -= 6;
        confMul *= 0.92;
        rec.warnings.push('v4：近5根K线回报偏弱，注意下跌惯性');
      }

      if (pull > 0.14) {
        dTrend -= 5;
        confMul *= 0.94;
        rec.warnings.push('v4：距20日高点回撤较大，趋势看涨与位置需复核');
      }

      if (bullishShortMA && rd.trailingDownCloses === 0 && pull < 0.08) {
        dTrend += 4;
        dRisk += 2;
        rec.reasons.unshift('v4：短周期均线多头且未见连阴，与趋势判断一致');
      }
    }

    if (tp.direction === 'sideways') {
      if (bullishShortMA && rd.ret5 !== undefined && rd.ret5 > 0.8) {
        dTrend += 5;
        rec.reasons.unshift('v4：横盘背景下短均线多头且近端偏强，可适当关注');
      }
    }

    if (tp.direction === 'down' && rd.trailingDownCloses >= 3 && weakShortMA) {
      dRisk -= 5;
      rec.warnings.push('v4：下跌方向下短周期仍走弱，注意承接风险');
    }
  }

  rec.trendScore = v4ClampIntScore(rec.trendScore + dTrend);
  rec.riskScore = v4ClampIntScore(rec.riskScore + dRisk);
  rec.totalScore = v4RecomputeTotal(rec);

  tp.confidence = Math.min(0.95, Math.max(0, tp.confidence * confMul));

  if (rd && confMul < 0.999) {
    tp.reasoning.unshift(`v4：短周期结构校正，置信度系数×${confMul.toFixed(2)}`);
    tp.reasoning = tp.reasoning.slice(0, 5);
  }

  rec.reasons = rec.reasons.slice(0, 5);
  rec.warnings = rec.warnings.slice(0, 5);

  return {
    ...base,
    trendPrediction: tp,
    recommendation: rec,
    analyzedAt: Date.now(),
  };
}

/**
 * 完整的AI辅助分析（v4.0：v1 等价管线 + 短周期结构校正）
 */
export function performAIAnalysis(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  allStockData?: Map<string, { code: string; name: string; klineData: KLineData[] }>
): AIAnalysisResult {
  // 趋势预测
  const trendPrediction = predictTrend(klineData);

  // 相似形态识别（如果有股票池数据）
  let similarPatterns: SimilarPatternMatch[] | undefined;
  if (allStockData && allStockData.size > 0) {
    similarPatterns = findSimilarPatterns(opportunityData.code, klineData, allStockData);
  }

  // 智能推荐评分
  const recommendation = calculateRecommendationScore(klineData, opportunityData);

  // 信号共识判定
  const signalConfluence =
    trendPrediction.totalSignals > 0 &&
    trendPrediction.signalCount >= 4 &&
    trendPrediction.signalCount >= trendPrediction.totalSignals * 0.6;

  // 相似形态历史胜率
  let patternWinRate: number | undefined;
  if (similarPatterns && similarPatterns.length > 0) {
    const withPerformance = similarPatterns.filter((p) => p.historicalPerformance !== undefined);
    if (withPerformance.length > 0) {
      const winCount = withPerformance.filter(
        (p) => (p.historicalPerformance?.changePercent ?? 0) > 0
      ).length;
      patternWinRate = winCount / withPerformance.length;
    }
  }

  return v4ApplyStructuralAdjust(klineData, {
    trendPrediction,
    similarPatterns,
    recommendation,
    analyzedAt: Date.now(),
    signalConfluence,
    patternWinRate,
  });
}

/**
 * 执行 AI 分析并返回包含时间戳的完整结果（用于 Worker 筛选）
 */
export function performAIAnalysisWithTimestamp(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  allStockData?: Map<string, { code: string; name: string; klineData: KLineData[] }>
): { result: AIAnalysisResult; timestamp: number } {
  const timestamp = Date.now();
  const result = performAIAnalysis(klineData, opportunityData, allStockData);
  return { result, timestamp };
}
