/**
 * 中衡设计 - 完整技术指标验证脚本
 * 验证三个关键买入点的技术指标表现
 */

const fs = require('fs');
const path = require('path');

// ==================== 技术指标计算函数 ====================

/**
 * 计算RSI指标
 */
function calculateRSI(klineData, period = 14) {
  const len = klineData.length;
  const rsi = new Array(len).fill(null);

  if (len < period + 1) {
    return rsi;
  }

  // 计算价格变化
  const changes = [];
  for (let i = 1; i < len; i++) {
    changes.push(klineData[i].close - klineData[i - 1].close);
  }

  // 计算初始平均 gains 和 losses
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // 计算第一个RSI
  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - 100 / (1 + rs);
  }

  // 计算后续RSI
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return rsi;
}

/**
 * 计算EMA
 */
function calculateEMA(data, period) {
  const ema = new Array(data.length).fill(null);
  if (data.length < period) {
    return ema;
  }

  // 第一个EMA值是简单移动平均
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  ema[period - 1] = sum / period;

  // 计算后续EMA
  const multiplier = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

/**
 * 计算MACD指标
 */
function calculateMACD(klineData, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const len = klineData.length;
  const closes = klineData.map((k) => k.close);

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const dif = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      dif[i] = emaFast[i] - emaSlow[i];
    }
  }

  // 计算DEA（DIF的EMA）
  const validDif = dif.map((d) => (d !== null ? d : 0));
  const dea = calculateEMA(validDif, signalPeriod);

  // 计算MACD柱
  const macd = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (dif[i] !== null && dea[i] !== null) {
      macd[i] = (dif[i] - dea[i]) * 2;
    }
  }

  return { dif, dea, macd };
}

/**
 * 判断MACD金叉
 */
function isMACDGoldenCross(dif, dea, index) {
  if (index < 1) return false;

  const prevDIF = dif[index - 1];
  const prevDEA = dea[index - 1];
  const currDIF = dif[index];
  const currDEA = dea[index];

  if (prevDIF === null || prevDEA === null || currDIF === null || currDEA === null) {
    return false;
  }

  return prevDIF <= prevDEA && currDIF > currDEA;
}

/**
 * 计算布林带
 */
function calculateBollingerBands(klineData, period = 20, stdDev = 2) {
  const len = klineData.length;
  const upper = new Array(len).fill(null);
  const middle = new Array(len).fill(null);
  const lower = new Array(len).fill(null);

  if (len < period) {
    return { upper, middle, lower };
  }

  for (let i = period - 1; i < len; i++) {
    // 计算中轨（简单移动平均）
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += klineData[j].close;
    }
    const ma = sum / period;
    middle[i] = ma;

    // 计算标准差
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(klineData[j].close - ma, 2);
    }
    const std = Math.sqrt(variance / period);

    // 计算上下轨
    upper[i] = ma + stdDev * std;
    lower[i] = ma - stdDev * std;
  }

  return { upper, middle, lower };
}

/**
 * 计算移动平均线
 */
function calculateMA(klineData, period) {
  if (klineData.length < period) return 0;
  let sum = 0;
  for (let i = klineData.length - period; i < klineData.length; i++) {
    sum += klineData[i].close;
  }
  return sum / period;
}

// ==================== 主验证逻辑 ====================

// 读取中衡设计K线数据
const dataFile = path.join(__dirname, '中衡设计.txt');
const content = fs.readFileSync(dataFile, 'utf-8');

const updatedAtMatch = content.match(/"updatedAt"\s*:\s*\d+/);
const jsonEndIndex = updatedAtMatch.index + updatedAtMatch[0].length;
const closingBraceIndex = content.indexOf('}', jsonEndIndex);
const validJson = content.substring(0, closingBraceIndex + 1);
const rawData = JSON.parse(validJson);
const klineData = rawData.dailyLines;

console.log('=== 中衡设计 - 完整技术指标验证 ===\n');
console.log(`股票代码: ${rawData.code}`);
console.log(`股票名称: ${rawData.name}`);
console.log(`总K线数量: ${klineData.length}\n`);

// 需要验证的三个日期
const targetDates = [
  { date: '2026-04-17', label: '日期1 (2026-04-17)' },
  { date: '2026-01-07', label: '日期2 (2026-01-07)' },
  { date: '2025-11-24', label: '日期3 (2025-11-24)' },
];

