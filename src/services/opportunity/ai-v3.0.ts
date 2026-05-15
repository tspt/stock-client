/**
 * AI辅助分析服务 v3.0
 * 提供基于历史数据的趋势预测、相似形态识别、智能选股推荐功能
 *
 * v3.0 核心特性（基于 v2.0）：
 * - 继承 v2.0 所有特性（市场状态检测、自适应阈值、动态权重等）
 * - 信号共识筛选：要求多个指标一致才发出信号（提高可靠性）
 * - 相似形态胜率筛选：基于历史相似股票的表现进行筛选（统计学支持）
 * - 风险收益比筛选：确保盈亏比合理（专业交易指标）
 * - 更严格的默认筛选条件，提高准确性
 *
 * 与 v2.0 的区别：
 * - v2.0：算法优化（动态权重 + 个性化阈值）
 * - v3.0：筛选增强（新增3个筛选维度，结果更可靠）
 *
 * 适用场景：追求高准确性的交易者、中长线投资、回测验证
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
 * 信号权重配置（用于动态调整各指标的重要性）
 */
interface SignalWeightConfig {
  /** 市场波动状态 */
  marketVolatility: 'high' | 'medium' | 'low';
  /** 趋势强度 */
  trendStrength: 'strong' | 'weak';
}

/**
 * 个股特性分析结果（用于自适应阈值）
 */
interface StockCharacteristics {
  /** 平均波动率（最近20日收盘价标准差/均值） */
  avgVolatility: number;
  /** RSI 25分位数（超卖阈值） */
  rsiPercentile25: number;
  /** RSI 75分位数（超买阈值） */
  rsiPercentile75: number;
  /** 布林带位置均值 */
  bbPositionMean: number;
  /** 成交量异常阈值（相对于均量的倍数） */
  volumeSpikeThreshold: number;
}

/**
 * 检测市场状态（高波动/低波动、强趋势/弱趋势）
 */
