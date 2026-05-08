/**
 * ML买点识别模型 - v4.0 增强版
 *
 * 基于决策树的买点识别模型（单模型）
 * 训练时间: 2026-05-07
 *
 * 模型配置 (Config_22_Recall_Opt):
 *   - 树深度: 20
 *   - 负样本数: 1725 (25/股票)
 *   - 训练数据: 69只股票, 188个买点
 *   - 训练集召回率: 87.2%
 */

import type { KLineData } from '@/types/stock';

// ==================== 模型元数据 ====================

export const MODEL_METADATA = {
  version: 'v4.0',
  configId: 'Config_22_Recall_Opt',
  trainingDate: '2026-05-07',
  performance: {
    accuracy: 98.6,
    precision: 98.8,
    recall: 87.2,
    f1: 0.93,
  },
  trainingSamples: {
    total: 1913,
    positive: 188,
    negative: 1725,
  },
  modelConfig: {
    maxDepth: 20,
    minSamplesSplit: 2,
    negativeSamplesPerStock: 25,
  },
  trainingData: {
    stocks: 69,
    buyPoints: 188,
  },
};

// ==================== 决策树类型定义 ====================

interface DecisionTreeNode {
  featureIndex?: number;
  threshold?: number;
  featureName?: string;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
  prediction?: number;
  probability?: number;
  samples?: number;
}

// ==================== 决策树模型数据 ====================
// 从 JSON 文件导入 v4.0 模型数据
import modelDataV4 from './buypoint_model_v4.json';

const MODEL_TREE_V4: DecisionTreeNode = (modelDataV4 as any).tree;

// 特征名称映射
const FEATURE_NAMES = [
  'distFromHigh', // 0: 距60日高点%
  'change5d', // 1: 5日变化%
  'change10d', // 2: 10日变化%
  'volumeRatio', // 3: 量比
  'ma5Deviation', // 4: MA5偏离%
  'ma20Deviation', // 5: MA20偏离%
  'bbWidth', // 6: 布林带宽度
  'atrPercent', // 7: ATR%
];

// ==================== 特征计算函数 ====================

/**
 * 计算移动平均线
 */
function calculateMA(data: KLineData[], period: number): number | null {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((s, k) => s + k.close, 0);
  return sum / period;
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
 * 计算所有特征
 */
function calculateFeatures(klineData: KLineData[], index: number): number[] | null {
  if (index < 20) return null;

  const slice = klineData.slice(0, index + 1);
  const current = klineData[index];

  // 1. 价格相关
  const close = current.close;

  // 2. 移动平均线
  const ma5 = calculateMA(slice, 5);
  const ma20 = calculateMA(slice, 20);

  // 3. 距60日高点距离
  const lookback60 = Math.min(60, slice.length);
  const highest60 = Math.max(...slice.slice(-lookback60).map((k) => k.high));
  const distFromHigh = ((close - highest60) / highest60) * 100;

  // 4. 价格变化
  const change5d =
    slice.length >= 5
      ? ((close - slice[slice.length - 5].close) / slice[slice.length - 5].close) * 100
      : 0;
  const change10d =
    slice.length >= 10
      ? ((close - slice[slice.length - 10].close) / slice[slice.length - 10].close) * 100
      : 0;

  // 5. MA偏离度
  const ma5Deviation = ma5 ? ((close - ma5) / ma5) * 100 : 0;
  const ma20Deviation = ma20 ? ((close - ma20) / ma20) * 100 : 0;

  // 6. 成交量特征
  const volume = current.volume;
  const avgVol5 = slice.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
  const volumeRatio = avgVol5 > 0 ? volume / avgVol5 : 1;

  // 7. 布林带宽度
  const bb = calculateBollingerBands(slice, 20, 2);
  const bbWidth = bb.upper && bb.lower && bb.middle ? (bb.upper - bb.lower) / bb.middle : 0;

  // 8. ATR百分比
  const atr = calculateATR(slice, 14);
  const atrPercent = atr ? (atr / close) * 100 : 0;

  return [
    distFromHigh,
    change5d,
    change10d,
    volumeRatio,
    ma5Deviation,
    ma20Deviation,
    bbWidth,
    atrPercent,
  ];
}

// ==================== 决策树预测函数 ====================

/**
 * 递归遍历决策树进行预测
 */
function predictWithTree(features: number[], node: DecisionTreeNode): number {
  // 如果是叶子节点，返回预测结果
  if (node.prediction !== undefined) {
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

// ==================== 主预测函数（集成学习）====================

/**
 * 预测指定位置是否为买点（双模型集成）
 * @param klineData K线数据数组
 * @param index 当前要预测的索引位置
 * @returns true表示是买点，false表示不是买点
 *
 * 集成策略: OR逻辑 - 任一模型识别即标记为买点
 */
export function predictBuyPoint(klineData: KLineData[], index: number): boolean {
  // 计算特征
  const features = calculateFeatures(klineData, index);

  if (!features) {
    // 数据不足，无法预测
    return false;
  }

  // 使用 v4.0 模型预测
  const prediction = predictWithTree(features, MODEL_TREE_V4);

  // 返回预测结果（1=买点，0=非买点）
  return prediction === 1;
}

/**
 * 获取模型元数据
 */
export function getModelMetadata() {
  return MODEL_METADATA;
}
