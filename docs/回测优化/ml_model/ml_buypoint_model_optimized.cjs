const fs = require('fs');
const path = require('path');

// ==================== 配置区域 ====================

// 所有股票数据文件列表
const stockFiles = [
  // 原有股票
  { file: '中衡设计.txt', dates: ['2026-04-17', '2026-01-07', '2025-11-24'] },
  { file: '起帆股份.txt', dates: ['2026-04-14', '2026-01-16', '2025-12-11'] },
  { file: '永杉锂业.txt', dates: ['2026-04-07', '2025-10-28'] },
  { file: '山东玻纤.txt', dates: ['2026-04-09', '2026-02-03'] },
  { file: '宏昌电子.txt', dates: ['2026-04-03', '2026-01-14'] },
  { file: '三孚股份.txt', dates: ['2025-12-22', '2026-04-01'] },

  // 新增股票
  { file: '兆新股份.txt', dates: ['2025-10-31', '2026-04-10', '2025-08-15'] },
  { file: '吉林化纤.txt', dates: ['2025-12-24', '2025-05-19', '2026-03-10'] },
  { file: '太极实业.txt', dates: ['2025-09-23', '2025-12-22'] },
  { file: '安彩高科.txt', dates: ['2026-03-20', '2026-02-06', '2025-10-29'] },
  { file: '晶科科技.txt', dates: ['2026-04-10', '2026-03-05', '2025-08-13'] },
  { file: '江苏有线.txt', dates: ['2025-12-26', '2026-01-22', '2025-05-28'] },
  { file: '浙富控股.txt', dates: ['2026-04-10', '2026-01-06', '2025-09-29'] },
  { file: '浙文互联.txt', dates: ['2026-04-07', '2025-12-30', '2025-10-21'] },
  { file: '风范股份.txt', dates: ['2025-10-30', '2025-12-10', '2026-02-11'] },
  { file: '盛洋科技.txt', dates: ['2025-09-23', '2025-12-04', '2025-12-24'] },
  { file: '三维通信.txt', dates: ['2026-01-07', '2025-08-22', '2026-04-24'] },
];

