/**
 * 单行业模型训练器
 *
 * 为单个行业执行完整的训练流程：
 * 1. 提取特征
 * 2. 超参数调优
 * 3. 训练最终模型
 * 4. 评估性能
 * 5. 保存模型
 */

const fs = require('fs');
const path = require('path');
const { extractIndustryFeatures, getFeatureNames } = require('./feature_engineer.cjs');
const { gridSearch, quickGridSearch } = require('./hyperparameter_tuner.cjs');
const RandomForest = require('./random_forest.cjs');
const { evaluateModel } = require('./cross_validator.cjs');

const MODEL_OUTPUT_DIR = path.join(__dirname, '..', '..', '..', 'public', 'models', 'industry');

/**
 * 确保输出目录存在
 */
function ensureOutputDir() {
  if (!fs.existsSync(MODEL_OUTPUT_DIR)) {
    fs.mkdirSync(MODEL_OUTPUT_DIR, { recursive: true });
    console.log(`📁 创建模型输出目录: ${MODEL_OUTPUT_DIR}\n`);
  }
}

/**
 * 按时间划分训练集和测试集
 * @param {Array} samples - 样本数组（已按时间排序）
 * @param {number} trainRatio - 训练集比例
 * @returns {Object} 包含训练集和测试集的对象
 */
function splitTrainTest(samples, trainRatio = 0.8) {
  const splitIndex = Math.floor(samples.length * trainRatio);

  const trainSamples = samples.slice(0, splitIndex);
  const testSamples = samples.slice(splitIndex);

  return { trainSamples, testSamples };
}

/**
 * 训练单个行业的模型
 * @param {string} industryName - 行业名称
 * @param {Array} stocks - 该行业的股票数组
 * @param {Object} options - 训练选项
 * @returns {Object} 训练结果
 */
async function trainIndustryModel(industryName, stocks, options = {}) {
  const {
    useQuickSearch = false, // 是否使用快速搜索
    trainRatio = 0.8, // 训练集比例
    startIndex = 60, // 特征计算起始索引
  } = options;

  console.log('\n' + '='.repeat(60));
  console.log(`🏭 开始训练行业模型: ${industryName}`);
  console.log(`📊 股票数量: ${stocks.length}`);
  console.log('='.repeat(60) + '\n');

  try {
    // 步骤1: 提取特征
    console.log('📝 步骤1: 提取特征...\n');
    const featureResult = extractIndustryFeatures(stocks, startIndex);

    if (featureResult.samples.length < 100) {
      console.warn(`⚠️  样本数不足 (${featureResult.samples.length})，跳过该行业\n`);
      return {
        industryName,
        success: false,
        reason: '样本数不足',
      };
    }

    const samples = featureResult.samples;

    // 步骤2: 划分训练集和测试集
    console.log('📝 步骤2: 划分数据集...\n');
    const { trainSamples, testSamples } = splitTrainTest(samples, trainRatio);

    console.log(`训练集: ${trainSamples.length} 样本`);
    console.log(`测试集: ${testSamples.length} 样本\n`);

    // 步骤3: 超参数调优
    console.log('📝 步骤3: 超参数调优...\n');
    let bestConfig;

    if (useQuickSearch) {
      const searchResult = quickGridSearch(trainSamples);
      bestConfig = searchResult.bestConfig;
    } else {
      // 优化搜索范围
      const searchResult = gridSearch(trainSamples, 3);
      bestConfig = searchResult.bestConfig;
    }

    // 强制优化超参数，防止哑火
    bestConfig.maxDepth = Math.max(bestConfig.maxDepth, 10);
    bestConfig.minSamplesLeaf = Math.min(bestConfig.minSamplesLeaf, 5);

    // 步骤4: 使用最佳配置训练最终模型
    console.log('📝 步骤4: 训练最终模型...\n');
    const finalModel = new RandomForest({
      nTrees: Math.max(bestConfig.nTrees, 100), // 增加树的数量
      maxDepth: bestConfig.maxDepth,
      minSamplesSplit: 2,
      minSamplesLeaf: bestConfig.minSamplesLeaf,
      maxFeatures: bestConfig.maxFeatures,
      bootstrap: true,
      oobScore: true,
    });

    // 准备训练数据
    const trainX = trainSamples.map((s) => s.features);
    const trainY = trainSamples.map((s) => s.label);

    finalModel.fit(trainX, trainY);

    // 步骤5: 评估模型
    console.log('\n📝 步骤5: 评估模型性能...\n');
    const testX = testSamples.map((s) => s.features);
    const testY = testSamples.map((s) => s.label);

    const testMetrics = evaluateModel(finalModel, testX, testY);

    console.log('📊 测试集性能:');
    console.log(`  准确率: ${(testMetrics.accuracy * 100).toFixed(2)}%`);
    console.log(`  精确率: ${(testMetrics.precision * 100).toFixed(2)}%`);
    console.log(`  召回率: ${(testMetrics.recall * 100).toFixed(2)}%`);
    console.log(`  F1分数: ${testMetrics.f1.toFixed(3)}`);
    console.log(`  AUC-ROC: ${testMetrics.auc.toFixed(3)}\n`);

    // 步骤6: 保存模型
    console.log('📝 步骤6: 保存模型...\n');
    ensureOutputDir();

    const modelData = {
      industryName: industryName,
      version: 'v1.0-rf',
      trainingDate: new Date().toISOString(),
      algorithm: 'RandomForest',
      hyperparameters: {
        nTrees: bestConfig.nTrees,
        maxDepth: bestConfig.maxDepth,
        minSamplesSplit: 2,
        minSamplesLeaf: bestConfig.minSamplesLeaf,
        maxFeatures: bestConfig.maxFeatures,
        bootstrap: true,
      },
      trees: finalModel.toJSON().trees,
      featureNames: getFeatureNames(),
      featureStats: null, // 可以添加特征标准化参数
      performance: {
        accuracy: testMetrics.accuracy,
        precision: testMetrics.precision,
        recall: testMetrics.recall,
        f1: testMetrics.f1,
        auc: testMetrics.auc,
        confusionMatrix: testMetrics.confusionMatrix,
      },
      trainingSamples: {
        total: trainSamples.length,
        positive: trainSamples.filter((s) => s.label === 1).length,
        negative: trainSamples.filter((s) => s.label === 0).length,
      },
      testSamples: {
        total: testSamples.length,
        positive: testSamples.filter((s) => s.label === 1).length,
        negative: testSamples.filter((s) => s.label === 0).length,
      },
      stockCount: stocks.length,
      stockCodes: stocks.map((s) => s.code),
    };

    // 保存模型文件
    const modelName = `${industryName.replace(/[\/\\:*?"<>|]/g, '_')}_model.json`;
    const modelPath = path.join(MODEL_OUTPUT_DIR, modelName);
    fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2), 'utf-8');

    console.log(`✅ 模型已保存: ${modelPath}\n`);

    return {
      industryName,
      success: true,
      modelPath,
      metrics: testMetrics,
      bestConfig,
      sampleStats: {
        train: trainSamples.length,
        test: testSamples.length,
        total: samples.length,
      },
    };
  } catch (error) {
    console.error(`❌ 训练失败: ${error.message}`);
    console.error(error.stack);

    return {
      industryName,
      success: false,
      reason: error.message,
    };
  }
}

module.exports = {
  trainIndustryModel,
  splitTrainTest,
  ensureOutputDir,
};
