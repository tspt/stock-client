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

console.log('=== 买点特征全面分析 ===\n');

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

// 计算移动平均线
function calculateMA(data, period) {
  const ma = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    ma[i] = sum / period;
  }
  return ma;
}

// 计算ATR (平均真实波幅)
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

  // 第一个ATR是TR的简单平均
  let atrValue = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atr[period] = atrValue;

  // 后续使用平滑公式
  for (let i = period + 1; i < klineData.length; i++) {
    atrValue = (atrValue * (period - 1) + trueRanges[i - 1]) / period;
    atr[i] = atrValue;
  }

  return atr;
}

// 布林带宽度
function calculateBollingerWidth(klineData, period = 20, stdDev = 2) {
  const width = new Array(klineData.length).fill(null);

  for (let i = period - 1; i < klineData.length; i++) {
    const closes = klineData.slice(i - period + 1, i + 1).map((k) => k.close);
    const mean = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    const upper = mean + stdDev * std;
    const lower = mean - stdDev * std;
    width[i] = (upper - lower) / mean; // 相对宽度
  }

  return width;
}

// 查找近期高低点
function findRecentHighLow(klineData, currentIndex, lookback = 60) {
  const startIdx = Math.max(0, currentIndex - lookback);
  const slice = klineData.slice(startIdx, currentIndex + 1);

  const highs = slice.map((k) => k.high);
  const lows = slice.map((k) => k.low);

  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);

  return { recentHigh, recentLow };
}

// 查找前期低点
function findPreviousLows(klineData, currentIndex, lookback = 60) {
  const startIdx = Math.max(0, currentIndex - lookback);
  const slice = klineData.slice(startIdx, currentIndex);

  // 找出局部低点（前后都比它高）
  const previousLows = [];
  for (let i = 1; i < slice.length - 1; i++) {
    if (slice[i].low < slice[i - 1].low && slice[i].low < slice[i + 1].low) {
      previousLows.push(slice[i].low);
    }
  }

  return previousLows.sort((a, b) => a - b); // 从低到高排序
}

