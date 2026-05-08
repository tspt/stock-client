/**
 * 分析v4.0模型未覆盖买点的共同特征
 * 
 * 功能：
 * 1. 读取v4.0覆盖率报告
 * 2. 提取所有未覆盖的买点
 * 3. 从股票数据文件中获取这些买点的详细技术指标
 * 4. 统计分析未覆盖买点的共同特征
 */

const fs = require('fs');
const path = require('path');

// 配置路径
const COVERAGE_REPORT = path.join(__dirname, '..', '买点验证报告', 'BUYPOINT_COVERAGE_REPORT.v4.0.json');
const STOCK_DATA_DIR = path.join(__dirname, '..', '股票数据');
const OUTPUT_FILE = path.join(__dirname, '..', '买点验证报告', 'MISSED_BUYPOINTS_V4_FEATURE_ANALYSIS.json');

/**
 * 将时间戳转换为日期字符串 (YYYY-MM-DD)
 */
function timestampToDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 计算简单移动平均线 (SMA)
 */
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const sum = data.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * 计算RSI
 */
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * 计算MACD
 */
function calculateMACD(closes) {
  if (closes.length < 26) return { dif: null, dea: null, macd: null };
  
  // 简化版：只计算最后的值
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const dif = ema12 - ema26;
  
  // DEA需要历史DIF值，这里简化处理
  return { dif, dea: null, macd: null };
}

function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  
  return ema;
}

/**
 * 从股票数据文件中获取指定日期的K线数据和技术指标
 */
function getKLineDataAtDate(stockCode, targetDate) {
  // 查找对应的股票文件
  const files = fs.readdirSync(STOCK_DATA_DIR).filter(f => f.endsWith('.json'));
  
  for (const filename of files) {
    const filePath = path.join(STOCK_DATA_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(content);
      
      const code = jsonData.data?.code;
      if (!code || code !== stockCode) continue;
      
      const dailyLines = jsonData.data?.dailyLines || [];
      
      // 查找目标日期的K线索引
      let targetIndex = -1;
      for (let i = 0; i < dailyLines.length; i++) {
        const dateStr = timestampToDate(dailyLines[i].time);
        if (dateStr === targetDate) {
          targetIndex = i;
          break;
        }
      }
      
      if (targetIndex === -1) return null;
      
      const kline = dailyLines[targetIndex];
      
      // 计算技术指标
      const closes = dailyLines.slice(0, targetIndex + 1).map(k => k.close);
      const volumes = dailyLines.slice(0, targetIndex + 1).map(k => k.volume);
      
      const sma5 = calculateSMA(closes, 5);
      const sma10 = calculateSMA(closes, 10);
      const sma20 = calculateSMA(closes, 20);
      
      const volumeMA5 = calculateSMA(volumes, 5);
      const volumeRatio = volumeMA5 > 0 ? kline.volume / volumeMA5 : 1;
      
      const rsi = calculateRSI(closes, 14);
      const macdData = calculateMACD(closes);
      
      const changePercent = ((kline.close - kline.open) / kline.open * 100);
      const isBullish = kline.close >= kline.open;
      
      return {
        stockName: jsonData.data?.name || filename.replace('.json', ''),
        stockCode: code,
        date: targetDate,
        kline: {
          ...kline,
          changePercent: changePercent.toFixed(2),
          isBullish,
          aboveSMA5: sma5 ? kline.close > sma5 : null,
          aboveSMA10: sma10 ? kline.close > sma10 : null,
          aboveSMA20: sma20 ? kline.close > sma20 : null,
          volumeRatio: volumeRatio.toFixed(2),
          rsi: rsi ? rsi.toFixed(2) : null,
          dif: macdData.dif ? macdData.dif.toFixed(4) : null,
          dea: macdData.dea ? macdData.dea.toFixed(4) : null,
          macd: macdData.macd ? macdData.macd.toFixed(4) : null
        },
        indicators: {
          sma5,
          sma10,
          sma20,
          volumeMA5,
          rsi,
          ...macdData
        }
      };
    } catch (error) {
      console.error(`读取文件失败 ${filename}:`, error.message);
    }
  }
  
  return null;
}

