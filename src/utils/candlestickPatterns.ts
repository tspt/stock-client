/**
 * K线形态识别工具函数
 * 优化版本：性能优化 + 准确度提升 + 新增形态
 */

import type { KLineData } from '@/types/stock';

/** 形态检测结果 */
export interface CandlestickPatternResult {
  /** 锤头线（ bullish reversal） */
  hammer: boolean;
  /** 射击之星（bearish reversal） */
  shootingStar: boolean;
  /** 十字星 */
  doji: boolean;
  /** 吞没形态 - 阳包阴 */
  engulfingBullish: boolean;
  /** 吞没形态 - 阴包阳 */
  engulfingBearish: boolean;
  /** 早晨之星（见底信号） */
  morningStar: boolean;
  /** 黄昏之星（见顶信号） */
  eveningStar: boolean;
  /** 乌云盖顶（见顶信号） */
  darkCloudCover: boolean;
  /** 刺透形态（见底信号） */
  piercing: boolean;
  /** 孕线形态 - 阳孕阴 */
  haramiBullish: boolean;
  /** 孕线形态 - 阴孕阳 */
  haramiBearish: boolean;
  /** 三只乌鸦（下跌信号） */
  threeBlackCrows: boolean;
  /** 三兵红烛（上涨信号） */
  threeWhiteSoldiers: boolean;
  /** 倒锤头线（看涨反转） */
  invertedHammer: boolean;
  /** 上吊线（看跌反转） */
  hangingMan: boolean;
  /** 蜻蜓十字星（强烈看涨） */
  dragonflyDoji: boolean;
  /** 墓碑十字星（强烈看跌） */
  gravestoneDoji: boolean;
}

/** K线预计算数据（用于性能优化） */
interface PrecomputedKLine {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  body: number;
  bodyTop: number;
  bodyBottom: number;
  upperShadow: number;
  lowerShadow: number;
  range: number;
  isBullish: boolean;
  isBearish: boolean;
  isDojiBody: boolean;
  isSmallBody: boolean;
  isLargeBody: boolean;
}