// 提取买点特征
function extractBuyPointFeatures(stockData, targetDate) {
  const klineData = stockData.dailyLines;

  // 找到目标日期索引
  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === targetDate;
  });

  if (targetIndex === -1) {
    console.log(`❌ 未找到日期 ${targetDate}`);
    return null;
  }

  const currentPrice = klineData[targetIndex].close;
  const historicalData = klineData.slice(0, targetIndex + 1);

  // 计算各种指标
  const ma5 = calculateMA(
    historicalData.map((k) => k.close),
    5
  );
  const ma10 = calculateMA(
    historicalData.map((k) => k.close),
    10
  );
  const ma20 = calculateMA(
    historicalData.map((k) => k.close),
    20
  );
  const ma60 = calculateMA(
    historicalData.map((k) => k.close),
    60
  );
  const atr = calculateATR(historicalData, 14);
  const bollingerWidth = calculateBollingerWidth(historicalData, 20, 2);

  // 价格变化率
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

  // 近期高低点
  const { recentHigh, recentLow } = findRecentHighLow(klineData, targetIndex, 60);
  const distanceFromHigh = recentHigh > 0 ? ((currentPrice - recentHigh) / recentHigh) * 100 : null;
  const distanceFromLow = recentLow > 0 ? ((currentPrice - recentLow) / recentLow) * 100 : null;

  // 成交量分析
  const currentVolume = klineData[targetIndex].volume;
  const avgVolume_5d =
    targetIndex >= 5
      ? historicalData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5
      : null;
  const volumeRatio_5d = avgVolume_5d > 0 ? currentVolume / avgVolume_5d : null;

  // 成交量趋势（比较当日与前5日均量）
  let volumeTrend = 'unknown';
  if (volumeRatio_5d !== null) {
    if (volumeRatio_5d < 0.8) volumeTrend = 'shrinking';
    else if (volumeRatio_5d > 1.2) volumeTrend = 'expanding';
    else volumeTrend = 'stable';
  }

  // K线形态分析
  const open = klineData[targetIndex].open;
  const close = klineData[targetIndex].close;
  const high = klineData[targetIndex].high;
  const low = klineData[targetIndex].low;

  const bodySize = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;
  const totalRange = high - low;

  const hasLongLowerShadow = totalRange > 0 && lowerShadow / totalRange > 0.5;
  const shadowToBodyRatio = bodySize > 0 ? lowerShadow / bodySize : null;
  const isDoji = totalRange > 0 && bodySize / totalRange < 0.1;

  // 位置特征
  const previousLows = findPreviousLows(klineData, targetIndex, 60);
  const nearPreviousLow =
    previousLows.length > 0
      ? Math.abs(currentPrice - previousLows[0]) / previousLows[0] < 0.03
      : false;

  // 是否接近整数关口
  const roundNumbers = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  const nearRoundNumber = roundNumbers.some((n) => Math.abs(currentPrice - n) / n < 0.02);

  // 均线排列
  const lastIdx = historicalData.length - 1;
  const maAlignment = {
    ma5: ma5[lastIdx],
    ma10: ma10[lastIdx],
    ma20: ma20[lastIdx],
    ma60: ma60[lastIdx],
  };

  // 价格在均线系统中的位置
  const priceVsMA5 = ma5[lastIdx] ? ((currentPrice - ma5[lastIdx]) / ma5[lastIdx]) * 100 : null;
  const priceVsMA10 = ma10[lastIdx] ? ((currentPrice - ma10[lastIdx]) / ma10[lastIdx]) * 100 : null;
  const priceVsMA20 = ma20[lastIdx] ? ((currentPrice - ma20[lastIdx]) / ma20[lastIdx]) * 100 : null;

  // ATR和波动率
  const atrValue = atr[lastIdx];
  const atrPercent = atrValue ? (atrValue / currentPrice) * 100 : null;
  const bollWidth = bollingerWidth[lastIdx];

  // 次日表现
  const nextDayReturn =
    targetIndex < klineData.length - 1
      ? ((klineData[targetIndex + 1].close - currentPrice) / currentPrice) * 100
      : null;

  return {
    stockCode: stockData.code,
    stockName: stockData.name,
    date: targetDate,
    index: targetIndex,
    price: currentPrice,

    // 价格变化
    priceChange_3d,
    priceChange_5d,
    priceChange_10d,
    distanceFromHigh,
    distanceFromLow,

    // 成交量
    volume: currentVolume,
    volumeRatio_5d,
    volumeTrend,

    // K线形态
    hasLongLowerShadow,
    shadowToBodyRatio,
    isDoji,
    bodySize,
    lowerShadow,
    upperShadow,

    // 位置特征
    nearPreviousLow,
    nearRoundNumber,
    previousLowPrice: previousLows.length > 0 ? previousLows[0] : null,

    // 均线系统
    ...maAlignment,
    priceVsMA5,
    priceVsMA10,
    priceVsMA20,

    // 波动率
    atr: atrValue,
    atrPercent,
    bollingerWidth: bollWidth,

    // 标签
    nextDayReturn,
  };
}

// 收集所有买点的特征
const allFeatures = [];

stockFiles.forEach((stockFile) => {
  console.log(`\n处理: ${stockFile.file}`);
  const stockData = loadStockData(stockFile.file);

  stockFile.dates.forEach((date) => {
    const features = extractBuyPointFeatures(stockData, date);
    if (features) {
      allFeatures.push(features);
      console.log(`  ✅ ${date}: 次日涨幅 ${features.nextDayReturn?.toFixed(2)}%`);
    }
  });
});

console.log('\n\n' + '='.repeat(80));
console.log('=== 买点特征汇总表格 ===');
console.log('='.repeat(80) + '\n');

// 打印表头
console.log(
  '股票名称 | 日期       | 价格  | 3日跌幅 | 5日跌幅 | 10日跌幅 | 距高点 | 量比  | 长下影 | MA20偏离 | 次日涨幅'
);
console.log('-'.repeat(120));

