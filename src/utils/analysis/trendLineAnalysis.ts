/**
 * 沿趋势线（收盘不跌 + 收盘在 MA5 之上）在检索窗内滑动检测
 */

import type { KLineData, TrendLineAnalysis } from '@/types/stock';

const EPSILON = 1e-6;
const MA5_PERIOD = 5;

export interface TrendLineOptions {
  /** 检索根数 M：从最新一根向前追溯的根数 */
  lookback: number;
  /** 连续根数 N：需要连续满足的根数 */
  consecutive: number;
  /**
   * 是否要求命中段延伸到最新一根 K 线（含尾）。
   * 开启后只评估「以最新一根结尾」的那一段，可排除“趋势早已走完”的无效命中。
   */
  requireEndsAtLatest?: boolean;
  /** 命中段累计涨幅下限（%）：段前一日收盘 → 段最后一根收盘；0 表示不限制 */
  minRisePct?: number;
}

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
 * 命中段累计涨幅（%）：段起点前一日收盘 → 段最后一根收盘。
 * 段起点为第一根（无前一日收盘）或收盘价非法时返回 null。
 */
function segmentRisePct(
  klineData: KLineData[],
  startIndex: number,
  length: number
): number | null {
  if (startIndex < 1) {
    return null;
  }
  const baseClose = klineData[startIndex - 1]?.close;
  const lastClose = klineData[startIndex + length - 1]?.close;
  if (!Number.isFinite(baseClose) || baseClose <= 0 || !Number.isFinite(lastClose)) {
    return null;
  }
  return ((lastClose - baseClose) / baseClose) * 100;
}

/**
 * 以 K 线末尾为终点向前取 M 根，寻找连续 N 根满足「收盘≥昨收且收盘≥当日MA5」的片段：
 * - `requireEndsAtLatest` 为 true 时，只接受以最新一根结尾的片段；
 * - `minRisePct > 0` 时，片段累计涨幅需达到该下限；
 * - 命中多个时可取起点最大（最贴近最新 K 线）的一段。
 */
export function calculateTrendLineInLookback(
  klineData: KLineData[],
  options: TrendLineOptions
): TrendLineAnalysis {
  const rawM = Math.max(1, Math.floor(options.lookback));
  const N = Math.max(1, Math.floor(options.consecutive));
  const M = Math.max(N, rawM);
  const requireEndsAtLatest = options.requireEndsAtLatest === true;
  const minRisePct =
    typeof options.minRisePct === 'number' && Number.isFinite(options.minRisePct) && options.minRisePct > 0
      ? options.minRisePct
      : 0;

  const effective = { requireEndsAtLatest, minRisePct };

  if (!klineData || klineData.length < N) {
    return {
      lookback: M,
      consecutive: N,
      ...effective,
      isHit: false,
      reasonText: '数据不足',
    };
  }

  const ma5 = buildMa5AtClose(klineData);

  const m = Math.min(M, klineData.length);
  const windowStart = klineData.length - m;
  const latestStart = klineData.length - N;

  let bestStart = -1;
  for (let i = latestStart; i >= windowStart; i--) {
    if (
      segmentSatisfiesTrendLine(klineData, ma5, i, N) &&
      (minRisePct === 0 || (segmentRisePct(klineData, i, N) ?? -Infinity) + EPSILON >= minRisePct)
    ) {
      bestStart = i;
      break;
    }
    // 只允许“含尾”时，第一个候选（以最新一根结尾）不满足即可判定未命中
    if (requireEndsAtLatest) {
      break;
    }
  }

  const riseTag = minRisePct > 0 ? `·累涨≥${minRisePct}%` : '';

  if (bestStart < 0) {
    return {
      lookback: m,
      consecutive: N,
      ...effective,
      isHit: false,
      reasonText: `检${m}无${N}连${riseTag}`,
    };
  }

  const endsAtLatest = bestStart === latestStart;
  const tailTag = endsAtLatest ? '含尾' : '非尾';
  const risePct = segmentRisePct(klineData, bestStart, N);
  const riseDetail =
    risePct === null ? '' : `·累涨${risePct.toFixed(1)}%`;

  return {
    lookback: m,
    consecutive: N,
    ...effective,
    isHit: true,
    endsAtLatest,
    risePct: risePct ?? undefined,
    reasonText: `检${m}·${tailTag} 连${N}根·≥昨收·≥MA5${riseDetail}${minRisePct > 0 ? `(≥${minRisePct}%)` : ''}`,
  };
}
