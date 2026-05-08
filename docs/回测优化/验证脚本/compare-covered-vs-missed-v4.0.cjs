const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');
const REPORT_PATH = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.v4.0.json');

// ==================== 工具函数 ====================

/**
 * 计算技术指标
 */
function calculateMA(data, period) {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((s, k) => s + k.close, 0);
  return sum / period;
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

/**
 * 提取某一日期的特征
 */
function extractFeaturesAtDate(klineData, targetDate) {
  // 将目标日期转换为时间戳进行比较
  const targetTime = new Date(targetDate).getTime();
  
  // 找到目标日期的索引（klineData使用time字段，是时间戳）
  const index = klineData.findIndex(k => {
    // 比较日期部分（忽略时分秒）
    const kDate = new Date(k.time);
    const tDate = new Date(targetTime);
    return kDate.getFullYear() === tDate.getFullYear() &&
           kDate.getMonth() === tDate.getMonth() &&
           kDate.getDate() === tDate.getDate();
  });
  
  if (index === -1 || index < 20) {
    console.warn(`   ⚠️  未找到日期 ${targetDate} 或数据不足 (index=${index})`);
    return null; // 数据不足或找不到日期
  }
  
  const slice = klineData.slice(0, index + 1);
  const current = klineData[index];
  const close = current.close;
  
  // 1. 距60日高点距离
  const lookback60 = Math.min(60, slice.length);
  const highest60 = Math.max(...slice.slice(-lookback60).map(k => k.high));
  const distFromHigh = ((close - highest60) / highest60) * 100;
  
  // 2. 价格变化
  const change5d = slice.length >= 5 
    ? ((close - slice[slice.length - 5].close) / slice[slice.length - 5].close) * 100
    : 0;
  const change10d = slice.length >= 10
    ? ((close - slice[slice.length - 10].close) / slice[slice.length - 10].close) * 100
    : 0;
  
  // 3. MA偏离度
  const ma5 = calculateMA(slice, 5);
  const ma20 = calculateMA(slice, 20);
  const ma5Deviation = ma5 ? ((close - ma5) / ma5) * 100 : 0;
  const ma20Deviation = ma20 ? ((close - ma20) / ma20) * 100 : 0;
  
  // 4. 成交量特征
  const volume = current.volume;
  const avgVol5 = slice.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
  const volumeRatio = avgVol5 > 0 ? volume / avgVol5 : 1;
  
  // 5. ATR百分比
  const atr = calculateATR(slice, 14);
  const atrPercent = atr ? (atr / close) * 100 : 0;
  
  return {
    distFromHigh,
    change5d,
    change10d,
    volumeRatio,
    ma5Deviation,
    ma20Deviation,
    atrPercent,
    close,
    volume,
  };
}

// ==================== 主逻辑 ====================

console.log('=== 开始分析未覆盖买点特征 ===\n');

// 读取验证报告
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));

// 分类买点
const coveredBuyPoints = [];
const missedBuyPoints = [];

report.stocks.forEach(stock => {
  const stockFile = path.join(STOCK_DATA_DIR, `${stock.name}.json`);
  
  if (!fs.existsSync(stockFile)) {
    console.warn(`⚠️  文件不存在: ${stockFile}`);
    return;
  }
  
  const stockData = JSON.parse(fs.readFileSync(stockFile, 'utf-8'));
  const klineData = stockData.data.dailyLines;
  
  // 处理已覆盖的买点（取前2个作为样本）
  if (stock.coveredCount > 0 && stock.coveredDates) {
    stock.coveredDates.slice(0, 2).forEach(date => {
      const features = extractFeaturesAtDate(klineData, date);
      if (features) {
        coveredBuyPoints.push({
          stockName: stock.name,
          stockCode: stock.code,
          date,
          ...features,
        });
      }
    });
  }
  
  // 处理未覆盖的买点
  if (stock.missedCount > 0 && stock.missedDates) {
    stock.missedDates.forEach(date => {
      const features = extractFeaturesAtDate(klineData, date);
      if (features) {
        missedBuyPoints.push({
          stockName: stock.name,
          stockCode: stock.code,
          date,
          ...features,
        });
      }
    });
  }
});

