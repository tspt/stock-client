/**
 * 沿趋势线（收盘不跌 + 收盘在 MA5 之上）在检索窗内滑动检测
 */

import type { KLineData, TrendLineAnalysis } from '@/types/stock';

const EPSILON = 1e-6;
const MA5_PERIOD = 5;

/** 每根 K 线收盘对应的 MA5；前四根样本不足时为 null。 */
function buildMa5AtClose(klineData: KLineData[]): (number | null)[] {
  const len = klineData.length;
  const ma5: (number | null)[] = new Array(len);
  for (let j = 0; j < len; j++) {
    if (j < MA5_PERIOD - 1) {
      ma5[j] = null;
      continue;
    }
    let sum = 0;
    for (let k = j - (MA5_PERIOD - 1); k <= j; k++) {
      sum += klineData[k].close;
    }
    ma5[j] = sum / MA5_PERIOD;
  }
  return ma5;
}

function segmentSatisfiesTrendLine(
  klineData: KLineData[],
  ma5: (number | null)[],
  startIndex: number,
  length: number
): boolean {
  for (let j = startIndex; j < startIndex + length; j++) {
    if (j < 1) {
      return false;
    }
    if (klineData[j].close + EPSILON < klineData[j - 1].close) {
      return false;
    }
    const ma = ma5[j];
    if (ma === null) {
      return false;
    }
    if (klineData[j].close + EPSILON < ma) {
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

  const ma5 = buildMa5AtClose(klineData);

  const m = Math.min(M, klineData.length);
  const windowStart = klineData.length - m;

  let bestStart = -1;
  for (let i = klineData.length - N; i >= windowStart; i--) {
    if (segmentSatisfiesTrendLine(klineData, ma5, i, N)) {
      bestStart = i;
      break;
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
