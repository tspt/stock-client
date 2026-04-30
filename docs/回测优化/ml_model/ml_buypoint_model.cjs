const fs = require('fs');
const path = require('path');

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

console.log('================================================================================');
console.log('=== 基于决策树的买点识别模型 ===');
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

// ==================== 数据集构建 ====================
console.log('步骤1: 构建训练数据集\n');

const positiveSamples = []; // 买点(正样本)
const negativeSamples = []; // 非买点(负样本)

// 收集正样本(已知的14个买点)
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

  // 每只股票随机选取20个非买点
  let collected = 0;
  let attempts = 0;

  while (collected < 20 && attempts < 200) {
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

// ==================== 决策树实现 ====================
console.log('步骤2: 训练决策树模型\n');

// 简化的决策树实现
class DecisionTree {
  constructor(maxDepth = 5, minSamplesSplit = 2) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
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

        if (
          leftSamples.length < this.minSamplesSplit ||
          rightSamples.length < this.minSamplesSplit
        ) {
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

// ==================== 模型训练 ====================
const allSamples = [...positiveSamples, ...negativeSamples];
const model = new DecisionTree((maxDepth = 4), (minSamplesSplit = 2));

model.fit(allSamples);

console.log('决策树结构:\n');
model.printTree();

// ==================== 模型评估 ====================
console.log('\n\n步骤3: 模型评估\n');

// 在训练集上评估
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
const precision = truePositives > 0 ? (truePositives / (truePositives + falsePositives)) * 100 : 0;
const recall = truePositives > 0 ? (truePositives / (truePositives + falseNegatives)) * 100 : 0;
const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

console.log('【混淆矩阵】');
console.log(`              预测买点  预测非买点`);
console.log(
  `实际买点:     ${truePositives.toString().padStart(6)}   ${falseNegatives.toString().padStart(6)}`
);
console.log(
  `实际非买点:   ${falsePositives.toString().padStart(6)}   ${trueNegatives
    .toString()
    .padStart(6)}\n`
);

console.log('【性能指标】');
console.log(`准确率 (Accuracy): ${accuracy.toFixed(1)}%`);
console.log(`精确率 (Precision): ${precision.toFixed(1)}%`);
console.log(`召回率 (Recall): ${recall.toFixed(1)}%`);
console.log(`F1分数: ${f1Score.toFixed(2)}\n`);

// ==================== 特征重要性 ====================
console.log('步骤4: 特征重要性分析\n');

// 统计每个特征在决策树中的使用情况
const featureUsage = {};

function countFeatureUsage(node) {
  if (!node || node.isLeaf) return;

  if (!featureUsage[node.feature]) {
    featureUsage[node.feature] = 0;
  }
  featureUsage[node.feature]++;

  countFeatureUsage(node.left);
  countFeatureUsage(node.right);
}

countFeatureUsage(model.tree);

const sortedFeatures = Object.entries(featureUsage).sort((a, b) => b[1] - a[1]);

console.log('特征使用次数排名:');
sortedFeatures.forEach(([feature, count], idx) => {
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

  const name = featureNames[feature] || feature;
  console.log(`  ${idx + 1}. ${name.padEnd(12)}: ${count}次`);
});

// ==================== 模型保存 ====================
console.log('\n\n步骤5: 保存模型\n');

const modelData = {
  tree: model.tree,
  trainingSamples: allSamples.length,
  positiveSamples: positiveSamples.length,
  negativeSamples: negativeSamples.length,
  metrics: {
    accuracy,
    precision,
    recall,
    f1Score,
  },
  featureImportance: featureUsage,
  trainedAt: new Date().toISOString(),
};

const modelPath = path.join(__dirname, 'buypoint_model.json');
fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2), 'utf-8');

console.log(`✅ 模型已保存到: ${modelPath}`);
console.log(
  `   训练样本: ${allSamples.length}个 (正样本${positiveSamples.length}个, 负样本${negativeSamples.length}个)`
);
console.log(`   模型性能: 准确率${accuracy.toFixed(1)}%, F1分数${f1Score.toFixed(2)}\n`);

// ==================== 使用示例 ====================
console.log('================================================================================');
console.log('=== 模型使用示例 ===');
console.log('================================================================================\n');

console.log('如何使用这个模型:\n');
console.log('1. 加载模型:');
console.log('   const modelData = JSON.parse(fs.readFileSync("buypoint_model.json", "utf-8"));');
console.log('   const model = new DecisionTree();');
console.log('   model.tree = modelData.tree;\n');

console.log('2. 提取股票特征:');
console.log('   const features = extractFeatures(stockData, currentIndex);\n');

console.log('3. 预测:');
console.log('   const result = model.predict(features);');
console.log('   if (result.prediction === 1) {');
console.log('     console.log(`潜在买点! 置信度: ${(result.probability * 100).toFixed(1)}%`);');
console.log('   }\n');

console.log('4. 增加新样本:');
console.log('   - 当您发现新的买点时,将其添加到正样本列表');
console.log('   - 重新运行此脚本训练新模型');
console.log('   - 样本越多,模型越准确\n');

console.log('================================================================================');
console.log('=== 模型训练完成 ===');
console.log('================================================================================');
