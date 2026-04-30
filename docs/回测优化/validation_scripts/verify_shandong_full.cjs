/**
 * 山东玻纤 - 完整技术指标验证脚本
 */

const fs = require('fs');
const path = require('path');

// ==================== 技术指标计算函数 ====================

function calculateRSI(klineData, period = 14) {
  const len = klineData.length;
  const rsi = new Array(len).fill(null);
  if (len < period + 1) return rsi;

  const changes = [];
  for (let i = 1; i < len; i++) {
    changes.push(klineData[i].close - klineData[i - 1].close);
  }

  let avgGain = 0,
    avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) rsi[period] = 100;
  else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);
  }

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) rsi[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      rsi[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return rsi;
}

function calculateEMA(data, period) {
  const ema = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  ema[period - 1] = sum / period;

  // Calculate rest
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

function calculateMACD(klineData, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const closes = klineData.map((k) => k.close);
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const dif = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif[i] = emaFast[i] - emaSlow[i];
    }
  }

  const dea = calculateEMA(
    dif.filter((v) => v !== null),
    signalPeriod
  );

  // Align DEA with original array
  const alignedDEA = new Array(closes.length).fill(null);
  let deaIndex = 0;
  for (let i = 0; i < closes.length; i++) {
    if (dif[i] !== null) {
      if (deaIndex < dea.length && dea[deaIndex] !== null) {
        alignedDEA[i] = dea[deaIndex];
      }
      deaIndex++;
    }
  }

  const macd = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (dif[i] !== null && alignedDEA[i] !== null) {
      macd[i] = (dif[i] - alignedDEA[i]) * 2;
    }
  }

  return { dif, dea: alignedDEA, macd };
}

function calculateBollingerBands(klineData, period = 20, stdDev = 2) {
  const closes = klineData.map((k) => k.close);
  const upper = new Array(closes.length).fill(null);
  const middle = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    middle[i] = mean;
    upper[i] = mean + stdDev * std;
    lower[i] = mean - stdDev * std;
  }

  return { upper, middle, lower };
}

function calculateMA(klineData, period) {
  const closes = klineData.map((k) => k.close);
  const ma = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    ma[i] = slice.reduce((sum, val) => sum + val, 0) / period;
  }

  return ma;
}

function calculateVolumeMA(klineData, period = 5) {
  const volumes = klineData.map((k) => k.volume);
  const volumeMA = new Array(volumes.length).fill(null);

  for (let i = period - 1; i < volumes.length; i++) {
    const slice = volumes.slice(i - period + 1, i + 1);
    volumeMA[i] = slice.reduce((sum, val) => sum + val, 0) / period;
  }

  return volumeMA;
}

// ==================== 主验证逻辑 ====================

