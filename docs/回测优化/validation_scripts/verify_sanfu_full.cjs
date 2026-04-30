const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '三孚股份.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 三孚股份 - 技术指标验证 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);

// RSI计算函数
function calculateRSI(klineData, period = 14) {
  const len = klineData.length;
  const rsi = new Array(len).fill(null);
  if (len < period + 1) return rsi;

  const changes = [];
  for (let i = 1; i < len; i++) {
    changes.push(klineData[i].close - klineData[i - 1].close);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) {
      avgGain += changes[i];
    } else {
      avgLoss -= changes[i];
    }
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < len; i++) {
    const change = changes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - 100 / (1 + rs);
    }
  }

  return rsi;
}

// MACD计算函数
function calculateMACD(klineData, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const len = klineData.length;
  const macdLine = new Array(len).fill(null);
  const signalLine = new Array(len).fill(null);
  const histogram = new Array(len).fill(null);

  // 计算EMA
  function calculateEMA(data, period) {
    const ema = new Array(data.length).fill(null);
    const multiplier = 2 / (period + 1);

    // 第一个EMA使用SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    ema[period - 1] = sum / period;

    // 后续使用EMA公式
    for (let i = period; i < data.length; i++) {
      ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
    }

    return ema;
  }

  const closes = klineData.map((k) => k.close);
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  // 计算MACD线
  for (let i = slowPeriod - 1; i < len; i++) {
    macdLine[i] = fastEMA[i] - slowEMA[i];
  }

  // 计算信号线(MACD的EMA)
  const validMacd = macdLine.filter((v) => v !== null);
  const signalEMA = calculateEMA(validMacd, signalPeriod);

  // 填充信号线和柱状图
  let signalIdx = 0;
  for (let i = 0; i < len; i++) {
    if (macdLine[i] !== null && signalEMA[signalIdx] !== undefined) {
      signalLine[i] = signalEMA[signalIdx];
      histogram[i] = macdLine[i] - signalLine[i];
      signalIdx++;
    }
  }

  return { macdLine, signalLine, histogram };
}

// 布林带计算函数
function calculateBollingerBands(klineData, period = 20, stdDev = 2) {
  const len = klineData.length;
  const upper = new Array(len).fill(null);
  const middle = new Array(len).fill(null);
  const lower = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    const slice = klineData.slice(i - period + 1, i + 1).map((k) => k.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    middle[i] = mean;
    upper[i] = mean + stdDev * std;
    lower[i] = mean - stdDev * std;
  }

  return { upper, middle, lower };
}

// MA计算函数
function calculateMA(klineData, period = 20) {
  const len = klineData.length;
  const ma = new Array(len).fill(null);

  for (let i = period - 1; i < len; i++) {
    const slice = klineData.slice(i - period + 1, i + 1).map((k) => k.close);
    ma[i] = slice.reduce((a, b) => a + b, 0) / period;
  }

  return ma;
}

// 成交量分析函数
function analyzeVolume(klineData, targetIndex) {
  if (targetIndex < 5) return { volumeRatio: null, isShrinking: false };

  const currentVolume = klineData[targetIndex].volume;
  const avgVolume =
    klineData.slice(targetIndex - 5, targetIndex).reduce((sum, k) => sum + k.volume, 0) / 5;

  const volumeRatio = currentVolume / avgVolume;
  const isShrinking = volumeRatio < 0.8;

  return { volumeRatio, isShrinking };
}

// 需要验证的两个日期
const targetDates = [
  { date: '2025-12-22', label: '日期1 (2025-12-22)' },
  { date: '2026-04-01', label: '日期2 (2026-04-01)' },
];

