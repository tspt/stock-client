/**
 * 回测验证脚本
 *
 * 功能：
 * - 加载训练好的行业模型
 * - 对历史数据进行预测
 * - 模拟买入操作，计算实际收益率
 * - 统计胜率、平均收益、最大回撤等指标
 */

const fs = require('fs');
const path = require('path');
const { loadData } = require('./data_loader.cjs');
const { calculateFeaturesAt } = require('./feature_engineer.cjs');
const RandomForest = require('./random_forest.cjs');

const MODEL_DIR = path.join(__dirname, '..', '..', '..', 'public', 'models', 'industry');

/**
 * 加载行业模型
 * @param {string} industryName - 行业名称
 * @returns {Object|null} 模型对象或null
 */
function loadIndustryModel(industryName) {
  const modelName = `${industryName.replace(/[\/\\:*?"<>|]/g, '_')}_model.json`;
  const modelPath = path.join(MODEL_DIR, modelName);

  if (!fs.existsSync(modelPath)) {
    console.warn(`⚠️  模型文件不存在: ${modelName}`);
    return null;
  }

  try {
    const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

    // 重建随机森林模型
    const model = new RandomForest();
    model.fromJSON(modelData);

    return {
      model,
      modelData,
    };
  } catch (error) {
    console.error(`❌ 加载模型失败: ${error.message}`);
    return null;
  }
}

/**
 * 对单只股票进行回测
 * @param {Object} stock - 股票数据
 * @param {Object} modelWrapper - 模型包装器
 * @param {number} startIndex - 开始回测的索引
 * @returns {Object} 回测结果
 */
function backtestStock(stock, modelWrapper, startIndex = 60) {
  const klineData = stock.klineData;
  const signals = [];

  // 遍历每个可能的位置
  for (let i = startIndex; i < klineData.length - 5; i++) {
    // 计算特征
    const features = calculateFeaturesAt(klineData, i);

    if (!features) continue;

    // 预测是否为买点
    const prediction = modelWrapper.model.predictSample(features);

    if (prediction === 1) {
      // 计算实际收益
      const buyPrice = klineData[i].close;
      const returns = {
        day1: (klineData[i + 1].close - buyPrice) / buyPrice,
        day2: (klineData[i + 2].close - buyPrice) / buyPrice,
        day3: (klineData[i + 3].close - buyPrice) / buyPrice,
        day5: (klineData[i + 5].close - buyPrice) / buyPrice,
      };

      // 判断是否为好信号（至少两种收益为正）
      let positiveCount = 0;
      if (returns.day1 > 0) positiveCount++;
      if (returns.day2 > 0) positiveCount++;
      if (returns.day3 > 0) positiveCount++;
      if (returns.day5 > 0) positiveCount++;

      const isGoodSignal = positiveCount >= 2;

      signals.push({
        index: i,
        date: new Date(klineData[i].time).toISOString().split('T')[0],
        buyPrice,
        returns,
        isGoodSignal,
        positiveCount,
      });
    }
  }

  // 统计回测指标
  const totalSignals = signals.length;
  const goodSignals = signals.filter((s) => s.isGoodSignal).length;
  const winRate = totalSignals > 0 ? goodSignals / totalSignals : 0;

  // 计算平均收益
  const avgReturns = {
    day1: signals.reduce((sum, s) => sum + s.returns.day1, 0) / totalSignals || 0,
    day2: signals.reduce((sum, s) => sum + s.returns.day2, 0) / totalSignals || 0,
    day3: signals.reduce((sum, s) => sum + s.returns.day3, 0) / totalSignals || 0,
    day5: signals.reduce((sum, s) => sum + s.returns.day5, 0) / totalSignals || 0,
  };

  // 计算最大回撤（简化版）
  let maxDrawdown = 0;
  for (const signal of signals) {
    const minReturn = Math.min(
      signal.returns.day1,
      signal.returns.day2,
      signal.returns.day3,
      signal.returns.day5
    );
    if (minReturn < maxDrawdown) {
      maxDrawdown = minReturn;
    }
  }

  return {
    stockCode: stock.code,
    stockName: stock.name,
    totalSignals,
    goodSignals,
    winRate,
    avgReturns,
    maxDrawdown,
    signals: signals.slice(0, 100), // 只保留前100个信号用于详细分析
  };
}

/**
 * 对行业内所有股票进行回测
 * @param {string} industryName - 行业名称
 * @param {Array} stocks - 股票数组
 * @returns {Object} 回测结果
 */
