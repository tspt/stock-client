/**
 * ML买点识别模型 - v5.0 完整版（32个特征）
 *
 * 基于随机森林的买点识别模型（分行业）
 * 训练时间: 2026-05-23
 *
 * 模型特点:
 *   - 69个行业独立模型
 *   - 随机森林算法（多树投票）
 *   - 32个技术特征（完整版本，包含当日形态特征）
 *   - 信号定义：买入后1/2/3/5日至少两种涨幅大于2%
 *
 * 使用说明:
 *   - 此文件为v5.0完整版本，包含所有32个特征的计算
 *   - 如需切换版本，修改导入路径即可
 */

import type { KLineData } from '@/types/stock';
import type { LoadedIndustryModel } from '@/types/industryModel';

// ==================== 模型元数据 ====================

export const MODEL_METADATA = {
  version: 'v5.0-rf-full',
  algorithm: 'RandomForest',
  trainingDate: '2026-05-23',
  featureCount: 32,
  industries: 69,
  signalDefinition: '买入后1/2/3/5日至少两种涨幅大于2%',
};

// ==================== 决策树类型定义 ====================

interface DecisionTreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
  prediction?: number;
  probability?: number;
  samples?: number;
}

// ==================== 随机森林模型类型 ====================

interface RandomForestModel {
  industryName: string;
  version: string;
  trees: Array<{ tree: DecisionTreeNode }>;
  featureNames: string[];
  hyperparameters: {
    nTrees: number;
    maxDepth: number;
    minSamplesLeaf: number;
    maxFeatures: number;
  };
  performance?: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    auc: number;
  };
}

// ==================== 特征名称映射（32个特征）====================

const FEATURE_NAMES = [
  // A. 价格动量特征（8个）
  'return_1d', // 0: 1日收益率
  'return_3d', // 1: 3日累计收益率
  'return_5d', // 2: 5日累计收益率
  'return_10d', // 3: 10日累计收益率
  'ma5_deviation', // 4: 相对5日均线偏离度
  'ma20_deviation', // 5: 相对20日均线偏离度
  'ma60_deviation', // 6: 相对60日均线偏离度
  'price_position', // 7: 价格位置指标

  // B. 波动性特征（7个）
  'volatility_5d', // 8: 5日年化波动率
  'volatility_10d', // 9: 10日年化波动率
  'atr_normalized', // 10: 归一化ATR
  'bb_width', // 11: 布林带宽度
  'daily_amplitude', // 12: 当日振幅
  'max_amplitude_5d', // 13: 近5日最大振幅
  'price_range_ratio', // 14: 价格区间比率

  // C. 成交量特征（6个）
  'volume_ratio', // 15: 量比
  'vol_change_5d', // 16: 成交量5日变化率
  'vol_trend', // 17: 成交量趋势斜率
  'price_volume_corr', // 18: 价量相关系数
  'up_vol_ratio', // 19: 上涨日成交量占比
  'money_flow_proxy', // 20: 资金流向代理

  // D. 技术形态特征（11个）
  'body_size', // 21: K线实体大小
  'upper_shadow', // 22: 上影线比例
  'lower_shadow', // 23: 下影线比例
  'consecutive_up', // 24: 连续上涨天数
  'consecutive_down', // 25: 连续下跌天数
  'rsi_14', // 26: RSI(14)
  'macd_histogram', // 27: MACD柱状图值
  'day0_return', // 28: 当日涨跌幅 (特征化过滤)
  'day0_lower_shadow_ratio', // 29: 当日下影线占比 (特征化过滤)
  'day0_upper_shadow_ratio', // 30: 当日上影线占比
  'day0_body_ratio', // 31: 当日实体占比

  // E. 强逻辑特征（4个）
  'vol_breakout', // 32: 放量突破
  'bullish_alignment', // 33: 均线多头排列
  'low_vol_pullback', // 34: 缩量回踩
  'relative_strength_proxy', // 35: 相对强度代理
];

// ==================== 辅助函数 ====================

/**
 * 计算移动平均线
 */
function calculateMA(data: KLineData[], period: number): number | null {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((s, k) => s + k.close, 0);
  return sum / period;
}

/**
 * 计算标准差
 */
function calculateStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 计算布林带
 */
