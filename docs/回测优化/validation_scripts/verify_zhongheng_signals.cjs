/**
 * 中衡设计技术指标验证脚本
 * 用于验证三个关键买入点的技术指标表现
 */

const fs = require('fs');
const path = require('path');

// 读取中衡设计K线数据
const dataFile = path.join(__dirname, '中衡设计.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

// 提取纯JSON部分（找到第一个完整的JSON对象）
// 查找 "updatedAt" 后面的闭合括号
const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
if (!updatedAtMatch) {
  console.error('无法找到JSON结束标记');
  process.exit(1);
}

const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
// 找到 updatedAt 值后面的第一个 }
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);

let rawData;
try {
  rawData = JSON.parse(validJson);
} catch (e) {
  console.error('JSON解析失败:', e.message);
  console.log('尝试截取更多字符...');
  // 尝试包含更多字符
  const extendedJson = content.substring(0, closingBraceIndex + 100);
  const extendedEnd = extendedJson.lastIndexOf('}');
  rawData = JSON.parse(extendedJson.substring(0, extendedEnd + 1));
}

const klineData = rawData.dailyLines;

console.log('=== 中衡设计技术指标验证 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);
console.log(
  `数据范围: ${new Date(klineData[0].time).toLocaleDateString()} ~ ${new Date(
    klineData[klineData.length - 1].time
  ).toLocaleDateString()}\n`
);

// 需要验证的三个日期（使用字符串匹配）
const targetDates = [
  { date: '2026-04-17', label: '日期1' },
  { date: '2026-01-07', label: '日期2' },
  { date: '2025-11-24', label: '日期3' },
];

// 查找每个日期的索引（通过日期字符串匹配）
targetDates.forEach((target) => {
  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === target.date;
  });

  if (targetIndex === -1) {
    console.log(`❌ ${target.label} (${target.date}): 未找到该日期的数据\n`);
    return;
  }

  console.log(`✅ ${target.label} (${target.date})`);
  console.log(`   索引: ${targetIndex}`);
  console.log(`   时间戳: ${klineData[targetIndex].time}`);
  console.log(`   数据:`, {
    开盘: klineData[targetIndex].open,
    收盘: klineData[targetIndex].close,
    最高: klineData[targetIndex].high,
    最低: klineData[targetIndex].low,
    成交量: klineData[targetIndex].volume,
  });

  // 截取到目标日期的数据
  const sliceData = klineData.slice(0, targetIndex + 1);

  // 简单分析前后几天的价格走势
  const prevDay = targetIndex > 0 ? klineData[targetIndex - 1] : null;
  const nextDay = targetIndex < klineData.length - 1 ? klineData[targetIndex + 1] : null;

  if (prevDay) {
    const changeFromPrev = (
      ((klineData[targetIndex].close - prevDay.close) / prevDay.close) *
      100
    ).toFixed(2);
    console.log(`   较前一日涨跌: ${changeFromPrev}%`);
  }

  if (nextDay) {
    const changeToNext = (
      ((nextDay.close - klineData[targetIndex].close) / klineData[targetIndex].close) *
      100
    ).toFixed(2);
    console.log(`   较后一日涨跌: ${changeToNext}%`);
  }

  console.log();
});

console.log('\n=== 验证完成 ===');
console.log('\n提示: 如果需要详细的技术指标分析（RSI、MACD、布林带等），请告诉我');
