const fs = require('fs');
const path = require('path');

// 所有股票数据文件列表(使用修正后的日期)
const stockFiles = [
  { file: '中衡设计.txt', dates: ['2026-04-17', '2026-01-07', '2025-11-24'] },
  { file: '起帆股份.txt', dates: ['2026-04-14', '2026-01-16', '2025-12-11'] },
  { file: '永杉锂业.txt', dates: ['2026-04-07', '2025-10-28'] },
  { file: '山东玻纤.txt', dates: ['2026-04-09', '2026-02-03'] },
  { file: '宏昌电子.txt', dates: ['2026-04-03', '2026-01-14'] },
  { file: '三孚股份.txt', dates: ['2025-12-22', '2026-04-01'] },
];

console.log('================================================================================');
console.log('=== 方向1: 买点分类聚类分析 ===');
console.log('================================================================================\n');

// 加载股票数据
function loadStockData(filename) {
  const filePath = path.join(__dirname, filename);
  const content = fs.readFileSync(filePath, 'utf-8');

  const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
  const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
  const closingBraceIndex = content.indexOf('}', jsonEndIndex);
  const validJson = content.substring(0, closingBraceIndex + 1);

  return JSON.parse(validJson);
}

// 提取买点特征向量(用于聚类)
function extractFeatureVector(stockData, targetDate) {
  const klineData = stockData.dailyLines;

  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === targetDate;
  });

  if (targetIndex === -1) return null;

  const currentPrice = klineData[targetIndex].close;
  const historicalData = klineData.slice(0, targetIndex + 1);

  // 计算特征
  const priceChange_3d =
    targetIndex >= 3
      ? ((currentPrice - klineData[targetIndex - 3].close) / klineData[targetIndex - 3].close) * 100
      : 0;
  const priceChange_5d =
    targetIndex >= 5
      ? ((currentPrice - klineData[targetIndex - 5].close) / klineData[targetIndex - 5].close) * 100
      : 0;
  const priceChange_10d =
    targetIndex >= 10
      ? ((currentPrice - klineData[targetIndex - 10].close) / klineData[targetIndex - 10].close) *
        100
      : 0;

  // 距高点
  const lookback = 60;
  const startIdx = Math.max(0, targetIndex - lookback);
  const slice = klineData.slice(startIdx, targetIndex + 1);
  const recentHigh = Math.max(...slice.map((k) => k.high));
  const distanceFromHigh = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : 0;

  // 成交量
  const currentVolume = klineData[targetIndex].volume;
  const avgVolume_5d =
    targetIndex >= 5
      ? historicalData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5
      : currentVolume;
  const volumeRatio_5d = avgVolume_5d > 0 ? currentVolume / avgVolume_5d : 1;

  // MA20偏离
  const ma20 =
    targetIndex >= 20
      ? historicalData
          .slice(targetIndex - 19, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 20
      : currentPrice;
  const priceVsMA20 = ma20 > 0 ? ((currentPrice - ma20) / ma20) * 100 : 0;

  // K线形态
  const open = klineData[targetIndex].open;
  const close = klineData[targetIndex].close;
  const high = klineData[targetIndex].high;
  const low = klineData[targetIndex].low;
  const bodySize = Math.abs(close - open);
  const lowerShadow = Math.min(open, close) - low;
  const totalRange = high - low;
  const hasLongLowerShadow = totalRange > 0 && lowerShadow / totalRange > 0.5 ? 1 : 0;

  // 次日收益
  const nextDayReturn =
    targetIndex < klineData.length - 1
      ? ((klineData[targetIndex + 1].close - currentPrice) / currentPrice) * 100
      : 0;

  return {
    stockName: stockData.name,
    date: targetDate,
    price: currentPrice,
    nextDayReturn,
    // 特征向量(归一化前)
    features: {
      priceChange_3d,
      priceChange_5d,
      priceChange_10d,
      distanceFromHigh,
      volumeRatio_5d,
      priceVsMA20,
      hasLongLowerShadow,
    },
  };
}

// 收集所有买点的特征
const allBuyPoints = [];

stockFiles.forEach((stockFile) => {
  const stockData = loadStockData(stockFile.file);

  stockFile.dates.forEach((date) => {
    const feature = extractFeatureVector(stockData, date);
    if (feature) {
      allBuyPoints.push(feature);
    }
  });
});

