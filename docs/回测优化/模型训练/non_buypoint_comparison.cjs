const fs = require('fs');
const path = require('path');

// 所有股票数据文件列表
const stockFiles = [
  { file: '中衡设计.txt', dates: ['2026-04-17', '2026-01-07', '2025-11-24'] },
  { file: '起帆电缆.txt', dates: ['2026-04-14', '2026-01-16', '2025-12-11'] },
  { file: '永杉锂业.txt', dates: ['2026-04-07', '2025-10-28'] },
  { file: '山东玻纤.txt', dates: ['2026-04-09', '2026-02-03'] },
  { file: '宏昌电子.txt', dates: ['2026-04-03', '2026-01-14'] },
  { file: '三孚股份.txt', dates: ['2025-12-22', '2026-04-01'] },
];

console.log('================================================================================');
console.log('=== 方向3: 对比非买点时期 ===');
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

// 提取特征
function extractFeatures(stockData, targetIndex) {
  const klineData = stockData.dailyLines;
  const currentPrice = klineData[targetIndex].close;
  const historicalData = klineData.slice(0, targetIndex + 1);

  // 价格变化
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

  // 距高点
  const lookback = 60;
  const startIdx = Math.max(0, targetIndex - lookback);
  const slice = klineData.slice(startIdx, targetIndex + 1);
  const recentHigh = Math.max(...slice.map((k) => k.high));
  const distanceFromHigh = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : null;

  // 成交量
  const currentVolume = klineData[targetIndex].volume;
  const avgVolume_5d =
    targetIndex >= 5
      ? historicalData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5
      : null;
  const volumeRatio_5d = avgVolume_5d > 0 ? currentVolume / avgVolume_5d : null;

  // MA20偏离
  const ma20 =
    targetIndex >= 20
      ? historicalData
          .slice(targetIndex - 19, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 20
      : null;
  const priceVsMA20 = ma20 > 0 ? ((currentPrice - ma20) / ma20) * 100 : null;

  // 次日收益
  const nextDayReturn =
    targetIndex < klineData.length - 1
      ? ((klineData[targetIndex + 1].close - currentPrice) / currentPrice) * 100
      : null;

  return {
    priceChange_3d,
    priceChange_5d,
    priceChange_10d,
    distanceFromHigh,
    volumeRatio_5d,
    priceVsMA20,
    nextDayReturn,
  };
}

// 收集买点特征
const buyPointFeatures = [];
const allBuyPointDates = new Set();

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
      buyPointFeatures.push({
        stockName: stockData.name,
        date,
        ...features,
        isBuyPoint: true,
      });
      allBuyPointDates.add(`${stockData.code}_${date}`);
    }
  });
});

console.log(`已收集 ${buyPointFeatures.length} 个买点特征\n`);

// 从每只股票中随机选取非买点日期
const nonBuyPointFeatures = [];
const samplesPerStock = 10; // 每只股票采样10个非买点

