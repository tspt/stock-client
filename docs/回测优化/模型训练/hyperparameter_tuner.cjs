/**
 * 超参数调优模块
 *
 * 使用网格搜索找到最优的随机森林超参数组合
 */

const { crossValidate } = require('./cross_validator.cjs');
const RandomForest = require('./random_forest.cjs');

/**
 * 定义超参数搜索空间
 * @returns {Array} 超参数配置数组
 */
function getParameterGrid() {
  return [
    // 配置1: 较浅的树，适合噪声大的数据
    {
      nTrees: 50,
      maxDepth: 5,
      minSamplesLeaf: 10,
      maxFeatures: 0.5,
      id: 'Config_Shallow_1',
    },
    {
      nTrees: 100,
      maxDepth: 5,
      minSamplesLeaf: 10,
      maxFeatures: 0.5,
      id: 'Config_Shallow_2',
    },

    // 配置2: 中等深度，平衡性能
    {
      nTrees: 100,
      maxDepth: 8,
      minSamplesLeaf: 10,
      maxFeatures: 0.7,
      id: 'Config_Medium_1',
    },
    {
      nTrees: 150,
      maxDepth: 8,
      minSamplesLeaf: 10,
      maxFeatures: 0.7,
      id: 'Config_Medium_2',
    },
    {
      nTrees: 100,
      maxDepth: 10,
      minSamplesLeaf: 15,
      maxFeatures: 0.7,
      id: 'Config_Medium_3',
    },

    // 配置3: 较深的树，捕捉复杂模式
    {
      nTrees: 150,
      maxDepth: 12,
      minSamplesLeaf: 15,
      maxFeatures: 1.0,
      id: 'Config_Deep_1',
    },
    {
      nTrees: 200,
      maxDepth: 12,
      minSamplesLeaf: 20,
      maxFeatures: 1.0,
      id: 'Config_Deep_2',
    },
    {
      nTrees: 150,
      maxDepth: 15,
      minSamplesLeaf: 20,
      maxFeatures: 0.7,
      id: 'Config_Deep_3',
    },
  ];
}

/**
 * 执行网格搜索
 * @param {Array} samples - 样本数组
 * @param {number} nSplits - 交叉验证折数
 * @param {Function} scoreFunc - 评分函数（默认使用F1）
 * @returns {Object} 最佳配置和所有结果
 */
function gridSearch(samples, nSplits = 3, scoreFunc = null) {
  console.log('🔍 开始网格搜索超参数...\n');

  if (!scoreFunc) {
    // 默认使用F1分数作为评分标准
    scoreFunc = (metrics) => metrics.f1;
  }

  const parameterGrid = getParameterGrid();
  console.log(`测试 ${parameterGrid.length} 种超参数配置\n`);

  const results = [];
  let bestConfig = null;
  let bestScore = -Infinity;

  for (let i = 0; i < parameterGrid.length; i++) {
    const config = parameterGrid[i];
    console.log(`[${i + 1}/${parameterGrid.length}] 测试配置: ${config.id}`);
    console.log(
      `  参数: nTrees=${config.nTrees}, maxDepth=${config.maxDepth}, ` +
        `minSamplesLeaf=${config.minSamplesLeaf}, maxFeatures=${config.maxFeatures}`
    );

    try {
      // 执行交叉验证
      const cvResult = crossValidate(
        RandomForest,
        samples,
        {
          nTrees: config.nTrees,
          maxDepth: config.maxDepth,
          minSamplesSplit: 2,
          minSamplesLeaf: config.minSamplesLeaf,
          maxFeatures: config.maxFeatures,
          bootstrap: true,
          oobScore: false,
        },
        nSplits
      );

      const score = scoreFunc(cvResult.averageMetrics);

      console.log(
        `  F1分数: ${cvResult.averageMetrics.f1.toFixed(3)}, ` +
          `精确率: ${(cvResult.averageMetrics.precision * 100).toFixed(2)}%, ` +
          `召回率: ${(cvResult.averageMetrics.recall * 100).toFixed(2)}%`
      );
      console.log(`  评分: ${score.toFixed(3)}\n`);

      results.push({
        config: config,
        metrics: cvResult.averageMetrics,
        score: score,
      });

      // 更新最佳配置
      if (score > bestScore) {
        bestScore = score;
        bestConfig = config;
      }
    } catch (error) {
      console.error(`  ❌ 配置测试失败: ${error.message}\n`);
    }
  }

  // 按分数排序
  results.sort((a, b) => b.score - a.score);

  console.log('='.repeat(60));
  console.log('✅ 网格搜索完成\n');
  console.log('🏆 最佳配置:');
  console.log(`  ID: ${bestConfig.id}`);
  console.log(
    `  参数: nTrees=${bestConfig.nTrees}, maxDepth=${bestConfig.maxDepth}, ` +
      `minSamplesLeaf=${bestConfig.minSamplesLeaf}, maxFeatures=${bestConfig.maxFeatures}`
  );
  console.log(`  F1分数: ${results[0].metrics.f1.toFixed(3)}`);
  console.log(`  精确率: ${(results[0].metrics.precision * 100).toFixed(2)}%`);
  console.log(`  召回率: ${(results[0].metrics.recall * 100).toFixed(2)}%`);
  console.log(`  AUC: ${results[0].metrics.auc.toFixed(3)}`);
  console.log('='.repeat(60) + '\n');

  return {
    bestConfig: bestConfig,
    bestScore: bestScore,
    allResults: results,
  };
}

/**
 * 快速网格搜索（减少配置数量，用于初步筛选）
 * @param {Array} samples - 样本数组
 * @returns {Object} 最佳配置
 */
function quickGridSearch(samples) {
  console.log('⚡ 执行快速网格搜索（简化版）...\n');

  // 只测试几个关键配置
  const quickConfigs = [
    {
      nTrees: 100,
      maxDepth: 8,
      minSamplesLeaf: 10,
      maxFeatures: 0.7,
      id: 'Quick_Medium',
    },
    {
      nTrees: 150,
      maxDepth: 10,
      minSamplesLeaf: 15,
      maxFeatures: 0.7,
      id: 'Quick_Balanced',
    },
    {
      nTrees: 150,
      maxDepth: 12,
      minSamplesLeaf: 20,
      maxFeatures: 1.0,
      id: 'Quick_Deep',
    },
  ];

  let bestConfig = null;
  let bestScore = -Infinity;

  for (const config of quickConfigs) {
    console.log(`测试配置: ${config.id}`);

    try {
      const cvResult = crossValidate(
        RandomForest,
        samples,
        {
          nTrees: config.nTrees,
          maxDepth: config.maxDepth,
          minSamplesSplit: 2,
          minSamplesLeaf: config.minSamplesLeaf,
          maxFeatures: config.maxFeatures,
          bootstrap: true,
          oobScore: false,
        },
        3 // 只用3折
      );

      const score = cvResult.averageMetrics.f1;
      console.log(`  F1: ${score.toFixed(3)}\n`);

      if (score > bestScore) {
        bestScore = score;
        bestConfig = config;
      }
    } catch (error) {
      console.error(`  失败: ${error.message}\n`);
    }
  }

  console.log(`🏆 快速搜索最佳配置: ${bestConfig.id}\n`);

  return {
    bestConfig: bestConfig,
    bestScore: bestScore,
  };
}

module.exports = {
  getParameterGrid,
  gridSearch,
  quickGridSearch,
};
