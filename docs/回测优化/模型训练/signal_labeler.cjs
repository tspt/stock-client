/**
 * 信号点标注模块
 *
 * 根据定义的标准标注买点信号：
 * - 买入后持有1日、2日、3日、5日
 * - 至少两种收益为正，标记为正向样本(1)
 * - 否则标记为负向样本(0)
 */

/**
 * 计算从指定位置买入后的多日收益
 * @param {Array} klineData - K线数据数组
 * @param {number} buyIndex - 买入位置的索引
 * @returns {Object|null} 包含各日收益的对象，如果数据不足返回null
 */
function calculateFutureReturns(klineData, buyIndex) {
  const buyPrice = klineData[buyIndex].close;

  // 检查是否有足够的数据
  if (buyIndex + 5 >= klineData.length) {
    return null;
  }

  // 计算1、2、3、5日后的收益率
  const returns = {
    day1: (klineData[buyIndex + 1].close - buyPrice) / buyPrice,
    day2: (klineData[buyIndex + 2].close - buyPrice) / buyPrice,
    day3: (klineData[buyIndex + 3].close - buyPrice) / buyPrice,
    day5: (klineData[buyIndex + 5].close - buyPrice) / buyPrice,
  };

  return returns;
}

/**
 * 判断是否为好的信号点
 * @param {Object} returns - 未来收益对象
 * @returns {boolean} 是否为好信号
 */
function isGoodSignal(returns) {
  if (!returns) return false;

  // 至少两种收益为正且涨幅 > 1%
  let positiveCount = 0;

  if (returns.day1 > 0.01) positiveCount++;
  if (returns.day2 > 0.01) positiveCount++;
  if (returns.day3 > 0.01) positiveCount++;
  if (returns.day5 > 0.01) positiveCount++;

  // 至少两种收益满足标准
  return positiveCount >= 2;
}

/**
 * 为单只股票标注所有可能的信号点
 * @param {Object} stock - 股票数据对象
 * @param {number} startIndex - 开始标注的索引（默认20，确保有足够历史数据）
 * @returns {Array} 标注结果数组，每个元素包含索引和标签
 */
function labelStockSignals(stock, startIndex = 20) {
  const labels = [];
  const klineData = stock.klineData;

  // 遍历每个可能的位置
  for (let i = startIndex; i < klineData.length - 5; i++) {
    const returns = calculateFutureReturns(klineData, i);

    if (returns) {
      const label = isGoodSignal(returns) ? 1 : 0;

      labels.push({
        index: i,
        label: label,
        date: new Date(klineData[i].time).toISOString().split('T')[0],
        returns: returns,
      });
    }
  }

  return labels;
}

/**
 * 为行业内的所有股票标注信号点
 * @param {Array} stocks - 股票数组
 * @param {number} startIndex - 开始标注的索引
 * @returns {Object} 包含所有标注结果的對象
 */
function labelIndustrySignals(stocks, startIndex = 20) {
  console.log(`🏷️  开始标注 ${stocks.length} 只股票的信号点...`);

  const allLabels = [];
  let totalPositive = 0;
  let totalNegative = 0;
  let skippedCount = 0;

  for (const stock of stocks) {
    try {
      const labels = labelStockSignals(stock, startIndex);

      // 添加到总结果
      labels.forEach((label) => {
        allLabels.push({
          ...label,
          stockCode: stock.code,
          stockName: stock.name,
        });

        if (label.label === 1) {
          totalPositive++;
        } else {
          totalNegative++;
        }
      });
    } catch (error) {
      console.warn(`⚠️  标注股票 ${stock.code} 失败: ${error.message}`);
      skippedCount++;
    }
  }

  const totalSamples = totalPositive + totalNegative;
  const positiveRate = totalSamples > 0 ? ((totalPositive / totalSamples) * 100).toFixed(2) : 0;

  console.log(`✅ 标注完成:`);
  console.log(`  - 总样本数: ${totalSamples}`);
  console.log(`  - 正向样本: ${totalPositive} (${positiveRate}%)`);
  console.log(`  - 负向样本: ${totalNegative} (${(100 - positiveRate).toFixed(2)}%)`);
  if (skippedCount > 0) {
    console.log(`  - 跳过股票: ${skippedCount}`);
  }
  console.log('');

  return {
    labels: allLabels,
    stats: {
      total: totalSamples,
      positive: totalPositive,
      negative: totalNegative,
      positiveRate: parseFloat(positiveRate),
      skipped: skippedCount,
    },
  };
}