stockFiles.forEach((stockFile) => {
  const stockData = loadStockData(stockFile.file);
  const klineData = stockData.dailyLines;

  // 随机选取非买点日期(避开买点前后3天)
  const candidateIndices = [];
  for (let i = 20; i < klineData.length - 15; i++) {
    // 留出前后缓冲
    const date = new Date(klineData[i].time).toISOString().split('T')[0];
    const key = `${stockData.code}_${date}`;

    if (!allBuyPointDates.has(key)) {
      // 检查是否在买点前后3天内
      let isNearBuyPoint = false;
      stockFile.dates.forEach((buyDate) => {
        const buyIndex = klineData.findIndex((k) => {
          const d = new Date(k.time);
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`;
          return ds === buyDate;
        });

        if (buyIndex !== -1 && Math.abs(i - buyIndex) <= 3) {
          isNearBuyPoint = true;
        }
      });

      if (!isNearBuyPoint) {
        candidateIndices.push(i);
      }
    }
  }

  // 随机选取samplesPerStock个
  const selectedIndices = [];
  while (selectedIndices.length < samplesPerStock && candidateIndices.length > 0) {
    const randIdx = Math.floor(Math.random() * candidateIndices.length);
    selectedIndices.push(candidateIndices[randIdx]);
    candidateIndices.splice(randIdx, 1);
  }

  selectedIndices.forEach((idx) => {
    const features = extractFeatures(stockData, idx);
    const date = new Date(klineData[idx].time).toISOString().split('T')[0];

    nonBuyPointFeatures.push({
      stockName: stockData.name,
      date,
      ...features,
      isBuyPoint: false,
    });
  });
});

console.log(`已收集 ${nonBuyPointFeatures.length} 个非买点特征\n`);

// 统计分析
function calculateStats(features, fieldName) {
  const values = features.filter((f) => f[fieldName] !== null).map((f) => f[fieldName]);
  if (values.length === 0) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...values);
  const max = Math.max(...values);

  return { mean, median, min, max, count: values.length };
}

console.log('=== 买点 vs 非买点 特征对比 ===\n');

const fields = [
  { name: 'priceChange_3d', label: '3日变化%' },
  { name: 'priceChange_5d', label: '5日变化%' },
  { name: 'priceChange_10d', label: '10日变化%' },
  { name: 'distanceFromHigh', label: '距高点%' },
  { name: 'volumeRatio_5d', label: '量比' },
  { name: 'priceVsMA20', label: 'MA20偏离%' },
  { name: 'nextDayReturn', label: '次日收益%' },
];

console.log('特征         | 买点均值 | 买点中位数 | 非买点均值 | 非买点中位数 | 差异(买-非买)');
console.log('-'.repeat(85));

fields.forEach((field) => {
  const buyStats = calculateStats(buyPointFeatures, field.name);
  const nonBuyStats = calculateStats(nonBuyPointFeatures, field.name);

  if (buyStats && nonBuyStats) {
    const diff = buyStats.mean - nonBuyStats.mean;
    const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2);

    console.log(
      `${field.label.padEnd(10)} | ${buyStats.mean.toFixed(2).padStart(8)} | ${buyStats.median
        .toFixed(2)
        .padStart(8)} | ${nonBuyStats.mean.toFixed(2).padStart(8)} | ${nonBuyStats.median
        .toFixed(2)
        .padStart(8)} | ${diffStr.padStart(12)}`
    );
  }
});

console.log('\n\n=== 关键区分特征分析 ===\n');

// 找出差异最大的特征
const featureDiffs = fields
  .map((field) => {
    const buyStats = calculateStats(buyPointFeatures, field.name);
    const nonBuyStats = calculateStats(nonBuyPointFeatures, field.name);

    if (buyStats && nonBuyStats) {
      return {
        name: field.label,
        diff: buyStats.mean - nonBuyStats.mean,
        buyMean: buyStats.mean,
        nonBuyMean: nonBuyStats.mean,
      };
    }
    return null;
  })
  .filter((f) => f !== null)
  .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

console.log('按区分度排序的特征:\n');
featureDiffs.forEach((f, idx) => {
  console.log(`${idx + 1}. ${f.name}`);
  console.log(`   买点均值: ${f.buyMean.toFixed(2)}`);
  console.log(`   非买点均值: ${f.nonBuyMean.toFixed(2)}`);
  console.log(`   差异: ${(f.diff >= 0 ? '+' : '') + f.diff.toFixed(2)}`);
  console.log();
});

// 尝试制定筛选规则
console.log('=== 基于对比的筛选规则建议 ===\n');

// 规则1: 距高点回调
const distHighDiff = featureDiffs.find((f) => f.name === '距高点%');
if (distHighDiff) {
  const threshold = (distHighDiff.buyMean + distHighDiff.nonBuyMean) / 2;
  console.log(`规则1: 深度回调`);
  console.log(`  条件: 距60日高点跌幅 > ${threshold.toFixed(1)}%`);
  console.log(
    `  依据: 买点平均${distHighDiff.buyMean.toFixed(
      1
    )}%, 非买点平均${distHighDiff.nonBuyMean.toFixed(1)}%\n`
  );
}

// 规则2: 短期价格走势
const priceChange5dDiff = featureDiffs.find((f) => f.name === '5日变化%');
if (priceChange5dDiff) {
  const threshold = (priceChange5dDiff.buyMean + priceChange5dDiff.nonBuyMean) / 2;
  console.log(`规则2: 短期走势`);
  console.log(`  条件: 5日累计变化 < ${threshold.toFixed(1)}%`);
  console.log(
    `  依据: 买点平均${priceChange5dDiff.buyMean.toFixed(
      1
    )}%, 非买点平均${priceChange5dDiff.nonBuyMean.toFixed(1)}%\n`
  );
}

// 规则3: MA20偏离
const ma20Diff = featureDiffs.find((f) => f.name === 'MA20偏离%');
if (ma20Diff) {
  const threshold = (ma20Diff.buyMean + ma20Diff.nonBuyMean) / 2;
  console.log(`规则3: 均线位置`);
  console.log(`  条件: 相对MA20偏离 < ${threshold.toFixed(1)}%`);
  console.log(
    `  依据: 买点平均${ma20Diff.buyMean.toFixed(1)}%, 非买点平均${ma20Diff.nonBuyMean.toFixed(
      1
    )}%\n`
  );
}

// 规则4: 成交量
const volDiff = featureDiffs.find((f) => f.name === '量比');
if (volDiff) {
  const threshold = (volDiff.buyMean + volDiff.nonBuyMean) / 2;
  console.log(`规则4: 成交量特征`);
  console.log(`  条件: 量比 < ${threshold.toFixed(2)}`);
  console.log(
    `  依据: 买点平均${volDiff.buyMean.toFixed(2)}, 非买点平均${volDiff.nonBuyMean.toFixed(2)}\n`
  );
}

console.log('建议: 组合使用上述规则,例如满足其中2-3个条件即视为潜在买点');

console.log('\n================================================================================');
console.log('=== 方向3完成,准备进入方向4 ===');
console.log('================================================================================');
