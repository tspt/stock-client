/**
 * 信号点标注模块
 *
 * 根据定义的标准标注买点信号：
 * - 买入后持有1日、2日、3日、5日
 * - 至少两种收益为正，标记为正向样本(1)
 * - 否则标记为负向样本(0)
 */

/**
 * 计算从指定位置买入后的多日收益和最大回撤
 * @param {Array} klineData - K线数据数组
 * @param {number} buyIndex - 买入位置的索引
 * @returns {Object|null} 包含各日收益和回撤的对象，如果数据不足返回null
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

  // 计算5日内的最大回撤（基于最低价）
  let minPrice5d = buyPrice;
  for (let i = 1; i <= 5; i++) {
    if (klineData[buyIndex + i].low < minPrice5d) {
      minPrice5d = klineData[buyIndex + i].low;
    }
  }
  returns.maxDrawdown = (minPrice5d - buyPrice) / buyPrice;

  return returns;
}

/**
 * 判断是否为好的信号点
 * @param {Object} returns - 未来收益对象
 * @param {Object} currentKline - 当前K线数据 (用于方案 B 企稳过滤)
 * @returns {boolean} 是否为好信号
 */
function isGoodSignal(returns, currentKline) {
  if (!returns) return false;

  // 1. 基础门槛：至少两种收益 > 2% (用户最新要求)
  let positiveCount = 0;
  if (returns.day1 > 0.02) positiveCount++;
  if (returns.day2 > 0.02) positiveCount++;
  if (returns.day3 > 0.02) positiveCount++;
  if (returns.day5 > 0.02) positiveCount++;

  if (positiveCount < 2) return false;

  // 2. 负向约束：5日内最大回撤超过 5% 则判定为坏信号 (防止大幅波动)
  if (returns.maxDrawdown < -0.05) {
    return false;
  }

  // 3. 方案 B: 企稳过滤器 (Labeling-side)
  // 如果当天还在大跌或收盘极差，不标注为好买点，强迫模型学习“企稳”后的特征
  if (currentKline) {
    const open = currentKline.open;
    const close = currentKline.close;
    const low = currentKline.low;

    // B1. 如果当天跌幅大于 2% (大阴线)，不作为好买点，防止学习“接飞刀”
    const day0Return = (close - open) / open;
    if (day0Return < -0.02) {
      return false;
    }

    // B2. 如果收盘在接近最低点 (无下影线的秃底大跌阴线)，不作为好买点
    if (close < open) {
      const entity = open - close;
      const lowerShadow = close - low;
      if (lowerShadow < entity * 0.15) {
        return false;
      }
    }
  }

  return true;
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
      // 传入当前K线用于方案 B 过滤
      const label = isGoodSignal(returns, klineData[i]) ? 1 : 0;

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
 * @returns {Object} 包含所有样本的统计信息
 */
function labelIndustrySignals(stocks, startIndex = 20) {
  let totalPositive = 0;
  let totalNegative = 0;

  for (const stock of stocks) {
    const labels = labelStockSignals(stock, startIndex);
    stock.labels = labels;

    const positive = labels.filter((l) => l.label === 1).length;
    totalPositive += positive;
    totalNegative += labels.length - positive;
  }

  return {
    positive: totalPositive,
    negative: totalNegative,
    ratio: totalPositive / (totalPositive + totalNegative || 1),
  };
}

module.exports = {
  calculateFutureReturns,
  isGoodSignal,
  labelStockSignals,
  labelIndustrySignals,
};
