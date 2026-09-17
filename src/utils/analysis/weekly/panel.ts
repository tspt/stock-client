/**
 * 周K逐周因子面板
 *
 * 存在的意义：回测要在「每一个历史周」重算横截面评分，就必须把
 * computeWeeklyFactors 的「只算最后一周」扩展成「每一周都算一遍」。
 *
 * 两条硬约束：
 * 1. 第 i 周的因子只能用 index <= i 的数据（回测里未来函数是最致命的错误）。
 * 2. 计算必须在几百只股票 × 几百周上跑得动，因此回归/回撤这类窗口计算用前缀和
 *    或滚动实现，不做 O(n*window) 的朴素重算。
 *
 * 本模块产出的快照与 computeWeeklyFactors 语义一致，可以直接喂给
 * scoreWeeklyFactors，从而保证「回测的评分」与「页面上看到的评分」是同一个算法。
 */

import type { KLineData } from '@/types/stock';
import {
  atrWilder,
  clamp,
  ema,
  rollingExtremes,
  rollingLogRegression,
  rollingMaxDrawdown,
  safe,
  sma,
  stdev,
} from './math';
import { estimateAmount, resolveMacdState } from './factors';
import type { WeeklyConfig, WeeklyFactors, WeeklyStructure } from './types';

/** 逐周面板：每个数组的下标与 bars 对齐，NaN/undefined 表示该周数据不足 */
export interface WeeklyPanel {
  code: string;
  name: string;
  bars: KLineData[];
  n: number;

  close: number[];
  high: number[];
  low: number[];
  volume: number[];
  amount: number[];

  ma5: number[];
  ma8: number[];
  ma10: number[];
  ma20: number[];
  /** Wilder ATR20，止损与乖离都用它归一化 */
  atr: number[];
  /** 近 4 周 MA20 变化率（%） */
  ma20Slope: Array<number | undefined>;

  ret13w: Array<number | undefined>;
  ret13wSkip1: Array<number | undefined>;
  ret1w: Array<number | undefined>;
  ret26w: Array<number | undefined>;
  ret52w: Array<number | undefined>;
  vol13w: Array<number | undefined>;

  pos52w: Array<number | undefined>;
  atrPct: Array<number | undefined>;
  extBias: Array<number | undefined>;
  maxDD52w: Array<number | undefined>;

  avgAmount20w: Array<number | undefined>;
  amount8wMedian: Array<number | undefined>;
  amountCrowd8w: Array<number | undefined>;
  volRatio5: Array<number | undefined>;

  boxHigh: Array<number | undefined>;
  boxLow: Array<number | undefined>;
  boxAmplitude: Array<number | undefined>;
  boxBreakout: boolean[];
  boxBreakoutFirst: boolean[];
  /** 当前价距箱顶的距离（%，正值=已突破，负值=仍在箱体内） */
  distToBoxHigh: Array<number | undefined>;

  maStack: boolean[];
  pxAboveMa8: boolean[];
  pxAboveMa10: boolean[];
  pxAboveMa20: boolean[];
  structure: WeeklyStructure[];
  /** 26 周回归年化斜率（%，趋势方向强度） */
  annualSlope: Array<number | undefined>;
  /** 26 周回归 R²（趋势干净程度） */
  trendR2: Array<number | undefined>;
  /** 近 4 周均量 / 近 26 周均量，衡量量能是趋势性放大还是单周脉冲 */
  volTrend4_26: Array<number | undefined>;

  macdDif: Array<number | undefined>;
  macdDea: Array<number | undefined>;
  macdGoldenCross: boolean[];
  macdGoldenAboveZero: boolean[];
  macdDeathCross: boolean[];
  macdBullish: boolean[];

  /** 近 104 周内疑似异常跳空次数 */
  suspectedGaps: number[];
}

function prefixSums(values: number[]): number[] {
  const out = new Array<number>(values.length + 1).fill(0);
  for (let i = 0; i < values.length; i += 1) out[i + 1] = out[i] + values[i];
  return out;
}

function sumRange(prefix: number[], from: number, to: number): number {
  const lo = Math.max(0, from);
  const hi = Math.min(to, prefix.length - 2);
  if (hi < lo) return NaN;
  return prefix[hi + 1] - prefix[lo];
}

function retAt(closes: number[], i: number, weeks: number): number | undefined {
  const ref = i - weeks;
  if (ref < 0) return undefined;
  const start = closes[ref];
  const end = closes[i];
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(end)) return undefined;
  return ((end - start) / start) * 100;
}

