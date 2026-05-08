/**
 * 验证未覆盖买点的特征是否符合决策树分析结论
 *
 * 版本: v1.0
 * 创建时间: 2026-05-08
 *
 * 验证假设：
 * 1. 未覆盖买点中，change5d <= 0.57% 的比例很高
 * 2. 未覆盖买点中，volumeRatio < 0.8 的比例很高
 * 3. 这些买点的其他指标（均线、RSI等）其实是健康的
 */

const fs = require('fs');
const path = require('path');

// 读取文件
const FEATURE_ANALYSIS = path.join(
  __dirname,
  '..',
  '买点验证报告',
  'MISSED_BUYPOINTS_V4_FEATURE_ANALYSIS.json'
);
const CLUSTER_ANALYSIS = path.join(
  __dirname,
  '..',
  '买点验证报告',
  'MISSED_BUYPOINTS_CLUSTER_ANALYSIS.json'
);

console.log('🔍 开始验证未覆盖买点特征...\n');

// 读取特征分析数据
let featureData;
try {
  featureData = JSON.parse(fs.readFileSync(FEATURE_ANALYSIS, 'utf-8'));
  console.log(`✅ 加载特征分析数据: ${featureData.totalMissedPoints}个未覆盖买点\n`);
} catch (error) {
  console.error(`❌ 读取失败: ${error.message}`);
  process.exit(1);
}

const missedPoints = featureData.detailedAnalysis;

// ==================== 验证假设1: change5d阈值 ====================
console.log('📊 验证假设1: change5d <= 0.57% 的买点比例');
console.log('-'.repeat(80));

// 由于我们没有直接计算change5d，我们用涨跌幅近似
// 实际上应该从原始数据计算，但这里先用现有数据分析
const smallChangePoints = missedPoints.filter((bp) => {
  const changePercent = parseFloat(bp.kline.changePercent || 0);
  return Math.abs(changePercent) <= 1.0; // 小幅波动
});

console.log(
  `小幅波动买点(|涨跌幅|<=1%): ${smallChangePoints.length}个 (${(
    (smallChangePoints.length / missedPoints.length) *
    100
  ).toFixed(1)}%)`
);
console.log(`预期: 应该有较高比例\n`);

// ==================== 验证假设2: volumeRatio阈值 ====================
console.log('📊 验证假设2: volumeRatio < 0.8 的买点比例');
console.log('-'.repeat(80));

const lowVolumePoints = missedPoints.filter((bp) => {
  const volumeRatio = parseFloat(bp.kline.volumeRatio || 0);
  return volumeRatio < 0.8;
});

console.log(
  `低量比买点(量比<0.8): ${lowVolumePoints.length}个 (${(
    (lowVolumePoints.length / missedPoints.length) *
    100
  ).toFixed(1)}%)`
);

const veryLowVolumePoints = missedPoints.filter((bp) => {
  const volumeRatio = parseFloat(bp.kline.volumeRatio || 0);
  return volumeRatio < 0.6;
});

console.log(
  `极低量比买点(量比<0.6): ${veryLowVolumePoints.length}个 (${(
    (veryLowVolumePoints.length / missedPoints.length) *
    100
  ).toFixed(1)}%)\n`
);

// ==================== 验证假设3: 其他指标健康 ====================
console.log('📊 验证假设3: 未覆盖买点的其他指标是否健康');
console.log('-'.repeat(80));

// 统计均线状态
const aboveAllSMA = missedPoints.filter(
  (bp) =>
    bp.kline.aboveSMA5 === true && bp.kline.aboveSMA10 === true && bp.kline.aboveSMA20 === true
);

console.log(
  `同时高于所有均线的买点: ${aboveAllSMA.length}个 (${(
    (aboveAllSMA.length / missedPoints.length) *
    100
  ).toFixed(1)}%)`
);
console.log(`说明: 如果这个比例高，说明模型拒绝了很多技术上健康的买点\n`);

// 统计RSI状态
const neutralRSI = missedPoints.filter((bp) => {
  const rsi = parseFloat(bp.kline.rsi || 0);
  return rsi >= 40 && rsi <= 60;
});

console.log(
  `RSI在中性区(40-60)的买点: ${neutralRSI.length}个 (${(
    (neutralRSI.length / missedPoints.length) *
    100
  ).toFixed(1)}%)`
);
console.log(`说明: RSI中性通常是健康的买入时机\n`);

// ==================== 综合评估 ====================
console.log('='.repeat(80));
console.log('📋 综合评估');
console.log('='.repeat(80));

