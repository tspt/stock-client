const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'FEATURE_COMPARISON_V4_ANALYSIS.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

console.log('=== 未覆盖买点样本详情 (前10个) ===\n');

data.missedSampleDetails.slice(0, 10).forEach((bp, i) => {
  console.log(`${i + 1}. ${bp.stockName} (${bp.stockCode}) - ${bp.date}`);
  console.log(
    `   距高点: ${bp.distFromHigh.toFixed(2)}%, 5日变化: ${bp.change5d.toFixed(
      2
    )}%, 10日变化: ${bp.change10d.toFixed(2)}%`
  );
  console.log(
    `   MA5偏离: ${bp.ma5Deviation.toFixed(2)}%, MA20偏离: ${bp.ma20Deviation.toFixed(2)}%`
  );
  console.log(`   量比: ${bp.volumeRatio.toFixed(2)}, ATR%: ${bp.atrPercent.toFixed(2)}%`);
  console.log();
});

console.log('\n=== 已覆盖买点样本详情 (前10个) ===\n');

data.coveredSampleDetails.slice(0, 10).forEach((bp, i) => {
  console.log(`${i + 1}. ${bp.stockName} (${bp.stockCode}) - ${bp.date}`);
  console.log(
    `   距高点: ${bp.distFromHigh.toFixed(2)}%, 5日变化: ${bp.change5d.toFixed(
      2
    )}%, 10日变化: ${bp.change10d.toFixed(2)}%`
  );
  console.log(
    `   MA5偏离: ${bp.ma5Deviation.toFixed(2)}%, MA20偏离: ${bp.ma20Deviation.toFixed(2)}%`
  );
  console.log(`   量比: ${bp.volumeRatio.toFixed(2)}, ATR%: ${bp.atrPercent.toFixed(2)}%`);
  console.log();
});
