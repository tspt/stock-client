/**
 * 技术指标计算工具
 */

import type { KLineData } from '@/types/stock';
import { MA_PERIODS, MACD_PARAMS, KDJ_PARAMS, RSI_PERIODS } from './constants';

/**
 * 计算移动平均线（MA）
 */
export function calculateMA(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 计算所有MA周期
 */
export function calculateAllMA(data: KLineData[]) {
  const result: Record<string, number[]> = {};
  for (const period of MA_PERIODS) {
    result[`ma${period}`] = calculateMA(data, period);
  }
  return result;
}

/**
 * 计算EMA（指数移动平均）
 */
function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[i]);
    } else {
      result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

/**
 * 计算MACD指标
 */
export function calculateMACD(data: KLineData[]) {
  const closes = data.map(d => d.close);
  const fastEMA = calculateEMA(closes, MACD_PARAMS.fast);
  const slowEMA = calculateEMA(closes, MACD_PARAMS.slow);
  
  const dif = fastEMA.map((fast, i) => fast - slowEMA[i]);
  const dea = calculateEMA(dif, MACD_PARAMS.signal);
  const macd = dif.map((d, i) => (d - dea[i]) * 2);
  
  return { dif, dea, macd };
}

/**
 * 计算RSV（未成熟随机值）
 */
function calculateRSV(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const high = Math.max(...slice.map(d => d.high));
      const low = Math.min(...slice.map(d => d.low));
      const close = data[i].close;
      const rsv = ((close - low) / (high - low)) * 100;
      result.push(isNaN(rsv) ? 0 : rsv);
    }
  }
  return result;
}

/**
 * 计算KDJ指标
 */
export function calculateKDJ(data: KLineData[]) {
  const rsv = calculateRSV(data, KDJ_PARAMS.n);
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  
  for (let i = 0; i < rsv.length; i++) {
    if (isNaN(rsv[i])) {
      k.push(NaN);
      d.push(NaN);
      j.push(NaN);
    } else {
      if (i === 0) {
        k.push(50);
        d.push(50);
      } else {
        const prevK = isNaN(k[i - 1]) ? 50 : k[i - 1];
        const prevD = isNaN(d[i - 1]) ? 50 : d[i - 1];
        const newK = (2 * prevK + rsv[i]) / 3;
        const newD = (2 * prevD + newK) / 3;
        k.push(newK);
        d.push(newD);
      }
      const currentK = k[i];
      const currentD = d[i];
      j.push(3 * currentK - 2 * currentD);
    }
  }
  
  return { k, d, j };
}

/**
 * 计算RSI指标
 */
export function calculateRSI(data: KLineData[], period: number): number[] {
  const result: number[] = [];
  const closes = data.map(d => d.close);
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      let gainSum = 0;
      let lossSum = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) {
          gainSum += change;
        } else {
          lossSum += Math.abs(change);
        }
      }
      
      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }
  
  return result;
}

/**
 * 计算所有RSI周期
 */
export function calculateAllRSI(data: KLineData[]) {
  const result: Record<string, number[]> = {};
  for (const period of RSI_PERIODS) {
    result[`rsi${period}`] = calculateRSI(data, period);
  }
  return result;
}