function detectMarketRegime(klineData: KLineData[]): {
  volatility: 'high' | 'medium' | 'low';
  trendStrength: 'strong' | 'weak';
} {
  const len = klineData.length;
  if (len < 20) {
    return { volatility: 'medium', trendStrength: 'weak' };
  }

  // 计算最近20日的波动率
  const recent = klineData.slice(-20);
  const closes = recent.map((k) => k.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / closes.length;
  const volatility = Math.sqrt(variance) / mean;

  // 判断波动率等级
  let volatilityLevel: 'high' | 'medium' | 'low';
  if (volatility > 0.03) {
    volatilityLevel = 'high';
  } else if (volatility < 0.015) {
    volatilityLevel = 'low';
  } else {
    volatilityLevel = 'medium';
  }

  // 判断趋势强度（通过线性回归斜率）
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
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const normalizedSlope = Math.abs(slope) / mean; // 归一化斜率

  // 判断趋势强度
  const trendStrength = normalizedSlope > 0.005 ? 'strong' : 'weak';

  return {
    volatility: volatilityLevel,
    trendStrength,
  };
}

/**
 * 计算个股特性（用于自适应阈值）
 */
function calculateStockCharacteristics(klineData: KLineData[]): StockCharacteristics {
  const len = klineData.length;
  const lookback = Math.min(60, len); // 使用最近60个交易日，不足则用全部
  const recent = klineData.slice(-lookback);

  // 1. 计算平均波动率
  const closes = recent.map((k) => k.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / closes.length;
  const avgVolatility = Math.sqrt(variance) / mean;

  // 2. 计算RSI分位数
  const rsi6 = calculateRSI(klineData, 6);
  const validRSI = rsi6.filter((r): r is number => r !== null);
  let rsiPercentile25 = 30; // 默认值
  let rsiPercentile75 = 70; // 默认值

  if (validRSI.length >= 20) {
    const sorted = [...validRSI].sort((a, b) => a - b);
    const idx25 = Math.floor(sorted.length * 0.25);
    const idx75 = Math.floor(sorted.length * 0.75);
    rsiPercentile25 = sorted[idx25];
    rsiPercentile75 = sorted[idx75];
  }

  // 3. 计算布林带位置均值
  const bb = calculateBollingerBands(klineData, 20, 2);
  let bbPositionMean = 0.5; // 默认中轨
  if (bb.upper.length > 0 && bb.lower.length > 0) {
    const positions: number[] = [];
    for (let i = 0; i < bb.upper.length; i++) {
      if (bb.upper[i] !== null && bb.lower[i] !== null && bb.upper[i]! - bb.lower[i]! > 0) {
        const pos =
          (closes[Math.min(i + 19, closes.length - 1)] - bb.lower[i]!) /
          (bb.upper[i]! - bb.lower[i]!);
        positions.push(pos);
      }
    }
    if (positions.length > 0) {
      bbPositionMean = positions.reduce((a, b) => a + b, 0) / positions.length;
    }
  }

  // 4. 计算成交量异常阈值（基于历史成交量的均值和标准差）
  const volumes = recent.map((k) => k.volume);
  const volMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const volVariance =
    volumes.reduce((acc, val) => acc + Math.pow(val - volMean, 2), 0) / volumes.length;
  const volStd = Math.sqrt(volVariance);
  // 异常阈值 = 均值 + 1.5倍标准差，至少为1.3倍
  const volumeSpikeThreshold = Math.max(1.3, 1 + (1.5 * volStd) / volMean);

  return {
    avgVolatility,
    rsiPercentile25,
    rsiPercentile75,
    bbPositionMean,
    volumeSpikeThreshold,
  };
}

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

  // === 第一步：检测市场状态和个股特性 ===
  const marketRegime = detectMarketRegime(klineData);
  const characteristics = calculateStockCharacteristics(klineData);

  // 构建权重配置
  const weightConfig: SignalWeightConfig = {
    marketVolatility: marketRegime.volatility,
    trendStrength: marketRegime.trendStrength,
  };

  // === 第二步：各指标分析（使用动态权重和自适应阈值）===

  // 1. 移动平均线分析
  if (config.useMovingAverages) {
    const maSignals = analyzeMovingAverages(klineData, weightConfig);
    signals.push(...maSignals);
  }

  // 2. RSI分析
  if (config.useRSI) {
    const rsiSignals = analyzeRSI(klineData, weightConfig, characteristics);
    signals.push(...rsiSignals);
  }

  // 3. MACD分析
  if (config.useMACD) {
    const macdSignals = analyzeMACD(klineData, weightConfig);
    signals.push(...macdSignals);
  }

  // 4. 布林带分析
  if (config.useBollingerBands) {
    const bbSignals = analyzeBollingerBands(klineData, characteristics);
    signals.push(...bbSignals);
  }

  // 5. 趋势形态分析
  const trendSignals = analyzeTrendPatterns(klineData, weightConfig);
  signals.push(...trendSignals);

  // 6. 成交量趋势确认（量价配合）
  const volumeSignals = analyzeVolumeTrend(klineData, weightConfig, characteristics);
  signals.push(...volumeSignals);

  // === 第三步：信号持续性检测 ===
  const persistentSignals = analyzeSignalPersistence(klineData);
  signals.push(...persistentSignals);

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
  klineData: KLineData[],
  weightConfig?: SignalWeightConfig
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

  // 根据市场状态调整权重
  const baseWeight = weightConfig?.trendStrength === 'strong' ? 0.35 : 0.3;
  const crossWeight = weightConfig?.trendStrength === 'strong' ? 0.3 : 0.25;

  // 价格与均线关系
  if (lastClose > lastMA5 && lastMA5 > lastMA10 && lastMA10 > lastMA20) {
    signals.push({ direction: 'up', weight: baseWeight, reason: '多头排列：价格>MA5>MA10>MA20' });
  } else if (lastClose < lastMA5 && lastMA5 < lastMA10 && lastMA10 < lastMA20) {
    signals.push({ direction: 'down', weight: baseWeight, reason: '空头排列：价格<MA5<MA10<MA20' });
  }

  // 金叉死叉
  if (ma5.length >= 2 && ma10.length >= 2) {
    const prevMA5 = ma5[ma5.length - 2];
    const prevMA10 = ma10[ma10.length - 2];

    if (prevMA5 <= prevMA10 && lastMA5 > lastMA10) {
      signals.push({ direction: 'up', weight: crossWeight, reason: 'MA5上穿MA10形成金叉' });
    } else if (prevMA5 >= prevMA10 && lastMA5 < lastMA10) {
      signals.push({ direction: 'down', weight: crossWeight, reason: 'MA5下穿MA10形成死叉' });
    }
  }

  return signals;
}

/**
 * RSI分析
 */
function analyzeRSI(
  klineData: KLineData[],
  weightConfig?: SignalWeightConfig,
  characteristics?: StockCharacteristics
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

  // 使用自适应阈值或默认值
  const oversoldThreshold = characteristics?.rsiPercentile25 ?? 30;
  const overboughtThreshold = characteristics?.rsiPercentile75 ?? 70;

  // 根据市场波动调整权重
  const rsiWeight = weightConfig?.marketVolatility === 'high' ? 0.25 : 0.2;
  const crossWeight = 0.15;

  // RSI超买超卖
  if (lastRSI6 < oversoldThreshold) {
    signals.push({
      direction: 'up',
      weight: rsiWeight,
      reason: `RSI(6)=${lastRSI6.toFixed(1)}进入超卖区（阈值${oversoldThreshold.toFixed(1)}）`,
    });
  } else if (lastRSI6 > overboughtThreshold) {
    signals.push({
      direction: 'down',
      weight: rsiWeight,
      reason: `RSI(6)=${lastRSI6.toFixed(1)}进入超买区（阈值${overboughtThreshold.toFixed(1)}）`,
    });
  }

  // RSI金叉死叉
  if (rsi6.length >= 2 && rsi12.length >= 2) {
    const prevRSI6 = rsi6[len - 2];
    const prevRSI12 = rsi12[len - 2];

    if (prevRSI6 !== null && prevRSI12 !== null) {
      if (prevRSI6 <= prevRSI12 && lastRSI6 > lastRSI12) {
        signals.push({ direction: 'up', weight: crossWeight, reason: 'RSI金叉' });
      } else if (prevRSI6 >= prevRSI12 && lastRSI6 < lastRSI12) {
        signals.push({ direction: 'down', weight: crossWeight, reason: 'RSI死叉' });
      }
    }
  }

  return signals;
}

/**
 * MACD分析
 */
function analyzeMACD(
  klineData: KLineData[],
  weightConfig?: SignalWeightConfig
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

  // 根据趋势强度调整权重
  const crossWeight = weightConfig?.trendStrength === 'strong' ? 0.3 : 0.25;
  const barWeight = 0.15;

  // MACD金叉死叉
  if (macd.dif.length >= 2 && macd.dea.length >= 2) {
    const prevDIF = macd.dif[len - 2];
    const prevDEA = macd.dea[len - 2];

    if (prevDIF !== null && prevDEA !== null) {
      if (prevDIF <= prevDEA && lastDIF > lastDEA) {
        signals.push({ direction: 'up', weight: crossWeight, reason: 'MACD金叉' });
      } else if (prevDIF >= prevDEA && lastDIF < lastDEA) {
        signals.push({ direction: 'down', weight: crossWeight, reason: 'MACD死叉' });
      }
    }
  }

  // MACD柱状图
  if (macd.macd.length >= 2) {
    const prevMACD = macd.macd[len - 2];
    if (prevMACD !== null) {
      if (lastMACD > 0 && lastMACD > prevMACD) {
        signals.push({ direction: 'up', weight: barWeight, reason: 'MACD红柱放大' });
      } else if (lastMACD < 0 && lastMACD < prevMACD) {
        signals.push({ direction: 'down', weight: barWeight, reason: 'MACD绿柱放大' });
      }
    }
  }

  return signals;
}

/**
 * 布林带分析
 */
function analyzeBollingerBands(
  klineData: KLineData[],
  characteristics?: StockCharacteristics
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

  // 根据个股波动特性调整阈值
  const volatility = characteristics?.avgVolatility ?? 0.02;
  let lowerThreshold = 0.2;
  let upperThreshold = 0.8;

  if (volatility > 0.03) {
    // 高波动股票，放宽阈值
    lowerThreshold = 0.15;
    upperThreshold = 0.85;
  } else if (volatility < 0.015) {
    // 低波动股票，收紧阈值
    lowerThreshold = 0.25;
    upperThreshold = 0.75;
  }

  if (position < lowerThreshold) {
    signals.push({
      direction: 'up',
      weight: 0.2,
      reason: `价格接近布林带下轨（位置${(position * 100).toFixed(1)}%）`,
    });
  } else if (position > upperThreshold) {
    signals.push({
      direction: 'down',
      weight: 0.2,
      reason: `价格接近布林带上轨（位置${(position * 100).toFixed(1)}%）`,
    });
  } else if (position >= 0.4 && position <= 0.6) {
    signals.push({ direction: 'sideways', weight: 0.15, reason: '价格在布林带中轨附近' });
  }

  return signals;
}

/**
 * 趋势形态分析
 */
function analyzeTrendPatterns(
  klineData: KLineData[],
  weightConfig?: SignalWeightConfig
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];

  const trends = detectTrendPatterns(klineData, 20);

  // 根据趋势强度调整权重
  const trendWeight = weightConfig?.trendStrength === 'strong' ? 0.3 : 0.25;
  const breakoutWeight = weightConfig?.trendStrength === 'strong' ? 0.35 : 0.3;

  if (trends.uptrend) {
    signals.push({ direction: 'up', weight: trendWeight, reason: '检测到上升趋势' });
  }
  if (trends.downtrend) {
    signals.push({ direction: 'down', weight: trendWeight, reason: '检测到下降趋势' });
  }
  if (trends.sideways) {
    signals.push({ direction: 'sideways', weight: 0.2, reason: '检测到横盘整理' });
  }
  if (trends.breakout) {
    signals.push({ direction: 'up', weight: breakoutWeight, reason: '检测到突破形态' });
  }
  if (trends.breakdown) {
    signals.push({ direction: 'down', weight: breakoutWeight, reason: '检测到跌破形态' });
  }

  return signals;
}