console.log(`成功提取 ${allBuyPoints.length} 个买点的特征向量\n`);

// 标准化特征(减去均值,除以标准差)
function standardizeFeatures(data) {
  const featureNames = Object.keys(data[0].features);
  const standardized = data.map((point) => ({ ...point, stdFeatures: {} }));

  featureNames.forEach((fname) => {
    const values = data.map((p) => p.features[fname]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    standardized.forEach((point, idx) => {
      point.stdFeatures[fname] = std > 0 ? (values[idx] - mean) / std : 0;
    });
  });

  return standardized;
}

const standardizedData = standardizeFeatures(allBuyPoints);

// 计算欧氏距离
function euclideanDistance(vec1, vec2) {
  const featureNames = Object.keys(vec1.stdFeatures);
  let sum = 0;
  featureNames.forEach((fname) => {
    sum += Math.pow(vec1.stdFeatures[fname] - vec2.stdFeatures[fname], 2);
  });
  return Math.sqrt(sum);
}

// K-Means聚类(简化版,k=2和k=3)
function kMeansClustering(data, k, maxIterations = 100) {
  const n = data.length;
  const featureNames = Object.keys(data[0].stdFeatures);

  // 随机初始化中心点
  let centroids = [];
  const usedIndices = new Set();
  for (let i = 0; i < k; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * n);
    } while (usedIndices.has(idx));
    usedIndices.add(idx);
    centroids.push({ ...data[idx].stdFeatures });
  }

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // 分配每个点到最近的中心
    const newAssignments = data.map((point) => {
      let minDist = Infinity;
      let closestCluster = 0;

      centroids.forEach((centroid, cidx) => {
        let dist = 0;
        featureNames.forEach((fname) => {
          dist += Math.pow(point.stdFeatures[fname] - centroid[fname], 2);
        });
        dist = Math.sqrt(dist);

        if (dist < minDist) {
          minDist = dist;
          closestCluster = cidx;
        }
      });

      return closestCluster;
    });

    // 检查是否收敛
    if (JSON.stringify(assignments) === JSON.stringify(newAssignments)) {
      break;
    }

    assignments = newAssignments;

    // 更新中心点
    centroids = centroids.map((centroid, cidx) => {
      const clusterPoints = data.filter((_, idx) => assignments[idx] === cidx);
      if (clusterPoints.length === 0) return centroid;

      const newCentroid = {};
      featureNames.forEach((fname) => {
        newCentroid[fname] =
          clusterPoints.reduce((sum, p) => sum + p.stdFeatures[fname], 0) / clusterPoints.length;
      });

      return newCentroid;
    });
  }

  return { assignments, centroids };
}

// 执行K=2和K=3的聚类
console.log('--- 尝试 K=2 聚类 ---\n');
const clustering_k2 = kMeansClustering(standardizedData, 2);

// 打印K=2的结果
const cluster0_k2 = standardizedData.filter((_, idx) => clustering_k2.assignments[idx] === 0);
const cluster1_k2 = standardizedData.filter((_, idx) => clustering_k2.assignments[idx] === 1);

console.log(`类别0 (${cluster0_k2.length}个买点):`);
cluster0_k2.forEach((p) => {
  console.log(
    `  ${p.stockName.padEnd(8)} | ${p.date} | 次日+${p.nextDayReturn.toFixed(2).padStart(5)}%`
  );
});

console.log(`\n类别1 (${cluster1_k2.length}个买点):`);
cluster1_k2.forEach((p) => {
  console.log(
    `  ${p.stockName.padEnd(8)} | ${p.date} | 次日+${p.nextDayReturn.toFixed(2).padStart(5)}%`
  );
});

// 计算各类别的特征均值
function calculateClusterMean(cluster) {
  const featureNames = Object.keys(cluster[0].features);
  const mean = {};
  featureNames.forEach((fname) => {
    mean[fname] = cluster.reduce((sum, p) => sum + p.features[fname], 0) / cluster.length;
  });
  return mean;
}

const mean0_k2 = calculateClusterMean(cluster0_k2);
const mean1_k2 = calculateClusterMean(cluster1_k2);