/** 形态检测配置 */
export interface PatternDetectionConfig {
  /** 十字星阈值（实体/范围），默认0.1 (10%) */
  dojiThreshold?: number;
  /** 小实体阈值（实体/范围），默认0.33 */
  smallBodyThreshold?: number;
  /** 大实体阈值（实体/范围），默认0.66 */
  largeBodyThreshold?: number;
  /** 影线相对实体倍数，默认2 */
  shadowBodyRatio?: number;
  /** 启用成交量确认 */
  useVolumeConfirmation?: boolean;
  /** 成交量放大倍数 */
  volumeMultiplier?: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<PatternDetectionConfig> = {
  dojiThreshold: 0.1,
  smallBodyThreshold: 0.33,
  largeBodyThreshold: 0.66,
  shadowBodyRatio: 2,
  useVolumeConfirmation: false,
  volumeMultiplier: 1.5,
};

/**
 * 预计算K线数据（性能优化：避免重复计算）
 */
function precomputeKLine(kline: KLineData): PrecomputedKLine {
  const body = Math.abs(kline.close - kline.open);
  const bodyTop = Math.max(kline.open, kline.close);
  const bodyBottom = Math.min(kline.open, kline.close);
  const upperShadow = kline.high - bodyTop;
  const lowerShadow = bodyBottom - kline.low;
  const range = kline.high - kline.low;
  const isBullish = kline.close > kline.open;
  const isBearish = kline.close < kline.open;
  const bodyRatio = range > 0 ? body / range : 0;

  return {
    open: kline.open,
    close: kline.close,
    high: kline.high,
    low: kline.low,
    volume: kline.volume,
    body,
    bodyTop,
    bodyBottom,
    upperShadow,
    lowerShadow,
    range,
    isBullish,
    isBearish,
    isDojiBody: bodyRatio <= 0.1,
    isSmallBody: bodyRatio < 0.33,
    isLargeBody: bodyRatio > 0.66,
  };
}

/**
 * 预计算窗口内所有K线（性能优化）
 */
function precomputeWindow(windowData: KLineData[]): PrecomputedKLine[] {
  return windowData.map(precomputeKLine);
}

/**
 * 计算窗口内平均成交量（用于成交量确认）
 */
function calculateAvgVolume(precomputed: PrecomputedKLine[], lookback: number = 20): number {
  const start = Math.max(0, precomputed.length - lookback);
  const window = precomputed.slice(start);
  if (window.length === 0) return 0;
  const sum = window.reduce((acc, k) => acc + k.volume, 0);
  return sum / window.length;
}

// ==================== 基础形态检测函数 ====================

/**
 * 判断是否为锤头线（Hammer）
 * 特征：实体小，下影线长（至少是实体的2倍），上影线很短或没有
 */
export function isHammer(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体要小
  if (!p.isSmallBody) return false;

  // 下影线要长（至少是实体的2倍）
  if (p.lowerShadow < p.body * cfg.shadowBodyRatio) return false;

  // 上影线要短（小于范围的1/3）
  if (p.upperShadow >= p.range / 3) return false;

  // 成交量确认（可选）
  if (cfg.useVolumeConfirmation && p.volume > 0) {
    // 锤头线通常伴随放量
    // 这个检查在 detectPatternsInWindow 中进行
  }

  return true;
}

/**
 * 判断是否为射击之星（Shooting Star）
 * 特征：实体小，上影线长（至少是实体的2倍），下影线很短或没有
 */
export function isShootingStar(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体要小
  if (!p.isSmallBody) return false;

  // 上影线要长（至少是实体的2倍）
  if (p.upperShadow < p.body * cfg.shadowBodyRatio) return false;

  // 下影线要短（小于范围的1/3）
  if (p.lowerShadow >= p.range / 3) return false;

  return true;
}

/**
 * 判断是否为倒锤头线（Inverted Hammer）
 * 特征：实体小，上影线长，下影线短，出现在下降趋势底部
 */
export function isInvertedHammer(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体要小
  if (!p.isSmallBody) return false;

  // 上影线要长（至少是实体的2倍）
  if (p.upperShadow < p.body * cfg.shadowBodyRatio) return false;

  // 下影线要短
  if (p.lowerShadow >= p.range / 3) return false;

  return true;
}

/**
 * 判断是否为上吊线（Hanging Man）
 * 特征：实体小，下影线长，出现在上升趋势顶部
 */
export function isHangingMan(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体要小
  if (!p.isSmallBody) return false;

  // 下影线要长（至少是实体的2倍）
  if (p.lowerShadow < p.body * cfg.shadowBodyRatio) return false;

  // 上影线要短
  if (p.upperShadow >= p.range / 3) return false;

  return true;
}

/**
 * 判断是否为蜻蜓十字星（Dragonfly Doji）
 * 特征：开盘=收盘=最高价，只有下影线，强烈看涨信号
 */
export function isDragonflyDoji(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体非常小（接近十字星）
  if (p.body / p.range >= 0.05) return false;

  // 开盘和收盘接近最高价
  const openCloseAvg = (p.open + p.close) / 2;
  if (p.high - openCloseAvg > p.range * 0.1) return false;

  // 有明显的下影线
  if (p.lowerShadow < p.range * 0.5) return false;

  return true;
}

/**
 * 判断是否为墓碑十字星（Gravestone Doji）
 * 特征：开盘=收盘=最低价，只有上影线，强烈看跌信号
 */
export function isGravestoneDoji(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  // 实体非常小（接近十字星）
  if (p.body / p.range >= 0.05) return false;

  // 开盘和收盘接近最低价
  const openCloseAvg = (p.open + p.close) / 2;
  if (openCloseAvg - p.low > p.range * 0.1) return false;

  // 有明显的上影线
  if (p.upperShadow < p.range * 0.5) return false;

  return true;
}

/**
 * 判断是否为十字星（Doji）
 * 特征：开盘价和收盘价非常接近
 */
export function isDoji(kline: KLineData, config: PatternDetectionConfig = {}): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const p = precomputeKLine(kline);