/**
 * 分析信号持续性（检测关键指标的连续出现情况）
 */
function analyzeSignalPersistence(
  klineData: KLineData[]
): Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> {
  const signals: Array<{ direction: 'up' | 'down' | 'sideways'; weight: number; reason: string }> =
    [];
  const len = klineData.length;

  if (len < 10) {
    return signals; // 数据不足，无法分析持续性
  }

  // 1. 均线持续性：检查MA5>MA10>MA20是否连续保持
  const ma5 = calculateMA(klineData, 5);
  const ma10 = calculateMA(klineData, 10);
  const ma20 = calculateMA(klineData, 20);

  if (ma5.length >= 7 && ma10.length >= 7 && ma20.length >= 7) {
    let bullishConsecutive = 0;
    let bearishConsecutive = 0;

    // 从后往前检查连续天数
    for (let i = ma5.length - 1; i >= Math.max(0, ma5.length - 10); i--) {
      const idx10 = i - (ma5.length - ma10.length);
      const idx20 = i - (ma5.length - ma20.length);

      if (idx10 >= 0 && idx20 >= 0) {
        if (ma5[i] > ma10[idx10] && ma10[idx10] > ma20[idx20]) {
          bullishConsecutive++;
        } else if (ma5[i] < ma10[idx10] && ma10[idx10] < ma20[idx20]) {
          bearishConsecutive++;
        } else {
          break; // 连续性中断
        }
      }
    }

    // 根据连续天数添加额外权重
    if (bullishConsecutive >= 7) {
      signals.push({
        direction: 'up',
        weight: 0.2,
        reason: `均线多头排列持续${bullishConsecutive}天，趋势稳定`,
      });
    } else if (bullishConsecutive >= 5) {
      signals.push({
        direction: 'up',
        weight: 0.15,
        reason: `均线多头排列持续${bullishConsecutive}天`,
      });
    } else if (bullishConsecutive >= 3) {
      signals.push({
        direction: 'up',
        weight: 0.1,
        reason: `均线多头排列持续${bullishConsecutive}天`,
      });
    }

    if (bearishConsecutive >= 7) {
      signals.push({
        direction: 'down',
        weight: 0.2,
        reason: `均线空头排列持续${bearishConsecutive}天，趋势稳定`,
      });
    } else if (bearishConsecutive >= 5) {
      signals.push({
        direction: 'down',
        weight: 0.15,
        reason: `均线空头排列持续${bearishConsecutive}天`,
      });
    } else if (bearishConsecutive >= 3) {
      signals.push({
        direction: 'down',
        weight: 0.1,
        reason: `均线空头排列持续${bearishConsecutive}天`,
      });
    }
  }

  // 2. 价格趋势持续性：收盘价连续上涨/下跌的天数
  let upConsecutive = 0;
  let downConsecutive = 0;

  for (let i = len - 1; i >= Math.max(1, len - 10); i--) {
    if (klineData[i].close > klineData[i - 1].close) {
      upConsecutive++;
      downConsecutive = 0; // 重置下跌计数
    } else if (klineData[i].close < klineData[i - 1].close) {
      downConsecutive++;
      upConsecutive = 0; // 重置上涨计数
    } else {
      break; // 平盘，连续性中断
    }
  }

  if (upConsecutive >= 5) {
    signals.push({
      direction: 'up',
      weight: 0.15,
      reason: `收盘价连续上涨${upConsecutive}天，动能强劲`,
    });
  } else if (upConsecutive >= 3) {
    signals.push({
      direction: 'up',
      weight: 0.1,
      reason: `收盘价连续上涨${upConsecutive}天`,
    });
  }

  if (downConsecutive >= 5) {
    signals.push({
      direction: 'down',
      weight: 0.15,
      reason: `收盘价连续下跌${downConsecutive}天，抛压持续`,
    });
  } else if (downConsecutive >= 3) {
    signals.push({
      direction: 'down',
      weight: 0.1,
      reason: `收盘价连续下跌${downConsecutive}天`,
    });
  }

  // 3. RSI持续性：RSI持续处于超买/超卖区
  const rsi6 = calculateRSI(klineData, 6);
  if (rsi6.length >= 5) {
    let oversoldConsecutive = 0;
    let overboughtConsecutive = 0;

    for (let i = rsi6.length - 1; i >= Math.max(0, rsi6.length - 10); i--) {
      if (rsi6[i] !== null) {
        if (rsi6[i]! < 30) {
          oversoldConsecutive++;
          overboughtConsecutive = 0;
        } else if (rsi6[i]! > 70) {
          overboughtConsecutive++;
          oversoldConsecutive = 0;
        } else {
          break; // 退出极端区域
        }
      }
    }

    if (oversoldConsecutive >= 3) {
      signals.push({
        direction: 'up',
        weight: 0.15,
        reason: `RSI持续超卖${oversoldConsecutive}天，反弹概率增加`,
      });
    }

    if (overboughtConsecutive >= 3) {
      signals.push({
        direction: 'down',
        weight: 0.15,
        reason: `RSI持续超买${overboughtConsecutive}天，回调风险加大`,
      });
    }
  }

  return signals;
}

