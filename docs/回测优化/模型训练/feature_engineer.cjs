/**
 * 特征工程模块
 *
 * 计算四类特征（约28个）：
 * A. 价格动量特征（8个）
 * B. 波动性特征（7个）
 * C. 成交量特征（6个）
 * D. 技术形态特征（7个）
 */

/**
 * 计算移动平均线
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number|null} 移动平均值
 */
function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((s, p) => s + p, 0);
  return sum / period;
}

/**
 * 计算标准差
 * @param {Array} values - 数值数组
 * @returns {number} 标准差
 */
function calculateStd(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 计算布林带
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @param {number} multiplier - 倍数
 * @returns {Object} 包含上轨、中轨、下轨
 */
function calculateBollingerBands(prices, period = 20, multiplier = 2) {
  if (prices.length < period) {
    return { upper: null, middle: null, lower: null };
  }

  const recentPrices = prices.slice(-period);
  const middle = recentPrices.reduce((s, p) => s + p, 0) / period;
  const std = calculateStd(recentPrices);

  return {
    upper: middle + multiplier * std,
    middle: middle,
    lower: middle - multiplier * std,
  };
}

/**
 * 计算ATR（平均真实波幅）
 * @param {Array} klineData - K线数据数组
 * @param {number} period - 周期
 * @returns {number|null} ATR值
 */
function calculateATR(klineData, period = 14) {
  if (klineData.length < period + 1) return null;

  let trSum = 0;
  for (let i = klineData.length - period; i < klineData.length; i++) {
    const current = klineData[i];
    const previous = klineData[i - 1];

    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);

    const tr = Math.max(highLow, highClose, lowClose);
    trSum += tr;
  }

  return trSum / period;
}

/**
 * 计算RSI（相对强弱指标）
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number|null} RSI值
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 计算MACD柱状图值
 * @param {Array} prices - 价格数组
 * @returns {number|null} MACD histogram值
 */
function calculateMACDHistogram(prices) {
  if (prices.length < 26) return null;

  // 简化的MACD计算
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (ema12 === null || ema26 === null) return null;

  const macdLine = ema12 - ema26;
  const signalLine = calculateEMA(prices.slice(-9), 9); // 简化

  if (signalLine === null) return null;

  return macdLine - signalLine;
}

/**
 * 计算EMA（指数移动平均）
 * @param {Array} prices - 价格数组
 * @param {number} period - 周期
 * @returns {number|null} EMA值
 */