console.log('\n【类别0 vs 类别1 的特征对比】');
console.log('特征           | 类别0均值    | 类别1均值    | 差异');
console.log('-'.repeat(60));
Object.keys(mean0_k2).forEach((fname) => {
  const diff = mean0_k2[fname] - mean1_k2[fname];
  const fname_cn =
    {
      priceChange_3d: '3日变化%',
      priceChange_5d: '5日变化%',
      priceChange_10d: '10日变化%',
      distanceFromHigh: '距高点%',
      volumeRatio_5d: '量比',
      priceVsMA20: 'MA20偏离%',
      hasLongLowerShadow: '长下影',
    }[fname] || fname;

  console.log(
    `${fname_cn.padEnd(14)} | ${mean0_k2[fname].toFixed(2).padStart(10)} | ${mean1_k2[fname]
      .toFixed(2)
      .padStart(10)} | ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
  );
});

console.log('\n\n--- 尝试 K=3 聚类 ---\n');
const clustering_k3 = kMeansClustering(standardizedData, 3);

// 打印K=3的结果
for (let c = 0; c < 3; c++) {
  const cluster = standardizedData.filter((_, idx) => clustering_k3.assignments[idx] === c);
  console.log(`类别${c} (${cluster.length}个买点):`);
  cluster.forEach((p) => {
    console.log(
      `  ${p.stockName.padEnd(8)} | ${p.date} | 次日+${p.nextDayReturn.toFixed(2).padStart(5)}%`
    );
  });
  console.log();
}

// 计算K=3各类别的特征均值
console.log('【K=3聚类的特征对比】');
for (let c = 0; c < 3; c++) {
  const cluster = standardizedData.filter((_, idx) => clustering_k3.assignments[idx] === c);
  if (cluster.length === 0) continue;

  const mean = calculateClusterMean(cluster);
  console.log(`\n类别${c} (${cluster.length}个买点):`);
  console.log(`  3日变化: ${mean.priceChange_3d.toFixed(2)}%`);
  console.log(`  5日变化: ${mean.priceChange_5d.toFixed(2)}%`);
  console.log(`  10日变化: ${mean.priceChange_10d.toFixed(2)}%`);
  console.log(`  距高点: ${mean.distanceFromHigh.toFixed(2)}%`);
  console.log(`  量比: ${mean.volumeRatio_5d.toFixed(2)}`);
  console.log(`  MA20偏离: ${mean.priceVsMA20.toFixed(2)}%`);
}

console.log('\n\n' + '='.repeat(80));
console.log('=== 聚类分析结论 ===');
console.log('='.repeat(80) + '\n');

// 分析聚类结果的意义
console.log('根据K=2聚类结果,买点可能分为两类:\n');

if (Math.abs(mean0_k2.distanceFromHigh - mean1_k2.distanceFromHigh) > 5) {
  console.log('📊 主要区分维度: 距高点回调幅度');
  console.log(`  - 类别0: 平均距高点 ${mean0_k2.distanceFromHigh.toFixed(1)}%`);
  console.log(`  - 类别1: 平均距高点 ${mean1_k2.distanceFromHigh.toFixed(1)}%`);
  console.log('  → 这可能代表"深度回调型"vs"浅度回调型"买点\n');
}

if (Math.abs(mean0_k2.volumeRatio_5d - mean1_k2.volumeRatio_5d) > 0.2) {
  console.log('📊 次要区分维度: 成交量变化');
  console.log(`  - 类别0: 平均量比 ${mean0_k2.volumeRatio_5d.toFixed(2)}`);
  console.log(`  - 类别1: 平均量比 ${mean1_k2.volumeRatio_5d.toFixed(2)}`);
  console.log('  → 这可能代表"缩量企稳型"vs"放量突破型"买点\n');
}

if (Math.abs(mean0_k2.priceChange_5d - mean1_k2.priceChange_5d) > 2) {
  console.log('📊 价格趋势维度: 短期价格走势');
  console.log(`  - 类别0: 5日平均变化 ${mean0_k2.priceChange_5d.toFixed(2)}%`);
  console.log(`  - 类别1: 5日平均变化 ${mean1_k2.priceChange_5d.toFixed(2)}%`);
  console.log('  → 这可能代表"下跌企稳型"vs"上涨中继型"买点\n');
}

console.log('建议: 针对不同类别的买点,可能需要制定不同的筛选策略');

console.log('\n================================================================================');
console.log('=== 方向1完成,准备进入方向2 ===');
console.log('================================================================================');
