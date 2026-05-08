/**
 * 分析v4.0模型决策树的关键判断条件
 *
 * 版本: v1.0
 * 创建时间: 2026-05-08
 *
 * 功能：
 * 1. 解析决策树结构
 * 2. 提取所有判断条件
 * 3. 统计特征重要性
 * 4. 找出导致未覆盖买点的主要规则
 */

const fs = require('fs');
const path = require('path');

// 读取模型文件
const MODEL_FILE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'utils',
  'analysis',
  'buypoint_model_v4.json'
);
const OUTPUT_FILE = path.join(__dirname, '..', '买点验证报告', 'MODEL_DECISION_TREE_ANALYSIS.json');

// 特征名称映射
const FEATURE_NAMES = [
  'distFromHigh', // 0: 距60日高点%
  'change5d', // 1: 5日变化%
  'change10d', // 2: 10日变化%
  'volumeRatio', // 3: 量比
  'ma5Deviation', // 4: MA5偏离%
  'ma20Deviation', // 5: MA20偏离%
  'bbWidth', // 6: 布林带宽度
  'atrPercent', // 7: ATR%
];

/**
 * 遍历决策树，提取所有判断路径
 */
function extractDecisionPaths(node, path = [], paths = []) {
  if (!node) return paths;

  // 如果是叶子节点（有prediction）
  if (node.prediction !== undefined) {
    paths.push({
      prediction: node.prediction,
      probability: node.probability,
      samples: node.samples,
      conditions: [...path],
    });
    return paths;
  }

  // 内部节点，继续遍历
  const featureName = node.featureName || FEATURE_NAMES[node.featureIndex];
  const threshold = node.threshold;

  // 左分支（<= threshold）
  if (node.left) {
    extractDecisionPaths(node.left, [...path, `${featureName} <= ${threshold.toFixed(4)}`], paths);
  }

  // 右分支（> threshold）
  if (node.right) {
    extractDecisionPaths(node.right, [...path, `${featureName} > ${threshold.toFixed(4)}`], paths);
  }

  return paths;
}

/**
 * 统计特征使用频率
 */
function countFeatureUsage(node, featureCount = {}) {
  if (!node || node.prediction !== undefined) return featureCount;

  const featureName = node.featureName || FEATURE_NAMES[node.featureIndex];
  featureCount[featureName] = (featureCount[featureName] || 0) + 1;

  if (node.left) countFeatureUsage(node.left, featureCount);
  if (node.right) countFeatureUsage(node.right, featureCount);

  return featureCount;
}

/**
 * 分析导致预测为0（非买点）的主要路径
 */