function calculateEMA(prices, period) {
  if (prices.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * 计算单个位置的所有特征
 * @param {Array} klineData - K线数据数组
 * @param {number} index - 当前位置索引
 * @returns {Array|null} 特征向量或null（如果数据不足）
 */
function calculateFeaturesAt(klineData, index) {
  // 确保有足够的数据
  if (index < 60) return null;

  const slice = klineData.slice(0, index + 1);
  const current = klineData[index];
  const close = current.close;
  const prices = slice.map((k) => k.close);
  const volumes = slice.map((k) => k.volume);

  const features = [];

  // ==================== A. 价格动量特征（8个）====================

  // 1. 1日收益率
  const return_1d =
    index > 0 ? (close - klineData[index - 1].close) / klineData[index - 1].close : 0;
  features.push(return_1d);

  // 2. 3日累计收益率
  const return_3d =
    index >= 3 ? (close - klineData[index - 3].close) / klineData[index - 3].close : 0;
  features.push(return_3d);

  // 3. 5日累计收益率
  const return_5d =
    index >= 5 ? (close - klineData[index - 5].close) / klineData[index - 5].close : 0;
  features.push(return_5d);

  // 4. 10日累计收益率
  const return_10d =
    index >= 10 ? (close - klineData[index - 10].close) / klineData[index - 10].close : 0;
  features.push(return_10d);

  // 5. 相对5日均线偏离度
  const ma5 = calculateMA(prices, 5);
  const ma5_deviation = ma5 ? (close - ma5) / ma5 : 0;
  features.push(ma5_deviation);

  // 6. 相对20日均线偏离度
  const ma20 = calculateMA(prices, 20);
  const ma20_deviation = ma20 ? (close - ma20) / ma20 : 0;
  features.push(ma20_deviation);

  // 7. 相对60日均线偏离度
  const ma60 = calculateMA(prices, 60);
  const ma60_deviation = ma60 ? (close - ma60) / ma60 : 0;
  features.push(ma60_deviation);

  // 8. 价格位置指标 (close-low_20)/(high_20-low_20)
  const last20 = slice.slice(-20);
  const high_20 = Math.max(...last20.map((k) => k.high));
  const low_20 = Math.min(...last20.map((k) => k.low));
  const price_position = high_20 - low_20 > 0 ? (close - low_20) / (high_20 - low_20) : 0.5;
  features.push(price_position);

  // ==================== B. 波动性特征（7个）====================

  // 9. 5日年化波动率
  const returns_5d = [];
  for (let i = Math.max(1, index - 4); i <= index; i++) {
    const ret = (klineData[i].close - klineData[i - 1].close) / klineData[i - 1].close;
    returns_5d.push(ret);
  }
  const volatility_5d = calculateStd(returns_5d) * Math.sqrt(252);
  features.push(volatility_5d);

  // 10. 10日年化波动率
  const returns_10d = [];
  for (let i = Math.max(1, index - 9); i <= index; i++) {
    const ret = (klineData[i].close - klineData[i - 1].close) / klineData[i - 1].close;
    returns_10d.push(ret);
  }
  const volatility_10d = calculateStd(returns_10d) * Math.sqrt(252);
  features.push(volatility_10d);

  // 11. 归一化ATR (ATR14/close)
  const atr = calculateATR(slice, 14);
  const atr_normalized = atr ? atr / close : 0;
  features.push(atr_normalized);

  // 12. 布林带宽度
  const bb = calculateBollingerBands(prices, 20, 2);
  const bb_width = bb.upper && bb.lower && bb.middle ? (bb.upper - bb.lower) / bb.middle : 0;
  features.push(bb_width);

  // 13. 当日振幅 (high-low)/close
  const daily_amplitude = (current.high - current.low) / close;
  features.push(daily_amplitude);

  // 14. 近5日最大振幅
  let max_amplitude_5d = 0;
  for (let i = Math.max(0, index - 4); i <= index; i++) {
    const amp = (klineData[i].high - klineData[i].low) / klineData[i].close;
    max_amplitude_5d = Math.max(max_amplitude_5d, amp);
  }
  features.push(max_amplitude_5d);

  // 15. 价格区间比率
  const price_range_ratio = close > 0 ? (current.high - current.low) / close : 0;
  features.push(price_range_ratio);

  // ==================== C. 成交量特征（6个）====================

  // 16. 量比 (volume/MA_volume_5)
  const volume = current.volume;
  const avgVol5 = slice.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
  const volume_ratio = avgVol5 > 0 ? volume / avgVol5 : 1;
  features.push(volume_ratio);

  // 17. 成交量5日变化率
  const avgVolPrev5 =
    index >= 10 ? slice.slice(-10, -5).reduce((s, k) => s + k.volume, 0) / 5 : avgVol5;
  const vol_change_5d = avgVolPrev5 > 0 ? (avgVol5 - avgVolPrev5) / avgVolPrev5 : 0;
  features.push(vol_change_5d);

  // 18. 成交量趋势斜率（简单线性回归）
  const volTrend = slice.slice(-10).map((k) => k.volume);
  const vol_trend = calculateTrendSlope(volTrend);
  features.push(vol_trend);

  // 19. 价量相关系数(10日)
  const prices10 = slice.slice(-10).map((k) => k.close);
  const volumes10 = slice.slice(-10).map((k) => k.volume);
  const price_volume_corr = calculateCorrelation(prices10, volumes10);
  features.push(price_volume_corr);

  // 20. 上涨日成交量占比
  const last10Days = slice.slice(-10);
  const upDays = last10Days.filter((k, i) => i > 0 && k.close > last10Days[i - 1].close);
  const up_vol_ratio =
    upDays.length > 0
      ? upDays.reduce((s, k) => s + k.volume, 0) / last10Days.reduce((s, k) => s + k.volume, 0)
      : 0.5;
  features.push(up_vol_ratio);

  // 21. 资金流向代理（价格上涨且放量视为流入）
  const money_flow_proxy =
    last10Days.reduce((flow, k, i) => {
      if (i === 0) return flow;
      const prev = last10Days[i - 1];
      const priceChange = k.close - prev.close;
      const volRatio = prev.volume > 0 ? k.volume / prev.volume : 1;
      return (
        flow + (priceChange > 0 && volRatio > 1 ? 1 : priceChange < 0 && volRatio > 1 ? -1 : 0)
      );
    }, 0) / 10;
  features.push(money_flow_proxy);

  // ==================== D. 技术形态特征（11个）====================

  // 22. K线实体大小 abs(close-open)/close
  const body_size = close > 0 ? Math.abs(close - current.open) / close : 0;
  features.push(body_size);

  // 23. 上影线比例
  const upper_shadow = close > 0 ? (current.high - Math.max(close, current.open)) / close : 0;
  features.push(upper_shadow);

  // 24. 下影线比例
  const lower_shadow = close > 0 ? (Math.min(close, current.open) - current.low) / close : 0;
  features.push(lower_shadow);

  // 25. 连续上涨天数
  let consecutive_up = 0;
  for (let i = index; i > 0; i--) {
    if (klineData[i].close > klineData[i - 1].close) {
      consecutive_up++;
    } else {
      break;
    }
  }
  features.push(consecutive_up);

  // 26. 连续下跌天数
  let consecutive_down = 0;
  for (let i = index; i > 0; i--) {
    if (klineData[i].close < klineData[i - 1].close) {
      consecutive_down++;
    } else {
      break;
    }
  }
  features.push(consecutive_down);

  // 27. RSI(14)
  const rsi_14 = calculateRSI(prices, 14) || 50;
  features.push(rsi_14 / 100); // 归一化到0-1

  // 28. MACD柱状图值
  const macd_histogram = calculateMACDHistogram(prices) || 0;
  features.push(macd_histogram / close); // 归一化

  // 29. 当日涨跌幅 (特征化过滤)
  const day0_return = (close - current.open) / current.open;
  features.push(day0_return);

  // 30. 当日下影线占比 (特征化过滤)
  const day0_lower_shadow = Math.min(current.open, close) - current.low;
  const day0_range = current.high - current.low;
  const day0_lower_shadow_ratio = day0_range > 0 ? day0_lower_shadow / day0_range : 0;
  features.push(day0_lower_shadow_ratio);

  // 31. 当日上影线占比
  const day0_upper_shadow = current.high - Math.max(current.open, close);
  const day0_upper_shadow_ratio = day0_range > 0 ? day0_upper_shadow / day0_range : 0;
  features.push(day0_upper_shadow_ratio);

  // 32. 当日实体占比
  const day0_body = Math.abs(close - current.open);
  const day0_body_ratio = day0_range > 0 ? day0_body / day0_range : 0;
  features.push(day0_body_ratio);

  // ==================== E. 强逻辑特征（4个）====================

  // 33. 放量突破 (当日成交量 / 过去10日最大成交量)
  const maxVol10 = index >= 10 ? Math.max(...slice.slice(-11, -1).map((k) => k.volume)) : volume;
  const vol_breakout = maxVol10 > 0 ? volume / maxVol10 : 1;
  features.push(vol_breakout);

  // 34. 均线多头排列 (MA5 > MA10 > MA20)
  const ma10 = calculateMA(prices, 10);
  const bullish_alignment = ma5 && ma10 && ma20 && ma5 > ma10 && ma10 > ma20 ? 1 : 0;
  features.push(bullish_alignment);

  // 35. 缩量回踩 (当日成交量 / 5日均量 < 0.6 且涨跌幅在 [-1%, 1%] 之间)
  const is_low_vol = avgVol5 > 0 && volume / avgVol5 < 0.6;
  const is_flat_price = Math.abs(day0_return) < 0.01;
  const low_vol_pullback = is_low_vol && is_flat_price ? 1 : 0;
  features.push(low_vol_pullback);

  // 36. 相对强度代理 (10日收益率 / 行业平均暂不可得，改用 10日收益率 / 20日波动率)
  const return_10d_val = features[3]; // return_10d
  const vol_20d = calculateStd(prices.slice(-20).map((p, i, arr) => (i > 0 ? (p - arr[i - 1]) / arr[i - 1] : 0))) * Math.sqrt(252);
  const relative_strength_proxy = vol_20d > 0 ? return_10d_val / vol_20d : 0;
  features.push(relative_strength_proxy);

  return features;
}

/**
 * 计算趋势斜率（简单线性回归）
 * @param {Array} values - 数值数组
 * @returns {number} 斜率
 */
function calculateTrendSlope(values) {
  if (values.length < 2) return 0;

  const n = values.length;
  const x = Array.from({ length: n }, (_, i) => i);

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (values[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * 计算相关系数
 * @param {Array} x - 数组x
 * @param {Array} y - 数组y
 * @returns {number} 相关系数
 */
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let xStd = 0;
  let yStd = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    numerator += xDiff * yDiff;
    xStd += xDiff * xDiff;
    yStd += yDiff * yDiff;
  }

  const denominator = Math.sqrt(xStd * yStd);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * 为单只股票计算所有位置的特征
 * @param {Object} stock - 股票数据对象
 * @param {number} startIndex - 开始计算的索引
 * @returns {Array} 特征和标签的数组
 */
function extractStockFeatures(stock, startIndex = 60) {
  const { labelStockSignals } = require('./signal_labeler.cjs');

  // 先标注信号点
  const labels = labelStockSignals(stock, startIndex);

  // 为每个标注的位置计算特征
  const samples = [];

  for (const labelInfo of labels) {
    const features = calculateFeaturesAt(stock.klineData, labelInfo.index);

    if (features) {
      samples.push({
        features: features,
        label: labelInfo.label,
        stockCode: stock.code,
        stockName: stock.name,
        date: labelInfo.date,
        index: labelInfo.index,
      });
    }
  }

  return samples;
}

/**
 * 为行业内所有股票提取特征
 * @param {Array} stocks - 股票数组
 * @param {number} startIndex - 开始计算的索引
 * @returns {Object} 包含所有样本和统计信息的对象
 */
function extractIndustryFeatures(stocks, startIndex = 60) {
  console.log(`🔧 开始提取 ${stocks.length} 只股票的特征...`);

  const allSamples = [];
  let totalSkipped = 0;

  for (const stock of stocks) {
    try {
      const samples = extractStockFeatures(stock, startIndex);
      allSamples.push(...samples);
    } catch (error) {
      console.warn(`⚠️  提取股票 ${stock.code} 特征失败: ${error.message}`);
      totalSkipped++;
    }
  }

  // 统计正负样本数量
  const positiveCount = allSamples.filter((s) => s.label === 1).length;
  const negativeCount = allSamples.filter((s) => s.label === 0).length;
  const totalCount = positiveCount + negativeCount;

  console.log(`✅ 特征提取完成:`);
  console.log(`  - 总样本数: ${totalCount}`);
  console.log(
    `  - 正向样本: ${positiveCount} (${((positiveCount / totalCount) * 100).toFixed(2)}%)`
  );
  console.log(
    `  - 负向样本: ${negativeCount} (${((negativeCount / totalCount) * 100).toFixed(2)}%)`
  );
  if (totalSkipped > 0) {
    console.log(`  - 跳过股票: ${totalSkipped}`);
  }
  console.log('');

  return {
    samples: allSamples,
    stats: {
      total: totalCount,
      positive: positiveCount,
      negative: negativeCount,
      skipped: totalSkipped,
    },
  };
}

/**
 * 获取特征名称列表
 * @returns {Array} 特征名称数组
 */
function getFeatureNames() {
  return [
    // A. 价格动量特征（8个）
    'return_1d',
    'return_3d',
    'return_5d',
    'return_10d',
    'ma5_deviation',
    'ma20_deviation',
    'ma60_deviation',
    'price_position',

    // B. 波动性特征（7个）
    'volatility_5d',
    'volatility_10d',
    'atr_normalized',
    'bb_width',
    'daily_amplitude',
    'max_amplitude_5d',
    'price_range_ratio',

    // C. 成交量特征（6个）
    'volume_ratio',
    'vol_change_5d',
    'vol_trend',
    'price_volume_corr',
    'up_vol_ratio',
    'money_flow_proxy',

    // D. 技术形态特征（11个）
    'body_size',
    'upper_shadow',
    'lower_shadow',
    'consecutive_up',
    'consecutive_down',
    'rsi_14',
    'macd_histogram',
    'day0_return',
    'day0_lower_shadow_ratio',
    'day0_upper_shadow_ratio',
    'day0_body_ratio',

    // E. 强逻辑特征（4个）
    'vol_breakout',
    'bullish_alignment',
    'low_vol_pullback',
    'relative_strength_proxy',
  ];
}

module.exports = {
  calculateFeaturesAt,
  extractStockFeatures,
  extractIndustryFeatures,
  getFeatureNames,
  // 导出辅助函数供测试使用
  calculateMA,
  calculateStd,
  calculateBollingerBands,
  calculateATR,
  calculateRSI,
  calculateMACDHistogram,
};