  if (p.range <= 0) return false;

  return p.body / p.range < cfg.dojiThreshold;
}

/**
 * 判断是否为阳包阴吞没形态（Bullish Engulfing）
 * 需要两根K线：前阴后阳，当前阳的实体完全包裹前一根阴的实体
 */
export function isBullishEngulfing(prev: PrecomputedKLine, curr: PrecomputedKLine): boolean {
  if (prev.body <= 0 || curr.body <= 0) return false;

  // 前一根是阴线
  if (!prev.isBearish) return false;
  // 当前是阳线
  if (!curr.isBullish) return false;

  // 当前K线的实体要完全吞没前一根K线的实体
  return curr.bodyBottom < prev.bodyBottom && curr.bodyTop > prev.bodyTop && curr.body > prev.body;
}

/**
 * 判断是否为阴包阳吞没形态（Bearish Engulfing）
 */
export function isBearishEngulfing(prev: PrecomputedKLine, curr: PrecomputedKLine): boolean {
  if (prev.body <= 0 || curr.body <= 0) return false;

  // 前一根是阳线
  if (!prev.isBullish) return false;
  // 当前是阴线
  if (!curr.isBearish) return false;

  // 当前K线的实体要完全吞没前一根K线的实体
  return curr.bodyBottom < prev.bodyBottom && curr.bodyTop > prev.bodyTop && curr.body > prev.body;
}

/**
 * 判断是否为早晨之星（Morning Star）
 * 需要三根K线：大阴线 + 小实体 + 大阳线
 */
export function isMorningStar(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 2) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const first = precomputed[index - 2];
  const second = precomputed[index - 1];
  const third = precomputed[index];

  // 第一根是大阴线
  if (!first.isBearish || first.body <= 0) return false;

  // 第二根是小实体（可以是十字星或小阴阳线）
  if (second.body >= first.body * cfg.smallBodyThreshold * 1.5) return false;

  // 第三根是大阳线
  if (!third.isBullish || third.body < first.body * cfg.largeBodyThreshold) return false;

  // 第三根收盘价应该进入第一根实体的一半以上
  const firstMidpoint = (first.open + first.close) / 2;
  return third.close > firstMidpoint;
}

/**
 * 判断是否为黄昏之星（Evening Star）
 * 需要三根K线：大阳线 + 小实体 + 大阴线
 */
export function isEveningStar(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 2) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const first = precomputed[index - 2];
  const second = precomputed[index - 1];
  const third = precomputed[index];

  // 第一根是大阳线
  if (!first.isBullish || first.body <= 0) return false;

  // 第二根是小实体
  if (second.body >= first.body * cfg.smallBodyThreshold * 1.5) return false;

  // 第三根是大阴线
  if (!third.isBearish || third.body < first.body * cfg.largeBodyThreshold) return false;

  // 第三根收盘价应该进入第一根实体的一半以下
  const firstMidpoint = (first.open + first.close) / 2;
  return third.close < firstMidpoint;
}

// ==================== 新增形态函数 ====================

/**
 * 判断是否为乌云盖顶（Dark Cloud Cover）- 见顶信号
 * 形态特征：大阳线后出现大阴线，开盘高于前一日最高价，收盘深入阳线实体一半以下
 */
export function isDarkCloudCover(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 1) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const prev = precomputed[index - 1];
  const curr = precomputed[index];

  // 前一根是大阳线
  if (!prev.isBullish || !prev.isLargeBody) return false;

  // 当前是大阴线
  if (!curr.isBearish || !curr.isLargeBody) return false;

  // 乌云盖顶特征：当前开盘高于前一日最高价
  if (curr.open <= prev.high) return false;

  // 当前收盘深入阳线实体一半以下
  const prevMidpoint = (prev.open + prev.close) / 2;
  return curr.close < prevMidpoint;
}

/**
 * 判断是否为刺透形态（Piercing Line）- 见底信号
 * 形态特征：大阴线后出现大阳线，开盘低于前一日最低价，收盘深入阴线实体一半以上
 */
