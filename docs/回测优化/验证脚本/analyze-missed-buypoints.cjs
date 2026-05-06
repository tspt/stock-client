/**
 * 分析未覆盖买点的K线特征
 *
 * 功能：
 * 1. 提取所有未覆盖日期的K线数据
 * 2. 计算技术指标（MA、MACD、RSI、成交量等）
 * 3. 对比已覆盖日期的特征
 * 4. 找出共同模式和差异
 */

const fs = require('fs');
const path = require('path');

// 配置路径
const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');
const EXPORT_FILE = path.join(__dirname, '..', '历史回测数据', 'backtest_export_latest.json');
const COVERAGE_REPORT = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.json');

/**
 * 计算简单移动平均线
 */
function calculateSMA(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * 计算指数移动平均线
 */
function calculateEMA(data, period) {
  const result = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  // 需要至少period个数据点
  if (data.length < period) {
    return result;
  }

  // 第一个EMA使用SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  result[period - 1] = sum / period;

  // 后续使用EMA公式
  for (let i = period; i < data.length; i++) {
    result[i] = (data[i].close - result[i - 1]) * multiplier + result[i - 1];
  }

  return result;
}

/**
 * 计算MACD
 */
function calculateMACD(data) {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);

  const dif = [];
  for (let i = 0; i < data.length; i++) {
    if (ema12[i] === null || ema26[i] === null) {
      dif.push(null);
    } else {
      dif.push(ema12[i] - ema26[i]);
    }
  }

  // DEA (DIF的9日EMA)
  const validDif = dif.filter((v) => v !== null);
  const deaValues = [];

  if (validDif.length >= 9) {
    // 计算第一个DEA（前9个DIF的平均值）
    let sum = 0;
    for (let i = 0; i < 9 && i < validDif.length; i++) {
      sum += validDif[i];
    }
    deaValues.push(sum / 9);

    // 计算后续DEA
    const multiplier = 2 / (9 + 1);
    for (let i = 9; i < validDif.length; i++) {
      const dea =
        (validDif[i] - deaValues[deaValues.length - 1]) * multiplier +
        deaValues[deaValues.length - 1];
      deaValues.push(dea);
    }
  }

  // 将DEA映射回原始长度
  const dea = [];
  let deaIndex = 0;
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] === null) {
      dea.push(null);
    } else {
      if (deaIndex < deaValues.length) {
        dea.push(deaValues[deaIndex]);
        deaIndex++;
      } else {
        dea.push(null);
      }
    }
  }

  // MACD柱状图
  const macd = [];
  for (let i = 0; i < dif.length; i++) {
    if (dif[i] === null || dea[i] === null) {
      macd.push(null);
    } else {
      macd.push((dif[i] - dea[i]) * 2);
    }
  }

  return { dif, dea, macd };
}

/**
 * 计算RSI
 */
function calculateRSI(data, period = 14) {
  const result = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = 0; j < period; j++) {
      const change = data[i - j].close - data[i - j - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);
      result.push(rsi);
    }
  }

  return result;
}

/**
 * 计算成交量均线
 */
function calculateVolumeMA(data, period = 5) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].volume;
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * 从日期字符串获取索引
 */
function getDateIndex(dailyLines, targetDate) {
  // 将目标日期转换为时间戳（当天0点）
  const targetTime = new Date(targetDate).setHours(0, 0, 0, 0);

  for (let i = 0; i < dailyLines.length; i++) {
    const lineTime = new Date(dailyLines[i].time).setHours(0, 0, 0, 0);
    if (lineTime === targetTime) {
      return i;
    }
  }

  return -1;
}

/**
 * 提取指定日期的K线特征
 */
