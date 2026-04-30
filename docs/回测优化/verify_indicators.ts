/**
 * 艾华集团技术指标验证脚本
 * 用于分析4月3日低点时的各项技术指标表现
 */

import { calculateRSI, calculateMACD, calculateBollingerBands } from './src/utils/analysis/technicalIndicators';

// 读取艾华集团K线数据
const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, '../艾华集团.txt');
const rawData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const klineData = rawData.dailyLines;

console.log('=== 艾华集团技术指标验证 ===\n');
console.log(`总K线数量: ${klineData.length}\n`);

// 找到4月3日的索引（time: 1743955200000）
const targetDate = 1743955200000;
const targetIndex = klineData.findIndex(k => k.time === targetDate);

if (targetIndex === -1) {
  console.error('未找到4月3日的数据');
  process.exit(1);
}

console.log(`目标日期索引: ${targetIndex}`);
console.log(`目标日期数据:`, {
  time: new Date(targetDate).toLocaleDateString(),
  open: klineData[targetIndex].open,
  close: klineData[targetIndex].close,
  high: klineData[targetIndex].high,
  low: klineData[targetIndex].low,
  volume: klineData[targetIndex].volume
});
console.log('\n--- 开始计算技术指标 ---\n');

// 截取到4月3日的数据
const sliceData = klineData.slice(0, targetIndex + 1);

// 1. RSI指标
console.log('【1】RSI指标分析:');
const rsi6 = calculateRSI(sliceData, 6);
const rsi12 = calculateRSI(sliceData, 12);
const rsi14 = calculateRSI(sliceData, 14);

const lastRSI6 = rsi6[rsi6.length - 1];
const lastRSI12 = rsi12[rsi12.length - 1];
const lastRSI14 = rsi14[rsi14.length - 1];

console.log(`  RSI(6):  ${lastRSI6?.toFixed(2)} ${lastRSI6 < 30 ? '← 超卖区' : lastRSI6 < 50 ? '← 偏弱' : ''}`);
console.log(`  RSI(12): ${lastRSI12?.toFixed(2)} ${lastRSI12 < 30 ? '← 超卖区' : lastRSI12 < 50 ? '← 偏弱' : ''}`);
console.log(`  RSI(14): ${lastRSI14?.toFixed(2)} ${lastRSI14 < 30 ? '← 超卖区' : lastRSI14 < 50 ? '← 偏弱' : ''}`);
console.log();

// 2. MACD指标
console.log('【2】MACD指标分析:');
const macd = calculateMACD(sliceData);
const lastDIF = macd.dif[macd.dif.length - 1];
const lastDEA = macd.dea[macd.dea.length - 1];
const lastMACDBar = macd.macd[macd.macd.length - 1];

// 检查金叉
let isGoldenCross = false;
if (macd.dif.length >= 2 && macd.dea.length >= 2) {
  const prevDIF = macd.dif[macd.dif.length - 2];
  const prevDEA = macd.dea[macd.dea.length - 2];
  if (prevDIF !== null && prevDEA !== null && lastDIF !== null && lastDEA !== null) {
    isGoldenCross = prevDIF <= prevDEA && lastDIF > lastDEA;
  }
}

console.log(`  DIF:  ${lastDIF?.toFixed(4)}`);
console.log(`  DEA:  ${lastDEA?.toFixed(4)}`);
console.log(`  MACD柱: ${lastMACDBar?.toFixed(4)} ${lastMACDBar < 0 ? '← 绿柱' : '← 红柱'}`);
console.log(`  金叉状态: ${isGoldenCross ? '✓ 是' : '✗ 否'}`);

// 检查底背离
function hasBottomDivergence(klineData: any[], dif: (number | null)[], lookback: number = 20): boolean {
  const len = klineData.length;
  if (len < lookback + 10) return false;

  const closes = klineData.map((k: any) => k.close);
  const validDif = dif.map((d) => d ?? 0);

  function findLocalValleys(data: number[], windowSize: number): number[] {
    const valleys: number[] = [];
    for (let i = windowSize; i < data.length - windowSize; i++) {
      let isValley = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j !== i && data[j] <= data[i]) {
          isValley = false;
          break;
        }
      }
      if (isValley) valleys.push(i);
    }
    return valleys;
  }

  const windowStart = Math.max(0, len - lookback);
  const windowCloses = closes.slice(windowStart);
  const windowDif = validDif.slice(windowStart);
  const priceValleys = findLocalValleys(windowCloses, 2).slice(-2);
  const difValleys = findLocalValleys(windowDif, 2).slice(-2);

  if (priceValleys.length >= 2 && difValleys.length >= 2) {
    const priceLower = windowCloses[priceValleys[1]] < windowCloses[priceValleys[0]];
    const difHigher = windowDif[difValleys[1]] > windowDif[difValleys[0]];
    if (priceLower && difHigher) {
      return true;
    }
  }

  return false;
}

