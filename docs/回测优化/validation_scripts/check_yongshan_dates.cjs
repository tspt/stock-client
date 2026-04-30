const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '永杉锂业.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 永杉锂业 - 关键日期检查 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);

// 需要验证的两个日期
const targetDates = [
  { date: '2026-04-07', label: '日期1 (2026-04-07)' },
  { date: '2025-10-28', label: '日期2 (2025-10-28)' },
];

targetDates.forEach((target) => {
  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === target.date;
  });

  if (targetIndex === -1) {
    console.log(`❌ ${target.label}: 未找到该日期的数据\n`);
    return;
  }

  console.log(`✅ ${target.label}`);
  console.log(`   索引: ${targetIndex}`);
  console.log(`   收盘价: ${klineData[targetIndex].close}`);

  // 检查次日表现
  if (targetIndex < klineData.length - 1) {
    const nextDay = klineData[targetIndex + 1];
    const nextDayReturn = (
      ((nextDay.close - klineData[targetIndex].close) / klineData[targetIndex].close) *
      100
    ).toFixed(2);
    console.log(
      `   次日表现: ${nextDayReturn}% (${klineData[targetIndex].close} → ${nextDay.close})`
    );
  }

  // 检查前后几天的价格
  console.log(`   前一日: ${targetIndex > 0 ? klineData[targetIndex - 1].close : 'N/A'}`);
  console.log(
    `   后两日: ${targetIndex < klineData.length - 2 ? klineData[targetIndex + 2].close : 'N/A'}`
  );
  console.log();
});

console.log('\n=== 检查完成 ===');