const dataFile = path.join(__dirname, '山东玻纤.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 山东玻纤 - 完整技术指标验证 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);

// 需要验证的两个日期
const targetDates = [
  { date: '2026-04-09', label: '日期1 (2026-04-09)' },
  { date: '2026-02-03', label: '日期2 (2026-02-03)' },
];

targetDates.forEach((target) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${target.label}`);
  console.log('='.repeat(60));

  const targetIndex = klineData.findIndex((k) => {
    const d = new Date(k.time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    return dateStr === target.date;
  });

  if (targetIndex === -1) {
    console.log(`❌ 未找到该日期的数据\n`);
    return;
  }

  // 截取到目标日期的历史数据
  const historicalData = klineData.slice(0, targetIndex + 1);
  const currentPrice = klineData[targetIndex].close;

  console.log(`\n📊 基本信息:`);
  console.log(`   收盘价: ${currentPrice}`);
  console.log(`   成交量: ${klineData[targetIndex].volume}`);

  // 检查次日表现
  if (targetIndex < klineData.length - 1) {
    const nextDay = klineData[targetIndex + 1];
    const nextDayReturn = (((nextDay.close - currentPrice) / currentPrice) * 100).toFixed(2);
    console.log(`   次日涨幅: ${nextDayReturn}% (${currentPrice} → ${nextDay.close})`);
  }

  // 计算所有技术指标
  const rsi6 = calculateRSI(historicalData, 6);
  const rsi12 = calculateRSI(historicalData, 12);
  const macd = calculateMACD(historicalData);
  const bollinger = calculateBollingerBands(historicalData);
  const ma20 = calculateMA(historicalData, 20);
  const volumeMA5 = calculateVolumeMA(historicalData, 5);

  // 获取当前值
  const currentRSI6 = rsi6[targetIndex];
  const currentRSI12 = rsi12[targetIndex];
  const currentDIF = macd.dif[targetIndex];
  const currentDEA = macd.dea[targetIndex];
  const currentMACD = macd.macd[targetIndex];
  const currentUpper = bollinger.upper[targetIndex];
  const currentMiddle = bollinger.middle[targetIndex];
  const currentLower = bollinger.lower[targetIndex];
  const currentMA20 = ma20[targetIndex];
  const currentVolume = klineData[targetIndex].volume;
  const currentVolMA5 = volumeMA5[targetIndex];

  console.log(`\n📈 技术指标值:`);
  console.log(`   RSI(6): ${currentRSI6 !== null ? currentRSI6.toFixed(2) : 'N/A'}`);
  console.log(`   RSI(12): ${currentRSI12 !== null ? currentRSI12.toFixed(2) : 'N/A'}`);
  console.log(`   MACD DIF: ${currentDIF !== null ? currentDIF.toFixed(4) : 'N/A'}`);
  console.log(`   MACD DEA: ${currentDEA !== null ? currentDEA.toFixed(4) : 'N/A'}`);
  console.log(`   MACD柱: ${currentMACD !== null ? currentMACD.toFixed(4) : 'N/A'}`);
  console.log(`   布林带上轨: ${currentUpper !== null ? currentUpper.toFixed(2) : 'N/A'}`);
  console.log(`   布林带中轨: ${currentMiddle !== null ? currentMiddle.toFixed(2) : 'N/A'}`);
  console.log(`   布林带下轨: ${currentLower !== null ? currentLower.toFixed(2) : 'N/A'}`);
  console.log(`   MA20: ${currentMA20 !== null ? currentMA20.toFixed(2) : 'N/A'}`);
  console.log(`   成交量: ${currentVolume}`);
  console.log(`   5日均量: ${currentVolMA5 !== null ? Math.round(currentVolMA5) : 'N/A'}`);

  // 判断信号
  console.log(`\n🔍 买入信号检测:`);

  // 1. RSI超卖 (RSI6 < 30 或 RSI12 < 30)
  const rsiOversold =
    (currentRSI6 !== null && currentRSI6 < 30) || (currentRSI12 !== null && currentRSI12 < 30);
  console.log(
    `   [${rsiOversold ? '✅' : '❌'}] RSI超卖: RSI6=${
      currentRSI6 !== null ? currentRSI6.toFixed(2) : 'N/A'
    }, RSI12=${currentRSI12 !== null ? currentRSI12.toFixed(2) : 'N/A'} (阈值<30)`
  );

  // 2. MACD金叉 (DIF上穿DEA)
  let goldenCross = false;
  if (targetIndex >= 1 && currentDIF !== null && currentDEA !== null) {
    const prevDIF = macd.dif[targetIndex - 1];
    const prevDEA = macd.dea[targetIndex - 1];
    if (prevDIF !== null && prevDEA !== null) {
      goldenCross = prevDIF <= prevDEA && currentDIF > currentDEA;
    }
  }
  console.log(
    `   [${goldenCross ? '✅' : '❌'}] MACD金叉: DIF=${
      currentDIF !== null ? currentDIF.toFixed(4) : 'N/A'
    }, DEA=${currentDEA !== null ? currentDEA.toFixed(4) : 'N/A'}`
  );

  // 3. 布林带下轨 (价格接近或低于下轨)
  const nearBollingerLower = currentLower !== null && currentPrice <= currentLower * 1.02;
  console.log(
    `   [${nearBollingerLower ? '✅' : '❌'}] 布林带下轨: 价格=${currentPrice}, 下轨=${
      currentLower !== null ? currentLower.toFixed(2) : 'N/A'
    }`
  );

  // 4. MA20支撑 (价格在MA20附近±2%)
  const nearMA20 =
    currentMA20 !== null && Math.abs(currentPrice - currentMA20) / currentMA20 <= 0.02;
  console.log(
    `   [${nearMA20 ? '✅' : '❌'}] MA20支撑: 价格=${currentPrice}, MA20=${
      currentMA20 !== null ? currentMA20.toFixed(2) : 'N/A'
    }, 偏离=${
      currentMA20 !== null ? (((currentPrice - currentMA20) / currentMA20) * 100).toFixed(2) : 'N/A'
    }%`
  );

  // 5. 成交量萎缩 (量比<0.8)
  const volumeRatio =
    currentVolMA5 !== null && currentVolMA5 > 0 ? currentVolume / currentVolMA5 : null;
  const volumeShrink = volumeRatio !== null && volumeRatio < 0.8;
  console.log(
    `   [${volumeShrink ? '✅' : '❌'}] 成交量萎缩: 量比=${
      volumeRatio !== null ? volumeRatio.toFixed(2) : 'N/A'
    } (阈值<0.8)`
  );

  // 综合评估
  const signals = [
    { name: 'RSI超卖', active: rsiOversold },
    { name: 'MACD金叉', active: goldenCross },
    { name: '布林带下轨', active: nearBollingerLower },
    { name: 'MA20支撑', active: nearMA20 },
    { name: '成交量萎缩', active: volumeShrink },
  ];

  const activeSignals = signals.filter((s) => s.active);
  const shouldBuy = activeSignals.length >= 2;

  console.log(`\n📋 综合评估:`);
  console.log(`   激活信号数: ${activeSignals.length}/5`);
  console.log(`   是否触发买入: ${shouldBuy ? '✅ 是 (≥2个信号)' : '❌ 否 (<2个信号)'}`);

  if (activeSignals.length > 0) {
    console.log(`   激活的信号: ${activeSignals.map((s) => s.name).join(', ')}`);
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log('验证完成');
console.log('='.repeat(60));