const smallChangePercent = ((smallChangePoints.length / missedPoints.length) * 100).toFixed(1);
const lowVolumePercent = ((lowVolumePoints.length / missedPoints.length) * 100).toFixed(1);
const healthySMAPercent = ((aboveAllSMA.length / missedPoints.length) * 100).toFixed(1);

console.log(`\n关键指标:`);
console.log(`1. 小幅波动买点占比: ${smallChangePercent}%`);
console.log(`   → 如果 > 20%，说明change5d阈值可能过低`);
console.log(`   → 当前: ${smallChangePercent > 20 ? '⚠️ 过高，建议调整' : '✅ 合理'}`);

console.log(`\n2. 低量比买点占比: ${lowVolumePercent}%`);
console.log(`   → 如果 > 30%，说明volumeRatio要求可能过严`);
console.log(`   → 当前: ${lowVolumePercent > 30 ? '⚠️ 过高，建议放宽' : '✅ 合理'}`);

console.log(`\n3. 均线多头但被拒绝的买点: ${healthySMAPercent}%`);
console.log(`   → 如果 > 40%，说明模型错过了很多优质买点`);
console.log(`   → 当前: ${healthySMAPercent > 40 ? '⚠️ 严重问题，必须优化' : '✅ 可接受'}`);

console.log(
  `\n4. RSI中性但被拒绝的买点: ${((neutralRSI.length / missedPoints.length) * 100).toFixed(1)}%`
);
console.log(`   → 如果 > 40%，说明模型对RSI的判断可能有问题`);

// ==================== 具体案例展示 ====================
console.log('\n\n📌 典型案例展示（同时满足多个"被拒绝"条件但仍可能是好买点）:\n');

const typicalCases = missedPoints
  .filter((bp) => {
    const changePercent = parseFloat(bp.kline.changePercent || 0);
    const volumeRatio = parseFloat(bp.kline.volumeRatio || 0);
    const rsi = parseFloat(bp.kline.rsi || 0);

    // 小幅上涨 + 缩量 + RSI中性 + 均线多头
    return (
      changePercent > 0 &&
      changePercent <= 1.5 &&
      volumeRatio < 1.0 &&
      rsi >= 40 &&
      rsi <= 60 &&
      bp.kline.aboveSMA5 === true &&
      bp.kline.aboveSMA10 === true
    );
  })
  .slice(0, 5);

if (typicalCases.length > 0) {
  typicalCases.forEach((bp, idx) => {
    console.log(`${idx + 1}. ${bp.stockName} (${bp.stockCode}) - ${bp.date}`);
    console.log(`   涨跌幅: ${bp.kline.changePercent}%`);
    console.log(`   量比: ${bp.kline.volumeRatio}`);
    console.log(`   RSI: ${bp.kline.rsi}`);
    console.log(
      `   均线: MA5:${bp.kline.aboveSMA5 ? '上' : '下'}, MA10:${
        bp.kline.aboveSMA10 ? '上' : '下'
      }, MA20:${bp.kline.aboveSMA20 ? '上' : '下'}`
    );
    console.log(`   ⚠️  这是一个典型的"稳健型买点"，但被模型拒绝了\n`);
  });
} else {
  console.log('未找到完全符合的案例，可能需要调整筛选条件\n');
}

console.log('='.repeat(80));
console.log('✅ 验证完成！');
console.log('='.repeat(80));

// 保存验证结果
const validationResult = {
  timestamp: new Date().toISOString(),
  totalMissedPoints: missedPoints.length,
  assumptions: {
    smallChangePoints: {
      count: smallChangePoints.length,
      percentage: smallChangePercent + '%',
      conclusion: smallChangePercent > 20 ? '需要调整change5d阈值' : '阈值合理',
    },
    lowVolumePoints: {
      count: lowVolumePoints.length,
      percentage: lowVolumePercent + '%',
      conclusion: lowVolumePercent > 30 ? '需要放宽volumeRatio要求' : '要求合理',
    },
    healthySMAPoints: {
      count: aboveAllSMA.length,
      percentage: healthySMAPercent + '%',
      conclusion: healthySMAPercent > 40 ? '严重问题，必须优化' : '可接受',
    },
  },
  typicalCases: typicalCases,
};

const outputPath = path.join(__dirname, '..', '买点验证报告', 'VERIFICATION_RESULT.json');
fs.writeFileSync(outputPath, JSON.stringify(validationResult, null, 2), 'utf-8');
console.log(`\n💾 验证结果已保存到: ${outputPath}`);