targetDates.forEach((target) => {
  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === target.date;
  });

  if (targetIndex === -1) {
    console.log(`❌ ${target.label}: 未找到该日期的数据\n`);
    return;
  }

  console.log(`=== ${target.label} ===`);
  console.log(`索引: ${targetIndex}`);
  console.log(`收盘价: ${klineData[targetIndex].close}`);

  // 截取到目标日期的历史数据用于计算指标
  const historicalData = klineData.slice(0, targetIndex + 1);

  // 计算各种指标
  const rsi6 = calculateRSI(historicalData, 6);
  const rsi12 = calculateRSI(historicalData, 12);
  const macd = calculateMACD(historicalData);
  const bollinger = calculateBollingerBands(historicalData);
  const ma20 = calculateMA(historicalData, 20);
  const volumeAnalysis = analyzeVolume(historicalData, targetIndex);

  // 评估各个信号
  const lastIdx = historicalData.length - 1;

  // 1. RSI超卖信号
  const rsiOversold = rsi6[lastIdx] !== null && rsi6[lastIdx] < 30;
  console.log(`\n1. RSI(6): ${rsi6[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(`   RSI(12): ${rsi12[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(`   超卖信号: ${rsiOversold ? '✅ 是' : '❌ 否'}`);

  // 2. MACD金叉信号
  const goldenCross =
    macd.histogram[lastIdx] !== null &&
    macd.histogram[lastIdx] > 0 &&
    macd.histogram[lastIdx - 1] !== null &&
    macd.histogram[lastIdx - 1] <= 0;
  console.log(`\n2. MACD:`);
  console.log(`   MACD线: ${macd.macdLine[lastIdx]?.toFixed(4) || 'N/A'}`);
  console.log(`   信号线: ${macd.signalLine[lastIdx]?.toFixed(4) || 'N/A'}`);
  console.log(`   柱状图: ${macd.histogram[lastIdx]?.toFixed(4) || 'N/A'}`);
  console.log(`   金叉信号: ${goldenCross ? '✅ 是' : '❌ 否'}`);

  // 3. 布林带下轨信号
  const nearBollingerLower =
    bollinger.lower[lastIdx] !== null &&
    Math.abs(klineData[targetIndex].close - bollinger.lower[lastIdx]) / bollinger.lower[lastIdx] <
      0.02;
  console.log(`\n3. 布林带:`);
  console.log(`   上轨: ${bollinger.upper[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(`   中轨: ${bollinger.middle[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(`   下轨: ${bollinger.lower[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(`   接近下轨: ${nearBollingerLower ? '✅ 是' : '❌ 否'}`);

  // 4. MA20支撑信号
  const nearMA20 =
    ma20[lastIdx] !== null &&
    Math.abs(klineData[targetIndex].close - ma20[lastIdx]) / ma20[lastIdx] < 0.02;
  console.log(`\n4. MA20:`);
  console.log(`   MA20值: ${ma20[lastIdx]?.toFixed(2) || 'N/A'}`);
  console.log(
    `   价格偏离: ${
      ma20[lastIdx]
        ? (((klineData[targetIndex].close - ma20[lastIdx]) / ma20[lastIdx]) * 100).toFixed(2) + '%'
        : 'N/A'
    }`
  );
  console.log(`   MA20支撑: ${nearMA20 ? '✅ 是' : '❌ 否'}`);

  // 5. 成交量萎缩信号
  console.log(`\n5. 成交量:`);
  console.log(`   当日成交量: ${klineData[targetIndex].volume}`);
  console.log(
    `   5日均量: ${(volumeAnalysis.volumeRatio
      ? klineData[targetIndex].volume / volumeAnalysis.volumeRatio
      : 'N/A'
    ).toFixed(0)}`
  );
  console.log(`   量比: ${volumeAnalysis.volumeRatio?.toFixed(2) || 'N/A'}`);
  console.log(`   成交量萎缩: ${volumeAnalysis.isShrinking ? '✅ 是' : '❌ 否'}`);

  // 综合评估
  const signals = [
    { name: 'RSI超卖', active: rsiOversold },
    { name: 'MACD金叉', active: goldenCross },
    { name: '布林带下轨', active: nearBollingerLower },
    { name: 'MA20支撑', active: nearMA20 },
    { name: '成交量萎缩', active: volumeAnalysis.isShrinking },
  ];

  const activeSignals = signals.filter((s) => s.active);
  const shouldBuy = activeSignals.length >= 2;

  console.log(`\n--- 综合评估 ---`);
  console.log(`激活信号数: ${activeSignals.length}/5`);
  console.log(`激活的信号: ${activeSignals.map((s) => s.name).join(', ') || '无'}`);
  console.log(`是否触发买入: ${shouldBuy ? '✅ 是 (≥2个信号)' : '❌ 否 (<2个信号)'}`);

  // 检查次日表现
  if (targetIndex < klineData.length - 1) {
    const nextDay = klineData[targetIndex + 1];
    const nextDayReturn = (
      ((nextDay.close - klineData[targetIndex].close) / klineData[targetIndex].close) *
      100
    ).toFixed(2);
    console.log(
      `\n次日表现: ${nextDayReturn}% (${klineData[targetIndex].close} → ${nextDay.close})`
    );
  }

  console.log('\n' + '='.repeat(60) + '\n');
});

console.log('=== 验证完成 ===');
