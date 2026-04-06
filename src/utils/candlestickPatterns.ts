/**
 * K线形态识别工具函数
 */

import type { KLineData } from '@/types/stock';

/**
 * 判断是否为锤头线（Hammer）
 * 特征：实体小，下影线长（至少是实体的2倍），上影线很短或没有
 * @param kline K线数据
 * @returns 是否为锤头线
 */
export function isHammer(kline: KLineData): boolean {
  const body = Math.abs(kline.close - kline.open);
  const upperShadow = kline.high - Math.max(kline.close, kline.open);
  const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
  const range = kline.high - kline.low;

  if (range <= 0) return false;

  // 实体要小（小于范围的1/3）
  // 下影线要长（至少是实体的2倍）
  // 上影线要短（小于范围的1/3）
  return body < range / 3 && lowerShadow >= body * 2 && upperShadow < range / 3;
}

/**
 * 判断是否为射击之星（Shooting Star）
 * 特征：实体小，上影线长（至少是实体的2倍），下影线很短或没有
 * @param kline K线数据
 * @returns 是否为射击之星
 */
export function isShootingStar(kline: KLineData): boolean {
  const body = Math.abs(kline.close - kline.open);
  const upperShadow = kline.high - Math.max(kline.close, kline.open);
  const lowerShadow = Math.min(kline.close, kline.open) - kline.low;
  const range = kline.high - kline.low;

  if (range <= 0) return false;

  // 实体要小（小于范围的1/3）
  // 上影线要长（至少是实体的2倍）
  // 下影线要短（小于范围的1/3）
  return body < range / 3 && upperShadow >= body * 2 && lowerShadow < range / 3;
}

/**
 * 判断是否为十字星（Doji）
 * 特征：开盘价和收盘价非常接近
 * @param kline K线数据
 * @param threshold 阈值比例，默认0.01（1%）
 * @returns 是否为十字星
 */
export function isDoji(kline: KLineData, threshold: number = 0.01): boolean {
  const body = Math.abs(kline.close - kline.open);
  const range = kline.high - kline.low;

  if (range <= 0) return false;

  // 实体相对于整个范围很小
  return body / range < threshold;
}

/**
 * 判断是否为吞没形态（Engulfing）
 * 需要两根K线
 * @param prevKline 前一根K线
 * @param currKline 当前K线
 * @returns 是否为吞没形态
 */
export function isEngulfing(prevKline: KLineData, currKline: KLineData): boolean {
  const prevBody = Math.abs(prevKline.close - prevKline.open);
  const currBody = Math.abs(currKline.close - currKline.open);

  if (prevBody <= 0 || currBody <= 0) return false;

  const prevIsBullish = prevKline.close > prevKline.open;
  const currIsBullish = currKline.close > currKline.open;

  // 必须是相反方向
  if (prevIsBullish === currIsBullish) return false;

  // 当前K线的实体要完全吞没前一根K线的实体
  const currOpen = Math.min(currKline.open, currKline.close);
  const currClose = Math.max(currKline.open, currKline.close);
  const prevOpen = Math.min(prevKline.open, prevKline.close);
  const prevClose = Math.max(prevKline.open, prevKline.close);

  return currOpen < prevOpen && currClose > prevClose && currBody > prevBody;
}

/**
 * 判断是否为早晨之星（Morning Star）
 * 需要三根K线：大阴线 + 小实体 + 大阳线
 * @param klines K线数组（至少3根）
 * @param index 当前索引（检查index-2, index-1, index）
 * @returns 是否为早晨之星
 */
export function isMorningStar(klines: KLineData[], index: number): boolean {
  if (index < 2) return false;

  const first = klines[index - 2];
  const second = klines[index - 1];
  const third = klines[index];

  const firstBody = Math.abs(first.close - first.open);
  const secondBody = Math.abs(second.close - second.open);
  const thirdBody = Math.abs(third.close - third.open);

  // 第一根是大阴线
  const firstIsBearish = first.close < first.open && firstBody > 0;
  // 第二根是小实体（可以是十字星或小阴阳线）
  const secondIsSmall = secondBody < firstBody * 0.5;
  // 第三根是大阳线
  const thirdIsBullish = third.close > third.open && thirdBody > 0;

  if (!firstIsBearish || !secondIsSmall || !thirdIsBullish) return false;

  // 第三根收盘价应该进入第一根实体的一半以上
  const firstMidpoint = (first.open + first.close) / 2;
  return third.close > firstMidpoint;
}

