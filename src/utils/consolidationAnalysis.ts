/**
 * 横盘分析工具函数
 */

import type {
  ConsolidationAnalysis,
  ConsolidationMatch,
  ConsolidationType,
  KLineData,
} from '@/types/stock';

const EPSILON = 1e-6;
const MA10_PERIOD = 10;

/** 与逐点 sma 等价：下标 i 处为第 i 根收盘参与时的 SMA10，前 MA10_PERIOD-1 根为 null */
function buildSma10Array(klineData: KLineData[]): (number | null)[] {
  const len = klineData.length;
  const out: (number | null)[] = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = null;
  }
  if (len < MA10_PERIOD) {
    return out;
  }
  let sum = 0;
  for (let k = 0; k < MA10_PERIOD; k++) {
    sum += klineData[k].close;
  }
  out[MA10_PERIOD - 1] = sum / MA10_PERIOD;
  for (let i = MA10_PERIOD; i < len; i++) {
    sum += klineData[i].close - klineData[i - MA10_PERIOD].close;
    out[i] = sum / MA10_PERIOD;
  }
  return out;
}

/** 连续段 [startIndex, startIndex+length) 内每日收盘价是否均不低于当日 MA10（sma10AtBar 须与 buildSma10Array 一致） */
function segmentClosesAllOnOrAboveMa10(
  klineData: KLineData[],
  sma10AtBar: (number | null)[],
  startIndex: number,
  length: number
): boolean {
  for (let j = startIndex; j < startIndex + length; j++) {
    const ma = sma10AtBar[j];
    if (ma === null) {
      return false;
    }
    if (klineData[j].close + EPSILON < ma) {
      return false;
    }
  }
  return true;
}