function analyzeRejectionPaths(paths) {
  const rejectionPaths = paths.filter((p) => p.prediction === 0 && p.samples > 5);

  // 按样本数排序
  rejectionPaths.sort((a, b) => b.samples - a.samples);

  // 统计最常见的拒绝条件
  const conditionStats = {};

  rejectionPaths.forEach((path) => {
    path.conditions.forEach((condition) => {
      if (!conditionStats[condition]) {
        conditionStats[condition] = {
          condition: condition,
          count: 0,
          totalSamples: 0,
        };
      }
      conditionStats[condition].count++;
      conditionStats[condition].totalSamples += path.samples;
    });
  });

  return {
    topRejectionPaths: rejectionPaths.slice(0, 10),
    commonConditions: Object.values(conditionStats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
  };
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始分析v4.0模型决策树...\n');

  // 读取模型文件
  let modelData;
  try {
    modelData = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf-8'));
    console.log(`✅ 成功加载模型文件`);
    console.log(`   配置ID: ${modelData.config.configId}`);
    console.log(`   训练样本: ${modelData.trainingSamples.total}个`);
    console.log(`   准确率: ${(modelData.performance.accuracy * 100).toFixed(2)}%`);
    console.log(`   召回率: ${(modelData.performance.recall * 100).toFixed(2)}%\n`);
  } catch (error) {
    console.error(`❌ 读取模型文件失败: ${error.message}`);
    process.exit(1);
  }

  const tree = modelData.tree;

  // 1. 提取所有决策路径
  console.log('📊 提取决策路径...');
  const allPaths = extractDecisionPaths(tree);
  console.log(`   总路径数: ${allPaths.length}`);

  const buyPaths = allPaths.filter((p) => p.prediction === 1);
  const nonBuyPaths = allPaths.filter((p) => p.prediction === 0);
  console.log(`   买点路径: ${buyPaths.length}条`);
  console.log(`   非买点路径: ${nonBuyPaths.length}条\n`);

  // 2. 统计特征使用频率
  console.log('📊 统计特征重要性...');
  const featureCount = countFeatureUsage(tree);
  const sortedFeatures = Object.entries(featureCount).sort((a, b) => b[1] - a[1]);

  console.log('   特征使用次数排名:');
  sortedFeatures.forEach(([name, count], index) => {
    const percentage = (
      (count / Object.values(featureCount).reduce((a, b) => a + b, 0)) *
      100
    ).toFixed(1);
    console.log(`   ${index + 1}. ${name}: ${count}次 (${percentage}%)`);
  });
  console.log();

  // 3. 分析导致拒绝的主要路径
  console.log('📊 分析拒绝路径（预测为非买点）...');
  const rejectionAnalysis = analyzeRejectionPaths(allPaths);

  console.log('\n【Top 10 拒绝路径】（按样本数排序）');
  rejectionAnalysis.topRejectionPaths.forEach((path, index) => {
    console.log(`\n${index + 1}. 样本数: ${path.samples}`);
    console.log('   条件:');
    path.conditions.forEach((cond) => {
      console.log(`     - ${cond}`);
    });
  });

  console.log('\n【最常见的拒绝条件】');
  rejectionAnalysis.commonConditions.forEach((cond, index) => {
    console.log(`${index + 1}. ${cond.condition}`);
    console.log(`   出现次数: ${cond.count}次, 影响样本: ${cond.totalSamples}个`);
  });

  // 4. 检查关键阈值
  console.log('\n📊 关键阈值分析...');

  // 查找volumeRatio相关的条件
  const volumeConditions = allPaths
    .flatMap((p) => p.conditions)
    .filter((c) => c.includes('volumeRatio'))
    .filter((v, i, arr) => arr.indexOf(v) === i); // 去重

  console.log('\n   成交量相关条件:');
  volumeConditions.forEach((cond) => {
    console.log(`     - ${cond}`);
  });

  // 查找涨跌幅相关条件
  const changeConditions = allPaths
    .flatMap((p) => p.conditions)
    .filter((c) => c.includes('change'))
    .filter((v, i, arr) => arr.indexOf(v) === i);

  console.log('\n   涨跌幅相关条件:');
  changeConditions.forEach((cond) => {
    console.log(`     - ${cond}`);
  });

  // 保存分析结果
  const analysisResult = {
    modelInfo: {
      configId: modelData.config.configId,
      trainingSamples: modelData.trainingSamples,
      performance: modelData.performance,
    },
    decisionPaths: {
      total: allPaths.length,
      buyPaths: buyPaths.length,
      nonBuyPaths: nonBuyPaths.length,
    },
    featureImportance: sortedFeatures.map(([name, count]) => ({
      feature: name,
      usageCount: count,
    })),
    rejectionAnalysis: {
      topPaths: rejectionAnalysis.topRejectionPaths,
      commonConditions: rejectionAnalysis.commonConditions,
    },
    keyThresholds: {
      volumeConditions: volumeConditions,
      changeConditions: changeConditions,
    },
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysisResult, null, 2), 'utf-8');
  console.log(`\n💾 分析结果已保存到: ${OUTPUT_FILE}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ 决策树分析完成！');
  console.log('='.repeat(80));

  // 输出优化建议
  console.log('\n💡 优化建议:');
  console.log('1. 检查volumeRatio的阈值是否过高（当前可能要求 >= 1.0）');
  console.log('2. 检查change5d/change10d的阈值是否过于严格');
  console.log('3. 考虑放宽ma5Deviation和ma20Deviation的条件');
  console.log('4. 对于高频拒绝条件，评估是否可以调整阈值');
}

main();