function backtestIndustry(industryName, stocks) {
  console.log(`\n📊 回测行业: ${industryName}`);
  console.log(`📈 股票数量: ${stocks.length}\n`);

  // 加载模型
  const modelWrapper = loadIndustryModel(industryName);

  if (!modelWrapper) {
    console.warn(`⚠️  跳过该行业（模型不存在）\n`);
    return null;
  }

  console.log(`✅ 模型加载成功`);
  console.log(`📅 训练日期: ${new Date(modelWrapper.modelData.trainingDate).toLocaleDateString()}`);
  console.log(`🎯 测试集F1: ${modelWrapper.modelData.performance.f1.toFixed(3)}\n`);

  // 对每只股票进行回测
  const stockResults = [];

  for (const stock of stocks) {
    try {
      const result = backtestStock(stock, modelWrapper);
      stockResults.push(result);
    } catch (error) {
      console.warn(`⚠️  回测股票 ${stock.code} 失败: ${error.message}`);
    }
  }

  // 汇总行业回测结果
  const totalSignals = stockResults.reduce((sum, r) => sum + r.totalSignals, 0);
  const totalGoodSignals = stockResults.reduce((sum, r) => sum + r.goodSignals, 0);
  const overallWinRate = totalSignals > 0 ? totalGoodSignals / totalSignals : 0;

  const avgWinRate = stockResults.reduce((sum, r) => sum + r.winRate, 0) / stockResults.length || 0;

  const avgReturns = {
    day1: stockResults.reduce((sum, r) => sum + r.avgReturns.day1, 0) / stockResults.length,
    day2: stockResults.reduce((sum, r) => sum + r.avgReturns.day2, 0) / stockResults.length,
    day3: stockResults.reduce((sum, r) => sum + r.avgReturns.day3, 0) / stockResults.length,
    day5: stockResults.reduce((sum, r) => sum + r.avgReturns.day5, 0) / stockResults.length,
  };

  const avgMaxDrawdown =
    stockResults.reduce((sum, r) => sum + r.maxDrawdown, 0) / stockResults.length;

  console.log('📊 行业回测结果:');
  console.log(`  总信号数: ${totalSignals}`);
  console.log(`  好信号数: ${totalGoodSignals}`);
  console.log(`  整体胜率: ${(overallWinRate * 100).toFixed(2)}%`);
  console.log(`  平均胜率: ${(avgWinRate * 100).toFixed(2)}%`);
  console.log(`  平均收益:`);
  console.log(`    1日: ${(avgReturns.day1 * 100).toFixed(2)}%`);
  console.log(`    2日: ${(avgReturns.day2 * 100).toFixed(2)}%`);
  console.log(`    3日: ${(avgReturns.day3 * 100).toFixed(2)}%`);
  console.log(`    5日: ${(avgReturns.day5 * 100).toFixed(2)}%`);
  console.log(`  平均最大回撤: ${(avgMaxDrawdown * 100).toFixed(2)}%\n`);

  return {
    industryName,
    stockCount: stocks.length,
    totalSignals,
    goodSignals,
    overallWinRate,
    avgWinRate,
    avgReturns,
    avgMaxDrawdown,
    stockResults,
  };
}

/**
 * 主函数：回测所有行业
 */
function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔙 模型回测验证系统');
  console.log('='.repeat(60) + '\n');

  // 加载数据
  console.log('📦 加载数据...\n');
  const { industryMap } = loadData(500);

  // 检查模型目录
  if (!fs.existsSync(MODEL_DIR)) {
    console.error('❌ 模型目录不存在，请先运行训练脚本');
    process.exit(1);
  }

  const modelFiles = fs.readdirSync(MODEL_DIR).filter((f) => f.endsWith('_model.json'));
  console.log(`📁 发现 ${modelFiles.length} 个模型文件\n`);

  // 回测各行业
  const results = [];

  for (const [industryName, stocks] of industryMap.entries()) {
    const result = backtestIndustry(industryName, stocks);

    if (result) {
      results.push(result);
    }
  }

  // 生成总体报告
  console.log('\n' + '='.repeat(60));
  console.log('📊 总体回测报告');
  console.log('='.repeat(60) + '\n');

  const industriesWithSignals = results.filter((r) => r.totalSignals > 0);

  if (industriesWithSignals.length > 0) {
    const avgOverallWinRate =
      industriesWithSignals.reduce((sum, r) => sum + r.overallWinRate, 0) /
      industriesWithSignals.length;
    const avgAvgWinRate =
      industriesWithSignals.reduce((sum, r) => sum + r.avgWinRate, 0) /
      industriesWithSignals.length;

    console.log(`回测行业数: ${industriesWithSignals.length}`);
    console.log(`平均整体胜率: ${(avgOverallWinRate * 100).toFixed(2)}%`);
    console.log(`平均个股胜率: ${(avgAvgWinRate * 100).toFixed(2)}%\n`);

    // 按胜率排序
    const sortedByWinRate = [...industriesWithSignals].sort(
      (a, b) => b.overallWinRate - a.overallWinRate
    );

    console.log('🏆 胜率最高的前10个行业:');
    sortedByWinRate.slice(0, 10).forEach((r, idx) => {
      console.log(
        `  ${idx + 1}. ${r.industryName}: ${(r.overallWinRate * 100).toFixed(2)}% (${
          r.totalSignals
        } 信号)`
      );
    });

    console.log('\n⚠️  胜率最低的后10个行业:');
    sortedByWinRate
      .slice(-10)
      .reverse()
      .forEach((r, idx) => {
        console.log(
          `  ${idx + 1}. ${r.industryName}: ${(r.overallWinRate * 100).toFixed(2)}% (${
            r.totalSignals
          } 信号)`
        );
      });
  }

  // 保存回测报告
  const reportPath = path.join(__dirname, 'backtest_report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalIndustries: results.length,
        results: results.map((r) => ({
          industryName: r.industryName,
          stockCount: r.stockCount,
          totalSignals: r.totalSignals,
          goodSignals: r.goodSignals,
          overallWinRate: r.overallWinRate,
          avgWinRate: r.avgWinRate,
          avgReturns: r.avgReturns,
          avgMaxDrawdown: r.avgMaxDrawdown,
        })),
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`\n📄 回测报告已保存: ${reportPath}\n`);
  console.log('✨ 回测完成！\n');
}

// 执行主函数
main();