export function isPiercing(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 1) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const prev = precomputed[index - 1];
  const curr = precomputed[index];

  // 前一根是大阴线
  if (!prev.isBearish || !prev.isLargeBody) return false;

  // 当前是大阳线
  if (!curr.isBullish || !curr.isLargeBody) return false;

  // 刺透特征：当前开盘低于前一日最低价
  if (curr.open >= prev.low) return false;

  // 当前收盘深入阴线实体一半以上
  const prevMidpoint = (prev.open + prev.close) / 2;
  return curr.close > prevMidpoint;
}

/**
 * 判断是否为阳孕阴（Bullish Harami）- 底部反转
 * 前一根是大阴线，当前是小阳线（实体完全在前面阴线实体内）
 */
export function isBullishHarami(prev: PrecomputedKLine, curr: PrecomputedKLine): boolean {
  if (prev.body <= 0 || curr.body <= 0) return false;

  // 前一根是大阴线
  if (!prev.isBearish || !prev.isLargeBody) return false;

  // 当前是小实体阳线
  if (!curr.isBullish || !curr.isSmallBody) return false;

  // 当前实体完全在前面阴线实体内
  return curr.bodyTop < prev.bodyTop && curr.bodyBottom > prev.bodyBottom;
}

/**
 * 判断是否为阴孕阳（Bearish Harami）- 顶部反转
 * 前一根是大阳线，当前是小阴线（实体完全在前面阳线实体内）
 */
export function isBearishHarami(prev: PrecomputedKLine, curr: PrecomputedKLine): boolean {
  if (prev.body <= 0 || curr.body <= 0) return false;

  // 前一根是大阳线
  if (!prev.isBullish || !prev.isLargeBody) return false;

  // 当前是小实体阴线
  if (!curr.isBearish || !curr.isSmallBody) return false;

  // 当前实体完全在前面阳线实体内
  return curr.bodyTop < prev.bodyTop && curr.bodyBottom > prev.bodyBottom;
}

/**
 * 判断是否为三只乌鸦（Three Black Crows）- 下跌信号
 * 三根连续的大阴线，每根收盘都接近当日最低价
 */
export function isThreeBlackCrows(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 2) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const first = precomputed[index - 2];
  const second = precomputed[index - 1];
  const third = precomputed[index];

  // 三根都是大阴线
  if (!first.isBearish || !first.isLargeBody) return false;
  if (!second.isBearish || !second.isLargeBody) return false;
  if (!third.isBearish || !third.isLargeBody) return false;

  // 每根收盘都接近当日最低价（下影线短）
  const threshold = third.range * 0.1; // 下影线不超过范围的10%
  if (third.lowerShadow > threshold) return false;
  if (second.lowerShadow > threshold) return false;
  if (first.lowerShadow > threshold) return false;

  // 三根K线实体依次下降（收盘价越来越低）
  if (!(first.close > second.close && second.close > third.close)) return false;

  // 每根的开盘价都在前一根实体范围内
  if (!(first.open > second.open && first.open < second.close)) return false;
  if (!(second.open > third.open && second.open < third.close)) return false;

  return true;
}

/**
 * 判断是否为三兵红烛（Three White Soldiers）- 上涨信号
 * 三根连续的大阳线，每根收盘都接近当日最高价
 */
export function isThreeWhiteSoldiers(
  precomputed: PrecomputedKLine[],
  index: number,
  config: PatternDetectionConfig = {}
): boolean {
  if (index < 2) return false;

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const first = precomputed[index - 2];
  const second = precomputed[index - 1];
  const third = precomputed[index];

  // 三根都是大阳线
  if (!first.isBullish || !first.isLargeBody) return false;
  if (!second.isBullish || !second.isLargeBody) return false;
  if (!third.isBullish || !third.isLargeBody) return false;

  // 每根收盘都接近当日最高价（上影线短）
  const threshold = third.range * 0.1; // 上影线不超过范围的10%
  if (third.upperShadow > threshold) return false;
  if (second.upperShadow > threshold) return false;
  if (first.upperShadow > threshold) return false;

  // 三根K线实体依次上升（收盘价越来越高）
  if (!(first.close < second.close && second.close < third.close)) return false;

  // 每根的开盘价都在前一根实体范围内
  if (!(first.open < second.open && first.open > second.close)) return false;
  if (!(second.open < third.open && second.open > third.close)) return false;

  return true;
}