/**
 * 成交量趋势分析（量价配合信号）
 */
function analyzeVolumeTrend(
  klineData: KLineData[],
  weightConfig?: SignalWeightConfig,
  characteristics?: StockCharacteristics
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

  // 使用自适应阈值或默认值
  const volumeSpikeThreshold = characteristics?.volumeSpikeThreshold ?? 1.3;

  // 根据市场状态调整权重
  const volumeWeight = weightConfig?.trendStrength === 'strong' ? 0.25 : 0.2;

  // 量能放大趋势
  if (lastVolMa5 > lastVolMa10 * volumeSpikeThreshold) {
    // 放量，结合价格方向判断
    const priceChange = klineData[len - 1].close - klineData[len - 2].close;
    if (priceChange > 0) {
      signals.push({ direction: 'up', weight: volumeWeight, reason: '放量上涨，量价配合良好' });
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

  // 风险评分
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
 * 风险评分
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

/**
 * 完整的AI辅助分析
 */
export function performAIAnalysis(
  klineData: KLineData[],
  opportunityData: StockOpportunityData,
  allStockData?: Map<string, { code: string; name: string; klineData: KLineData[] }>
): AIAnalysisResult {
  const analyzedAt = Date.now();

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

  return {
    trendPrediction,
    similarPatterns,
    recommendation,
    analyzedAt,
    signalConfluence,
    patternWinRate,
  };
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
