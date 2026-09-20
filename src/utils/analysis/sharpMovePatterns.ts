/**
 * 单日异动（急跌/急涨）形态：最近 N 根 K 线窗口内，用阈值 M 判定单日涨跌，再组合 S1–S4 / P1–P4。
 * 与旧「放量/箱体横盘后继」逻辑无关。
 *
 * 口径说明：
 * - 单日涨跌幅统一按「前一日收盘 → 当日收盘」（close-to-close）计算。
 * - 窗口右对齐最新一根；因判定需要前一日收盘，窗口首根不参与判定，
 *   故「检索根数 = N」时实际可判定的交易日为 N-1 天。
 * - S1/S2 为「窗口内是否存在」该类异动日（不要求互斥，两者可同时为真）。
 * - P1/P2 为急跌/急涨与相反方向异动的最小配对（中间不限）。
 * - P3/P4 额外要求中间至少 1 根、且中间每日均为横盘日（|涨跌幅| < 横盘阈值）。
 *
 * 实现要点：为把复杂度控制在 O(len)，先一次性预计算逐日涨跌幅与分类，
 * 再用后向扫描得到 nextRise/nextDrop，替代逐次的向前查找。
 */

import type { KLineData, SharpMovePatternAnalysis } from '@/types/stock';

type DayClass = 'drop' | 'rise' | 'normal';

/** 单日涨跌幅（%）；前收非法时按 0 处理，避免污染判定 */
function deltaPercent(prevClose: number, close: number): number {
  if (!Number.isFinite(prevClose) || prevClose <= 0) return 0;
  return ((close - prevClose) / prevClose) * 100;
}

function emptyAnalysis(
  windowBars: number,
  magnitudePercent: number,
  flatThresholdPercent: number
): SharpMovePatternAnalysis {
  return {
    windowBars,
    magnitudePercent,
    flatThresholdPercent,
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
  };
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
  flatThresholdPercent: number = magnitudePercent
): SharpMovePatternAnalysis {
  const m = magnitudePercent;
  // 横盘阈值不得超过异动阈值：否则“横盘日”会同时是急涨/急跌日，
  // P3/P4 的“中间为横盘”退化，形态失真。
  const flatThreshold = Math.min(flatThresholdPercent, m);
  const len = klineData?.length ?? 0;
  const wb = Math.max(1, Math.floor(windowBars));

  if (len < 2 || !Number.isFinite(m) || m <= 0) {
    return emptyAnalysis(wb, m, flatThreshold);
  }

  // ⓪ 一次性预计算逐日涨跌幅与分类，后续所有判定复用（O(len)）
  const delta: number[] = new Array(len).fill(0);
  const cls: DayClass[] = new Array(len).fill('normal');
  for (let t = 1; t < len; t++) {
    const d = deltaPercent(klineData[t - 1].close, klineData[t].close);
    delta[t] = d;
    cls[t] = d <= -m ? 'drop' : d >= m ? 'rise' : 'normal';
  }

  const start = Math.max(0, len - wb);
  /** 仅统计「前一日与当日」均落在窗口 [start, len-1] 内的涨跌，故 t≥start+1 */
  const tMin = Math.max(1, start + 1);
  const tMax = len - 1;
  if (tMin > tMax) {
    // 窗口内没有可判定的交易日（如 wb=1）
    return emptyAnalysis(wb, m, flatThreshold);
  }

  // 后向扫描：nextRise[i] / nextDrop[i] 为 i 之后首个同类日的索引，-1 表示不存在
  const nextRise: number[] = new Array(len).fill(-1);
  const nextDrop: number[] = new Array(len).fill(-1);
  let nearestRise = -1;
  let nearestDrop = -1;
  for (let t = len - 1; t >= 0; t--) {
    nextRise[t] = nearestRise;
    nextDrop[t] = nearestDrop;
    if (cls[t] === 'rise') nearestRise = t;
    if (cls[t] === 'drop') nearestDrop = t;
  }

  // 窗口内是否存在急跌 / 急涨，以及最近一次发生的索引
  let onlyDrop = false;
  let onlyRise = false;
  let lastDropIndex: number | undefined;
  let lastRiseIndex: number | undefined;
  for (let t = tMax; t >= tMin; t--) {
    if (cls[t] === 'drop') {
      onlyDrop = true;
      if (lastDropIndex === undefined) lastDropIndex = t;
    } else if (cls[t] === 'rise') {
      onlyRise = true;
      if (lastRiseIndex === undefined) lastRiseIndex = t;
    }
  }

  const lastDropBarsAgo = lastDropIndex !== undefined ? len - 1 - lastDropIndex : undefined;
  const lastRiseBarsAgo = lastRiseIndex !== undefined ? len - 1 - lastRiseIndex : undefined;

  /** 中间段（开区间 i+1..j-1）每日是否均为横盘日 */
  const middleAllFlat = (i: number, j: number): boolean => {
    for (let k = i + 1; k < j; k++) {
      if (Math.abs(delta[k]) >= flatThreshold) return false;
    }
    return true;
  };

  let dropThenRiseLoose = false;
  let riseThenDropLoose = false;
  let dropThenFlatThenRise = false;
  let riseThenFlatThenDrop = false;

  for (let i = tMin; i <= tMax; i++) {
    if (cls[i] !== 'drop') continue;
    const j = nextRise[i];
    if (j === -1 || j > tMax) continue;
    dropThenRiseLoose = true;
    // 要求中间至少 1 根：否则退化为相邻两日的 V 型，与 P1 重复，
    // 且与「急跌横盘急涨」的字面含义不符。
    if (j > i + 1 && middleAllFlat(i, j)) {
      dropThenFlatThenRise = true;
    }
  }

  for (let i = tMin; i <= tMax; i++) {
    if (cls[i] !== 'rise') continue;
    const j = nextDrop[i];
    if (j === -1 || j > tMax) continue;
    riseThenDropLoose = true;
    if (j > i + 1 && middleAllFlat(i, j)) {
      riseThenFlatThenDrop = true;
    }
  }

  const labels: string[] = [];
  if (onlyDrop) labels.push('存在急跌');
  if (onlyRise) labels.push('存在急涨');
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
