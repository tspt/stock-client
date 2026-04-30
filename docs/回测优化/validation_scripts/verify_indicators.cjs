/**
 * 艾华集团技术指标验证脚本（简化版）
 */

const fs = require('fs');
const path = require('path');

// 读取数据
const dataFile = 'c:/Users/pnc/Desktop/艾华集团.txt';
const rawData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const klineData = rawData.dailyLines;

console.log('=== 艾华集团技术指标验证 ===\n');
console.log(`总K线数量: ${klineData.length}\n`);

// 计算RSI
function calculateRSI(data, period) {
  const len = data.length;
  if (len < period + 1) return null;
  
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i-1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  
  for (let i = period + 1; i < len; i++) {
    const change = data[i].close - data[i-1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// 计算MACD
function calculateEMA(data, period) {
  if (data.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let ema = sum / period;
  
  const multiplier = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateMACD(data) {
  const closes = data.map(k => k.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  if (!ema12 || !ema26) return { dif: null, dea: null, macd: null };
  
  const dif = ema12 - ema26;
  
  // 简化：计算DEA需要历史DIF序列，这里用近似值
  const prevCloses = closes.slice(0, -1);
  const prevEma12 = calculateEMA(prevCloses, 12);
  const prevEma26 = calculateEMA(prevCloses, 26);
  const prevDif = (prevEma12 && prevEma26) ? (prevEma12 - prevEma26) : dif;
  
  const dea = (prevDif + dif) / 2; // 简化计算
  const macdBar = (dif - dea) * 2;
  
  return { dif, dea, macd: macdBar, isGoldenCross: prevDif <= (prevDif + dif)/2 && dif > dea };
}

// 计算布林带
function calculateBollingerBands(data, period = 20) {
  if (data.length < period) return null;
  
  const recent = data.slice(-period);
  const closes = recent.map(k => k.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  
  let variance = 0;
  closes.forEach(c => variance += Math.pow(c - sma, 2));
  const stdDev = Math.sqrt(variance / period);
  
  return {
    upper: sma + 2 * stdDev,
    middle: sma,
    lower: sma - 2 * stdDev
  };
}

// 计算均线
function calculateMA(data, period) {
  if (data.length < period) return null;
  const recent = data.slice(-period);
  return recent.reduce((sum, k) => sum + k.close, 0) / period;
}

// 找到多个目标日期
const targetDates = [
  { name: '4月3日', time: 1743955200000 },
  { name: '6月23日', time: 1750608000000 },
  { name: '12月19日', time: 1766073600000 }
];

targetDates.forEach(({ name, time }) => {
  const targetIndex = klineData.findIndex(k => k.time === time);
  
  if (targetIndex === -1) {
    console.error(`未找到${name}的数据`);
    return;
  }
  
  console.log(`\n========== ${name} (${new Date(time).toLocaleDateString()}) ==========\n`);
  console.log(`索引: ${targetIndex}`);
  console.log(`收盘价: ${klineData[targetIndex].close}, 开盘价: ${klineData[targetIndex].open}`);
  console.log(`涨跌幅: ${((klineData[targetIndex].close - klineData[targetIndex].open) / klineData[targetIndex].open * 100).toFixed(2)}%\n`);
  
  // 截取数据
  const sliceData = klineData.slice(0, targetIndex + 1);
  const lastClose = sliceData[sliceData.length - 1].close;
  
  // 计算RSI
  const rsi6 = calculateRSI(sliceData, 6);
  const rsi12 = calculateRSI(sliceData, 12);
  console.log('【1】RSI指标:');
  console.log(`  RSI(6):  ${rsi6?.toFixed(2)} ${rsi6 < 30 ? '← 超卖' : rsi6 < 50 ? '← 偏弱' : ''}`);
  console.log(`  RSI(12): ${rsi12?.toFixed(2)} ${rsi12 < 30 ? '← 超卖' : rsi12 < 50 ? '← 偏弱' : ''}\n`);
  
  // 计算MACD
  const macd = calculateMACD(sliceData);
  console.log('【2】MACD指标:');
  console.log(`  DIF: ${macd.dif?.toFixed(4)}`);
  console.log(`  DEA: ${macd.dea?.toFixed(4)}`);
  console.log(`  MACD柱: ${macd.macd?.toFixed(4)} ${macd.macd < 0 ? '← 绿柱' : '← 红柱'}`);
  console.log(`  金叉: ${macd.isGoldenCross ? '✓ 是' : '✗ 否'}\n`);
  
  // 计算布林带
  const bb = calculateBollingerBands(sliceData);
  console.log('【3】布林带:');
  if (bb) {
    const position = (lastClose - bb.lower) / (bb.upper - bb.lower);
    console.log(`  上轨: ${bb.upper.toFixed(2)}`);
    console.log(`  中轨: ${bb.middle.toFixed(2)}`);
    console.log(`  下轨: ${bb.lower.toFixed(2)}`);
    console.log(`  收盘价: ${lastClose.toFixed(2)}`);
    console.log(`  位置: ${(position * 100).toFixed(1)}% ${position < 0.2 ? '← 接近下轨' : ''}`);
    console.log(`  距下轨: ${((lastClose - bb.lower) / bb.lower * 100).toFixed(2)}%\n`);
  }
  
  // 计算均线
  const ma5 = calculateMA(sliceData, 5);
  const ma10 = calculateMA(sliceData, 10);
  const ma20 = calculateMA(sliceData, 20);
  const ma60 = calculateMA(sliceData, 60);
  console.log('【4】均线系统:');
  console.log(`  MA5:  ${ma5?.toFixed(2)} ${lastClose < ma5 ? '← 下方' : '← 上方'}`);
  console.log(`  MA10: ${ma10?.toFixed(2)} ${lastClose < ma10 ? '← 下方' : '← 上方'}`);
  console.log(`  MA20: ${ma20?.toFixed(2)} ${lastClose < ma20 ? '← 下方' : '← 上方'}`);
  console.log(`  MA60: ${ma60?.toFixed(2)} ${lastClose < ma60 ? '← 下方' : '← 上方'}\n`);
  
  // 成交量
  const currentVol = sliceData[sliceData.length - 1].volume;
  const avgVol5 = sliceData.slice(-5).reduce((s, k) => s + k.volume, 0) / 5;
  console.log('【5】成交量:');
  console.log(`  当日: ${currentVol}`);
  console.log(`  5日均: ${avgVol5.toFixed(0)}`);
  console.log(`  量比: ${(currentVol / avgVol5).toFixed(2)} ${currentVol < avgVol5 * 0.7 ? '← 缩量' : ''}\n`);
  
  // 综合信号
  console.log('=== 买入信号汇总 ===');
  const signals = [];
  if (rsi6 && rsi6 < 30) signals.push('✓ RSI(6)超卖');
  if (rsi12 && rsi12 < 30) signals.push('✓ RSI(12)超卖');
  if (macd.isGoldenCross) signals.push('✓ MACD金叉');
  if (bb && lastClose <= bb.lower * 1.05) signals.push('✓ 接近布林带下轨');
  if (ma20 && lastClose < ma20 && Math.abs(lastClose - ma20) / ma20 < 0.05) signals.push('✓ 接近MA20');
  if (currentVol < avgVol5 * 0.7) signals.push('✓ 成交量萎缩');
  
  console.log(`信号数量: ${signals.length}/6`);
  signals.forEach(s => console.log(`  ${s}`));
});