/**
 * 平衡数据集（可选）
 * 通过欠采样或过采样使正负样本比例更均衡
 * @param {Array} labels - 标注结果数组
 * @param {string} strategy - 策略: 'undersample', 'oversample', 'none'
 * @param {number} targetRatio - 目标正负样本比例（默认0.3表示30%正样本）
 * @returns {Array} 平衡后的标注结果
 */
function balanceDataset(labels, strategy = 'none', targetRatio = 0.3) {
  if (strategy === 'none') {
    return labels;
  }

  const positiveSamples = labels.filter((l) => l.label === 1);
  const negativeSamples = labels.filter((l) => l.label === 0);

  if (strategy === 'undersample') {
    // 欠采样：减少负样本数量
    const nPositive = positiveSamples.length;
    const nNegativeNeeded = Math.floor((nPositive * (1 - targetRatio)) / targetRatio);

    if (nNegativeNeeded >= negativeSamples.length) {
      return labels; // 不需要采样
    }

    // 随机选择负样本
    const shuffled = [...negativeSamples].sort(() => Math.random() - 0.5);
    const selectedNegative = shuffled.slice(0, nNegativeNeeded);

    console.log(`⚖️  欠采样: ${negativeSamples.length} -> ${selectedNegative.length} 个负样本`);

    return [...positiveSamples, ...selectedNegative].sort((a, b) => a.index - b.index);
  }

  if (strategy === 'oversample') {
    // 过采样：增加正样本数量（简单复制）
    const nNegative = negativeSamples.length;
    const nPositiveNeeded = Math.floor((nNegative * targetRatio) / (1 - targetRatio));

    if (nPositiveNeeded <= positiveSamples.length) {
      return labels; // 不需要采样
    }

    // 重复采样正样本
    const additionalPositive = [];
    while (additionalPositive.length < nPositiveNeeded - positiveSamples.length) {
      const randomSample = positiveSamples[Math.floor(Math.random() * positiveSamples.length)];
      additionalPositive.push({ ...randomSample });
    }

    console.log(
      `⚖️  过采样: ${positiveSamples.length} -> ${
        positiveSamples.length + additionalPositive.length
      } 个正样本`
    );

    return [...positiveSamples, ...additionalPositive, ...negativeSamples].sort(
      (a, b) => a.index - b.index
    );
  }

  return labels;
}

/**
 * 准备训练数据
 * 将标注结果转换为特征矩阵X和标签向量y
 * @param {Array} labels - 标注结果数组
 * @param {Function} featureExtractor - 特征提取函数
 * @returns {Object} 包含X, y和元数据的对象
 */
function prepareTrainingData(labels, featureExtractor) {
  console.log('📊 准备训练数据...');

  const X = [];
  const y = [];
  const metadata = [];
  let skippedCount = 0;

  for (const label of labels) {
    try {
      // 这里需要传入完整的K线数据和索引来计算特征
      // 实际使用时需要在调用此函数前准备好特征
      // 这个函数主要用于组织结构
      // 占位符：实际特征计算在feature_engineer中完成
      // 这里只是示意数据结构
    } catch (error) {
      skippedCount++;
    }
  }

  console.log(`✅ 训练数据准备完成: ${X.length} 个样本`);
  if (skippedCount > 0) {
    console.log(`⚠️  跳过 ${skippedCount} 个样本（特征计算失败）`);
  }

  return { X, y, metadata };
}

module.exports = {
  calculateFutureReturns,
  isGoodSignal,
  labelStockSignals,
  labelIndustrySignals,
  balanceDataset,
  prepareTrainingData,
};