export const CONSOLIDATION_TYPE_LABELS: Record<ConsolidationType, string> = {
  low_stable: '低点稳定型',
  high_stable: '高点稳定型',
  box: '箱体型',
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function hasMeaningfulDifference(values: number[]): boolean {
  if (values.length < 2) {
    return false;
  }

  return Math.max(...values) - Math.min(...values) > EPSILON;
}

function calculateRangePercent(minValue: number, maxValue: number): number {
  if (minValue <= 0 || maxValue < minValue) {
    return 0;
  }

  return ((maxValue - minValue) / minValue) * 100;
}

function calculateStrength(metric: number, threshold: number): number {
  if (threshold <= 0 || metric >= threshold) return 0;

  // 使用指数衰减：metric越小，strength越高；ratio=0时strength=100, ratio=1时strength≈5
  const ratio = metric / threshold;
  return round(Math.exp(-3 * ratio) * 100);
}

function createMatch(
  type: ConsolidationType,
  reason: string,
  strength: number
): ConsolidationMatch {
  return {
    type,
    label: CONSOLIDATION_TYPE_LABELS[type],
    reason,
    strength,
  };
}

/**
 * 按三种结构识别横盘：
 * 1. 低点稳定型
 * 2. 高点稳定型
 * 3. 箱体型
 */
export function calculateConsolidation(
  klineData: KLineData[],
  options: {
    period: number;
    threshold: number;
  }
): ConsolidationAnalysis {
  const period = Math.max(1, Math.floor(options.period));
  const threshold = options.threshold;

  if (!klineData || klineData.length < period || threshold < 0) {
    return {
      period,
      lookback: period,
      threshold,
      isConsolidation: false,
      matchedTypes: [],
      matchedTypeLabels: [],
      matches: [],
      reasonText: '数据不足',
      strength: 0,
      metrics: {
        lowRangePercent: 0,
        highRangePercent: 0,
        closeChanged: false,
        highChanged: false,
        lowChanged: false,
      },
    };
  }

  const recent = klineData.slice(-period);
  const lows = recent.map((item) => item.low);
  const highs = recent.map((item) => item.high);
  const closes = recent.map((item) => item.close);

  const lowRangePercent = round(calculateRangePercent(Math.min(...lows), Math.max(...lows)));
  const highRangePercent = round(calculateRangePercent(Math.min(...highs), Math.max(...highs)));
  const closeChanged = hasMeaningfulDifference(closes);
  const highChanged = hasMeaningfulDifference(highs);
  const lowChanged = hasMeaningfulDifference(lows);

  const matches: ConsolidationMatch[] = [];

  if (lowRangePercent <= threshold && closeChanged && highChanged) {
    matches.push(
      createMatch(
        'low_stable',
        `低稳·低波${lowRangePercent}%`,
        calculateStrength(lowRangePercent, threshold)
      )
    );
  }

  if (highRangePercent <= threshold && closeChanged && lowChanged) {
    matches.push(
      createMatch(
        'high_stable',
        `高稳·高波${highRangePercent}%`,
        calculateStrength(highRangePercent, threshold)
      )
    );
  }

  if (lowRangePercent <= threshold && highRangePercent <= threshold && closeChanged) {
    matches.push(
      createMatch(
        'box',
        `箱体·低${lowRangePercent}%高${highRangePercent}%`,
        round(
          (calculateStrength(lowRangePercent, threshold) +
            calculateStrength(highRangePercent, threshold)) /
            2
        )
      )
    );
  }

  const matchedTypes = matches.map((item) => item.type);
  const matchedTypeLabels = matches.map((item) => item.label);

  const compactReason =
    matches.length > 0
      ? `连${period}根·低${lowRangePercent}%·高${highRangePercent}%`
      : `连${period}根未命中`;

  return {
    period,
    lookback: period,
    threshold,
    isConsolidation: matches.length > 0,
    matchedTypes,
    matchedTypeLabels,
    matches,
    reasonText: compactReason,
    strength: matches.length > 0 ? Math.max(...matches.map((item) => item.strength)) : 0,
    metrics: {
      lowRangePercent,
      highRangePercent,
      closeChanged,
      highChanged,
      lowChanged,
    },
  };
}

/**
 * 以 K 线末尾为终点，向前取 M 根；若其中存在连续 N 根满足横盘结构则命中。
 * 多段命中时取强度最高者，强度相同时取更靠近最新 K 线的一段。
 */
export function calculateConsolidationInLookback(
  klineData: KLineData[],
  options: {
    lookback: number;
    consecutive: number;
    threshold: number;
    /** 为 true 时，命中段内每一根收盘价须 ≥ 当日 MA10（十日线） */
    requireClosesAboveMa10?: boolean;
  }
): ConsolidationAnalysis {
  const rawM = Math.max(1, Math.floor(options.lookback));
  const N = Math.max(1, Math.floor(options.consecutive));
  const threshold = options.threshold;
  const requireMa10 = options.requireClosesAboveMa10 === true;
  const M = Math.max(N, rawM);

  const emptyMetrics = {
    lowRangePercent: 0,
    highRangePercent: 0,
    closeChanged: false,
    highChanged: false,
    lowChanged: false,
  };

  if (!klineData || klineData.length < N || threshold < 0) {
    return {
      period: N,
      lookback: M,
      threshold,
      isConsolidation: false,
      matchedTypes: [],
      matchedTypeLabels: [],
      matches: [],
      reasonText: '数据不足',
      strength: 0,
      metrics: emptyMetrics,
    };
  }

  const m = Math.min(M, klineData.length);
  const windowStart = klineData.length - m;
  const sma10AtBar = requireMa10 ? buildSma10Array(klineData) : null;

  let best: ConsolidationAnalysis | null = null;
  let bestStart = -1;

  for (let i = windowStart; i <= klineData.length - N; i++) {
    const segment = klineData.slice(i, i + N);
    const result = calculateConsolidation(segment, { period: N, threshold });
    if (!result.isConsolidation) {
      continue;
    }
    if (requireMa10 && sma10AtBar && !segmentClosesAllOnOrAboveMa10(klineData, sma10AtBar, i, N)) {
      continue;
    }
    if (
      !best ||
      result.strength > best.strength ||
      (result.strength === best.strength && i > bestStart)
    ) {
      best = result;
      bestStart = i;
    }
  }

  if (!best) {
    const ma10Note = requireMa10 ? '·MA10' : '';
    return {
      period: N,
      lookback: m,
      threshold,
      isConsolidation: false,
      matchedTypes: [],
      matchedTypeLabels: [],
      matches: [],
      reasonText: `检${m}无${N}连${ma10Note}`,
      strength: 0,
      metrics: emptyMetrics,
    };
  }

  const endsAtLatest = bestStart === klineData.length - N;
  const tailTag = endsAtLatest ? '含尾' : '非尾';
  const ma10Suffix = requireMa10 ? '·MA10' : '';
  return {
    ...best,
    period: N,
    lookback: m,
    reasonText: `检${m}·${tailTag} ${best.reasonText}${ma10Suffix}`,
  };
}