/**
 * 判断是否为黄昏之星（Evening Star）
 * 需要三根K线：大阳线 + 小实体 + 大阴线
 * @param klines K线数组（至少3根）
 * @param index 当前索引（检查index-2, index-1, index）
 * @returns 是否为黄昏之星
 */
export function isEveningStar(klines: KLineData[], index: number): boolean {
  if (index < 2) return false;

  const first = klines[index - 2];
  const second = klines[index - 1];
  const third = klines[index];

  const firstBody = Math.abs(first.close - first.open);
  const secondBody = Math.abs(second.close - second.open);
  const thirdBody = Math.abs(third.close - third.open);

  // 第一根是大阳线
  const firstIsBullish = first.close > first.open && firstBody > 0;
  // 第二根是小实体
  const secondIsSmall = secondBody < firstBody * 0.5;
  // 第三根是大阴线
  const thirdIsBearish = third.close < third.open && thirdBody > 0;

  if (!firstIsBullish || !secondIsSmall || !thirdIsBearish) return false;

  // 第三根收盘价应该进入第一根实体的一半以下
  const firstMidpoint = (first.open + first.close) / 2;
  return third.close < firstMidpoint;
}

/**
 * 检测K线数据中的形态（仅最新一根）
 * @param klineData K线数据
 * @returns 形态检测结果
 */
export function detectCandlestickPatterns(klineData: KLineData[]): {
  hammer: boolean;
  shootingStar: boolean;
  doji: boolean;
  engulfing: boolean;
  morningStar: boolean;
  eveningStar: boolean;
} {
  const len = klineData.length;

  if (len === 0) {
    return {
      hammer: false,
      shootingStar: false,
      doji: false,
      engulfing: false,
      morningStar: false,
      eveningStar: false,
    };
  }

  const lastKline = klineData[len - 1];
  let hammer = false;
  let shootingStar = false;
  let doji = false;
  let engulfing = false;
  let morningStar = false;
  let eveningStar = false;

  // 检测单根K线形态
  hammer = isHammer(lastKline);
  shootingStar = isShootingStar(lastKline);
  doji = isDoji(lastKline);

  // 检测双根K线形态
  if (len >= 2) {
    engulfing = isEngulfing(klineData[len - 2], lastKline);
  }

  // 检测三根K线形态
  if (len >= 3) {
    morningStar = isMorningStar(klineData, len - 1);
    eveningStar = isEveningStar(klineData, len - 1);
  }

  return {
    hammer,
    shootingStar,
    doji,
    engulfing,
    morningStar,
    eveningStar,
  };
}

/**
 * 检测K线数据中的形态（回溯窗口内任一位置存在即返回true）
 * @param klineData K线数据
 * @param lookback 回溯窗口大小，默认20
 * @returns 形态检测结果
 */
export function detectCandlestickPatternsInWindow(
  klineData: KLineData[],
  lookback: number = 20
): {
  hammer: boolean;
  shootingStar: boolean;
  doji: boolean;
  engulfing: boolean;
  morningStar: boolean;
  eveningStar: boolean;
} {
  const len = klineData.length;

  if (len === 0) {
    return {
      hammer: false,
      shootingStar: false,
      doji: false,
      engulfing: false,
      morningStar: false,
      eveningStar: false,
    };
  }

  // 取回溯窗口内的K线数据
  const windowStart = Math.max(0, len - lookback);
  const windowData = klineData.slice(windowStart);
  const windowLen = windowData.length;

  let hammer = false;
  let shootingStar = false;
  let doji = false;
  let engulfing = false;
  let morningStar = false;
  let eveningStar = false;

  // 遍历窗口内所有位置检测单根K线形态
  for (let i = 0; i < windowLen; i++) {
    if (!hammer && isHammer(windowData[i])) hammer = true;
    if (!shootingStar && isShootingStar(windowData[i])) shootingStar = true;
    if (!doji && isDoji(windowData[i])) doji = true;
    if (hammer && shootingStar && doji) break; // 所有单根形态都找到后停止
  }

  // 检测双根K线形态（需要2根）
  for (let i = 1; i < windowLen; i++) {
    if (!engulfing && isEngulfing(windowData[i - 1], windowData[i])) {
      engulfing = true;
    }
    if (engulfing) break;
  }

  // 检测三根K线形态（需要3根）
  for (let i = 2; i < windowLen; i++) {
    if (!morningStar && isMorningStar(windowData, i)) morningStar = true;
    if (!eveningStar && isEveningStar(windowData, i)) eveningStar = true;
    if (morningStar && eveningStar) break;
  }

  return {
    hammer,
    shootingStar,
    doji,
    engulfing,
    morningStar,
    eveningStar,
  };
}
