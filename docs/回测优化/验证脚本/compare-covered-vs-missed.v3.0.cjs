/**
 * 对比已覆盖和未覆盖买点的特征差异
 *
 * 功能：
 * 1. 提取已覆盖日期的K线特征
 * 2. 与未覆盖日期进行对比
 * 3. 找出关键差异
 * 4. 生成优化建议
 *
 * 版本: v3.0
 * 创建时间: 2026-05-08
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

  if (data.length < period) {
    return result;
  }

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  result[period - 1] = sum / period;

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

  const validDif = dif.filter((v) => v !== null);
  const deaValues = [];

  if (validDif.length >= 9) {
    let sum = 0;
    for (let i = 0; i < 9 && i < validDif.length; i++) {
      sum += validDif[i];
    }
    deaValues.push(sum / 9);

    const multiplier = 2 / (9 + 1);
    for (let i = 9; i < validDif.length; i++) {
      const dea =
        (validDif[i] - deaValues[deaValues.length - 1]) * multiplier +
        deaValues[deaValues.length - 1];
      deaValues.push(dea);
    }
  }

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

  if (index === -1 || index < 26) {
    return null;
  }

  const dataSlice = dailyLines.slice(0, index + 1);

  const sma5 = calculateSMA(dataSlice, 5);
  const sma10 = calculateSMA(dataSlice, 10);
  const sma20 = calculateSMA(dataSlice, 20);
  const macd = calculateMACD(dataSlice);
  const rsi = calculateRSI(dataSlice, 14);
  const volumeMA5 = calculateVolumeMA(dataSlice, 5);

  const currentDay = dataSlice[index];
  const prevDay = dataSlice[index - 1];

  const changePercent = ((currentDay.close - prevDay.close) / prevDay.close) * 100;
  const bodySize = Math.abs(currentDay.close - currentDay.open);
  const isBullish = currentDay.close > currentDay.open;
  const volumeRatio = volumeMA5[index] ? currentDay.volume / volumeMA5[index] : null;

  return {
    date: targetDate,
    changePercent: parseFloat(changePercent.toFixed(2)),
    isBullish,
    bodySize: parseFloat(bodySize.toFixed(2)),
    volumeRatio: volumeRatio ? parseFloat(volumeRatio.toFixed(2)) : null,
    aboveSMA5: sma5[index] ? currentDay.close > sma5[index] : null,
    aboveSMA10: sma10[index] ? currentDay.close > sma10[index] : null,
    aboveSMA20: sma20[index] ? currentDay.close > sma20[index] : null,
    rsi: rsi[index] ? parseFloat(rsi[index].toFixed(2)) : null,
    dif: macd.dif[index] ? parseFloat(macd.dif[index].toFixed(4)) : null,
    macd: macd.macd[index] ? parseFloat(macd.macd[index].toFixed(4)) : null,
  };
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 开始对比已覆盖vs未覆盖买点的特征...\n');

  // 读取覆盖率报告
  let coverageReport;
  try {
    coverageReport = JSON.parse(fs.readFileSync(COVERAGE_REPORT, 'utf-8'));
    console.log(`✅ 成功加载覆盖率报告\n`);
  } catch (error) {
    console.error(`❌ 读取覆盖率报告失败: ${error.message}`);
    process.exit(1);
  }

  // 读取导出文件
  let exportData;
  try {
    exportData = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf-8'));
  } catch (error) {
    console.error(`❌ 读取导出文件失败: ${error.message}`);
    process.exit(1);
  }

  const coveredFeatures = [];
  const missedFeatures = [];

  // 遍历所有有手动买点的股票
  const stocksWithBuyPoints = coverageReport.stocks.filter((s) => s.manualCount > 0);

  console.log(`📊 需要分析的股票: ${stocksWithBuyPoints.length} 只\n`);

  for (const stock of stocksWithBuyPoints) {
    const filename = `${stock.name}.txt`;
    const filePath = path.join(STOCK_DATA_DIR, filename);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonEndMatch = content.match(/^\}/m);
    let jsonContent = content;
    if (jsonEndMatch) {
      jsonContent = content.substring(0, jsonEndMatch.index + 1);
    }

    const stockData = JSON.parse(jsonContent);

    // 提取已覆盖日期的特征
    for (const coveredDate of stock.coveredDates) {
      const features = extractFeatures(stockData.dailyLines, coveredDate);
      if (features) {
        features.stockName = stock.name;
        features.stockCode = stock.code;
        features.type = 'covered';
        coveredFeatures.push(features);
      }
    }

    // 提取未覆盖日期的特征
    for (const missedDate of stock.missedDates) {
      const features = extractFeatures(stockData.dailyLines, missedDate);
      if (features) {
        features.stockName = stock.name;
        features.stockCode = stock.code;
        features.type = 'missed';
        missedFeatures.push(features);
      }
    }
  }

  console.log(`✅ 已覆盖日期特征: ${coveredFeatures.length} 个`);
  console.log(`✅ 未覆盖日期特征: ${missedFeatures.length} 个\n`);

  // 统计分析
  function analyzeFeatures(features, label) {
    const total = features.length;
    if (total === 0) return null;

    const bullishCount = features.filter((f) => f.isBullish).length;
    const avgChange = features.reduce((sum, f) => sum + f.changePercent, 0) / total;
    const avgBodySize = features.reduce((sum, f) => sum + f.bodySize, 0) / total;

    const volumeRatios = features.filter((f) => f.volumeRatio !== null).map((f) => f.volumeRatio);
    const avgVolumeRatio =
      volumeRatios.length > 0
        ? volumeRatios.reduce((sum, v) => sum + v, 0) / volumeRatios.length
        : null;

    const aboveSMA5Count = features.filter((f) => f.aboveSMA5).length;
    const aboveSMA10Count = features.filter((f) => f.aboveSMA10).length;
    const aboveSMA20Count = features.filter((f) => f.aboveSMA20).length;

    const rsiValues = features.filter((f) => f.rsi !== null).map((f) => f.rsi);
    const avgRSI =
      rsiValues.length > 0 ? rsiValues.reduce((sum, v) => sum + v, 0) / rsiValues.length : null;

    return {
      label,
      total,
      bullishPercent: ((bullishCount / total) * 100).toFixed(1),
      avgChange: avgChange.toFixed(2),
      avgBodySize: avgBodySize.toFixed(2),
      avgVolumeRatio: avgVolumeRatio ? avgVolumeRatio.toFixed(2) : 'N/A',
      aboveSMA5Percent: ((aboveSMA5Count / total) * 100).toFixed(1),
      aboveSMA10Percent: ((aboveSMA10Count / total) * 100).toFixed(1),
      aboveSMA20Percent: ((aboveSMA20Count / total) * 100).toFixed(1),
      avgRSI: avgRSI ? avgRSI.toFixed(2) : 'N/A',
    };
  }

  const coveredStats = analyzeFeatures(coveredFeatures, '已覆盖买点');
  const missedStats = analyzeFeatures(missedFeatures, '未覆盖买点');

  console.log('='.repeat(80));
  console.log('📊 特征对比分析');
  console.log('='.repeat(80));
  console.log('\n指标                | 已覆盖买点      | 未覆盖买点      | 差异');
  console.log('-'.repeat(80));
  console.log(
    `样本数量            | ${coveredStats.total.toString().padStart(6)}       | ${missedStats.total
      .toString()
      .padStart(6)}       | -`
  );
  console.log(
    `阳线比例            | ${coveredStats.bullishPercent.padStart(
      5
    )}%      | ${missedStats.bullishPercent.padStart(5)}%      | ${(
      parseFloat(coveredStats.bullishPercent) - parseFloat(missedStats.bullishPercent)
    ).toFixed(1)}%`
  );
  console.log(
    `平均涨跌幅          | ${coveredStats.avgChange.padStart(
      7
    )}%     | ${missedStats.avgChange.padStart(7)}%     | ${(
      parseFloat(coveredStats.avgChange) - parseFloat(missedStats.avgChange)
    ).toFixed(2)}%`
  );
  console.log(
    `平均实体大小        | ${coveredStats.avgBodySize.padStart(
      7
    )}       | ${missedStats.avgBodySize.padStart(7)}       | ${(
      parseFloat(coveredStats.avgBodySize) - parseFloat(missedStats.avgBodySize)
    ).toFixed(2)}`
  );
  console.log(
    `平均成交量倍数      | ${coveredStats.avgVolumeRatio.padStart(
      7
    )}       | ${missedStats.avgVolumeRatio.padStart(7)}       | ${
      coveredStats.avgVolumeRatio !== 'N/A' && missedStats.avgVolumeRatio !== 'N/A'
        ? (
            parseFloat(coveredStats.avgVolumeRatio) - parseFloat(missedStats.avgVolumeRatio)
          ).toFixed(2)
        : 'N/A'
    }`
  );
  console.log(
    `在5日均线上方比例   | ${coveredStats.aboveSMA5Percent.padStart(
      5
    )}%      | ${missedStats.aboveSMA5Percent.padStart(5)}%      | ${(
      parseFloat(coveredStats.aboveSMA5Percent) - parseFloat(missedStats.aboveSMA5Percent)
    ).toFixed(1)}%`
  );
  console.log(
    `在10日均线上方比例  | ${coveredStats.aboveSMA10Percent.padStart(
      5
    )}%      | ${missedStats.aboveSMA10Percent.padStart(5)}%      | ${(
      parseFloat(coveredStats.aboveSMA10Percent) - parseFloat(missedStats.aboveSMA10Percent)
    ).toFixed(1)}%`
  );
  console.log(
    `在20日均线上方比例  | ${coveredStats.aboveSMA20Percent.padStart(
      5
    )}%      | ${missedStats.aboveSMA20Percent.padStart(5)}%      | ${(
      parseFloat(coveredStats.aboveSMA20Percent) - parseFloat(missedStats.aboveSMA20Percent)
    ).toFixed(1)}%`
  );
  console.log(
    `平均RSI             | ${coveredStats.avgRSI.padStart(7)}       | ${missedStats.avgRSI.padStart(
      7
    )}       | ${
      coveredStats.avgRSI !== 'N/A' && missedStats.avgRSI !== 'N/A'
        ? (parseFloat(coveredStats.avgRSI) - parseFloat(missedStats.avgRSI)).toFixed(2)
        : 'N/A'
    }`
  );
  console.log('='.repeat(80));

  // 保存对比结果
  const outputPath = path.join(
    __dirname,
    '..',
    '买点验证报告',
    'COVERED_VS_MISSED_COMPARISON.json'
  );
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        coveredFeatures,
        missedFeatures,
        coveredStats,
        missedStats,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log(`\n💾 详细对比数据已保存到: ${outputPath}\n`);

  // 生成优化建议
  console.log('💡 优化建议:\n');

  const changeDiff = parseFloat(coveredStats.avgChange) - parseFloat(missedStats.avgChange);
  const volumeDiff =
    coveredStats.avgVolumeRatio !== 'N/A' && missedStats.avgVolumeRatio !== 'N/A'
      ? parseFloat(coveredStats.avgVolumeRatio) - parseFloat(missedStats.avgVolumeRatio)
      : 0;
  const sma5Diff =
    parseFloat(coveredStats.aboveSMA5Percent) - parseFloat(missedStats.aboveSMA5Percent);

  if (Math.abs(changeDiff) < 1) {
    console.log('1. ✅ 涨跌幅差异不大，说明模型不应仅依赖涨幅判断');
  } else if (changeDiff > 0) {
    console.log(`1. ⚠️  已覆盖买点平均涨幅更高(${changeDiff.toFixed(2)}%)，可能需要降低涨幅阈值`);
  }

  if (Math.abs(volumeDiff) < 0.2) {
    console.log('2. ✅ 成交量差异不大，说明模型不应过度依赖放量');
  } else if (volumeDiff > 0) {
    console.log(`2. ⚠️  已覆盖买点成交量更大(${volumeDiff.toFixed(2)}x)，可能需要降低成交量要求`);
  }

  if (sma5Diff < 10) {
    console.log('3. ✅ 均线位置差异不大，说明站上均线的条件可能合理');
  } else {
    console.log(`3. ⚠️  已覆盖买点更多站在均线上方(${sma5Diff.toFixed(1)}%)，可能需要放宽均线条件`);
  }

  console.log('\n4. 💡 建议采用多指标投票机制，而非单一条件硬性过滤');
  console.log('5. 💡 考虑新增左侧交易规则，捕捉超跌反弹机会');
  console.log('6. 💡 考虑新增突破规则，捕捉温和上涨的买点');
}

main().catch((error) => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
