const fs = require('fs');
const path = require('path');

// 所有股票数据文件列表
const stockFiles = [
  { file: '中衡设计.txt', dates: ['2026-04-17', '2026-01-07', '2025-11-24'] },
  { file: '起帆股份.txt', dates: ['2026-04-14', '2026-01-16', '2025-12-11'] },
  { file: '永杉锂业.txt', dates: ['2026-04-07', '2025-10-28'] },
  { file: '山东玻纤.txt', dates: ['2026-04-09', '2026-02-03'] },
  { file: '宏昌电子.txt', dates: ['2026-04-03', '2026-01-14'] },
  { file: '三孚股份.txt', dates: ['2025-12-22', '2026-04-01'] },
];

console.log('================================================================================');
console.log('=== 方向4: 规则组合优化 ===');
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

  const priceChange_5d =
    targetIndex >= 5
      ? ((currentPrice - klineData[targetIndex - 5].close) / klineData[targetIndex - 5].close) * 100
      : null;

  const lookback = 60;
  const startIdx = Math.max(0, targetIndex - lookback);
  const slice = klineData.slice(startIdx, targetIndex + 1);
  const recentHigh = Math.max(...slice.map((k) => k.high));
  const distanceFromHigh = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : null;

  const currentVolume = klineData[targetIndex].volume;
  const avgVolume_5d =
    targetIndex >= 5
      ? historicalData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5
      : null;
  const volumeRatio_5d = avgVolume_5d > 0 ? currentVolume / avgVolume_5d : null;

  const ma20 =
    targetIndex >= 20
      ? historicalData
          .slice(targetIndex - 19, targetIndex + 1)
          .reduce((sum, k) => sum + k.close, 0) / 20
      : null;
  const priceVsMA20 = ma20 > 0 ? ((currentPrice - ma20) / ma20) * 100 : null;

  const nextDayReturn =
    targetIndex < klineData.length - 1
      ? ((klineData[targetIndex + 1].close - currentPrice) / currentPrice) * 100
      : null;

  return {
    priceChange_5d,
    distanceFromHigh,
    volumeRatio_5d,
    priceVsMA20,
    nextDayReturn,
  };
}

// 收集所有日期的特征(买点和非买点)
const allDataPoints = [];
const buyPointSet = new Set();

stockFiles.forEach((stockFile) => {
  const stockData = loadStockData(stockFile.file);
  const klineData = stockData.dailyLines;

  // 记录买点日期
  stockFile.dates.forEach((date) => {
    buyPointSet.add(`${stockData.code}_${date}`);
  });

  // 遍历所有日期(避开开头和结尾)
  for (let i = 20; i < klineData.length - 15; i++) {
    const date = new Date(klineData[i].time).toISOString().split('T')[0];
    const key = `${stockData.code}_${date}`;
    const isBuyPoint = buyPointSet.has(key);

    const features = extractFeatures(stockData, i);

    allDataPoints.push({
      stockName: stockData.name,
      stockCode: stockData.code,
      date,
      isBuyPoint,
      ...features,
    });
  }
});

console.log(`总数据点: ${allDataPoints.length}`);
console.log(`买点数量: ${allDataPoints.filter((d) => d.isBuyPoint).length}`);
console.log(`非买点数量: ${allDataPoints.filter((d) => !d.isBuyPoint).length}\n`);

// 定义候选规则
const rules = [
  {
    name: '深度回调',
    test: (d) => d.distanceFromHigh !== null && d.distanceFromHigh < -12.8,
  },
  {
    name: '短期走弱',
    test: (d) => d.priceChange_5d !== null && d.priceChange_5d < 0.2,
  },
  {
    name: '均线下方',
    test: (d) => d.priceVsMA20 !== null && d.priceVsMA20 < 1.5,
  },
  {
    name: '成交量萎缩',
    test: (d) => d.volumeRatio_5d !== null && d.volumeRatio_5d < 1.07,
  },
];

console.log('=== 单个规则的识别效果 ===\n');

rules.forEach((rule) => {
  const matched = allDataPoints.filter((d) => rule.test(d));
  const buyPointsMatched = matched.filter((d) => d.isBuyPoint);
  const nonBuyPointsMatched = matched.filter((d) => !d.isBuyPoint);

  const totalBuyPoints = allDataPoints.filter((d) => d.isBuyPoint).length;
  const recall = totalBuyPoints > 0 ? (buyPointsMatched.length / totalBuyPoints) * 100 : 0;
  const precision = matched.length > 0 ? (buyPointsMatched.length / matched.length) * 100 : 0;

  console.log(`规则: ${rule.name}`);
  console.log(`  匹配总数: ${matched.length}`);
  console.log(
    `  命中买点: ${buyPointsMatched.length}/${totalBuyPoints} (召回率 ${recall.toFixed(1)}%)`
  );
  console.log(
    `  精确率: ${precision.toFixed(1)}% (${buyPointsMatched.length}个买点 / ${
      matched.length
    }个匹配)`
  );
  console.log(`  误报数: ${nonBuyPointsMatched.length}\n`);
});

// 测试不同的规则组合
console.log('\n=== 规则组合测试 ===\n');

