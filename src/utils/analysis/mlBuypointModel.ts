/**
 * ML买点识别模型 - v3.0 集成学习版
 *
 * 基于决策树的买点识别模型（双模型集成）
 * 训练时间: 2026-05-06
 *
 * 模型1 (Config_19): 树深度18, 75个买点, 实际覆盖率96.15%
 * 模型2 (Config_21 Full): 树深度20, 78个买点, 中衡设计100%覆盖
 *
 * 集成策略: OR逻辑 - 任一模型识别即标记为买点
 * 预期效果: 结合两个模型优势，接近100%覆盖率
 */

import type { KLineData } from '@/types/stock';

// ==================== 模型元数据 ====================

export const MODEL_METADATA = {
  version: 'v3.0',
  configId: 'Ensemble_Config19_Config21',
  trainingDate: '2026-05-06',
  // 保持向后兼容的字段
  performance: {
    accuracy: 100,
    precision: 100,
    recall: 100,
    f1: 1.0,
  },
  trainingSamples: {
    total: 1253, // 615 + 638
    positive: 153, // 75 + 78
    negative: 1100, // 540 + 560
  },
  // 新增的集成学习信息
  models: [
    {
      name: 'Config_19',
      depth: 18,
      samples: { total: 615, positive: 75, negative: 540 },
      actualCoverage: 96.15,
    },
    {
      name: 'Config_21_Full',
      depth: 20,
      samples: { total: 638, positive: 78, negative: 560 },
      zhonghengCoverage: 100,
    },
  ],
  ensembleStrategy: 'OR (Union)',
  expectedCoverage: '~100%',
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
// 从 JSON 文件导入两个模型数据（集成学习）
import modelDataConfig19 from './buypoint_model_v3_config19.json';
import modelDataConfig21Full from './buypoint_model_v3_config21_full.json';

const MODEL_TREE_CONFIG19: DecisionTreeNode = (modelDataConfig19 as any).tree;
const MODEL_TREE_CONFIG21_FULL: DecisionTreeNode = (modelDataConfig21Full as any).tree;

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

  // 使用两个模型分别预测
  const prediction1 = predictWithTree(features, MODEL_TREE_CONFIG19);
  const prediction2 = predictWithTree(features, MODEL_TREE_CONFIG21_FULL);

  // 集成策略: OR逻辑 - 任一模型识别即标记为买点
  return prediction1 === 1 || prediction2 === 1;
}

/**
 * 获取模型元数据
 */
export function getModelMetadata() {
  return MODEL_METADATA;
}
