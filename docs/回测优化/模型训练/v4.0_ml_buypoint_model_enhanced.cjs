/**
 * 基于决策树的买点识别模型 - v4.0 增强版
 *
 * 版本说明：
 * - 支持 69 只股票、188 个买点的扩展数据集
 * - 完全支持 JSON 格式股票数据文件
 * - 从 buypointDate 字段自动读取买点日期
 * - 优先使用文件中的买点，fallback 到配置中的日期
 *
 * 使用方法：
 * node v4.0_ml_buypoint_model_enhanced.cjs
 */

const fs = require('fs');
const path = require('path');

// ==================== 配置区域 ====================

/**
 * 股票数据目录（动态扫描）
 * 自动读取 股票数据/ 目录下所有 .json 文件
 * 从每个文件的 buypointDate 字段获取买点日期
 */
const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');

/**
 * 动态加载股票文件列表
 * @returns {Array} 股票文件配置数组
 */
function loadStockFiles() {
  try {
    // 读取股票数据目录
    const files = fs.readdirSync(STOCK_DATA_DIR).filter((f) => f.endsWith('.json'));

    if (files.length === 0) {
      console.error('❌ 股票数据目录为空:', STOCK_DATA_DIR);
      process.exit(1);
    }

    console.log(`📂 发现 ${files.length} 个股票数据文件\n`);

    // 构建股票文件配置数组
    const stockFiles = files
      .map((filename) => {
        const filePath = path.join(STOCK_DATA_DIR, filename);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const jsonData = JSON.parse(content);

          // 从 buypointDate 字段提取买点日期
          const buyPointDates = jsonData.buypointDate || [];

          return {
            file: filename,
            dates: buyPointDates, // 使用文件中的买点日期
          };
        } catch (error) {
          console.warn(`⚠️  解析文件失败: ${filename} - ${error.message}`);
          return null;
        }
      })
      .filter((item) => item !== null); // 过滤掉解析失败的文件

    // 统计总买点数
    const totalBuyPoints = stockFiles.reduce((sum, stock) => sum + stock.dates.length, 0);
    console.log(`✅ 成功加载 ${stockFiles.length} 只股票，共 ${totalBuyPoints} 个买点\n`);

    return stockFiles;
  } catch (error) {
    console.error('❌ 加载股票文件列表失败:', error.message);
    process.exit(1);
  }
}

// 动态加载股票文件
const stockFiles = loadStockFiles();

