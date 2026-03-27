/**
 * 沿趋势线（收盘不跌 + 收盘在 MA5 之上）在检索窗内滑动检测
 */

import type { KLineData, TrendLineAnalysis } from '@/types/stock';

const EPSILON = 1e-6;
const MA5_PERIOD = 5;

function sma5AtIndex(klineData: KLineData[], index: number): number | null {
  if (index < MA5_PERIOD - 1 || index >= klineData.length) {
    return null;
  }
  let sum = 0;
  for (let k = index - (MA5_PERIOD - 1); k <= index; k++) {
    sum += klineData[k].close;
  }
  return sum / MA5_PERIOD;
}

function segmentSatisfiesTrendLine(klineData: KLineData[], startIndex: number, length: number): boolean {
  for (let j = startIndex; j < startIndex + length; j++) {
    if (j < 1) {
      return false;
    }
    if (klineData[j].close + EPSILON < klineData[j - 1].close) {
      return false;
    }
    const ma5 = sma5AtIndex(klineData, j);
    if (ma5 === null) {
      return false;
    }
    if (klineData[j].close + EPSILON < ma5) {
      return false;
    }
  }
  return true;
}

/**
 * 以 K 线末尾为终点向前取 M 根；若存在连续 N 根满足「收盘≥昨收且收盘≥当日MA5」，取起点下标最大的一段（最贴近最新 K 线）。
 */
export function calculateTrendLineInLookback(
  klineData: KLineData[],
  options: { lookback: number; consecutive: number }
): TrendLineAnalysis {
  const rawM = Math.max(1, Math.floor(options.lookback));
  const N = Math.max(1, Math.floor(options.consecutive));
  const M = Math.max(N, rawM);

  if (!klineData || klineData.length < N) {
    return {
      lookback: M,
      consecutive: N,
      isHit: false,
      reasonText: '数据不足',
    };
  }

  const m = Math.min(M, klineData.length);
  const windowStart = klineData.length - m;

  let bestStart = -1;
  for (let i = windowStart; i <= klineData.length - N; i++) {
    if (segmentSatisfiesTrendLine(klineData, i, N)) {
      bestStart = i;
    }
  }

  if (bestStart < 0) {
    return {
      lookback: m,
      consecutive: N,
      isHit: false,
      reasonText: `检${m}无${N}连`,
    };
  }

  const endsAtLatest = bestStart === klineData.length - N;
  const tailTag = endsAtLatest ? '含尾' : '非尾';
  return {
    lookback: m,
    consecutive: N,
    isHit: true,
    reasonText: `检${m}·${tailTag} 连${N}根·≥昨收·≥MA5`,
  };
}