function extractFeatures(dailyLines, targetDate) {
  const index = getDateIndex(dailyLines, targetDate);

  if (index === -1) {
    console.warn(`⚠️  未找到日期 ${targetDate} 的数据`);
    return null;
  }

  // 确保有足够的前置数据
  if (index < 26) {
    console.warn(`⚠️  日期 ${targetDate} 前置数据不足`);
    return null;
  }

  // 截取到目标日期的数据
  const dataSlice = dailyLines.slice(0, index + 1);

  // 计算技术指标
  const sma5 = calculateSMA(dataSlice, 5);
  const sma10 = calculateSMA(dataSlice, 10);
  const sma20 = calculateSMA(dataSlice, 20);
  const macd = calculateMACD(dataSlice);
  const rsi = calculateRSI(dataSlice, 14);
  const volumeMA5 = calculateVolumeMA(dataSlice, 5);

  const currentDay = dataSlice[index];
  const prevDay = dataSlice[index - 1];

  // 计算涨跌幅
  const changePercent = ((currentDay.close - prevDay.close) / prevDay.close) * 100;

  // 计算相对位置
  const priceRange = currentDay.high - currentDay.low;
  const bodySize = Math.abs(currentDay.close - currentDay.open);
  const upperShadow = currentDay.high - Math.max(currentDay.open, currentDay.close);
  const lowerShadow = Math.min(currentDay.open, currentDay.close) - currentDay.low;

  // 判断是否阳线
  const isBullish = currentDay.close > currentDay.open;

  // 成交量倍数
  const volumeRatio = volumeMA5[index] ? currentDay.volume / volumeMA5[index] : null;

  // 价格与均线关系
  const aboveSMA5 = sma5[index] ? currentDay.close > sma5[index] : null;
  const aboveSMA10 = sma10[index] ? currentDay.close > sma10[index] : null;
  const aboveSMA20 = sma20[index] ? currentDay.close > sma20[index] : null;

  // MACD状态
  const difPositive = macd.dif[index] ? macd.dif[index] > 0 : null;
  const macdPositive = macd.macd[index] ? macd.macd[index] > 0 : null;

  // RSI区间
  const rsiValue = rsi[index];
  const rsiOversold = rsiValue ? rsiValue < 30 : null;
  const rsiOverbought = rsiValue ? rsiValue > 70 : null;

  return {
    date: targetDate,
    index,
    price: {
      open: currentDay.open,
      close: currentDay.close,
      high: currentDay.high,
      low: currentDay.low,
      changePercent: changePercent.toFixed(2),
      isBullish,
      bodySize: bodySize.toFixed(2),
      upperShadow: upperShadow.toFixed(2),
      lowerShadow: lowerShadow.toFixed(2),
    },
    volume: {
      value: currentDay.volume,
      volumeMA5: volumeMA5[index] ? volumeMA5[index].toFixed(0) : null,
      volumeRatio: volumeRatio ? volumeRatio.toFixed(2) : null,
    },
    indicators: {
      sma5: sma5[index] ? sma5[index].toFixed(2) : null,
      sma10: sma10[index] ? sma10[index].toFixed(2) : null,
      sma20: sma20[index] ? sma20[index].toFixed(2) : null,
      aboveSMA5,
      aboveSMA10,
      aboveSMA20,
      dif: macd.dif[index] ? macd.dif[index].toFixed(4) : null,
      dea: macd.dea[index] ? macd.dea[index].toFixed(4) : null,
      macd: macd.macd[index] ? macd.macd[index].toFixed(4) : null,
      difPositive,
      macdPositive,
      rsi: rsiValue ? rsiValue.toFixed(2) : null,
      rsiOversold,
      rsiOverbought,
    },
  };
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始分析未覆盖买点的K线特征...\n');

  // 读取覆盖率报告
  let coverageReport;
  try {
    coverageReport = JSON.parse(fs.readFileSync(COVERAGE_REPORT, 'utf-8'));
    console.log(`✅ 成功加载覆盖率报告\n`);
  } catch (error) {
    console.error(`❌ 读取覆盖率报告失败: ${error.message}`);
    process.exit(1);
  }

  // 筛选出有未覆盖买点的股票
  const stocksToAnalyze = coverageReport.stocks.filter((s) => s.missedCount > 0);
  console.log(`📊 需要分析的股票: ${stocksToAnalyze.length} 只\n`);

  const analysisResults = [];

  // 遍历每只股票
  for (const stock of stocksToAnalyze) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📈 分析: ${stock.name} (${stock.code})`);
    console.log(`   未覆盖日期: ${stock.missedDates.join(', ')}`);
    console.log('='.repeat(80));

    // 读取股票数据文件
    const filename = `${stock.name}.txt`;
    const filePath = path.join(STOCK_DATA_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  文件不存在: ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // 移除末尾的"日期买点："行，只保留JSON部分
    const jsonEndMatch = content.match(/^\}/m);
    let jsonContent = content;
    if (jsonEndMatch) {
      jsonContent = content.substring(0, jsonEndMatch.index + 1);
    }

    const stockData = JSON.parse(jsonContent);

    // 分析每个未覆盖日期
    const missedAnalysis = [];

    for (const missedDate of stock.missedDates) {
      console.log(`\n  📅 分析日期: ${missedDate}`);

      const features = extractFeatures(stockData.dailyLines, missedDate);

      if (features) {
        missedAnalysis.push(features);

        // 输出关键信息
        console.log(`     价格: ¥${features.price.close} (${features.price.changePercent}%)`);
        console.log(
          `     K线: ${features.price.isBullish ? '阳线' : '阴线'}, 实体: ${
            features.price.bodySize
          }`
        );
        console.log(`     成交量: ${features.volume.volumeRatio}x 均量`);
        console.log(
          `     均线: 5日=${features.indicators.sma5}, 10日=${features.indicators.sma10}, 20日=${features.indicators.sma20}`
        );
        console.log(
          `     MACD: DIF=${features.indicators.dif}, DEA=${features.indicators.dea}, MACD=${features.indicators.macd}`
        );
        console.log(`     RSI: ${features.indicators.rsi}`);
      } else {
        console.log(`     ⚠️  无法提取特征`);
      }
    }

    analysisResults.push({
      name: stock.name,
      code: stock.code,
      missedCount: stock.missedCount,
      analysis: missedAnalysis,
    });
  }

  // 保存分析结果
  const outputPath = path.join(__dirname, '..', '买点验证', 'MISSED_BUYPOINTS_ANALYSIS.json');
  fs.writeFileSync(outputPath, JSON.stringify(analysisResults, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(80));
  console.log('📊 分析完成！');
  console.log('='.repeat(80));
  console.log(`详细结果已保存到: ${outputPath}\n`);

  // 生成总结统计
  console.log('📈 特征统计摘要:\n');

  let totalAnalyzed = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let avgChangePercent = 0;
  let aboveSMA5Count = 0;
  let macdPositiveCount = 0;
  let rsiOversoldCount = 0;

  analysisResults.forEach((stock) => {
    stock.analysis.forEach((day) => {
      totalAnalyzed++;
      if (day.price.isBullish) bullishCount++;
      else bearishCount++;

      avgChangePercent += parseFloat(day.price.changePercent);

      if (day.indicators.aboveSMA5) aboveSMA5Count++;
      if (day.indicators.macdPositive) macdPositiveCount++;
      if (day.indicators.rsiOversold) rsiOversoldCount++;
    });
  });

  if (totalAnalyzed > 0) {
    console.log(`总分析日期数: ${totalAnalyzed}`);
    console.log(
      `阳线/阴线: ${bullishCount}/${bearishCount} (${((bullishCount / totalAnalyzed) * 100).toFixed(
        1
      )}% 阳线)`
    );
    console.log(`平均涨跌幅: ${(avgChangePercent / totalAnalyzed).toFixed(2)}%`);
    console.log(
      `在5日均线上方: ${aboveSMA5Count}/${totalAnalyzed} (${(
        (aboveSMA5Count / totalAnalyzed) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `MACD为正: ${macdPositiveCount}/${totalAnalyzed} (${(
        (macdPositiveCount / totalAnalyzed) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `RSI超卖(<30): ${rsiOversoldCount}/${totalAnalyzed} (${(
        (rsiOversoldCount / totalAnalyzed) *
        100
      ).toFixed(1)}%)`
    );
  }

  console.log('\n💡 下一步建议:');
  console.log('1. 查看 MISSED_BUYPOINTS_ANALYSIS.json 了解每个日期的详细特征');
  console.log('2. 对比已覆盖日期的特征，找出差异');
  console.log('3. 根据共同模式调整模型规则');
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
