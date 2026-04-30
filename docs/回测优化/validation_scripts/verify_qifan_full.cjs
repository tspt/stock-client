/**
 * 起帆股份 - 完整技术指标验证脚本
 */

const fs = require('fs');
const path = require('path');

// ==================== 技术指标计算函数（与中衡设计相同）====================

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
  if (data.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  ema[period - 1] = sum / period;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

function calculateMACD(klineData, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const len = klineData.length;
  const closes = klineData.map((k) => k.close);
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  const dif = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) dif[i] = emaFast[i] - emaSlow[i];
  }
  const validDif = dif.map((d) => (d !== null ? d : 0));
  const dea = calculateEMA(validDif, signalPeriod);
  const macd = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (dif[i] !== null && dea[i] !== null) macd[i] = (dif[i] - dea[i]) * 2;
  }
  return { dif, dea, macd };
}

function isMACDGoldenCross(dif, dea, index) {
  if (index < 1) return false;
  const prevDIF = dif[index - 1],
    prevDEA = dea[index - 1];
  const currDIF = dif[index],
    currDEA = dea[index];
  if (prevDIF === null || prevDEA === null || currDIF === null || currDEA === null) return false;
  return prevDIF <= prevDEA && currDIF > currDEA;
}

function calculateBollingerBands(klineData, period = 20, stdDev = 2) {
  const len = klineData.length;
  const upper = new Array(len).fill(null);
  const middle = new Array(len).fill(null);
  const lower = new Array(len).fill(null);
  if (len < period) return { upper, middle, lower };

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += klineData[j].close;
    const ma = sum / period;
    middle[i] = ma;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += Math.pow(klineData[j].close - ma, 2);
    const std = Math.sqrt(variance / period);
    upper[i] = ma + stdDev * std;
    lower[i] = ma - stdDev * std;
  }
  return { upper, middle, lower };
}

function calculateMA(klineData, period) {
  if (klineData.length < period) return 0;
  let sum = 0;
  for (let i = klineData.length - period; i < klineData.length; i++) sum += klineData[i].close;
  return sum / period;
}

// ==================== 主验证逻辑 ====================

const dataFile = path.join(__dirname, '起帆股份.txt');
const content = fs.readFileSync(dataFile, 'utf-8');
const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 起帆股份 - 完整技术指标验证 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);

const targetDates = [
  { date: '2026-04-14', label: '日期1 (2026-04-14)' },
  { date: '2026-01-16', label: '日期2 (2026-01-16)' },
  { date: '2025-12-11', label: '日期3 (2025-12-11)' },
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
    console.log(`❌ ${target.label}: 未找到\n`);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${target.label}`);
  console.log('='.repeat(60));
  console.log(`索引: ${targetIndex}, 收盘价: ${klineData[targetIndex].close}`);

  const sliceData = klineData.slice(0, targetIndex + 1);
  const lastClose = sliceData[sliceData.length - 1].close;

  // 1. RSI
  const rsi6 = calculateRSI(sliceData, 6);
  const rsi12 = calculateRSI(sliceData, 12);
  const lastRSI6 = rsi6[rsi6.length - 1];
  const lastRSI12 = rsi12[rsi12.length - 1];
  const rsiOversold =
    (lastRSI6 !== null && lastRSI6 < 30) || (lastRSI12 !== null && lastRSI12 < 30);
  console.log(
    `\n【1】RSI: RSI(6)=${lastRSI6?.toFixed(2)}, RSI(12)=${lastRSI12?.toFixed(2)} → ${
      rsiOversold ? '✅ 超卖' : '❌ 未超卖'
    }`
  );

  // 2. MACD
  const macd = calculateMACD(sliceData);
  const goldenCross = isMACDGoldenCross(macd.dif, macd.dea, macd.dif.length - 1);
  console.log(`【2】MACD金叉: ${goldenCross ? '✅ 是' : '❌ 否'}`);

  // 3. 布林带
  const bb = calculateBollingerBands(sliceData, 20, 2);
  const lastUpper = bb.upper[bb.upper.length - 1];
  const lastLower = bb.lower[bb.lower.length - 1];
  let nearBollingerLower = false;
  if (lastUpper && lastLower) {
    const bandwidth = lastUpper - lastLower;
    const position = (lastClose - lastLower) / bandwidth;
    nearBollingerLower = position < 0.3 || lastClose <= lastLower * 1.05;
  }
  console.log(`【3】布林带下轨: ${nearBollingerLower ? '✅ 是' : '❌ 否'}`);

  // 4. MA20
  const ma20 = calculateMA(sliceData, 20);
  const nearMA20 = lastClose < ma20 && Math.abs(lastClose - ma20) / ma20 < 0.05;
  console.log(
    `【4】MA20支撑: ${nearMA20 ? '✅ 是' : '❌ 否'} (距MA20: ${(
      ((lastClose - ma20) / ma20) *
      100
    ).toFixed(2)}%)`
  );

  // 5. 成交量
  const currentVolume = sliceData[sliceData.length - 1].volume;
  const avgVolume5 = sliceData.slice(-5).reduce((sum, k) => sum + k.volume, 0) / 5;
  const volumeRatio = currentVolume / avgVolume5;
  const volumeShrink = volumeRatio < 0.8;
  console.log(
    `【5】成交量萎缩: ${volumeShrink ? '✅ 是' : '❌ 否'} (量比: ${volumeRatio.toFixed(2)})`
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

  console.log(`\n激活信号: ${activeSignals.length}/5`);
  activeSignals.forEach((s) => console.log(`  ✅ ${s.name}`));

  const shouldBuy = activeSignals.length >= 2;
  console.log(`\n📊 买入判定: ${shouldBuy ? '✅ 应该买入' : '❌ 不应买入'} (阈值: ≥2)`);

  if (targetIndex < klineData.length - 1) {
    const nextDay = klineData[targetIndex + 1];
    const nextDayReturn = (((nextDay.close - lastClose) / lastClose) * 100).toFixed(2);
    console.log(`📈 次日表现: ${nextDayReturn}%`);
  }
});

console.log('\n\n' + '='.repeat(60));
console.log('验证完成');
console.log('='.repeat(60));
