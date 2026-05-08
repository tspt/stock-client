const fs = require('fs');
const path = require('path');

// 读取验证报告
const reportPath = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.v4.0.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

console.log('=== v4.0 模型验证结果 ===\n');
console.log(`总买点数: ${report.totalManualPoints}`);
console.log(`已覆盖: ${report.coveredPoints}`);
console.log(`未覆盖: ${report.missedPoints}`);
console.log(`覆盖率: ${(report.coveredPoints / report.totalManualPoints * 100).toFixed(2)}%\n`);

// 提取未覆盖的买点
const missedBuyPoints = [];
report.stocks.forEach(stock => {
  if (stock.missedCount > 0 && stock.missedDates) {
    stock.missedDates.forEach(date => {
      missedBuyPoints.push({
        stockName: stock.name,
        stockCode: stock.code,
        date: date,
      });
    });
  }
});

console.log(`\n=== 未覆盖买点列表 (${missedBuyPoints.length}个) ===\n`);
missedBuyPoints.forEach((bp, index) => {
  console.log(`${index + 1}. ${bp.stockName} (${bp.stockCode}) - ${bp.date}`);
});

// 按股票统计
const stockStats = {};
report.stocks.forEach(stock => {
  if (stock.missedCount > 0) {
    stockStats[stock.name] = {
      code: stock.code,
      manualCount: stock.manualCount,
      missedCount: stock.missedCount,
      coverage: ((stock.manualCount - stock.missedCount) / stock.manualCount * 100).toFixed(1),
    };
  }
});

console.log(`\n\n=== 有未覆盖买点的股票 (${Object.keys(stockStats).length}只) ===\n`);
Object.entries(stockStats).forEach(([name, stats]) => {
  console.log(`${name} (${stats.code}):`);
  console.log(`  手动买点: ${stats.manualCount}个, 未覆盖: ${stats.missedCount}个, 覆盖率: ${stats.coverage}%`);
});

// 保存详细分析结果
const analysisResult = {
  summary: {
    totalPoints: report.totalManualPoints,
    coveredPoints: report.coveredPoints,
    missedPoints: report.missedPoints,
    coverageRate: (report.coveredPoints / report.totalManualPoints * 100).toFixed(2) + '%',
  },
  missedBuyPoints: missedBuyPoints,
  stockStats: stockStats,
};

const outputPath = path.join(__dirname, 'MISSED_BUYPOINTS_V4_ANALYSIS.json');
fs.writeFileSync(outputPath, JSON.stringify(analysisResult, null, 2), 'utf-8');
console.log(`\n\n✅ 详细分析已保存到: ${outputPath}`);
