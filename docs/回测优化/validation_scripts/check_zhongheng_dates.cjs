const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '中衡设计.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 中衡设计 - 关键月份日期检查 ===\n');

console.log('【2026年4月的所有日期】');
const apr2026 = klineData.filter((k) => {
  const d = new Date(k.time);
  return d.getFullYear() === 2026 && d.getMonth() === 3;
});
apr2026.forEach((k) => {
  const date = new Date(k.time);
  console.log(
    `  ${date.toLocaleDateString()} (周${
      ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
    }) 收盘: ${k.close}`
  );
});

console.log('\n【2026年1月的所有日期】');
const jan2026 = klineData.filter((k) => {
  const d = new Date(k.time);
  return d.getFullYear() === 2026 && d.getMonth() === 0;
});
jan2026.forEach((k) => {
  const date = new Date(k.time);
  console.log(
    `  ${date.toLocaleDateString()} (周${
      ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
    }) 收盘: ${k.close}`
  );
});

console.log('\n【2025年11月的所有日期】');
const nov2025 = klineData.filter((k) => {
  const d = new Date(k.time);
  return d.getFullYear() === 2025 && d.getMonth() === 10;
});
nov2025.forEach((k) => {
  const date = new Date(k.time);
  console.log(
    `  ${date.toLocaleDateString()} (周${
      ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
    }) 收盘: ${k.close}`
  );
});

console.log('\n=== 检查完成 ===');