// 增强版参数搜索配置（优化召回率）
const parameterGrid = [
  // 原8个配置（保留作为基准）
  { maxDepth: 5, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_1' },
  { maxDepth: 5, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_2' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_3' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_4' },
  { maxDepth: 6, minSamplesSplit: 2, negativeSamplesPerStock: 20, id: 'Config_5' },
  { maxDepth: 7, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_6' },
  { maxDepth: 7, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_7' },
  { maxDepth: 8, minSamplesSplit: 2, negativeSamplesPerStock: 12, id: 'Config_8' },

  // 新增配置：更大深度和更多负样本（提升召回率）
  { maxDepth: 9, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_9' },
  { maxDepth: 9, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_10' },
  { maxDepth: 10, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_11' },
  { maxDepth: 10, minSamplesSplit: 2, negativeSamplesPerStock: 12, id: 'Config_12' },
  { maxDepth: 10, minSamplesSplit: 2, negativeSamplesPerStock: 15, id: 'Config_13' },
  { maxDepth: 12, minSamplesSplit: 2, negativeSamplesPerStock: 10, id: 'Config_14' },
  { maxDepth: 12, minSamplesSplit: 2, negativeSamplesPerStock: 12, id: 'Config_15' },

  // 新增配置：更大深度 + 更多负样本（重点优化召回率）
  { maxDepth: 15, minSamplesSplit: 2, negativeSamplesPerStock: 20, id: 'Config_16_Recall_Opt' },
  { maxDepth: 15, minSamplesSplit: 2, negativeSamplesPerStock: 25, id: 'Config_17_Recall_Opt' },
  { maxDepth: 15, minSamplesSplit: 2, negativeSamplesPerStock: 30, id: 'Config_18_Recall_Opt' },
  { maxDepth: 18, minSamplesSplit: 2, negativeSamplesPerStock: 20, id: 'Config_19_Recall_Opt' },
  { maxDepth: 18, minSamplesSplit: 2, negativeSamplesPerStock: 25, id: 'Config_20_Recall_Opt' },
  { maxDepth: 20, minSamplesSplit: 2, negativeSamplesPerStock: 20, id: 'Config_21_Recall_Opt' },
  { maxDepth: 20, minSamplesSplit: 2, negativeSamplesPerStock: 25, id: 'Config_22_Recall_Opt' },
  { maxDepth: 20, minSamplesSplit: 2, negativeSamplesPerStock: 30, id: 'Config_23_Recall_Opt' },
];

console.log('================================================================================');
console.log('=== 基于决策树的买点识别模型 - v4.0 增强版 ===');
console.log('=== 数据集: 69 只股票, 188 个买点 ===');
console.log('================================================================================\n');

// ==================== 数据加载 ====================
function loadStockData(filename) {
  const filePath = path.join(__dirname, '..', '股票数据', filename);
  let content = fs.readFileSync(filePath, 'utf-8');

  try {
    // 尝试解析为JSON格式
    const data = JSON.parse(content);

    // 如果是新的JSON格式（包含data和buypointDate字段）
    if (data.data && data.data.dailyLines) {
      return {
        klineData: data.data.dailyLines,
        buyPoints: data.buypointDate || [],
      };
    }
    // 如果是旧的JSON格式（直接包含dailyLines）
    else if (data.dailyLines) {
      // 从文件名中提取买点日期（旧格式可能需要其他方式获取买点）
      return {
        klineData: data.dailyLines,
        buyPoints: [], // 旧格式可能没有买点信息
      };
    } else {
      console.error(`❌ 未知的JSON格式: ${filename}`);
      return { klineData: [], buyPoints: [] };
    }
  } catch (e) {
    console.error(`❌ 解析文件失败: ${filename}`, e.message);
    return { klineData: [], buyPoints: [] };
  }
}

// ==================== 特征工程 ====================
function calculateFeatures(klineData, index) {
  if (index < 20) return null;

  const slice = klineData.slice(0, index + 1);
  const current = klineData[index];

  // 1. 价格相关特征
  const close = current.close;
  const high = current.high;
  const low = current.low;

  // 2. 移动平均线
  const ma5 = calculateMA(slice, 5);
  const ma10 = calculateMA(slice, 10);
  const ma20 = calculateMA(slice, 20);
  const ma60 = calculateMA(slice, 60);

  // 3. 距高点距离
  const highest60 = Math.max(...slice.slice(-60).map((k) => k.high));
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

  // 7. 布林带
  const bb = calculateBollingerBands(slice, 20, 2);
  const bbWidth = bb.upper && bb.lower ? (bb.upper - bb.lower) / bb.middle : 0;

  // 8. ATR (平均真实波幅)
  const atr = calculateATR(slice, 14);
  const atrPercent = atr ? (atr / close) * 100 : 0;

  return {
    distFromHigh, // 距60日高点%
    change5d, // 5日变化%
    change10d, // 10日变化%
    volumeRatio, // 量比
    ma5Deviation, // MA5偏离%
    ma20Deviation, // MA20偏离%
    bbWidth, // 布林带宽度
    atrPercent, // ATR%
    close, // 收盘价（用于计算次日收益）
  };
}

function calculateMA(data, period) {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((s, k) => s + k.close, 0);
  return sum / period;
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
  if (data.length < period) return { upper: null, middle: null, lower: null };

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

function calculateATR(data, period = 14) {
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

// ==================== 决策树实现 ====================
class DecisionTree {
  constructor(maxDepth = 8, minSamplesSplit = 2, minSamplesLeaf = 1) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.minSamplesLeaf = minSamplesLeaf;
    this.tree = null;
    this.featureNames = [
      'distFromHigh',
      'change5d',
      'change10d',
      'volumeRatio',
      'ma5Deviation',
      'ma20Deviation',
      'bbWidth',
      'atrPercent',
    ];
  }

  train(X, y) {
    this.tree = this._buildTree(X, y, 0);
  }

  _buildTree(X, y, depth) {
    // 停止条件
    if (depth >= this.maxDepth || y.length < this.minSamplesSplit || this._isPure(y)) {
      return this._createLeaf(y);
    }

    // 寻找最佳分割点
    const bestSplit = this._findBestSplit(X, y);
    if (!bestSplit) {
      return this._createLeaf(y);
    }

    // 分割数据
    const { featureIndex, threshold } = bestSplit;
    const leftIndices = [];
    const rightIndices = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i][featureIndex] <= threshold) {
        leftIndices.push(i);
      } else {
        rightIndices.push(i);
      }
    }

    // 检查分割是否有效
    if (leftIndices.length < this.minSamplesLeaf || rightIndices.length < this.minSamplesLeaf) {
      return this._createLeaf(y);
    }

    const leftX = leftIndices.map((i) => X[i]);
    const leftY = leftIndices.map((i) => y[i]);
    const rightX = rightIndices.map((i) => X[i]);
    const rightY = rightIndices.map((i) => y[i]);

    return {
      featureIndex,
      threshold,
      featureName: this.featureNames[featureIndex],
      left: this._buildTree(leftX, leftY, depth + 1),
      right: this._buildTree(rightX, rightY, depth + 1),
    };
  }

  _findBestSplit(X, y) {
    let bestGain = -Infinity;
    let bestSplit = null;

    const parentEntropy = this._calculateEntropy(y);

    for (let featIdx = 0; featIdx < X[0].length; featIdx++) {
      const values = [...new Set(X.map((row) => row[featIdx]))].sort((a, b) => a - b);

      for (let i = 0; i < values.length - 1; i++) {
        const threshold = (values[i] + values[i + 1]) / 2;

        const leftY = [];
        const rightY = [];

        for (let j = 0; j < X.length; j++) {
          if (X[j][featIdx] <= threshold) {
            leftY.push(y[j]);
          } else {
            rightY.push(y[j]);
          }
        }

        if (leftY.length === 0 || rightY.length === 0) continue;

        const gain =
          parentEntropy -
          (leftY.length / y.length) * this._calculateEntropy(leftY) -
          (rightY.length / y.length) * this._calculateEntropy(rightY);

        if (gain > bestGain) {
          bestGain = gain;
          bestSplit = { featureIndex: featIdx, threshold };
        }
      }
    }

    return bestSplit;
  }

  _calculateEntropy(y) {
    if (y.length === 0) return 0;

    const counts = {};
    y.forEach((label) => {
      counts[label] = (counts[label] || 0) + 1;
    });

    let entropy = 0;
    const total = y.length;

    for (const count of Object.values(counts)) {
      const prob = count / total;
      if (prob > 0) {
        entropy -= prob * Math.log2(prob);
      }
    }

    return entropy;
  }

  _isPure(y) {
    return new Set(y).size === 1;
  }

  _createLeaf(y) {
    const counts = {};
    y.forEach((label) => {
      counts[label] = (counts[label] || 0) + 1;
    });

    const total = y.length;
    const prediction = parseInt(
      Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b))
    );

    return {
      prediction,
      probability: counts[1] ? counts[1] / total : 0,
      samples: total,
    };
  }

  predict(X) {
    return X.map((x) => this._predictOne(x, this.tree));
  }

  _predictOne(x, node) {
    if (!node.left && !node.right) {
      return node.prediction;
    }

    if (x[node.featureIndex] <= node.threshold) {
      return this._predictOne(x, node.left);
    } else {
      return this._predictOne(x, node.right);
    }
  }

  printTree(node = this.tree, prefix = '', isLeft = true) {
    if (!node) return;

    if (!node.left && !node.right) {
      console.log(
        `${prefix}${isLeft ? '├── ' : '└── '}预测: ${node.prediction} (概率: ${(
          node.probability * 100
        ).toFixed(1)}%, 样本: ${node.samples})`
      );
      return;
    }

    console.log(
      `${prefix}${isLeft ? '├── ' : '└── '}if ${node.featureName} <= ${node.threshold.toFixed(2)}`
    );
    this.printTree(node.left, prefix + (isLeft ? '│   ' : '    '), true);
    this.printTree(node.right, prefix + (isLeft ? '│   ' : '    '), false);
  }
}

// ==================== 评估函数 ====================
function evaluateModel(yTrue, yPred) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 0 && yPred[i] === 0) tn++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
  }

  const accuracy = (tp + tn) / (tp + fp + tn + fn);
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = (2 * (precision * recall)) / (precision + recall) || 0;
  const specificity = tn / (tn + fp) || 0;

  return { accuracy, precision, recall, f1, specificity, tp, fp, tn, fn };
}