// ==================== 综合检测函数 ====================

/**
 * 检测K线数据中的形态（仅最新一根）
 * @param klineData K线数据
 * @param config 检测配置
 */
export function detectCandlestickPatterns(
  klineData: KLineData[],
  config: PatternDetectionConfig = {}
): CandlestickPatternResult {
  const len = klineData.length;
  const result: CandlestickPatternResult = {
    hammer: false,
    shootingStar: false,
    doji: false,
    engulfingBullish: false,
    engulfingBearish: false,
    morningStar: false,
    eveningStar: false,
    darkCloudCover: false,
    piercing: false,
    haramiBullish: false,
    haramiBearish: false,
    threeBlackCrows: false,
    threeWhiteSoldiers: false,
    invertedHammer: false,
    hangingMan: false,
    dragonflyDoji: false,
    gravestoneDoji: false,
  };

  if (len === 0) return result;

  const precomputed = precomputeWindow(klineData);
  const lastIdx = len - 1;
  const last = precomputed[lastIdx];
  const prev = len >= 2 ? precomputed[lastIdx - 1] : null;

  // 单根K线形态
  result.hammer = isHammer(klineData[lastIdx], config);
  result.shootingStar = isShootingStar(klineData[lastIdx], config);
  result.doji = last.isDojiBody;

  // 双根K线形态
  if (prev) {
    result.engulfingBullish = isBullishEngulfing(prev, last);
    result.engulfingBearish = isBearishEngulfing(prev, last);
    result.haramiBullish = isBullishHarami(prev, last);
    result.haramiBearish = isBearishHarami(prev, last);
  }

  // 三根K线形态
  if (len >= 3) {
    result.morningStar = isMorningStar(precomputed, lastIdx, config);
    result.eveningStar = isEveningStar(precomputed, lastIdx, config);
    result.darkCloudCover = isDarkCloudCover(precomputed, lastIdx, config);
    result.piercing = isPiercing(precomputed, lastIdx, config);
    result.threeBlackCrows = isThreeBlackCrows(precomputed, lastIdx, config);
    result.threeWhiteSoldiers = isThreeWhiteSoldiers(precomputed, lastIdx, config);
  }

  return result;
}

/**
 * 检测K线数据中的形态（回溯窗口内任一位置存在即返回true）
 * 性能优化：预计算 + 提前中断
 *
 * @param klineData K线数据
 * @param lookback 回溯窗口大小，默认20
 * @param config 检测配置
 */
