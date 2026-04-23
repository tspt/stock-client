/**
 * 单日异动（急跌/急涨）形态：最近 N 根 K 线窗口内，用阈值 M 判定单日涨跌，再组合 S1–S4 / P1–P4。
 * 与旧「放量/箱体横盘后继」逻辑无关。
 */

import type { KLineData, SharpMovePatternAnalysis } from '@/types/stock';

function deltaPercent(prevClose: number, close: number): number {
  if (prevClose <= 0) return 0;
  return ((close - prevClose) / prevClose) * 100;
}

/** t 为当日 K 线索引，用 t-1 与 t 的收盘计算单日涨跌幅 */
function classifyDay(klineData: KLineData[], t: number, m: number): 'drop' | 'rise' | 'normal' {
  const prev = klineData[t - 1].close;
  const cur = klineData[t].close;
  const d = deltaPercent(prev, cur);
  if (d <= -m) return 'drop';
  if (d >= m) return 'rise';
  return 'normal';
}

/** 判断是否为横盘日（涨跌幅绝对值 < flatThreshold） */
function isFlatDay(klineData: KLineData[], t: number, flatThreshold: number): boolean {
  const prev = klineData[t - 1].close;
  const cur = klineData[t].close;
  const d = Math.abs(deltaPercent(prev, cur));
  return d < flatThreshold;
}

function firstRiseAfter(
  klineData: KLineData[],
  fromExclusive: number,
  m: number,
  len: number
): number | undefined {
  for (let t = fromExclusive + 1; t < len; t++) {
    if (classifyDay(klineData, t, m) === 'rise') return t;
  }
  return undefined;
}

function firstDropAfter(
  klineData: KLineData[],
  fromExclusive: number,
  m: number,
  len: number
): number | undefined {
  for (let t = fromExclusive + 1; t < len; t++) {
    if (classifyDay(klineData, t, m) === 'drop') return t;
  }
  return undefined;
}

function middleAllNormal(klineData: KLineData[], i: number, j: number, m: number): boolean {
  for (let k = i + 1; k < j; k++) {
    if (classifyDay(klineData, k, m) !== 'normal') return false;
  }
  return true;
}

/** 检查中间是否全部是横盘日（使用独立的横盘幅度阈值） */
function middleAllFlat(
  klineData: KLineData[],
  i: number,
  j: number,
  flatThreshold: number
): boolean {
  for (let k = i + 1; k < j; k++) {
    if (!isFlatDay(klineData, k, flatThreshold)) return false;
  }
  return true;
}

/**
 * @param windowBars 最近多少根 K 线（右对齐最后一根）
 * @param magnitudePercent 阈值 M（%），用于判断急涨/急跌
 * @param flatThresholdPercent 横盘幅度阈值（%），用于判断“横盘”
 */
export function analyzeSharpMovePatterns(
  klineData: KLineData[],
  windowBars: number,
  magnitudePercent: number,
  flatThresholdPercent: number = magnitudePercent // 默认使用 magnitudePercent 保持向后兼容
): SharpMovePatternAnalysis {
  const m = magnitudePercent;
  const flatThreshold = flatThresholdPercent;
  const len = klineData?.length ?? 0;
  const wb = Math.max(1, Math.floor(windowBars));

  const empty = (): SharpMovePatternAnalysis => ({
    windowBars: wb,
    magnitudePercent: m,
    flatThresholdPercent: flatThreshold,
    onlyDrop: false,
    onlyRise: false,
    dropThenRiseLoose: false,
    riseThenDropLoose: false,
    dropThenFlatThenRise: false,
    riseThenFlatThenDrop: false,
    lastDropBarsAgo: undefined,
    lastRiseBarsAgo: undefined,
    lastDropIndex: undefined,
    lastRiseIndex: undefined,
    labels: [],
  });

  if (len < 2 || m <= 0) {
    return empty();
  }

  const start = Math.max(0, len - wb);
  /** 仅统计「前一日与当日」均落在窗口 [start, len-1] 内的涨跌，故 t≥start+1；若 wb=1 则 tMin>tMax，无有效日 */
  const tMin = Math.max(1, start + 1);
  const tMax = len - 1;

  let onlyDrop = false;
  let onlyRise = false;

  for (let t = tMin; t <= tMax; t++) {
    const c = classifyDay(klineData, t, m);
    if (c === 'drop') onlyDrop = true;
    if (c === 'rise') onlyRise = true;
  }

  /** 最近一次急跌日索引（窗口内、从新往旧） */
  let lastDropIndex: number | undefined;
  for (let t = tMax; t >= tMin; t--) {
    if (classifyDay(klineData, t, m) === 'drop') {
      lastDropIndex = t;
      break;
    }
  }
  /** 最近一次急涨日索引 */
  let lastRiseIndex: number | undefined;
  for (let t = tMax; t >= tMin; t--) {
    if (classifyDay(klineData, t, m) === 'rise') {
      lastRiseIndex = t;
      break;
    }
  }

  const lastDropBarsAgo = lastDropIndex !== undefined ? len - 1 - lastDropIndex : undefined;
  const lastRiseBarsAgo = lastRiseIndex !== undefined ? len - 1 - lastRiseIndex : undefined;

  let dropThenRiseLoose = false;
  let riseThenDropLoose = false;
  let dropThenFlatThenRise = false;
  let riseThenFlatThenDrop = false;

  for (let i = tMin; i <= tMax; i++) {
    if (classifyDay(klineData, i, m) !== 'drop') continue;
    const jLoose = firstRiseAfter(klineData, i, m, len);
    if (jLoose !== undefined && jLoose <= tMax) {
      dropThenRiseLoose = true;
      if (middleAllFlat(klineData, i, jLoose, flatThreshold)) {
        dropThenFlatThenRise = true;
      }
    }
  }

  for (let i = tMin; i <= tMax; i++) {
    if (classifyDay(klineData, i, m) !== 'rise') continue;
    const jLoose = firstDropAfter(klineData, i, m, len);
    if (jLoose !== undefined && jLoose <= tMax) {
      riseThenDropLoose = true;
      if (middleAllFlat(klineData, i, jLoose, flatThreshold)) {
        riseThenFlatThenDrop = true;
      }
    }
  }

  const labels: string[] = [];
  if (onlyDrop) labels.push('仅急跌');
  if (onlyRise) labels.push('仅急涨');
  if (dropThenRiseLoose) labels.push('急跌→急涨');
  if (riseThenDropLoose) labels.push('急涨→急跌');
  if (dropThenFlatThenRise) labels.push('急跌横盘急涨');
  if (riseThenFlatThenDrop) labels.push('急涨横盘急跌');

  return {
    windowBars: wb,
    magnitudePercent: m,
    flatThresholdPercent: flatThreshold,
    onlyDrop,
    onlyRise,
    dropThenRiseLoose,
    riseThenDropLoose,
    dropThenFlatThenRise,
    riseThenFlatThenDrop,
    lastDropBarsAgo,
    lastRiseBarsAgo,
    lastDropIndex,
    lastRiseIndex,
    labels,
  };
}