/** 构建单只股票的逐周因子面板 */
export function buildWeeklyPanel(
  code: string,
  name: string,
  bars: KLineData[],
  config: WeeklyConfig
): WeeklyPanel {
  const n = bars.length;
  const close = bars.map((d) => d.close);
  const high = bars.map((d) => d.high);
  const low = bars.map((d) => d.low);
  const volume = bars.map((d) => d.volume);
  const amount = bars.map(estimateAmount);

  const ma5 = sma(close, 5);
  const ma8 = sma(close, 8);
  const ma10 = sma(close, 10);
  const ma20 = sma(close, 20);
  const atr = atrWilder(bars, 20);

  const ma20Slope: Array<number | undefined> = new Array(n).fill(undefined);
  const atrPct: Array<number | undefined> = new Array(n).fill(undefined);
  const extBias: Array<number | undefined> = new Array(n).fill(undefined);
  const maStack: boolean[] = new Array(n).fill(false);
  const pxAboveMa8: boolean[] = new Array(n).fill(false);
  const pxAboveMa10: boolean[] = new Array(n).fill(false);
  const pxAboveMa20: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    const c = close[i];
    const m20 = safe(ma20, i);
    const m8 = safe(ma8, i);
    const m10 = safe(ma10, i);
    const m5 = safe(ma5, i);
    const m20Prev = safe(ma20, i - 4);
    const a = safe(atr, i);

    if (m20 !== undefined && m20Prev !== undefined && m20Prev > 0) {
      ma20Slope[i] = ((m20 - m20Prev) / m20Prev) * 100;
    }
    if (a !== undefined && Number.isFinite(c) && c > 0) {
      atrPct[i] = (a / c) * 100;
      if (m20 !== undefined && a > 0) extBias[i] = (c - m20) / a;
    }
    if (Number.isFinite(c)) {
      pxAboveMa8[i] = m8 !== undefined && c >= m8;
      pxAboveMa10[i] = m10 !== undefined && c >= m10;
      pxAboveMa20[i] = m20 !== undefined && c >= m20;
      maStack[i] =
        m5 !== undefined &&
        m10 !== undefined &&
        m20 !== undefined &&
        m5 > m10 &&
        m10 > m20 &&
        (ma20Slope[i] ?? 0) > 0;
    }
  }

  const ret13w: Array<number | undefined> = new Array(n).fill(undefined);
  const ret13wSkip1: Array<number | undefined> = new Array(n).fill(undefined);
  const ret1w: Array<number | undefined> = new Array(n).fill(undefined);
  const ret26w: Array<number | undefined> = new Array(n).fill(undefined);
  const ret52w: Array<number | undefined> = new Array(n).fill(undefined);
  const vol13w: Array<number | undefined> = new Array(n).fill(undefined);
  for (let i = 0; i < n; i += 1) {
    ret13w[i] = retAt(close, i, 13);
    ret1w[i] = retAt(close, i, 1);
    ret26w[i] = retAt(close, i, 26);
    ret52w[i] = retAt(close, i, 52);
    if (i >= 13) {
      const start = close[i - 13];
      const end = close[i - 1];
      if (Number.isFinite(start) && start > 0 && Number.isFinite(end)) {
        ret13wSkip1[i] = ((end - start) / start) * 100;
      }
    }
    if (i >= 13) {
      const rets: number[] = [];
      for (let j = i - 12; j <= i; j += 1) {
        const prev = close[j - 1];
        const cur = close[j];
        if (prev > 0 && Number.isFinite(cur)) rets.push((cur / prev - 1) * 100);
      }
      vol13w[i] = stdev(rets);
    }
  }

  // ===== 位置与风险（滚动窗口，只含当周及之前） =====
  const pos52w: Array<number | undefined> = new Array(n).fill(undefined);
  {
    const hi52 = rollingExtremes(high, 52).max;
    const lo52 = rollingExtremes(low, 52).min;
    for (let i = 0; i < n; i += 1) {
      const hi = hi52[i];
      const lo = lo52[i];
      if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) continue;
      if (!Number.isFinite(close[i])) continue;
      pos52w[i] = clamp(((close[i] - lo) / (hi - lo)) * 100, 0, 100);
    }
  }

  const ddArr = rollingMaxDrawdown(close, 52);
  const maxDD52w: Array<number | undefined> = new Array(n).fill(undefined);
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(ddArr[i])) maxDD52w[i] = ddArr[i];
  }

  // ===== 量能 =====
  const amountPrefix = prefixSums(amount);
  const avgAmount20w: Array<number | undefined> = new Array(n).fill(undefined);
  const amount8wMedian: Array<number | undefined> = new Array(n).fill(undefined);
  const amountCrowd8w: Array<number | undefined> = new Array(n).fill(undefined);
  const volRatio5: Array<number | undefined> = new Array(n).fill(undefined);
  for (let i = 0; i < n; i += 1) {
    if (i >= 19) {
      const s = sumRange(amountPrefix, i - 19, i);
      if (Number.isFinite(s)) avgAmount20w[i] = s / 20;
    }
    if (i >= 7) {
      const window = amount.slice(i - 7, i + 1).filter((v) => Number.isFinite(v));
      const med = window.slice().sort((a, b) => a - b);
      const mid = Math.floor(med.length / 2);
      const medianAmt =
        med.length % 2 === 0 ? (med[mid - 1] + med[mid]) / 2 : med[mid];
      amount8wMedian[i] = medianAmt;
      if (medianAmt > 0 && Number.isFinite(amount[i])) {
        amountCrowd8w[i] = amount[i] / medianAmt;
      }
    }
    if (i >= 5) {
      let sum = 0;
      let count = 0;
      for (let j = i - 5; j < i; j += 1) {
        sum += volume[j];
        count += 1;
      }
      if (count > 0 && sum > 0) volRatio5[i] = volume[i] / (sum / count);
    }
  }

  // 量能趋势：近 4 周均量 / 近 26 周均量。单周脉冲与持续放量在周线级别含义完全不同
  const volPrefix = prefixSums(volume);
  const volTrend4_26: Array<number | undefined> = new Array(n).fill(undefined);
  for (let i = 25; i < n; i += 1) {
    const recent = sumRange(volPrefix, i - 3, i) / 4;
    const base = sumRange(volPrefix, i - 25, i) / 26;
    if (base > 0) volTrend4_26[i] = recent / base;
  }

  // ===== 形态：箱体突破 =====
  const boxLookback = config.boxLookback;
  const boxHigh: Array<number | undefined> = new Array(n).fill(undefined);
  const boxLow: Array<number | undefined> = new Array(n).fill(undefined);
  const boxAmplitude: Array<number | undefined> = new Array(n).fill(undefined);
  const boxBreakout: boolean[] = new Array(n).fill(false);
  const boxBreakoutFirst: boolean[] = new Array(n).fill(false);
  const distToBoxHigh: Array<number | undefined> = new Array(n).fill(undefined);

  for (let i = boxLookback; i < n; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - boxLookback; j < i; j += 1) {
      if (high[j] > hi) hi = high[j];
      if (low[j] < lo) lo = low[j];
    }
    boxHigh[i] = hi;
    boxLow[i] = lo;
    if (lo > 0) boxAmplitude[i] = ((hi - lo) / lo) * 100;
    if (hi > 0 && Number.isFinite(close[i])) distToBoxHigh[i] = ((close[i] - hi) / hi) * 100;

    const amp = boxAmplitude[i];
    const amplitudeOk =
      amp !== undefined && amp >= config.boxAmplitudeMin && amp <= config.boxAmplitudeMax;
    const volumeOk = volRatio5[i] !== undefined && (volRatio5[i] as number) >= config.breakoutVolumeRatio;
    const prevClose = i > 0 ? close[i - 1] : undefined;
    if (close[i] > hi && amplitudeOk && volumeOk) {
      boxBreakout[i] = true;
      boxBreakoutFirst[i] = prevClose !== undefined && prevClose <= hi;
    }
  }

  // ===== 结构：26 周对数回归（滚动） =====
  const regression = rollingLogRegression(close, config.trendLookback);
  const structure: WeeklyStructure[] = new Array(n).fill('sideways');
  const annualSlope: Array<number | undefined> = new Array(n).fill(undefined);
  const trendR2: Array<number | undefined> = new Array(n).fill(undefined);
  for (let i = 0; i < n; i += 1) {
    annualSlope[i] = safe(regression.annualized, i);
    trendR2[i] = safe(regression.r2, i);
    const r2 = safe(regression.r2, i);
    const annual = safe(regression.annualized, i);
    if (r2 === undefined || annual === undefined) continue;
    if (r2 >= config.trendR2Min) {
      if (annual >= config.trendSlopeMin) structure[i] = 'up';
      else if (annual <= -config.trendSlopeMin) structure[i] = 'down';
    }
  }

  // ===== MACD：全序列 EMA 无前视，状态逐周回溯 =====
  const emaFast = ema(close, 12);
  const emaSlow = ema(close, 26);
  const dif = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(dif, 9);
  const macdDif: Array<number | undefined> = new Array(n).fill(undefined);
  const macdDea: Array<number | undefined> = new Array(n).fill(undefined);
  const macdGoldenCross: boolean[] = new Array(n).fill(false);
  const macdGoldenAboveZero: boolean[] = new Array(n).fill(false);
  const macdDeathCross: boolean[] = new Array(n).fill(false);
  const macdBullish: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i += 1) {
    const d = safe(dif, i);
    const e = safe(dea, i);
    macdDif[i] = d;
    macdDea[i] = e;
    if (d === undefined || e === undefined) continue;
    macdBullish[i] = d > e && d > 0 && e > 0;
    const state = resolveMacdState(dif, dea, i, config.macdCrossLookback);
    macdGoldenCross[i] = state.golden;
    macdGoldenAboveZero[i] = state.goldenAboveZero;
    macdDeathCross[i] = state.death;
  }

  // ===== 异常跳空（近 104 周滚动计数） =====
  const gapFlags = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const prev = close[i - 1];
    if (prev > 0) {
      const change = Math.abs((close[i] - prev) / prev) * 100;
      if (change > config.gapThreshold) gapFlags[i] = 1;
    }
  }
  const gapPrefix = prefixSums(gapFlags);
  const suspectedGaps: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const s = sumRange(gapPrefix, Math.max(0, i - 103), i);
    suspectedGaps[i] = Number.isFinite(s) ? s : 0;
  }

  return {
    code,
    name,
    bars,
    n,
    close,
    high,
    low,
    volume,
    amount,
    ma5,
    ma8,
    ma10,
    ma20,
    atr,
    ma20Slope,
    ret13w,
    ret13wSkip1,
    ret1w,
    ret26w,
    ret52w,
    vol13w,
    pos52w,
    atrPct,
    extBias,
    maxDD52w,
    avgAmount20w,
    amount8wMedian,
    amountCrowd8w,
    volRatio5,
    boxHigh,
    boxLow,
    boxAmplitude,
    boxBreakout,
    boxBreakoutFirst,
    distToBoxHigh,
    maStack,
    pxAboveMa8,
    pxAboveMa10,
    pxAboveMa20,
    structure,
    annualSlope,
    trendR2,
    volTrend4_26,
    macdDif,
    macdDea,
    macdGoldenCross,
    macdGoldenAboveZero,
    macdDeathCross,
    macdBullish,
    suspectedGaps,
  };
}