// ==================== 主流程 ====================
async function runOptimization() {
  console.log('================================================================================');
  console.log('=== 开始增强版参数优化实验 ===');
  console.log('================================================================================\n');

  const results = [];

  for (const config of parameterGrid) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(
      `【${config.id}】maxDepth=${config.maxDepth}, 负样本/股票=${config.negativeSamplesPerStock}`
    );
    console.log('='.repeat(80));

    // 步骤1: 构建数据集
    console.log('\n步骤1: 构建训练数据集');
    const { X, y, positiveSamples } = buildDataset(config.negativeSamplesPerStock);

    console.log(`\n正样本(买点): ${positiveSamples.length}个`);
    console.log(`负样本(非买点): ${y.filter((v) => v === 0).length}个`);
    console.log(`总样本数: ${X.length}个`);

    // 步骤2: 训练模型
    console.log('\n步骤2: 训练决策树模型');
    const tree = new DecisionTree(config.maxDepth, config.minSamplesSplit, 1);
    tree.train(X, y);

    // 步骤3: 评估模型
    console.log('\n步骤3: 模型评估');
    const predictions = tree.predict(X);
    const metrics = evaluateModel(y, predictions);

    console.log(`\n【${config.id} 性能指标】`);
    console.log(`  准确率: ${(metrics.accuracy * 100).toFixed(1)}%`);
    console.log(`  精确率: ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`  召回率: ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`  F1分数: ${metrics.f1.toFixed(2)}`);
    console.log(`  特异性: ${(metrics.specificity * 100).toFixed(1)}%`);

    // 步骤4: 分析未捕获买点（根据预测结果找出真正的FN）
    const missedCount = metrics.fn; // FN = 实际为买点但预测为非买点
    const missedIndices = [];
    for (let i = 0; i < y.length; i++) {
      if (y[i] === 1 && predictions[i] === 0) {
        missedIndices.push(i);
      }
    }

    console.log(`\n  未捕获买点: ${missedCount}个 / ${positiveSamples.length}个`);
    if (missedCount > 0 && missedIndices.length > 0) {
      // 从未捕获的索引中提取对应的正样本
      const missedSamples = missedIndices.map((idx) => positiveSamples[idx]);
      const avgFeatures = calculateAverageFeatures(missedSamples);
      console.log(`  平均特征:`);
      console.log(`    - 距高点: ${avgFeatures.distFromHigh.toFixed(2)}%`);
      console.log(`    - 5日变化: ${avgFeatures.change5d.toFixed(2)}%`);
      console.log(`    - 10日变化: ${avgFeatures.change10d.toFixed(2)}%`);
      console.log(`    - 量比: ${avgFeatures.volumeRatio.toFixed(2)}`);
      console.log(`    - MA5偏离: ${avgFeatures.ma5Deviation.toFixed(2)}%`);
      console.log(`    - ATR%: ${avgFeatures.atrPercent.toFixed(2)}%`);
      console.log(`    - 次日收益: ${avgFeatures.nextDayReturn.toFixed(2)}%`);
    }

    results.push({
      configId: config.id,
      maxDepth: config.maxDepth,
      negativeSamples: y.filter((v) => v === 0).length,
      ...metrics,
    });
  }

  // 汇总结果
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('=== 参数优化实验结果汇总 ===');
  console.log('='.repeat(80));

  printComparisonTable(results);

  // 选择最优配置（以F1分数为主要指标）
  const bestConfig = results.reduce((best, curr) => (curr.f1 > best.f1 ? curr : best));

  console.log(`\n【🏆 推荐配置】`);
  console.log(`  配置ID: ${bestConfig.configId}`);
  console.log(`  树深度: ${bestConfig.maxDepth}`);
  console.log(`  负样本数: ${bestConfig.negativeSamples}`);
  console.log(`  召回率: ${(bestConfig.recall * 100).toFixed(1)}%`);
  console.log(`  F1分数: ${bestConfig.f1.toFixed(2)}`);
  console.log(`  精确率: ${(bestConfig.precision * 100).toFixed(1)}%`);
  console.log(`  准确率: ${(bestConfig.accuracy * 100).toFixed(1)}%`);

  // 保存最优模型
  console.log(`\n步骤5: 保存最优模型`);
  await saveBestModel(bestConfig);

  console.log(`\n${'='.repeat(80)}`);
  console.log('=== 参数优化实验完成 ===');
  console.log('='.repeat(80));
}