allFeatures.forEach((f) => {
  const name = f.stockName.padEnd(8, ' ');
  const date = f.date;
  const price = f.price.toFixed(2).padStart(6);
  const pc3 = f.priceChange_3d !== null ? f.priceChange_3d.toFixed(1).padStart(7) + '%' : '   N/A';
  const pc5 = f.priceChange_5d !== null ? f.priceChange_5d.toFixed(1).padStart(7) + '%' : '   N/A';
  const pc10 =
    f.priceChange_10d !== null ? f.priceChange_10d.toFixed(1).padStart(8) + '%' : '    N/A';
  const distHigh =
    f.distanceFromHigh !== null ? f.distanceFromHigh.toFixed(1).padStart(6) + '%' : '  N/A';
  const volRatio = f.volumeRatio_5d !== null ? f.volumeRatio_5d.toFixed(2).padStart(5) : ' N/A';
  const longShadow = f.hasLongLowerShadow ? '  ✅' : '  ❌';
  const ma20Dev = f.priceVsMA20 !== null ? f.priceVsMA20.toFixed(1).padStart(7) + '%' : '    N/A';
  const nextRet =
    f.nextDayReturn !== null
      ? (f.nextDayReturn > 0 ? '+' : '') + f.nextDayReturn.toFixed(2).padStart(6) + '%'
      : '   N/A';

  console.log(
    `${name} | ${date} | ${price} | ${pc3} | ${pc5} | ${pc10} | ${distHigh} | ${volRatio} | ${longShadow} | ${ma20Dev} | ${nextRet}`
  );
});

console.log('\n\n' + '='.repeat(80));
console.log('=== 统计分析 ===');
console.log('='.repeat(80) + '\n');

// 统计各项特征的分布
const stats = {
  priceChange_3d: allFeatures.filter((f) => f.priceChange_3d !== null).map((f) => f.priceChange_3d),
  priceChange_5d: allFeatures.filter((f) => f.priceChange_5d !== null).map((f) => f.priceChange_5d),
  priceChange_10d: allFeatures
    .filter((f) => f.priceChange_10d !== null)
    .map((f) => f.priceChange_10d),
  distanceFromHigh: allFeatures
    .filter((f) => f.distanceFromHigh !== null)
    .map((f) => f.distanceFromHigh),
  volumeRatio_5d: allFeatures.filter((f) => f.volumeRatio_5d !== null).map((f) => f.volumeRatio_5d),
  priceVsMA20: allFeatures.filter((f) => f.priceVsMA20 !== null).map((f) => f.priceVsMA20),
  nextDayReturn: allFeatures.filter((f) => f.nextDayReturn !== null).map((f) => f.nextDayReturn),
};

// 计算平均值
function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

console.log('【价格变化特征】');
console.log(`  3日跌幅均值: ${average(stats.priceChange_3d).toFixed(2)}%`);
console.log(`  5日跌幅均值: ${average(stats.priceChange_5d).toFixed(2)}%`);
console.log(`  10日跌幅均值: ${average(stats.priceChange_10d).toFixed(2)}%`);
console.log(`  距高点跌幅均值: ${average(stats.distanceFromHigh).toFixed(2)}%`);

console.log('\n【成交量特征】');
console.log(`  量比均值: ${average(stats.volumeRatio_5d).toFixed(2)}`);
const shrinkingCount = allFeatures.filter((f) => f.volumeTrend === 'shrinking').length;
const expandingCount = allFeatures.filter((f) => f.volumeTrend === 'expanding').length;
const stableCount = allFeatures.filter((f) => f.volumeTrend === 'stable').length;
console.log(`  成交量萎缩: ${shrinkingCount}个, 放大: ${expandingCount}个, 平稳: ${stableCount}个`);