console.log(`✅ 已覆盖买点样本: ${coveredBuyPoints.length}个`);
console.log(`✅ 未覆盖买点样本: ${missedBuyPoints.length}个\n`);

// ==================== 统计分析 ====================

function calculateStats(points, fieldName) {
  const values = points.map(p => p[fieldName]).filter(v => v !== null && !isNaN(v));
  if (values.length === 0) return null;
  
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // 标准差
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  
  return { avg, min, max, std, count: values.length };
}

const features = ['distFromHigh', 'change5d', 'change10d', 'volumeRatio', 'ma5Deviation', 'ma20Deviation', 'atrPercent'];

console.log('=== 特征对比分析 ===\n');
console.log('特征名称         | 已覆盖(均值±标准差)     | 未覆盖(均值±标准差)     | 差异');
console.log('-'.repeat(80));

const comparisonResults = [];

features.forEach(feature => {
  const coveredStats = calculateStats(coveredBuyPoints, feature);
  const missedStats = calculateStats(missedBuyPoints, feature);
  
  if (coveredStats && missedStats) {
    const diff = missedStats.avg - coveredStats.avg;
    const diffPercent = coveredStats.avg !== 0 ? (diff / Math.abs(coveredStats.avg) * 100).toFixed(1) : 'N/A';
    
    console.log(`${feature.padEnd(16)} | ${coveredStats.avg.toFixed(2).padStart(6)} ± ${coveredStats.std.toFixed(2).padStart(5)} | ${missedStats.avg.toFixed(2).padStart(6)} ± ${missedStats.std.toFixed(2).padStart(5)} | ${diff > 0 ? '+' : ''}${diff.toFixed(2)} (${diffPercent}%)`);
    
    comparisonResults.push({
      feature,
      coveredAvg: coveredStats.avg,
      coveredStd: coveredStats.std,
      missedAvg: missedStats.avg,
      missedStd: missedStats.std,
      diff,
      diffPercent: parseFloat(diffPercent),
    });
  }
});

// ==================== 关键发现 ====================

console.log('\n\n=== 关键发现 ===\n');

// 找出差异最大的特征
const sortedByDiff = [...comparisonResults].sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));

console.log('差异最显著的Top 5特征:');
sortedByDiff.slice(0, 5).forEach((item, index) => {
  console.log(`${index + 1}. ${item.feature}: 差异 ${item.diffPercent}%`);
  console.log(`   已覆盖: ${item.coveredAvg.toFixed(2)} ± ${item.coveredStd.toFixed(2)}`);
  console.log(`   未覆盖: ${item.missedAvg.toFixed(2)} ± ${item.missedStd.toFixed(2)}`);
  console.log();
});

// ==================== 保存结果 ====================

const analysisResult = {
  summary: {
    coveredSamples: coveredBuyPoints.length,
    missedSamples: missedBuyPoints.length,
  },
  featureComparison: comparisonResults,
  topDifferences: sortedByDiff.slice(0, 5),
  coveredSampleDetails: coveredBuyPoints.slice(0, 10), // 保存部分样本供参考
  missedSampleDetails: missedBuyPoints,
};

const outputPath = path.join(__dirname, 'FEATURE_COMPARISON_V4_ANALYSIS.json');
fs.writeFileSync(outputPath, JSON.stringify(analysisResult, null, 2), 'utf-8');

console.log(`✅ 详细分析已保存到: ${outputPath}\n`);

// ==================== 优化建议 ====================

console.log('=== 基于分析的优化建议 ===\n');

sortedByDiff.slice(0, 3).forEach(item => {
  if (Math.abs(item.diffPercent) > 20) {
    console.log(`⚠️  ${item.feature} 差异显著 (${item.diffPercent}%)`);
    console.log(`   建议: 在模型中增加对此特征的权重或调整决策边界`);
    console.log();
  }
});

console.log('\n下一步行动:');
console.log('1. 根据特征差异调整模型参数');
console.log('2. 考虑添加新的技术指标特征');
console.log('3. 重新训练并验证模型');