// 生成所有可能的规则组合(2个、3个、4个)
function generateCombinations(rules, size) {
  const combinations = [];

  function backtrack(start, current) {
    if (current.length === size) {
      combinations.push([...current]);
      return;
    }

    for (let i = start; i < rules.length; i++) {
      current.push(rules[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return combinations;
}

const allCombinations = [
  ...generateCombinations(rules, 2),
  ...generateCombinations(rules, 3),
  ...generateCombinations(rules, 4),
];

console.log(`测试 ${allCombinations.length} 种规则组合...\n`);

// 评估每个组合
const results = allCombinations.map((combo) => {
  const matched = allDataPoints.filter((d) => {
    // 满足至少N个规则(N为组合中的规则数-1,即宽松条件)
    const satisfiedCount = combo.filter((rule) => rule.test(d)).length;
    return satisfiedCount >= combo.length - 1; // 满足至少N-1个规则
  });

  const buyPointsMatched = matched.filter((d) => d.isBuyPoint);
  const nonBuyPointsMatched = matched.filter((d) => !d.isBuyPoint);

  const totalBuyPoints = allDataPoints.filter((d) => d.isBuyPoint).length;
  const recall = totalBuyPoints > 0 ? (buyPointsMatched.length / totalBuyPoints) * 100 : 0;
  const precision = matched.length > 0 ? (buyPointsMatched.length / matched.length) * 100 : 0;

  return {
    rules: combo.map((r) => r.name),
    ruleCount: combo.length,
    matchedCount: matched.length,
    buyPointsMatched: buyPointsMatched.length,
    nonBuyPointsMatched: nonBuyPointsMatched.length,
    recall,
    precision,
    f1Score: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
  };
});

// 按F1分数排序
results.sort((a, b) => b.f1Score - a.f1Score);

// 显示Top 10的组合
console.log('Top 10 最佳规则组合 (按F1分数排序):\n');
console.log(
  '排名 | 规则组合                              | 匹配数 | 买点 | 误报 | 召回率 | 精确率 | F1分数'
);
console.log('-'.repeat(100));

results.slice(0, 10).forEach((result, idx) => {
  const ruleStr = result.rules.join(' + ');
  console.log(
    `${(idx + 1).toString().padStart(2)}   | ${ruleStr.padEnd(35)} | ${result.matchedCount
      .toString()
      .padStart(5)} | ${result.buyPointsMatched
      .toString()
      .padStart(4)} | ${result.nonBuyPointsMatched.toString().padStart(4)} | ${result.recall
      .toFixed(1)
      .padStart(5)}% | ${result.precision.toFixed(1).padStart(5)}% | ${result.f1Score.toFixed(2)}`
  );
});

// 显示最佳组合的详细信息
const bestResult = results[0];
console.log('\n\n=== 最佳组合详细分析 ===\n');
console.log(`规则组合: ${bestResult.rules.join(' + ')}`);
console.log(`要求: 满足至少 ${bestResult.ruleCount - 1} 个规则\n`);

console.log(`性能指标:`);
console.log(
  `  召回率: ${bestResult.recall.toFixed(1)}% (捕获了${bestResult.buyPointsMatched}个买点中的${
    allDataPoints.filter((d) => d.isBuyPoint).length
  }个)`
);
console.log(
  `  精确率: ${bestResult.precision.toFixed(1)}% (${bestResult.buyPointsMatched}个买点 / ${
    bestResult.matchedCount
  }个匹配)`
);
console.log(`  F1分数: ${bestResult.f1Score.toFixed(2)}`);
console.log(`  误报数: ${bestResult.nonBuyPointsMatched}\n`);

// 显示被该组合捕获的买点
const matchedBuyPoints = allDataPoints.filter((d) => {
  const satisfiedCount = rules.filter(
    (rule) => bestResult.rules.includes(rule.name) && rule.test(d)
  ).length;
  return d.isBuyPoint && satisfiedCount >= bestResult.ruleCount - 1;
});

console.log('被捕获的买点:');
matchedBuyPoints.forEach((bp) => {
  console.log(`  ${bp.stockName.padEnd(8)} | ${bp.date} | 次日+${bp.nextDayReturn?.toFixed(2)}%`);
});

// 未被捕获的买点
const missedBuyPoints = allDataPoints.filter((d) => {
  const satisfiedCount = rules.filter(
    (rule) => bestResult.rules.includes(rule.name) && rule.test(d)
  ).length;
  return d.isBuyPoint && satisfiedCount < bestResult.ruleCount - 1;
});

if (missedBuyPoints.length > 0) {
  console.log('\n未被捕获的买点:');
  missedBuyPoints.forEach((bp) => {
    console.log(`  ${bp.stockName.padEnd(8)} | ${bp.date} | 次日+${bp.nextDayReturn?.toFixed(2)}%`);
  });
}

console.log('\n\n' + '='.repeat(80));
console.log('=== 最终建议 ===');
console.log('='.repeat(80) + '\n');

console.log('基于以上分析,推荐的筛选策略:\n');
console.log(`【推荐规则组合】`);
console.log(bestResult.rules.map((r, i) => `  ${i + 1}. ${r}`).join('\n'));
console.log(`\n【触发条件】`);
console.log(`  满足其中至少 ${bestResult.ruleCount - 1} 个规则即视为潜在买点\n`);

console.log(`【预期效果】`);
console.log(`  - 召回率: ${bestResult.recall.toFixed(1)}% (能捕获大部分优质买点)`);
console.log(`  - 精确率: ${bestResult.precision.toFixed(1)}% (会有一定误报,需人工筛选)`);
console.log(
  `  - 每日匹配数: 约 ${(bestResult.matchedCount / 6).toFixed(
    0
  )} 个/股票 (假设每只股票有约300个交易日)\n`
);

console.log(`【注意事项】`);
console.log(`  1. 此策略基于14个买点的样本,可能存在过拟合风险`);
console.log(`  2. 建议在更大规模的股票池中进行回测验证`);
console.log(`  3. 可结合其他因素(如板块热度、大盘走势)进一步过滤`);
console.log(`  4. 误报率较高,需要人工二次确认\n`);

console.log('================================================================================');
console.log('=== 四个方向分析全部完成 ===');
console.log('================================================================================');