console.log('\n【K线形态特征】');
const longShadowCount = allFeatures.filter((f) => f.hasLongLowerShadow).length;
const dojiCount = allFeatures.filter((f) => f.isDoji).length;
console.log(
  `  长下影线: ${longShadowCount}个 (${((longShadowCount / allFeatures.length) * 100).toFixed(0)}%)`
);
console.log(`  十字星: ${dojiCount}个 (${((dojiCount / allFeatures.length) * 100).toFixed(0)}%)`);

console.log('\n【位置特征】');
const nearPrevLowCount = allFeatures.filter((f) => f.nearPreviousLow).length;
const nearRoundCount = allFeatures.filter((f) => f.nearRoundNumber).length;
console.log(
  `  接近前期低点: ${nearPrevLowCount}个 (${((nearPrevLowCount / allFeatures.length) * 100).toFixed(
    0
  )}%)`
);
console.log(
  `  接近整数关口: ${nearRoundCount}个 (${((nearRoundCount / allFeatures.length) * 100).toFixed(
    0
  )}%)`
);

console.log('\n【均线系统】');
console.log(`  相对MA20偏离均值: ${average(stats.priceVsMA20).toFixed(2)}%`);
const belowMA20 = allFeatures.filter((f) => f.priceVsMA20 !== null && f.priceVsMA20 < 0).length;
console.log(
  `  在MA20下方: ${belowMA20}个 (${((belowMA20 / allFeatures.length) * 100).toFixed(0)}%)`
);

console.log('\n【次日表现】');
console.log(`  平均次日涨幅: ${average(stats.nextDayReturn).toFixed(2)}%`);
const positiveCount = allFeatures.filter((f) => f.nextDayReturn > 0).length;
console.log(
  `  正收益: ${positiveCount}个 (${((positiveCount / allFeatures.length) * 100).toFixed(0)}%)`
);

console.log('\n\n' + '='.repeat(80));
console.log('=== 潜在筛选规则假设 ===');
console.log('='.repeat(80) + '\n');

// 基于统计分析提出候选规则
console.log('根据以上分析,可能的筛选规则包括:\n');

// 规则1: 短期跌幅
const avgDrop5d = average(stats.priceChange_5d);
console.log(`规则1: 短期超跌`);
console.log(`  条件: 5日累计跌幅 > ${Math.abs(avgDrop5d).toFixed(1)}%`);
console.log(`  依据: 14个买点平均5日跌幅为${avgDrop5d.toFixed(2)}%\n`);

// 规则2: 距高点回调
const avgDistHigh = average(stats.distanceFromHigh);
console.log(`规则2: 深度回调`);
console.log(`  条件: 距60日高点跌幅 > ${Math.abs(avgDistHigh).toFixed(1)}%`);
console.log(`  依据: 14个买点平均距高点跌幅为${avgDistHigh.toFixed(2)}%\n`);

// 规则3: 成交量萎缩
console.log(`规则3: 成交量萎缩`);
console.log(`  条件: 当日成交量 < 5日均量的 ${(average(stats.volumeRatio_5d) * 100).toFixed(0)}%`);
console.log(`  依据: ${shrinkingCount}个买点出现成交量萎缩\n`);

// 规则4: K线形态
if (longShadowCount > 0) {
  console.log(`规则4: 长下影线形态`);
  console.log(`  条件: 下影线长度 > K线总长度的50%`);
  console.log(
    `  依据: ${longShadowCount}个买点(${((longShadowCount / allFeatures.length) * 100).toFixed(
      0
    )}%)出现长下影线\n`
  );
}

// 规则5: 均线偏离
const avgMA20Dev = average(stats.priceVsMA20);
console.log(`规则5: 均线偏离`);
console.log(`  条件: 价格低于MA20超过 ${Math.abs(avgMA20Dev).toFixed(1)}%`);
console.log(`  依据: 14个买点平均低于MA20 ${Math.abs(avgMA20Dev).toFixed(2)}%\n`);

console.log('建议: 组合使用多个规则,例如满足其中2-3个条件即视为潜在买点');

console.log('\n' + '='.repeat(80));
console.log('=== 分析完成 ===');
console.log('='.repeat(80));