const isBottomDivergence = hasBottomDivergence(sliceData, macd.dif);
console.log(`  底背离: ${isBottomDivergence ? '✓ 存在' : '✗ 不存在'}`);
console.log();

// 3. 布林带指标
console.log('【3】布林带指标分析:');
const bb = calculateBollingerBands(sliceData, 20, 2);
const lastClose = sliceData[sliceData.length - 1].close;
const lastUpper = bb.upper[bb.upper.length - 1];
const lastMiddle = bb.middle[bb.middle.length - 1];
const lastLower = bb.lower[bb.lower.length - 1];

if (lastUpper && lastMiddle && lastLower) {
  const bandwidth = lastUpper - lastLower;
  const position = (lastClose - lastLower) / bandwidth;
  
  console.log(`  上轨: ${lastUpper.toFixed(2)}`);
  console.log(`  中轨: ${lastMiddle.toFixed(2)}`);
  console.log(`  下轨: ${lastLower.toFixed(2)}`);
  console.log(`  收盘价: ${lastClose.toFixed(2)}`);
  console.log(`  价格位置: ${(position * 100).toFixed(1)}% ${position < 0.2 ? '← 接近下轨' : position > 0.8 ? '← 接近上轨' : ''}`);
  console.log(`  距下轨距离: ${((lastClose - lastLower) / lastLower * 100).toFixed(2)}%`);
}
console.log();

// 4. 均线系统
console.log('【4】均线系统分析:');
function calculateMA(data: any[], period: number): number {
  if (data.length < period) return 0;
  let sum = 0;
  for (let i = data.length - period; i < data.length; i++) {
    sum += data[i].close;
  }
  return sum / period;
}

const ma5 = calculateMA(sliceData, 5);
const ma10 = calculateMA(sliceData, 10);
const ma20 = calculateMA(sliceData, 20);
const ma60 = calculateMA(sliceData, 60);

console.log(`  MA5:  ${ma5.toFixed(2)} ${lastClose < ma5 ? '← 价格在下方' : '← 价格在上方'}`);
console.log(`  MA10: ${ma10.toFixed(2)} ${lastClose < ma10 ? '← 价格在下方' : '← 价格在上方'}`);
console.log(`  MA20: ${ma20.toFixed(2)} ${lastClose < ma20 ? '← 价格在下方' : '← 价格在上方'}`);
console.log(`  MA60: ${ma60.toFixed(2)} ${lastClose < ma60 ? '← 价格在下方' : '← 价格在上方'}`);
console.log(`  距MA20距离: ${((lastClose - ma20) / ma20 * 100).toFixed(2)}%`);
console.log();

// 5. 成交量分析
console.log('【5】成交量分析:');
const recentVolumes = sliceData.slice(-5).map(k => k.volume);
const avgVolume5 = recentVolumes.reduce((a, b) => a + b, 0) / 5;
const prevVolumes = sliceData.slice(-10, -5).map(k => k.volume);
const avgVolume10 = prevVolumes.reduce((a, b) => a + b, 0) / 5;
const currentVolume = sliceData[sliceData.length - 1].volume;

console.log(`  当日成交量: ${currentVolume}`);
console.log(`  5日均量: ${avgVolume5.toFixed(0)}`);
console.log(`  前5日均量: ${avgVolume10.toFixed(0)}`);
console.log(`  量比: ${(currentVolume / avgVolume5).toFixed(2)} ${currentVolume < avgVolume5 * 0.7 ? '← 缩量' : currentVolume > avgVolume5 * 1.5 ? '← 放量' : ''}`);
console.log();

// 6. 综合评分建议
console.log('=== 综合信号评估 ===');
const signals: string[] = [];

if (lastRSI6 && lastRSI6 < 30) signals.push('✓ RSI(6)进入超卖区');
if (lastRSI12 && lastRSI12 < 30) signals.push('✓ RSI(12)进入超卖区');
if (isGoldenCross) signals.push('✓ MACD金叉');
if (isBottomDivergence) signals.push('✓ MACD底背离');
if (lastLower && lastClose <= lastLower * 1.05) signals.push('✓ 价格接近布林带下轨');
if (lastClose < ma20 && Math.abs(lastClose - ma20) / ma20 < 0.05) signals.push('✓ 价格接近MA20支撑');
if (currentVolume < avgVolume5 * 0.7) signals.push('✓ 成交量萎缩（抛压减轻）');

console.log(`买入信号数量: ${signals.length}`);
signals.forEach(s => console.log(`  ${s}`));

console.log('\n=== 验证完成 ===');