// 对每个日期进行详细分析
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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${target.label}`);
  console.log('='.repeat(60));
  console.log(`索引: ${targetIndex}`);
  console.log(`收盘价: ${klineData[targetIndex].close}`);

  // 截取到目标日期的数据
  const sliceData = klineData.slice(0, targetIndex + 1);
  const lastClose = sliceData[sliceData.length - 1].close;

  // ========== 1. RSI指标 ==========
  console.log('\n【1】RSI指标分析:');
  const rsi6 = calculateRSI(sliceData, 6);
  const rsi12 = calculateRSI(sliceData, 12);

  const lastRSI6 = rsi6[rsi6.length - 1];
  const lastRSI12 = rsi12[rsi12.length - 1];

  console.log(
    `  RSI(6):  ${lastRSI6?.toFixed(2)} ${
      lastRSI6 < 30 ? '← ✅ 超卖区' : lastRSI6 < 50 ? '← 偏弱' : ''
    }`
  );
  console.log(
    `  RSI(12): ${lastRSI12?.toFixed(2)} ${
      lastRSI12 < 30 ? '← ✅ 超卖区' : lastRSI12 < 50 ? '← 偏弱' : ''
    }`
  );

  const rsiOversold =
    (lastRSI6 !== null && lastRSI6 < 30) || (lastRSI12 !== null && lastRSI12 < 30);
  console.log(`  → RSI超卖信号: ${rsiOversold ? '✅ 触发' : '❌ 未触发'}`);

  // ========== 2. MACD指标 ==========
  console.log('\n【2】MACD指标分析:');
  const macd = calculateMACD(sliceData);
  const lastDIF = macd.dif[macd.dif.length - 1];
  const lastDEA = macd.dea[macd.dea.length - 1];
  const lastMACDBar = macd.macd[macd.macd.length - 1];

  const goldenCross = isMACDGoldenCross(macd.dif, macd.dea, macd.dif.length - 1);

  console.log(`  DIF:  ${lastDIF?.toFixed(4)}`);
  console.log(`  DEA:  ${lastDEA?.toFixed(4)}`);
  console.log(`  MACD柱: ${lastMACDBar?.toFixed(4)} ${lastMACDBar < 0 ? '← 绿柱' : '← 红柱'}`);
  console.log(`  金叉状态: ${goldenCross ? '✅ 是' : '❌ 否'}`);
  console.log(`  → MACD金叉信号: ${goldenCross ? '✅ 触发' : '❌ 未触发'}`);

  // ========== 3. 布林带指标 ==========
  console.log('\n【3】布林带指标分析:');
  const bb = calculateBollingerBands(sliceData, 20, 2);
  const lastUpper = bb.upper[bb.upper.length - 1];
  const lastMiddle = bb.middle[bb.middle.length - 1];
  const lastLower = bb.lower[bb.lower.length - 1];

  let nearBollingerLower = false;
  if (lastUpper && lastMiddle && lastLower) {
    const bandwidth = lastUpper - lastLower;
    const position = (lastClose - lastLower) / bandwidth;

    console.log(`  上轨: ${lastUpper.toFixed(2)}`);
    console.log(`  中轨: ${lastMiddle.toFixed(2)}`);
    console.log(`  下轨: ${lastLower.toFixed(2)}`);
    console.log(`  收盘价: ${lastClose.toFixed(2)}`);
    console.log(
      `  价格位置: ${(position * 100).toFixed(1)}% ${position < 0.3 ? '← ✅ 接近下轨' : ''}`
    );
    console.log(`  距下轨距离: ${(((lastClose - lastLower) / lastLower) * 100).toFixed(2)}%`);

    nearBollingerLower = position < 0.3 || lastClose <= lastLower * 1.05;
  }
  console.log(`  → 布林带下轨信号: ${nearBollingerLower ? '✅ 触发' : '❌ 未触发'}`);

  // ========== 4. MA20支撑 ==========
  console.log('\n【4】均线系统分析:');
  const ma20 = calculateMA(sliceData, 20);

  console.log(`  MA20: ${ma20.toFixed(2)}`);
  console.log(`  距MA20距离: ${(((lastClose - ma20) / ma20) * 100).toFixed(2)}%`);

  const nearMA20 = lastClose < ma20 && Math.abs(lastClose - ma20) / ma20 < 0.05;
  console.log(`  → MA20支撑信号: ${nearMA20 ? '✅ 触发' : '❌ 未触发'}`);

  // ========== 5. 成交量分析 ==========
  console.log('\n【5】成交量分析:');
  const currentVolume = sliceData[sliceData.length - 1].volume;
  const avgVolume5 = sliceData.slice(-5).reduce((sum, k) => sum + k.volume, 0) / 5;
  const volumeRatio = currentVolume / avgVolume5;

  console.log(`  当日成交量: ${currentVolume}`);
  console.log(`  5日均量: ${avgVolume5.toFixed(0)}`);
  console.log(`  量比: ${volumeRatio.toFixed(2)} ${volumeRatio < 0.8 ? '← ✅ 缩量' : ''}`);

  const volumeShrink = volumeRatio < 0.8;
  console.log(`  → 成交量萎缩信号: ${volumeShrink ? '✅ 触发' : '❌ 未触发'}`);

  // ========== 综合评估 ==========
  console.log('\n' + '='.repeat(60));
  console.log('【综合信号评估】');
  console.log('='.repeat(60));

  const signals = [
    { name: 'RSI超卖', active: rsiOversold },
    { name: 'MACD金叉', active: goldenCross },
    { name: '布林带下轨', active: nearBollingerLower },
    { name: 'MA20支撑', active: nearMA20 },
    { name: '成交量萎缩', active: volumeShrink },
  ];

  const activeSignals = signals.filter((s) => s.active);

  console.log(`\n激活的信号数量: ${activeSignals.length}/5`);
  activeSignals.forEach((s) => console.log(`  ✅ ${s.name}`));

  const shouldBuy = activeSignals.length >= 2;
  console.log(`\n📊 买入判定: ${shouldBuy ? '✅ 应该买入' : '❌ 不应买入'} (阈值: ≥2个信号)`);

  // 检查次日表现
  if (targetIndex < klineData.length - 1) {
    const nextDay = klineData[targetIndex + 1];
    const nextDayReturn = (((nextDay.close - lastClose) / lastClose) * 100).toFixed(2);
    console.log(`\n📈 次日表现: ${nextDayReturn}% (${lastClose} → ${nextDay.close})`);
  }
});

console.log('\n\n' + '='.repeat(60));
console.log('验证完成');
console.log('='.repeat(60));