// 参数搜索配置
const parameterGrid = [
  { maxDepth: 5, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_1' },
  { maxDepth: 5, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_2' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_3' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_4' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 20, id: 'Config_5' },
  { maxDepth: 7, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_6' },
  { maxDepth: 7, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_7' },
  { maxDepth: 8, minSamplesSplit: 2, negativeSamplesPerStock: 12, id: 'Config_8' },
];

console.log('================================================================================');
console.log('=== 基于决策树的买点识别模型 - 参数优化版 ===');
console.log('================================================================================\n');

// ==================== 数据加载 ====================
function loadStockData(filename) {
  const filePath = path.join(__dirname, '..', 'stock_data', filename);
  const content = fs.readFileSync(filePath, 'utf-8');

  const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
  const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
  const closingBraceIndex = content.indexOf('}', jsonEndIndex);
  const validJson = content.substring(0, closingBraceIndex + 1);

  return JSON.parse(validJson);
}

// ==================== 特征工程 ====================
function extractFeatures(stockData, targetIndex) {
  const klineData = stockData.dailyLines;
  const currentPrice = klineData[targetIndex].close;
  const historicalData = klineData.slice(0, targetIndex + 1);

  // 价格变化特征
  const priceChange_3d =
    targetIndex >= 3
      ? ((currentPrice - klineData[targetIndex - 3].close) / klineData[targetIndex - 3].close) * 100
      : null;
  const priceChange_5d =
    targetIndex >= 5
      ? ((currentPrice - klineData[targetIndex - 5].close) / klineData[targetIndex - 5].close) * 100
      : null;
  const priceChange_10d =
    targetIndex >= 10
      ? ((currentPrice - klineData[targetIndex - 10].close) / klineData[targetIndex - 10].close) *
        100
      : null;

  // 距高点特征
  const lookback = 60;
  const startIdx = Math.max(0, targetIndex - lookback);
  const slice = klineData.slice(startIdx, targetIndex + 1);
  const recentHigh = Math.max(...slice.map((k) => k.high));
  const distanceFromHigh = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : null;

  // 成交量特征
  const currentVolume = klineData[targetIndex].volume;
  const avgVolume_5d =
    targetIndex >= 5
      ? historicalData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5
      : null;
  const volumeRatio_5d = avgVolume_5d > 0 ? currentVolume / avgVolume_5d : null;

  // 均线特征
  const ma5 =
    targetIndex >= 5
      ? historicalData
          .slice(targetIndex - 4, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 5
      : null;
  const ma10 =
    targetIndex >= 10
      ? historicalData
          .slice(targetIndex - 9, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 10
      : null;
  const ma20 =
    targetIndex >= 20
      ? historicalData
          .slice(targetIndex - 19, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 20
      : null;

  const priceVsMA5 = ma5 ? ((currentPrice - ma5) / ma5) * 100 : null;
  const priceVsMA10 = ma10 ? ((currentPrice - ma10) / ma10) * 100 : null;
  const priceVsMA20 = ma20 ? ((currentPrice - ma20) / ma20) * 100 : null;

  // K线形态特征
  const open = klineData[targetIndex].open;
  const close = klineData[targetIndex].close;
  const high = klineData[targetIndex].high;
  const low = klineData[targetIndex].low;
  const bodySize = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;
  const totalRange = high - low;

  const hasLongLowerShadow = totalRange > 0 && lowerShadow / totalRange > 0.5 ? 1 : 0;
  const shadowToBodyRatio = bodySize > 0 ? lowerShadow / bodySize : 0;
  const isDoji = totalRange > 0 && bodySize / totalRange < 0.1 ? 1 : 0;

  // 波动率特征
  const atr = calculateATR(historicalData, 14);
  const atrValue = atr[historicalData.length - 1];
  const atrPercent = atrValue ? (atrValue / currentPrice) * 100 : null;

  // 布林带宽度
  const bollingerWidth = calculateBollingerWidth(historicalData, 20, 2);
  const bollWidth = bollingerWidth[historicalData.length - 1];

  // 标签:次日收益>3%视为正样本
  const nextDayReturn =
    targetIndex < klineData.length - 1
      ? ((klineData[targetIndex + 1].close - currentPrice) / currentPrice) * 100
      : null;
  const label = nextDayReturn !== null && nextDayReturn > 3 ? 1 : 0;

  return {
    priceChange_3d,
    priceChange_5d,
    priceChange_10d,
    distanceFromHigh,
    volumeRatio_5d,
    priceVsMA5,
    priceVsMA10,
    priceVsMA20,
    hasLongLowerShadow,
    shadowToBodyRatio,
    isDoji,
    atrPercent,
    bollingerWidth: bollWidth,
    nextDayReturn,
    label,
  };
}

// 计算ATR
function calculateATR(klineData, period = 14) {
  const atr = new Array(klineData.length).fill(null);
  if (klineData.length < period + 1) return atr;

  const trueRanges = [];
  for (let i = 1; i < klineData.length; i++) {
    const highLow = klineData[i].high - klineData[i].low;
    const highClose = Math.abs(klineData[i].high - klineData[i - 1].close);
    const lowClose = Math.abs(klineData[i].low - klineData[i - 1].close);
    trueRanges.push(Math.max(highLow, highClose, lowClose));
  }

  let atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atr[period] = atrValue;

  for (let i = period + 1; i < klineData.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i - 1]) / period;
    atr[i] = atrValue;
  }

  return atr;
}

// 计算布林带宽度
function calculateBollingerWidth(klineData, period = 20, stdDev = 2) {
  const width = new Array(klineData.length).fill(null);

  for (let i = period - 1; i < klineData.length; i++) {
    const closes = klineData.slice(i - period + 1, i + 1).map((k) => k.close);
    const mean = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    const upper = mean + stdDev * std;
    const lower = mean - stdDev * std;
    width[i] = (upper - lower) / mean;
  }

  return width;
}

// ==================== 优化的决策树实现 ====================
class OptimizedDecisionTree {
  constructor(maxDepth = 6, minSamplesSplit = 2, minSamplesLeaf = 1) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.minSamplesLeaf = minSamplesLeaf;
    this.tree = null;
  }

  // 计算基尼不纯度
  giniImpurity(samples) {
    if (samples.length === 0) return 0;

    const labels = samples.map((s) => s.label);
    const positiveCount = labels.filter((l) => l === 1).length;
    const negativeCount = labels.length - positiveCount;

    const p = positiveCount / labels.length;
    const q = negativeCount / labels.length;

    return 1 - p * p - q * q;
  }

  // 找到最佳分割点
  findBestSplit(samples, features) {
    let bestGain = -Infinity;
    let bestFeature = null;
    let bestThreshold = null;

    const parentGini = this.giniImpurity(samples);

    features.forEach((feature) => {
      // 获取该特征的所有值
      const values = samples.map((s) => s[feature]).filter((v) => v !== null && !isNaN(v));

      if (values.length === 0) return;

      // 尝试不同的阈值
      const sortedValues = [...new Set(values)].sort((a, b) => a - b);

      for (let i = 0; i < sortedValues.length - 1; i++) {
        const threshold = (sortedValues[i] + sortedValues[i + 1]) / 2;

        const leftSamples = samples.filter((s) => s[feature] !== null && s[feature] <= threshold);
        const rightSamples = samples.filter((s) => s[feature] !== null && s[feature] > threshold);

        if (leftSamples.length < this.minSamplesLeaf || rightSamples.length < this.minSamplesLeaf) {
          continue;
        }

        // 计算信息增益
        const leftGini = this.giniImpurity(leftSamples);
        const rightGini = this.giniImpurity(rightSamples);

        const weightedGini =
          (leftSamples.length * leftGini + rightSamples.length * rightGini) / samples.length;
        const gain = parentGini - weightedGini;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = feature;
          bestThreshold = threshold;
        }
      }
    });

    return { feature: bestFeature, threshold: bestThreshold, gain: bestGain };
  }

  // 递归构建决策树
  buildTree(samples, depth = 0) {
    // 停止条件
    if (depth >= this.maxDepth || samples.length < this.minSamplesSplit) {
      return this.createLeafNode(samples);
    }

    // 检查是否所有样本属于同一类
    const labels = samples.map((s) => s.label);
    if (labels.every((l) => l === labels[0])) {
      return this.createLeafNode(samples);
    }

    // 找到最佳分割
    const features = [
      'distanceFromHigh',
      'priceChange_5d',
      'priceChange_10d',
      'volumeRatio_5d',
      'priceVsMA20',
      'priceVsMA5',
      'shadowToBodyRatio',
      'atrPercent',
      'bollingerWidth',
    ];

    const bestSplit = this.findBestSplit(samples, features);

    if (!bestSplit.feature || bestSplit.gain <= 0) {
      return this.createLeafNode(samples);
    }

    // 分割样本
    const leftSamples = samples.filter(
      (s) => s[bestSplit.feature] !== null && s[bestSplit.feature] <= bestSplit.threshold
    );
    const rightSamples = samples.filter(
      (s) => s[bestSplit.feature] !== null && s[bestSplit.feature] > bestSplit.threshold
    );

    if (leftSamples.length === 0 || rightSamples.length === 0) {
      return this.createLeafNode(samples);
    }

    // 递归构建子树
    return {
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      gain: bestSplit.gain,
      left: this.buildTree(leftSamples, depth + 1),
      right: this.buildTree(rightSamples, depth + 1),
    };
  }

  // 创建叶子节点
  createLeafNode(samples) {
    const labels = samples.map((s) => s.label);
    const positiveCount = labels.filter((l) => l === 1).length;
    const probability = samples.length > 0 ? positiveCount / samples.length : 0.5;

    return {
      isLeaf: true,
      prediction: probability > 0.5 ? 1 : 0,
      probability,
      sampleCount: samples.length,
    };
  }

  // 训练模型
  fit(samples) {
    this.tree = this.buildTree(samples);
  }

  // 预测单个样本
  predict(sample) {
    let node = this.tree;

    while (!node.isLeaf) {
      const value = sample[node.feature];

      if (value === null || value === undefined) {
        // 如果特征值为空,返回概率较高的分支
        return node.left.probability > node.right.probability
          ? this.predictLeaf(node.left)
          : this.predictLeaf(node.right);
      }

      if (value <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }

    return this.predictLeaf(node);
  }

  // 预测叶子节点
  predictLeaf(node) {
    return {
      prediction: node.prediction,
      probability: node.probability,
      sampleCount: node.sampleCount,
    };
  }

  // 打印决策树
  printTree(node = this.tree, prefix = '', isLeft = true) {
    if (!node) return;

    if (node.isLeaf) {
      console.log(
        `${prefix}${isLeft ? '├── ' : '└── '}预测: ${
          node.prediction === 1 ? '买点' : '非买点'
        } (概率: ${(node.probability * 100).toFixed(1)}%, 样本数: ${node.sampleCount})`
      );
    } else {
      const featureNames = {
        distanceFromHigh: '距高点%',
        priceChange_5d: '5日变化%',
        priceChange_10d: '10日变化%',
        volumeRatio_5d: '量比',
        priceVsMA20: 'MA20偏离%',
        priceVsMA5: 'MA5偏离%',
        shadowToBodyRatio: '下影/实体比',
        atrPercent: 'ATR%',
        bollingerWidth: '布林带宽',
      };

      const featureName = featureNames[node.feature] || node.feature;
      console.log(
        `${prefix}${isLeft ? '├── ' : '└── '}if ${featureName} <= ${node.threshold.toFixed(
          2
        )} (增益: ${node.gain.toFixed(4)})`
      );

      this.printTree(node.left, prefix + (isLeft ? '│   ' : '    '), true);
      this.printTree(node.right, prefix + (isLeft ? '│   ' : '    '), false);
    }
  }
}

// ==================== 数据集构建函数 ====================
function buildDataset(negativeSamplesPerStock = 15) {
  console.log(`\n步骤1: 构建训练数据集 (负样本/股票: ${negativeSamplesPerStock})\n`);

  const positiveSamples = [];
  const negativeSamples = [];

  // 收集正样本(已知的买点)
  stockFiles.forEach((stockFile) => {
    const stockData = loadStockData(stockFile.file);

    stockFile.dates.forEach((date) => {
      const targetIndex = stockData.dailyLines.findIndex((k) => {
        const d = new Date(k.time);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;
        return dateStr === date;
      });

      if (targetIndex !== -1) {
        const features = extractFeatures(stockData, targetIndex);
        positiveSamples.push({
          stockName: stockData.name,
          date,
          ...features,
        });
      }
    });
  });

  console.log(`正样本(买点): ${positiveSamples.length}个`);

  // 收集负样本(随机选取非买点日期)
  const buyPointSet = new Set();
  stockFiles.forEach((stockFile) => {
    stockFile.dates.forEach((date) => {
      buyPointSet.add(`${stockFile.file}_${date}`);
    });
  });

  stockFiles.forEach((stockFile) => {
    const stockData = loadStockData(stockFile.file);
    const klineData = stockData.dailyLines;

    // 每只股票随机选取指定数量的非买点
    let collected = 0;
    let attempts = 0;

    while (collected < negativeSamplesPerStock && attempts < 300) {
      const randomIndex = Math.floor(Math.random() * (klineData.length - 40)) + 20;
      const date = new Date(klineData[randomIndex].time).toISOString().split('T')[0];
      const key = `${stockFile.file}_${date}`;

      if (!buyPointSet.has(key)) {
        const features = extractFeatures(stockData, randomIndex);

        // 确保不是买点(次日收益<=3%)
        if (features.label === 0) {
          negativeSamples.push({
            stockName: stockData.name,
            date,
            ...features,
          });
          collected++;
        }
      }

      attempts++;
    }
  });

  console.log(`负样本(非买点): ${negativeSamples.length}个`);
  console.log(`总样本数: ${positiveSamples.length + negativeSamples.length}个\n`);

  return { positiveSamples, negativeSamples };
}

// ==================== 模型评估函数 ====================
function evaluateModel(model, allSamples) {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  allSamples.forEach((sample) => {
    const prediction = model.predict(sample);

    if (sample.label === 1 && prediction.prediction === 1) {
      truePositives++;
    } else if (sample.label === 0 && prediction.prediction === 1) {
      falsePositives++;
    } else if (sample.label === 0 && prediction.prediction === 0) {
      trueNegatives++;
    } else if (sample.label === 1 && prediction.prediction === 0) {
      falseNegatives++;
    }
  });

  const accuracy = ((truePositives + trueNegatives) / allSamples.length) * 100;
  const precision =
    truePositives > 0 ? (truePositives / (truePositives + falsePositives)) * 100 : 0;
  const recall = truePositives > 0 ? (truePositives / (truePositives + falseNegatives)) * 100 : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const specificity =
    trueNegatives > 0 ? (trueNegatives / (trueNegatives + falsePositives)) * 100 : 0;

  return {
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    accuracy,
    precision,
    recall,
    f1Score,
    specificity,
  };
}

// ==================== 未捕获买点分析 ====================
function analyzeMissedBuyPoints(model, positiveSamples) {
  const missedPoints = [];

  positiveSamples.forEach((sample) => {
    const prediction = model.predict(sample);
    if (prediction.prediction === 0) {
      missedPoints.push({
        stockName: sample.stockName,
        date: sample.date,
        nextDayReturn: sample.nextDayReturn,
        distanceFromHigh: sample.distanceFromHigh,
        priceChange_5d: sample.priceChange_5d,
        priceChange_10d: sample.priceChange_10d,
        volumeRatio_5d: sample.volumeRatio_5d,
        priceVsMA5: sample.priceVsMA5,
        atrPercent: sample.atrPercent,
      });
    }
  });

  if (missedPoints.length === 0) return null;

  // 计算平均特征
  const avgFeatures = {
    distanceFromHigh:
      missedPoints.reduce((sum, p) => sum + (p.distanceFromHigh || 0), 0) / missedPoints.length,
    priceChange_5d:
      missedPoints.reduce((sum, p) => sum + (p.priceChange_5d || 0), 0) / missedPoints.length,
    priceChange_10d:
      missedPoints.reduce((sum, p) => sum + (p.priceChange_10d || 0), 0) / missedPoints.length,
    volumeRatio_5d:
      missedPoints.reduce((sum, p) => sum + (p.volumeRatio_5d || 0), 0) / missedPoints.length,
    priceVsMA5: missedPoints.reduce((sum, p) => sum + (p.priceVsMA5 || 0), 0) / missedPoints.length,
    atrPercent: missedPoints.reduce((sum, p) => sum + (p.atrPercent || 0), 0) / missedPoints.length,
    nextDayReturn:
      missedPoints.reduce((sum, p) => sum + (p.nextDayReturn || 0), 0) / missedPoints.length,
  };

  return {
    count: missedPoints.length,
    samples: missedPoints.slice(0, 5), // 只显示前5个
    avgFeatures,
  };
}

// ==================== 主执行逻辑 ====================
console.log('================================================================================');
console.log('=== 开始参数优化实验 ===');
console.log('================================================================================\n');

const results = [];
let bestConfig = null;
let bestRecall = 0;

// 遍历所有配置
for (let i = 0; i < parameterGrid.length; i++) {
  const config = parameterGrid[i];
  console.log(`\n${'='.repeat(80)}`);
  console.log(
    `【${config.id}】maxDepth=${config.maxDepth}, 负样本/股票=${config.negativeSamplesPerStock}`
  );
  console.log('='.repeat(80));

  try {
    // 1. 构建数据集
    const { positiveSamples, negativeSamples } = buildDataset(config.negativeSamplesPerStock);
    const allSamples = [...positiveSamples, ...negativeSamples];

    // 2. 训练模型
    console.log('步骤2: 训练决策树模型\n');
    const model = new OptimizedDecisionTree(
      config.maxDepth,
      config.minSamplesSplit,
      1 // minSamplesLeaf
    );
    model.fit(allSamples);

    // 3. 评估模型
    console.log('步骤3: 模型评估\n');
    const metrics = evaluateModel(model, allSamples);

    // 4. 分析未捕获买点
    console.log('步骤4: 未捕获买点分析\n');
    const missedAnalysis = analyzeMissedBuyPoints(model, positiveSamples);

    // 5. 记录结果
    const result = {
      config,
      metrics,
      missedAnalysis,
      totalSamples: allSamples.length,
      positiveCount: positiveSamples.length,
      negativeCount: negativeSamples.length,
    };
    results.push(result);

    // 6. 检查是否为最优配置（以召回率为主）
    if (metrics.recall > bestRecall) {
      bestRecall = metrics.recall;
      bestConfig = result;
    }

    // 7. 输出简要结果
    console.log(`\n【${config.id} 性能指标】`);
    console.log(`  准确率: ${metrics.accuracy.toFixed(1)}%`);
    console.log(`  精确率: ${metrics.precision.toFixed(1)}%`);
    console.log(`  召回率: ${metrics.recall.toFixed(1)}%`);
    console.log(`  F1分数: ${metrics.f1Score.toFixed(2)}`);
    console.log(`  特异性: ${metrics.specificity.toFixed(1)}%`);

    if (missedAnalysis) {
      console.log(`\n  未捕获买点: ${missedAnalysis.count}个`);
      console.log(`  平均特征:`);
      console.log(`    - 距高点: ${missedAnalysis.avgFeatures.distanceFromHigh.toFixed(2)}%`);
      console.log(`    - 5日变化: ${missedAnalysis.avgFeatures.priceChange_5d.toFixed(2)}%`);
      console.log(`    - 10日变化: ${missedAnalysis.avgFeatures.priceChange_10d.toFixed(2)}%`);
      console.log(`    - 量比: ${missedAnalysis.avgFeatures.volumeRatio_5d.toFixed(2)}`);
      console.log(`    - MA5偏离: ${missedAnalysis.avgFeatures.priceVsMA5.toFixed(2)}%`);
      console.log(`    - ATR%: ${missedAnalysis.avgFeatures.atrPercent.toFixed(2)}%`);
      console.log(`    - 次日收益: ${missedAnalysis.avgFeatures.nextDayReturn.toFixed(2)}%`);
    }
  } catch (error) {
    console.error(`\n❌ ${config.id} 训练失败:`, error.message);
  }
}

// ==================== 生成对比报告 ====================
console.log('\n\n');
console.log('================================================================================');
console.log('=== 参数优化实验结果汇总 ===');
console.log('================================================================================\n');

console.log('【配置对比表】');
console.log('┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
console.log('│ 配置ID   │ 树深度   │ 负样本数  │ 准确率   │ 精确率   │ 召回率   │ F1分数   │');
console.log('├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

results.forEach((result) => {
  const id = result.config.id.padEnd(8);
  const depth = String(result.config.maxDepth).padStart(6);
  const negSamples = String(result.negativeCount).padStart(8);
  const acc = (result.metrics.accuracy.toFixed(1) + '%').padStart(8);
  const prec = (result.metrics.precision.toFixed(1) + '%').padStart(8);
  const rec = (result.metrics.recall.toFixed(1) + '%').padStart(8);
  const f1 = result.metrics.f1Score.toFixed(2).padStart(8);

  console.log(`│ ${id} │ ${depth} │ ${negSamples} │ ${acc} │ ${prec} │ ${rec} │ ${f1} │`);
});

console.log('└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘\n');

// ==================== 推荐最优配置 ====================
if (bestConfig) {
  console.log('【🏆 推荐配置】');
  console.log(`  配置ID: ${bestConfig.config.id}`);
  console.log(`  树深度: ${bestConfig.config.maxDepth}`);
  console.log(`  负样本数: ${bestConfig.negativeCount}`);
  console.log(`  召回率: ${bestConfig.metrics.recall.toFixed(1)}%`);
  console.log(`  F1分数: ${bestConfig.metrics.f1Score.toFixed(2)}`);
  console.log(`  精确率: ${bestConfig.metrics.precision.toFixed(1)}%`);
  console.log(`  准确率: ${bestConfig.metrics.accuracy.toFixed(1)}%\n`);

  // ==================== 保存最优模型 ====================
  console.log('步骤5: 保存最优模型\n');

  const modelData = {
    tree: bestConfig.model ? bestConfig.model.tree : null,
    trainingSamples: bestConfig.totalSamples,
    positiveSamples: bestConfig.positiveCount,
    negativeSamples: bestConfig.negativeCount,
    metrics: bestConfig.metrics,
    featureImportance: {}, // 可以后续添加
    trainedAt: new Date().toISOString(),
    config: bestConfig.config,
  };

  const modelPath = path.join(__dirname, 'buypoint_model.json');
  fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2), 'utf-8');

  console.log(`✅ 最优模型已保存到: ${modelPath}`);
  console.log(
    `   训练样本: ${bestConfig.totalSamples}个 (正样本${bestConfig.positiveCount}个, 负样本${bestConfig.negativeCount}个)`
  );
  console.log(
    `   模型性能: 准确率${bestConfig.metrics.accuracy.toFixed(
      1
    )}%, 召回率${bestConfig.metrics.recall.toFixed(1)}%, F1分数${bestConfig.metrics.f1Score.toFixed(
      2
    )}\n`
  );
}

console.log('================================================================================');
console.log('=== 参数优化实验完成 ===');
console.log('================================================================================');