/**
 * 分析未覆盖买点的特征
 */
function analyzeMissedBuyPoints() {
  console.log('🔍 开始分析v4.0模型未覆盖买点的特征...\n');
  
  // 读取覆盖率报告
  let coverageReport;
  try {
    coverageReport = JSON.parse(fs.readFileSync(COVERAGE_REPORT, 'utf-8'));
    console.log(`✅ 成功加载覆盖率报告`);
    console.log(`   版本: ${coverageReport.version}`);
    console.log(`   总买点数: ${coverageReport.totalManualPoints}`);
    console.log(`   未覆盖买点数: ${coverageReport.missedPoints}\n`);
  } catch (error) {
    console.error(`❌ 读取覆盖率报告失败: ${error.message}`);
    process.exit(1);
  }
  
  // 收集所有未覆盖的买点
  const missedBuyPoints = [];
  
  coverageReport.stocks.forEach(stock => {
    if (stock.missedDates && stock.missedDates.length > 0) {
      stock.missedDates.forEach(date => {
        const klineData = getKLineDataAtDate(stock.code, date);
        
        if (klineData) {
          missedBuyPoints.push({
            stockName: stock.name,
            stockCode: stock.code,
            date: date,
            kline: klineData.kline,
            indicators: klineData.indicators
          });
        } else {
          console.warn(`⚠️  未找到 ${stock.name} (${stock.code}) 在 ${date} 的K线数据`);
        }
      });
    }
  });
  
  console.log(`📊 共找到 ${missedBuyPoints.length} 个未覆盖买点\n`);
  
  // 统计分析
  const analysis = {
    version: '4.0',
    timestamp: new Date().toISOString(),
    totalMissedPoints: missedBuyPoints.length,
    summary: {},
    byStock: {},
    detailedAnalysis: missedBuyPoints
  };
  
  // 1. 按股票统计
  const stockStats = {};
  missedBuyPoints.forEach(bp => {
    if (!stockStats[bp.stockName]) {
      stockStats[bp.stockName] = {
        code: bp.stockCode,
        count: 0,
        dates: []
      };
    }
    stockStats[bp.stockName].count++;
    stockStats[bp.stockName].dates.push(bp.date);
  });
  
  analysis.byStock = stockStats;
  
  // 2. 价格形态分析
  const priceAnalysis = {
    bullishCount: 0,
    bearishCount: 0,
    avgChangePercent: 0,
    changePercentDistribution: {
      strongUp: 0,    // > 3%
      moderateUp: 0,  // 1-3%
      smallUp: 0,     // 0-1%
      smallDown: 0,   // 0 to -1%
      moderateDown: 0,// -1 to -3%
      strongDown: 0   // < -3%
    }
  };
  
  let totalChangePercent = 0;
  missedBuyPoints.forEach(bp => {
    const changePercent = parseFloat(bp.kline.changePercent || 0);
    totalChangePercent += changePercent;
    
    if (bp.kline.isBullish) {
      priceAnalysis.bullishCount++;
    } else {
      priceAnalysis.bearishCount++;
    }
    
    // 涨跌幅分布
    if (changePercent > 3) priceAnalysis.changePercentDistribution.strongUp++;
    else if (changePercent > 1) priceAnalysis.changePercentDistribution.moderateUp++;
    else if (changePercent > 0) priceAnalysis.changePercentDistribution.smallUp++;
    else if (changePercent > -1) priceAnalysis.changePercentDistribution.smallDown++;
    else if (changePercent > -3) priceAnalysis.changePercentDistribution.moderateDown++;
    else priceAnalysis.changePercentDistribution.strongDown++;
  });
  
  priceAnalysis.avgChangePercent = (totalChangePercent / missedBuyPoints.length).toFixed(2);
  analysis.summary.priceAnalysis = priceAnalysis;
  
  // 3. 成交量分析
  const volumeAnalysis = {
    avgVolumeRatio: 0,
    volumeRatioDistribution: {
      high: 0,      // > 1.5
      moderate: 0,  // 1.0-1.5
      low: 0        // < 1.0
    }
  };
  
  let totalVolumeRatio = 0;
  let validVolumeCount = 0;
  missedBuyPoints.forEach(bp => {
    const volumeRatio = parseFloat(bp.kline.volumeRatio || 0);
    if (volumeRatio > 0) {
      totalVolumeRatio += volumeRatio;
      validVolumeCount++;
      
      if (volumeRatio > 1.5) volumeAnalysis.volumeRatioDistribution.high++;
      else if (volumeRatio >= 1.0) volumeAnalysis.volumeRatioDistribution.moderate++;
      else volumeAnalysis.volumeRatioDistribution.low++;
    }
  });
  
  volumeAnalysis.avgVolumeRatio = validVolumeCount > 0 ? 
    (totalVolumeRatio / validVolumeCount).toFixed(2) : 0;
  analysis.summary.volumeAnalysis = volumeAnalysis;
  
  // 4. 均线关系分析
  const smaAnalysis = {
    aboveSMA5: 0,
    belowSMA5: 0,
    aboveSMA10: 0,
    belowSMA10: 0,
    aboveSMA20: 0,
    belowSMA20: 0,
    aboveAll: 0,      // 同时高于所有均线
    belowAll: 0,      // 同时低于所有均线
    mixed: 0          // 混合状态
  };
  
  missedBuyPoints.forEach(bp => {
    const above5 = bp.kline.aboveSMA5 === true;
    const above10 = bp.kline.aboveSMA10 === true;
    const above20 = bp.kline.aboveSMA20 === true;
    
    if (above5) smaAnalysis.aboveSMA5++;
    else smaAnalysis.belowSMA5++;
    
    if (above10) smaAnalysis.aboveSMA10++;
    else smaAnalysis.belowSMA10++;
    
    if (above20) smaAnalysis.aboveSMA20++;
    else smaAnalysis.belowSMA20++;
    
    if (above5 && above10 && above20) smaAnalysis.aboveAll++;
    else if (!above5 && !above10 && !above20) smaAnalysis.belowAll++;
    else smaAnalysis.mixed++;
  });
  
  analysis.summary.smaAnalysis = smaAnalysis;
  
  // 5. MACD分析
  const macdAnalysis = {
    difPositive: 0,
    difNegative: 0,
    macdPositive: 0,
    macdNegative: 0,
    goldenCross: 0,   // DIF上穿DEA
    deathCross: 0     // DIF下穿DEA
  };
  
  missedBuyPoints.forEach(bp => {
    const dif = parseFloat(bp.kline.dif || 0);
    const dea = parseFloat(bp.kline.dea || 0);
    const macd = parseFloat(bp.kline.macd || 0);
    
    if (dif > 0) macdAnalysis.difPositive++;
    else macdAnalysis.difNegative++;
    
    if (macd > 0) macdAnalysis.macdPositive++;
    else macdAnalysis.macdNegative++;
    
    // 金叉死叉判断（简化版）
    if (dif > dea && dif > 0) macdAnalysis.goldenCross++;
    else if (dif < dea && dif < 0) macdAnalysis.deathCross++;
  });
  
  analysis.summary.macdAnalysis = macdAnalysis;
  
  // 6. RSI分析
  const rsiAnalysis = {
    avgRSI: 0,
    rsiDistribution: {
      oversold: 0,    // < 30
      low: 0,         // 30-40
      neutral: 0,     // 40-60
      high: 0,        // 60-70
      overbought: 0   // > 70
    }
  };
  
  let totalRSI = 0;
  let validRSICount = 0;
  missedBuyPoints.forEach(bp => {
    const rsi = parseFloat(bp.kline.rsi || 0);
    if (rsi > 0) {
      totalRSI += rsi;
      validRSICount++;
      
      if (rsi < 30) rsiAnalysis.rsiDistribution.oversold++;
      else if (rsi < 40) rsiAnalysis.rsiDistribution.low++;
      else if (rsi < 60) rsiAnalysis.rsiDistribution.neutral++;
      else if (rsi < 70) rsiAnalysis.rsiDistribution.high++;
      else rsiAnalysis.rsiDistribution.overbought++;
    }
  });
  
  rsiAnalysis.avgRSI = validRSICount > 0 ? 
    (totalRSI / validRSICount).toFixed(2) : 0;
  analysis.summary.rsiAnalysis = rsiAnalysis;
  
  // 保存分析结果
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysis, null, 2), 'utf-8');
  console.log(`💾 分析结果已保存到: ${OUTPUT_FILE}\n`);
  
  // 输出总结
  console.log('='.repeat(80));
  console.log('📊 v4.0模型未覆盖买点特征分析总结');
  console.log('='.repeat(80));
  
  console.log('\n【价格形态】');
  console.log(`  阳线数量: ${priceAnalysis.bullishCount} (${((priceAnalysis.bullishCount/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  阴线数量: ${priceAnalysis.bearishCount} (${((priceAnalysis.bearishCount/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  平均涨跌幅: ${priceAnalysis.avgChangePercent}%`);
  console.log(`  涨跌幅分布:`);
  console.log(`    大涨(>3%): ${priceAnalysis.changePercentDistribution.strongUp}`);
  console.log(`    中涨(1-3%): ${priceAnalysis.changePercentDistribution.moderateUp}`);
  console.log(`    小涨(0-1%): ${priceAnalysis.changePercentDistribution.smallUp}`);
  console.log(`    小跌(0~-1%): ${priceAnalysis.changePercentDistribution.smallDown}`);
  console.log(`    中跌(-1~-3%): ${priceAnalysis.changePercentDistribution.moderateDown}`);
  console.log(`    大跌(<-3%): ${priceAnalysis.changePercentDistribution.strongDown}`);
  
  console.log('\n【成交量】');
  console.log(`  平均量比: ${volumeAnalysis.avgVolumeRatio}`);
  console.log(`  量比分布:`);
  console.log(`    放量(>1.5): ${volumeAnalysis.volumeRatioDistribution.high}`);
  console.log(`    平量(1.0-1.5): ${volumeAnalysis.volumeRatioDistribution.moderate}`);
  console.log(`    缩量(<1.0): ${volumeAnalysis.volumeRatioDistribution.low}`);
  
  console.log('\n【均线关系】');
  console.log(`  高于MA5: ${smaAnalysis.aboveSMA5} (${((smaAnalysis.aboveSMA5/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  高于MA10: ${smaAnalysis.aboveSMA10} (${((smaAnalysis.aboveSMA10/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  高于MA20: ${smaAnalysis.aboveSMA20} (${((smaAnalysis.aboveSMA20/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  同时高于所有均线: ${smaAnalysis.aboveAll} (${((smaAnalysis.aboveAll/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  同时低于所有均线: ${smaAnalysis.belowAll} (${((smaAnalysis.belowAll/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  混合状态: ${smaAnalysis.mixed} (${((smaAnalysis.mixed/missedBuyPoints.length)*100).toFixed(1)}%)`);
  
  console.log('\n【MACD】');
  console.log(`  DIF为正: ${macdAnalysis.difPositive} (${((macdAnalysis.difPositive/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  DIF为负: ${macdAnalysis.difNegative} (${((macdAnalysis.difNegative/missedBuyPoints.length)*100).toFixed(1)}%)`);
  console.log(`  MACD柱为正: ${macdAnalysis.macdPositive} (${((macdAnalysis.macdPositive/missedBuyPoints.length)*100).toFixed(1)}%)`);
  
  console.log('\n【RSI】');
  console.log(`  平均RSI: ${rsiAnalysis.avgRSI}`);
  console.log(`  RSI分布:`);
  console.log(`    超卖(<30): ${rsiAnalysis.rsiDistribution.oversold}`);
  console.log(`    偏低(30-40): ${rsiAnalysis.rsiDistribution.low}`);
  console.log(`    中性(40-60): ${rsiAnalysis.rsiDistribution.neutral}`);
  console.log(`    偏高(60-70): ${rsiAnalysis.rsiDistribution.high}`);
  console.log(`    超买(>70): ${rsiAnalysis.rsiDistribution.overbought}`);
  
  console.log('\n【按股票统计 - 未覆盖最多的前10只股票】');
  const sortedStocks = Object.entries(stockStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  
  sortedStocks.forEach(([name, stats]) => {
    console.log(`  ${name} (${stats.code}): ${stats.count}个未覆盖买点`);
    console.log(`    日期: ${stats.dates.join(', ')}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ 分析完成！');
  console.log('='.repeat(80));
  
  // ==================== 买点聚类分析 ====================
  console.log('\n\n🔍 开始对未覆盖买点进行聚类分析...\n');
  
  const clusters = {
    'MACD柱为负型': [],      // MACD柱 < 0
    '缩量整理型': [],        // 量比 < 1.0
    '小幅波动型': [],        // 涨跌幅在 -1% 到 +1%
    '均线突破型': [],        // 价格刚突破均线
    '其他类型': []           // 不符合以上任何一类
  };
  
  missedBuyPoints.forEach(bp => {
    const changePercent = parseFloat(bp.kline.changePercent || 0);
    const volumeRatio = parseFloat(bp.kline.volumeRatio || 0);
    const macd = parseFloat(bp.kline.macd || 0);
    const dif = parseFloat(bp.kline.dif || 0);
    
    let classified = false;
    
    // 类型1: MACD柱为负型（最关键的特征）
    if (macd < 0) {
      clusters['MACD柱为负型'].push({
        ...bp,
        reason: `MACD柱=${macd.toFixed(4)} < 0, DIF=${dif > 0 ? '正' : '负'}`
      });
      classified = true;
    }
    
    // 类型2: 缩量整理型
    if (!classified && volumeRatio < 1.0) {
      clusters['缩量整理型'].push({
        ...bp,
        reason: `量比=${volumeRatio.toFixed(2)} < 1.0, 涨跌幅=${changePercent.toFixed(2)}%`
      });
      classified = true;
    }
    
    // 类型3: 小幅波动型
    if (!classified && Math.abs(changePercent) <= 1.0) {
      clusters['小幅波动型'].push({
        ...bp,
        reason: `涨跌幅=${changePercent.toFixed(2)}%, 量比=${volumeRatio.toFixed(2)}`
      });
      classified = true;
    }
    
    // 类型4: 均线突破型（价格在均线附近）
    if (!classified) {
      const above5 = bp.kline.aboveSMA5 === true;
      const above10 = bp.kline.aboveSMA10 === true;
      const above20 = bp.kline.aboveSMA20 === true;
      
      // 如果价格刚突破某条均线（之前低于，现在高于）
      if ((above5 && !above10) || (above10 && !above20)) {
        clusters['均线突破型'].push({
          ...bp,
          reason: `MA5:${above5?'上':'下'}, MA10:${above10?'上':'下'}, MA20:${above20?'上':'下'}`
        });
        classified = true;
      }
    }
    
    // 其他类型
    if (!classified) {
      clusters['其他类型'].push(bp);
    }
  });
  
  // 输出聚类结果
  console.log('='.repeat(80));
  console.log('📊 未覆盖买点聚类分析结果');
  console.log('='.repeat(80));
  
  Object.entries(clusters).forEach(([clusterName, points]) => {
    if (points.length > 0) {
      const percentage = ((points.length / missedBuyPoints.length) * 100).toFixed(1);
      console.log(`\n【${clusterName}】 ${points.length}个 (${percentage}%)`);
      console.log('-'.repeat(80));
      
      // 显示该类别的典型案例（最多5个）
      points.slice(0, 5).forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.stockName} (${p.stockCode}) - ${p.date}`);
        if (p.reason) {
          console.log(`     特征: ${p.reason}`);
        }
      });
      
      if (points.length > 5) {
        console.log(`  ... 还有 ${points.length - 5} 个类似买点`);
      }
    }
  });
  
  // 保存聚类结果
  const clusterOutputPath = path.join(__dirname, '..', '买点验证报告', 'MISSED_BUYPOINTS_CLUSTER_ANALYSIS.json');
  fs.writeFileSync(clusterOutputPath, JSON.stringify(clusters, null, 2), 'utf-8');
  console.log(`\n💾 聚类分析结果已保存到: ${clusterOutputPath}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ 聚类分析完成！');
  console.log('='.repeat(80));
}

// 执行分析
analyzeMissedBuyPoints();