/**
 * 取第 i 周的因子快照。
 *
 * 只填「当周可见」的字段；quality 一律按可用处理，数据不足的周由调用方
 * （回测主循环用 minBars）提前排除，不再重复判定。
 */
export function snapshotAt(p: WeeklyPanel, i: number): WeeklyFactors {
  const bar = p.bars[i];
  const prevClose = i > 0 ? p.close[i - 1] : undefined;
  return {
    code: p.code,
    name: p.name,
    bars: p.n,
    confirmedBars: i + 1,
    runningWeekIncluded: false,
    lastWeekTime: bar.time,
    close: p.close[i],
    weekChangePercent:
      prevClose !== undefined && prevClose > 0
        ? ((p.close[i] - prevClose) / prevClose) * 100
        : 0,
    ma5: safe(p.ma5, i),
    ma8: safe(p.ma8, i),
    ma10: safe(p.ma10, i),
    ma20: safe(p.ma20, i),
    ma30: undefined,
    ma20Slope: p.ma20Slope[i],
    maStack: p.maStack[i],
    pxAboveMa8: p.pxAboveMa8[i],
    pxAboveMa10: p.pxAboveMa10[i],
    pxAboveMa20: p.pxAboveMa20[i],
    ret13w: p.ret13w[i],
    ret13wSkip1: p.ret13wSkip1[i],
    ret1w: p.ret1w[i],
    ret26w: p.ret26w[i],
    ret52w: p.ret52w[i],
    vol13w: p.vol13w[i],
    high52w: undefined,
    low52w: undefined,
    pos52w: p.pos52w[i],
    bias20: undefined,
    extBias: p.extBias[i],
    avgAmount20w: p.avgAmount20w[i],
    amount8wMedian: p.amount8wMedian[i],
    amountCrowd8w: p.amountCrowd8w[i],
    volRatio5: p.volRatio5[i],
    volTrend4_26: p.volTrend4_26[i],
    atrPct: p.atrPct[i],
    maxDD52w: p.maxDD52w[i],
    boxHigh: p.boxHigh[i],
    boxLow: p.boxLow[i],
    boxAmplitude: p.boxAmplitude[i],
    boxBreakout: p.boxBreakout[i],
    boxBreakoutFirst: p.boxBreakoutFirst[i],
    distToBoxHigh: p.distToBoxHigh[i],
    // 估值需要外部财报数据，逐周面板无法提供，回测中一律缺失（估值维度暂不参与回测）
    pb: undefined,
    peTtm: undefined,
    structure: p.structure[i],
    annualSlope: p.annualSlope[i],
    trendR2: p.trendR2[i],
    macdDif: p.macdDif[i],
    macdDea: p.macdDea[i],
    macdBar: undefined,
    macdGoldenCross: p.macdGoldenCross[i],
    macdGoldenAboveZero: p.macdGoldenAboveZero[i],
    macdDeathCross: p.macdDeathCross[i],
    macdBullish: p.macdBullish[i],
    quality: { ok: true, reasons: [], suspectedGaps: p.suspectedGaps[i], pausedWeeks: 0 },
  };
}