function calculateBollingerBands(
  data: KLineData[],
  period: number = 20,
  multiplier: number = 2
): { upper: number | null; middle: number | null; lower: number | null } {
  if (data.length < period) {
    return { upper: null, middle: null, lower: null };
  }

  const closes = data.slice(-period).map((k) => k.close);
  const middle = closes.reduce((s, c) => s + c, 0) / period;
  const variance = closes.reduce((s, c) => s + Math.pow(c - middle, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: middle + multiplier * std,
    middle: middle,
    lower: middle - multiplier * std,
  };
}

/**
 * 计算ATR（平均真实波幅）
 */
function calculateATR(data: KLineData[], period: number = 14): number | null {
  if (data.length < period + 1) return null;

  let trSum = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);

    const tr = Math.max(highLow, highClose, lowClose);
    trSum += tr;
  }

  return trSum / period;
}

/**
 * 计算RSI
 */
function calculateRSI(data: KLineData[], period: number = 14): number | null {
  if (data.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 计算MACD柱状图
 */
function calculateMACDHistogram(data: KLineData[]): number | null {
  if (data.length < 26) return null;

  // 简化的MACD计算（EMA12 - EMA26）
  const ema12 = calculateEMA(
    data.map((k) => k.close),
    12
  );
  const ema26 = calculateEMA(
    data.map((k) => k.close),
    26
  );

  if (ema12 === null || ema26 === null) return null;

  return ema12 - ema26;
}

/**
 * 计算EMA
 */
function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * 计算线性回归斜率
 */
function calculateSlope(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * 计算相关系数
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let xVar = 0;
  let yVar = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    xVar += xDiff * xDiff;
    yVar += yDiff * yDiff;
  }

  const denominator = Math.sqrt(xVar * yVar);
  return denominator === 0 ? 0 : numerator / denominator;
}

// ==================== 完整特征计算函数（28个特征）====================

/**
 * 计算所有28个特征
 */
function calculateFeatures(klineData: KLineData[], index: number): number[] | null {
  // 需要至少60天数据才能计算完整特征
  if (index < 60) return null;

  const slice = klineData.slice(0, index + 1);
  const current = klineData[index];
  const close = current.close;
  const open = current.open;
  const high = current.high;
  const low = current.low;
  const volume = current.volume;

  const features: number[] = [];

  // ==================== A. 价格动量特征（8个）====================

  // 0: 1日收益率
  const return_1d =
    slice.length >= 2 ? (close - slice[slice.length - 2].close) / slice[slice.length - 2].close : 0;
  features.push(return_1d);

  // 1: 3日累计收益率
  const return_3d =
    slice.length >= 4 ? (close - slice[slice.length - 4].close) / slice[slice.length - 4].close : 0;
  features.push(return_3d);

  // 2: 5日累计收益率
  const return_5d =
    slice.length >= 6 ? (close - slice[slice.length - 6].close) / slice[slice.length - 6].close : 0;
  features.push(return_5d);

  // 3: 10日累计收益率
  const return_10d =
    slice.length >= 11
      ? (close - slice[slice.length - 11].close) / slice[slice.length - 11].close
      : 0;
  features.push(return_10d);

  // 4: 相对5日均线偏离度
  const ma5 = calculateMA(slice, 5);
  const ma5_deviation = ma5 ? (close - ma5) / ma5 : 0;
  features.push(ma5_deviation);

  // 5: 相对20日均线偏离度
  const ma20 = calculateMA(slice, 20);
  const ma20_deviation = ma20 ? (close - ma20) / ma20 : 0;
  features.push(ma20_deviation);

  // 6: 相对60日均线偏离度
  const ma60 = calculateMA(slice, 60);
  const ma60_deviation = ma60 ? (close - ma60) / ma60 : 0;
  features.push(ma60_deviation);

  // 7: 价格位置指标（当前价格在近期高低点的位置）
  const lookback20 = slice.slice(-20);
  const highest20 = Math.max(...lookback20.map((k) => k.high));
  const lowest20 = Math.min(...lookback20.map((k) => k.low));
  const price_position = highest20 !== lowest20 ? (close - lowest20) / (highest20 - lowest20) : 0.5;
  features.push(price_position);

  // ==================== B. 波动性特征（7个）====================

  // 8: 5日年化波动率
  const returns_5d = slice
    .slice(-6)
    .slice(0, -1)
    .map((k, i, arr) => (i > 0 ? (k.close - arr[i - 1].close) / arr[i - 1].close : 0));
  const volatility_5d = calculateStd(returns_5d) * Math.sqrt(252);
  features.push(volatility_5d);

  // 9: 10日年化波动率
  const returns_10d = slice
    .slice(-11)
    .slice(0, -1)
    .map((k, i, arr) => (i > 0 ? (k.close - arr[i - 1].close) / arr[i - 1].close : 0));
  const volatility_10d = calculateStd(returns_10d) * Math.sqrt(252);
  features.push(volatility_10d);

  // 10: 归一化ATR
  const atr = calculateATR(slice, 14);
  const atr_normalized = atr ? atr / close : 0;
  features.push(atr_normalized);

  // 11: 布林带宽度
  const bb = calculateBollingerBands(slice, 20, 2);
  const bb_width = bb.upper && bb.lower && bb.middle ? (bb.upper - bb.lower) / bb.middle : 0;
  features.push(bb_width);

  // 12: 当日振幅
  const daily_amplitude = close > 0 ? (high - low) / close : 0;
  features.push(daily_amplitude);

  // 13: 近5日最大振幅
  const last5Days = slice.slice(-5);
  const max_amplitude_5d = Math.max(
    ...last5Days.map((k) => (k.close > 0 ? (k.high - k.low) / k.close : 0))
  );
  features.push(max_amplitude_5d);

  // 14: 价格区间比率
  const price_range_ratio = highest20 > 0 ? (highest20 - lowest20) / highest20 : 0;
  features.push(price_range_ratio);

  // ==================== C. 成交量特征（6个）====================

  // 15: 量比
  const avgVol5 = slice.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
  const volume_ratio = avgVol5 > 0 ? volume / avgVol5 : 1;
  features.push(volume_ratio);

  // 17: 成交量5日变化率
  const avgVolPrev5 =
    slice.length >= 10 ? slice.slice(-10, -5).reduce((s, k) => s + k.volume, 0) / 5 : avgVol5;
  const vol_change_5d = avgVolPrev5 > 0 ? (avgVol5 - avgVolPrev5) / avgVolPrev5 : 0;
  features.push(vol_change_5d);

  // 17: 成交量趋势斜率
  const volTrend = slice.slice(-10).map((k) => k.volume);
  const vol_trend = calculateSlope(volTrend);
  features.push(vol_trend);

  // 18: 价量相关系数
  const prices10 = slice.slice(-10).map((k) => k.close);
  const volumes10 = slice.slice(-10).map((k) => k.volume);
  const price_volume_corr = calculateCorrelation(prices10, volumes10);
  features.push(price_volume_corr);

  // 19: 上涨日成交量占比
  const last10Days = slice.slice(-10);
  const upDays = last10Days.filter((k, i) => i > 0 && k.close > last10Days[i - 1].close);
  const up_vol_ratio =
    upDays.length > 0
      ? upDays.reduce((s, k) => s + k.volume, 0) / last10Days.reduce((s, k) => s + k.volume, 0)
      : 0.5;
  features.push(up_vol_ratio);

  // 20: 资金流向代理（价格上涨且放量视为流入）
  const money_flow_proxy =
    last10Days.reduce((flow, k, i) => {
      if (i === 0) return flow;
      const prev = last10Days[i - 1];
      const priceChange = k.close - prev.close;
      const volRatio = prev.volume > 0 ? k.volume / prev.volume : 1;
      return (
        flow + (priceChange > 0 && volRatio > 1 ? 1 : priceChange < 0 && volRatio > 1 ? -1 : 0)
      );
    }, 0) / 10;
  features.push(money_flow_proxy);

  // ==================== D. 技术形态特征（7个）====================

  // 21: K线实体大小
  const body_size = close > 0 ? Math.abs(close - open) / close : 0;
  features.push(body_size);

  // 22: 上影线比例
  const upper_shadow = close > 0 ? (high - Math.max(open, close)) / close : 0;
  features.push(upper_shadow);

  // 23: 下影线比例
  const lower_shadow = close > 0 ? (Math.min(open, close) - low) / close : 0;
  features.push(lower_shadow);

  // 24: 连续上涨天数
  let consecutive_up = 0;
  for (let i = slice.length - 1; i > 0; i--) {
    if (slice[i].close > slice[i - 1].close) {
      consecutive_up++;
    } else {
      break;
    }
  }
  features.push(consecutive_up);

  // 25: 连续下跌天数
  let consecutive_down = 0;
  for (let i = slice.length - 1; i > 0; i--) {
    if (slice[i].close < slice[i - 1].close) {
      consecutive_down++;
    } else {
      break;
    }
  }
  features.push(consecutive_down);

  // 26: RSI(14)
  const rsi_14 = calculateRSI(slice, 14) || 50;
  features.push(rsi_14 / 100); // 归一化到0-1

  // 27: MACD柱状图值
  const macd_histogram = calculateMACDHistogram(slice) || 0;
  features.push(macd_histogram / close); // 归一化

  // 28: 当日涨跌幅 (特征化过滤)
  const day0_return = (close - open) / open;
  features.push(day0_return);

  // 29: 当日下影线占比 (特征化过滤)
  const day0_lower_shadow = Math.min(open, close) - low;
  const day0_range = high - low;
  const day0_lower_shadow_ratio = day0_range > 0 ? day0_lower_shadow / day0_range : 0;
  features.push(day0_lower_shadow_ratio);

  // 30: 当日上影线占比
  const day0_upper_shadow = high - Math.max(open, close);
  const day0_upper_shadow_ratio = day0_range > 0 ? day0_upper_shadow / day0_range : 0;
  features.push(day0_upper_shadow_ratio);

  // 31: 当日实体占比
  const day0_body = Math.abs(close - open);
  const day0_body_ratio = day0_range > 0 ? day0_body / day0_range : 0;
  features.push(day0_body_ratio);

  // ==================== E. 强逻辑特征（4个）====================

  // 32: 放量突破 (当日成交量 / 过去10日最大成交量)
  const maxVol10 =
    slice.length >= 11
      ? Math.max(...slice.slice(-11, -1).map((k) => k.volume))
      : volume;
  const vol_breakout = maxVol10 > 0 ? volume / maxVol10 : 1;
  features.push(vol_breakout);

  // 33: 均线多头排列 (MA5 > MA10 > MA20)
  const ma10 = calculateMA(slice, 10);
  const bullish_alignment = ma5 && ma10 && ma20 && ma5 > ma10 && ma10 > ma20 ? 1 : 0;
  features.push(bullish_alignment);

  // 34: 缩量回踩 (当日成交量 / 5日均量 < 0.6 且涨跌幅在 [-1%, 1%] 之间)
  const is_low_vol = avgVol5 > 0 && volume / avgVol5 < 0.6;
  const is_flat_price = Math.abs(day0_return) < 0.01;
  const low_vol_pullback = is_low_vol && is_flat_price ? 1 : 0;
  features.push(low_vol_pullback);

  // 35: 相对强度代理 (10日收益率 / 20日波动率)
  const return_10d_val = features[3]; // return_10d
  const returns_20d = slice
    .slice(-21)
    .slice(0, -1)
    .map((k, i, arr) => (i > 0 ? (k.close - arr[i - 1].close) / arr[i - 1].close : 0));
  const vol_20d = calculateStd(returns_20d) * Math.sqrt(252);
  const relative_strength_proxy = vol_20d > 0 ? return_10d_val / vol_20d : 0;
  features.push(relative_strength_proxy);

  return features;
}

// ==================== 决策树预测函数 ====================

/**
 * 递归遍历决策树进行预测
 */
function predictWithTree(features: number[], node: DecisionTreeNode): number {
  // 如果是叶子节点，返回预测结果
  if (node.prediction !== undefined && node.prediction !== null) {
    return node.prediction;
  }

  // 根据特征值和阈值决定走左子树还是右子树
  if (node.featureIndex === undefined || node.threshold === undefined) {
    // 异常情况，默认返回0（非买点）
    return 0;
  }

  const featureValue = features[node.featureIndex];

  if (featureValue <= node.threshold) {
    // 走左子树
    return node.left ? predictWithTree(features, node.left) : 0;
  } else {
    // 走右子树
    return node.right ? predictWithTree(features, node.right) : 0;
  }
}

// ==================== 行业模型管理器 ====================

// 行业模型缓存（行业名称 -> 决策树数组）
let industryModelsCache: Map<string, DecisionTreeNode[]> = new Map();
// 行业到模型的映射缓存（用于聚类回退）
let industryToModelMapCache: Record<string, string> = {};

/**
 * 设置行业模型（由前端调用）
 */
export function setIndustryModels(
  models: LoadedIndustryModel[],
  industryToModelMap?: Record<string, string>
): void {
  console.log('📥 setIndustryModels 被调用，接收到的模型数量:', models.length);

  industryModelsCache.clear();
  let loadedCount = 0;

  models.forEach((model) => {
    const trees = model.modelData?.trees;
    if (trees && Array.isArray(trees) && trees.length > 0) {
      const actualTrees = trees.map((t: any) => t.tree || t);
      industryModelsCache.set(model.industryName, actualTrees);
      loadedCount++;
    }
  });

  if (industryToModelMap) {
    industryToModelMapCache = industryToModelMap;
    console.log('📥 已加载行业到模型的映射关系');
  }

  console.log(`✅ 成功加载 ${loadedCount}/${models.length} 个行业模型`);
}

/**
 * 清空行业模型缓存
 */
export function clearIndustryModels(): void {
  industryModelsCache.clear();
  industryToModelMapCache = {};
}

/**
 * 获取行业模型
 */
function getIndustryModel(industryName?: string): DecisionTreeNode[] | null {
  if (!industryName || industryModelsCache.size === 0) {
    return null;
  }

  // 1. 尝试直接匹配行业名称
  let model = industryModelsCache.get(industryName);

  // 2. 如果没找到，尝试通过映射表查找聚类模型
  if (!model && industryToModelMapCache[industryName]) {
    const targetModelName = industryToModelMapCache[industryName];
    model = industryModelsCache.get(targetModelName);
    if (model) {
      console.log(`[getIndustryModel] 行业 [${industryName}] 回退到聚类模型 [${targetModelName}]`);
    }
  }

  return model || null;
}

// ==================== 主预测函数（集成学习）====================

/**
 * 预测指定位置是否为买点（支持行业模型）
 * @param klineData K线数据数组
 * @param index 当前要预测的索引位置
 * @param industryName 可选的行业名称
 * @returns true表示是买点，false表示不是买点
 *
 * 优先级：
 * 1. 如果有行业模型且该行业有训练好的模型，使用行业模型
 * 2. 否则返回false（不使用默认模型）
 */
export function predictBuyPoint(
  klineData: KLineData[],
  index: number,
  industryName?: string
): boolean {
  // 计算特征
  const features = calculateFeatures(klineData, index);

  if (!features) {
    // 数据不足，无法预测
    return false;
  }

  // 尝试使用行业模型（随机森林多树投票）
  const industryTrees = getIndustryModel(industryName);
  if (industryTrees && industryTrees.length > 0) {
    // 对每棵树进行预测，然后投票
    let positiveVotes = 0;
    let negativeVotes = 0;

    for (const tree of industryTrees) {
      const prediction = predictWithTree(features, tree);
      if (prediction === 1) {
        positiveVotes++;
      } else {
        negativeVotes++;
      }
    }

    // 调试日志：每100个预测点打印一次
    if (index % 100 === 0) {
      console.log(
        `[predictBuyPoint] industry=${industryName}, positiveVotes=${positiveVotes}, negativeVotes=${negativeVotes}, total=${industryTrees.length}`
      );
    }

    // 多数投票决定结果（引入 75% 置信度阈值）
    const confidenceThreshold = 0.75;
    const isModelBuy = positiveVotes / industryTrees.length >= confidenceThreshold;

    if (isModelBuy) {
      const current = klineData[index];
      const open = current.open;
      const close = current.close;
      const low = current.low;
      const high = current.high;

      // --- 硬性物理过滤 (一票否决制) ---

      // 1. 当日跌幅 > 3% (即 (close - open) / open < -0.03)，视为未企稳
      const day_return = (close - open) / open;
      if (day_return < -0.03) {
        return false;
      }

      // 2. 处于 60 日高位向下回撤超过 15% 的过程中不买 (防止接飞刀)
      const lookback60 = klineData.slice(Math.max(0, index - 60), index + 1);
      const highest60 = Math.max(...lookback60.map((k) => k.high));
      if (highest60 > 0 && (close - highest60) / highest60 < -0.15) {
        // 如果没有明显的放量拐点（当日成交量未达到5日均量的1.5倍），则过滤
        const avgVol5 =
          klineData.slice(Math.max(0, index - 5), index).reduce((s, k) => s + k.volume, 0) / 5;
        if (current.volume < avgVol5 * 1.5) {
          return false;
        }
      }

      // 3. 秃头阴线过滤 (下影线占比过低)
      if (close < open) {
        const entity = open - close;
        const lowerShadow = close - low;
        if (lowerShadow < entity * 0.15) {
          return false;
        }
      }
    }

    return isModelBuy;
  }

  // 没有行业模型时返回false
  return false;
}

/**
 * 获取模型元数据
 */
export function getModelMetadata() {
  return MODEL_METADATA;
}