export function detectCandlestickPatternsInWindow(
  klineData: KLineData[],
  lookback: number = 20,
  config: PatternDetectionConfig = {}
): CandlestickPatternResult {
  const len = klineData.length;

  const result: CandlestickPatternResult = {
    hammer: false,
    shootingStar: false,
    doji: false,
    engulfingBullish: false,
    engulfingBearish: false,
    morningStar: false,
    eveningStar: false,
    darkCloudCover: false,
    piercing: false,
    haramiBullish: false,
    haramiBearish: false,
    threeBlackCrows: false,
    threeWhiteSoldiers: false,
    invertedHammer: false,
    hangingMan: false,
    dragonflyDoji: false,
    gravestoneDoji: false,
  };

  if (len === 0) return result;

  // 预计算窗口内所有K线（性能优化）
  const windowStart = Math.max(0, len - lookback);
  const windowData = klineData.slice(windowStart);
  const windowLen = windowData.length;
  const precomputed = precomputeWindow(windowData);

  // 计算平均成交量（用于成交量确认）
  const avgVolume = config.useVolumeConfirmation ? calculateAvgVolume(precomputed, lookback) : 0;

  // 检测单根K线形态（性能优化：找到即停止）
  for (let i = 0; i < windowLen; i++) {
    const kline = windowData[i];
    const p = precomputed[i];

    if (!result.hammer && isHammer(kline, config)) {
      // 成交量确认
      const volumeMultiplier = config.volumeMultiplier || 1.5;
      if (!config.useVolumeConfirmation || p.volume >= avgVolume * volumeMultiplier) {
        result.hammer = true;
      }
    }
    if (!result.shootingStar && isShootingStar(kline, config)) {
      result.shootingStar = true;
    }
    if (!result.doji && p.isDojiBody) {
      result.doji = true;
    }
    // 新增形态检测
    if (!result.invertedHammer && isInvertedHammer(kline, config)) {
      result.invertedHammer = true;
    }
    if (!result.hangingMan && isHangingMan(kline, config)) {
      result.hangingMan = true;
    }
    if (!result.dragonflyDoji && isDragonflyDoji(kline, config)) {
      result.dragonflyDoji = true;
    }
    if (!result.gravestoneDoji && isGravestoneDoji(kline, config)) {
      result.gravestoneDoji = true;
    }

    // 性能优化：所有单根形态都找到后停止
    if (
      result.hammer &&
      result.shootingStar &&
      result.doji &&
      result.invertedHammer &&
      result.hangingMan &&
      result.dragonflyDoji &&
      result.gravestoneDoji
    )
      break;
  }

  // 检测双根K线形态
  for (let i = 1; i < windowLen; i++) {
    const prev = precomputed[i - 1];
    const curr = precomputed[i];

    if (!result.engulfingBullish) {
      result.engulfingBullish = isBullishEngulfing(prev, curr);
    }
    if (!result.engulfingBearish) {
      result.engulfingBearish = isBearishEngulfing(prev, curr);
    }
    if (!result.haramiBullish) {
      result.haramiBullish = isBullishHarami(prev, curr);
    }
    if (!result.haramiBearish) {
      result.haramiBearish = isBearishHarami(prev, curr);
    }

    if (
      result.engulfingBullish &&
      result.engulfingBearish &&
      result.haramiBullish &&
      result.haramiBearish
    ) {
      break;
    }
  }

  // 检测三根K线形态
  for (let i = 2; i < windowLen; i++) {
    if (!result.morningStar) {
      result.morningStar = isMorningStar(precomputed, i, config);
    }
    if (!result.eveningStar) {
      result.eveningStar = isEveningStar(precomputed, i, config);
    }
    if (!result.darkCloudCover) {
      result.darkCloudCover = isDarkCloudCover(precomputed, i, config);
    }
    if (!result.piercing) {
      result.piercing = isPiercing(precomputed, i, config);
    }
    if (!result.threeBlackCrows) {
      result.threeBlackCrows = isThreeBlackCrows(precomputed, i, config);
    }
    if (!result.threeWhiteSoldiers) {
      result.threeWhiteSoldiers = isThreeWhiteSoldiers(precomputed, i, config);
    }

    // 性能优化：所有三根形态都找到后停止
    if (
      result.morningStar &&
      result.eveningStar &&
      result.darkCloudCover &&
      result.piercing &&
      result.threeBlackCrows &&
      result.threeWhiteSoldiers
    ) {
      break;
    }
  }

  return result;
}

/**
 * 兼容旧接口：返回简化版形态检测结果
 * @deprecated 建议使用 detectCandlestickPatternsInWindow
 */
export function detectCandlestickPatternsLegacy(klineData: KLineData[]): {
  hammer: boolean;
  shootingStar: boolean;
  doji: boolean;
  engulfing: boolean;
  morningStar: boolean;
  eveningStar: boolean;
} {
  const result = detectCandlestickPatternsInWindow(klineData, 20);
  return {
    hammer: result.hammer,
    shootingStar: result.shootingStar,
    doji: result.doji,
    engulfing: result.engulfingBullish || result.engulfingBearish,
    morningStar: result.morningStar,
    eveningStar: result.eveningStar,
  };
}