function buildDataset(negativeSamplesPerStock) {
  const positiveSamples = [];
  const negativeSamples = [];

  // 收集所有买点
  for (const stock of stockFiles) {
    const result = loadStockData(stock.file);
    const klineData = result.klineData;
    const fileBuyPoints = result.buyPoints;

    if (klineData.length === 0) continue;

    // 创建日期到索引的映射
    const dateToIndex = {};
    klineData.forEach((k, idx) => {
      const date = new Date(k.time);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(date.getDate()).padStart(2, '0')}`;
      dateToIndex[dateStr] = idx;
    });

    // 添加正样本（买点）
    // 优先使用文件中的买点日期，如果没有则使用配置中的日期
    const buyDates = fileBuyPoints.length > 0 ? fileBuyPoints : stock.dates;
    for (const buyDate of buyDates) {
      const normalizedDate = buyDate.replace(/\//g, '-');
      const index = dateToIndex[normalizedDate];

      if (index !== undefined && index >= 20) {
        const features = calculateFeatures(klineData, index);
        if (features) {
          // 计算次日收益
          const nextDayReturn =
            index < klineData.length - 1
              ? ((klineData[index + 1].close - features.close) / features.close) * 100
              : 0;

          positiveSamples.push({
            features,
            nextDayReturn,
            stock: stock.file,
            date: buyDate,
          });
        }
      }
    }

    // 添加负样本（随机非买点）
    const nonBuyIndices = [];
    for (let i = 20; i < klineData.length - 1; i++) {
      const date = new Date(klineData[i].time);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(date.getDate()).padStart(2, '0')}`;

      // 排除买点日期
      if (!stock.dates.some((d) => d.replace(/\//g, '-') === dateStr)) {
        const nextDayReturn =
          ((klineData[i + 1].close - klineData[i].close) / klineData[i].close) * 100;
        // 优化：放宽负样本筛选条件，从<3%改为<5%，增加样本多样性
        if (nextDayReturn < 5) {
          nonBuyIndices.push(i);
        }
      }
    }

    // 随机选择负样本
    const shuffled = nonBuyIndices.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, negativeSamplesPerStock);

    for (const idx of selected) {
      const features = calculateFeatures(klineData, idx);
      if (features) {
        negativeSamples.push(features);
      }
    }
  }

  // 构建X和y
  const X = [
    ...positiveSamples.map((s) => [
      s.features.distFromHigh,
      s.features.change5d,
      s.features.change10d,
      s.features.volumeRatio,
      s.features.ma5Deviation,
      s.features.ma20Deviation,
      s.features.bbWidth,
      s.features.atrPercent,
    ]),
    ...negativeSamples.map((s) => [
      s.distFromHigh,
      s.change5d,
      s.change10d,
      s.volumeRatio,
      s.ma5Deviation,
      s.ma20Deviation,
      s.bbWidth,
      s.atrPercent,
    ]),
  ];

  const y = [...Array(positiveSamples.length).fill(1), ...Array(negativeSamples.length).fill(0)];

  return { X, y, positiveSamples };
}

function calculateAverageFeatures(samples) {
  if (samples.length === 0) return {};

  const sum = samples.reduce(
    (acc, s) => ({
      distFromHigh: acc.distFromHigh + s.features.distFromHigh,
      change5d: acc.change5d + s.features.change5d,
      change10d: acc.change10d + s.features.change10d,
      volumeRatio: acc.volumeRatio + s.features.volumeRatio,
      ma5Deviation: acc.ma5Deviation + s.features.ma5Deviation,
      ma20Deviation: acc.ma20Deviation + s.features.ma20Deviation,
      bbWidth: acc.bbWidth + s.features.bbWidth,
      atrPercent: acc.atrPercent + s.features.atrPercent,
      nextDayReturn: acc.nextDayReturn + s.nextDayReturn,
    }),
    {
      distFromHigh: 0,
      change5d: 0,
      change10d: 0,
      volumeRatio: 0,
      ma5Deviation: 0,
      ma20Deviation: 0,
      bbWidth: 0,
      atrPercent: 0,
      nextDayReturn: 0,
    }
  );

  const count = samples.length;
  return {
    distFromHigh: sum.distFromHigh / count,
    change5d: sum.change5d / count,
    change10d: sum.change10d / count,
    volumeRatio: sum.volumeRatio / count,
    ma5Deviation: sum.ma5Deviation / count,
    ma20Deviation: sum.ma20Deviation / count,
    bbWidth: sum.bbWidth / count,
    atrPercent: sum.atrPercent / count,
    nextDayReturn: sum.nextDayReturn / count,
  };
}

function printComparisonTable(results) {
  console.log('\n【配置对比表】');
  console.log('┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ 配置ID   │ 树深度   │ 负样本数  │ 准确率   │ 精确率   │ 召回率   │ F1分数   │');
  console.log('├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤');

  results.forEach((r) => {
    console.log(
      `│ ${r.configId.padEnd(8)} │ ${String(r.maxDepth).padStart(6)} │ ${String(
        r.negativeSamples
      ).padStart(8)} │ ${(r.accuracy * 100).toFixed(1).padStart(6)}% │ ${(r.precision * 100)
        .toFixed(1)
        .padStart(6)}% │ ${(r.recall * 100).toFixed(1).padStart(6)}% │ ${r.f1
        .toFixed(2)
        .padStart(8)} │`
    );
  });

  console.log('└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘');
}

async function saveBestModel(bestConfig) {
  // 使用最优配置重新训练并保存
  const { X, y } = buildDataset(
    parameterGrid.find((p) => p.id === bestConfig.configId).negativeSamplesPerStock
  );

  const tree = new DecisionTree(bestConfig.maxDepth, 2, 1);
  tree.train(X, y);

  const modelData = {
    config: bestConfig,
    trainingSamples: {
      total: X.length,
      positive: y.filter((v) => v === 1).length,
      negative: y.filter((v) => v === 0).length,
    },
    performance: {
      accuracy: bestConfig.accuracy,
      precision: bestConfig.precision,
      recall: bestConfig.recall,
      f1: bestConfig.f1,
    },
    tree: tree.tree,
    featureNames: tree.featureNames,
    timestamp: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, 'buypoint_model.json');
  fs.writeFileSync(outputPath, JSON.stringify(modelData, null, 2), 'utf-8');

  console.log(`\n✅ 最优模型已保存到: ${outputPath}`);
  console.log(
    `   训练样本: ${modelData.trainingSamples.total}个 (正样本${modelData.trainingSamples.positive}个, 负样本${modelData.trainingSamples.negative}个)`
  );
  console.log(
    `   模型性能: 准确率${(bestConfig.accuracy * 100).toFixed(1)}%, 召回率${(
      bestConfig.recall * 100
    ).toFixed(1)}%, F1分数${bestConfig.f1.toFixed(2)}`
  );
}

// 运行优化
runOptimization().catch((err) => {
  console.error('❌ 优化过程出错:', err);
  process.exit(1);
});
