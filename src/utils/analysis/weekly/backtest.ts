/**
 * 周线信号回测
 *
 * 存在的意义：技术面筛选最大的问题是「无法自证」——选出一批票之后，
 * 谁也说不清这套逻辑历史上到底有没有用。本模块用已有的周K历史回答这个问题：
 *
 *   对每一周都回到当时，用「当时可见的数据」判断信号是否触发，
 *   再统计之后 4/8/13/26 周的实际收益，并与同期全市场中位数收益对比。
 *
 * 关键约束（否则回测会骗人）：
 * 1. 只用当时可得数据：第 i 周的信号只能用 index <= i 的数据，绝不向前看。
 * 2. 必须扣掉基准：牛市里随便买都涨，只有超额收益才算逻辑有效。
 * 3. 信号点要有持有期：i + horizon 必须存在，否则该点不纳入统计（避免幸存者偏差）。
 */

import type { KLineData } from '@/types/stock';
import { atrWilder, median, sma, startOfWeek } from './math';
import type { BacktestHorizonStat, WeeklyBacktestResult } from './types';

/** 回测用的信号规则（由 UI 的筛选条件映射而来） */
export interface WeeklySignalRule {
  /** 收盘价站上周 MA20 */
  requireAboveMa20: boolean;
  /** 周 MA20 向上（中期趋势向上） */
  requireMa20Rising: boolean;
  /** 要求箱体首次突破 */
  requireBoxBreakout: boolean;
  /** ATR 归一化乖离上限 */
  maxExtBias?: number;
  /** 最低周均成交额（元） */
  minAvgAmount?: number;
  /** 52 周分位上限 */
  maxPos52w?: number;
}

export interface BacktestOptions {
  /** 最多参与回测的股票数（全市场太慢，抽样即可得到统计结论） */
  sampleSize?: number;
  /** 持有周数列表 */
  horizons?: number[];
  /** 信号之间最小间隔（周），避免同一波行情被重复计入 */
  cooldownWeeks?: number;
}

const DEFAULT_HORIZONS = [4, 8, 13, 26];

/** 简单可复现的伪随机（避免抽样结果每次都变） */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function reservoirSample<T>(items: T[], size: number, rand: () => number): T[] {
  if (items.length <= size) return items;
  const out = items.slice(0, size);
  for (let i = size; i < items.length; i += 1) {
    const j = Math.floor(rand() * (i + 1));
    if (j < size) out[j] = items[i];
  }
  return out;
}

/** 区间极值（O(n*window)，窗口小、样本可控，够用且实现简单） */
function rollingExtremes(
  values: number[],
  window: number
): { max: number[]; min: number[] } {
  const n = values.length;
  const max = new Array<number>(n).fill(NaN);
  const min = new Array<number>(n).fill(NaN);
  for (let i = window - 1; i < n; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - window + 1; j <= i; j += 1) {
      if (values[j] > hi) hi = values[j];
      if (values[j] < lo) lo = values[j];
    }
    max[i] = hi;
    min[i] = lo;
  }
  return { max, min };
}

interface PreparedSeries {
  code: string;
  bars: KLineData[];
  close: number[];
  ma20: number[];
  atr: number[];
  amount: number[];
  boxHigh: number[];
  volRatio5: number[];
  pos52w: number[];
}

/** 预先算好每个历史周点需要的全部指标，回测时 O(1) 取值 */
function prepare(bars: KLineData[], boxLookback: number, needPos: boolean): PreparedSeries {
  const close = bars.map((d) => d.close);
  const high = bars.map((d) => d.high);
  const low = bars.map((d) => d.low);
  const volume = bars.map((d) => d.volume);
  const ma20 = sma(close, 20);
  const atr = atrWilder(bars, 20);
  const amount = bars.map((d) => (d.amount && d.amount > 0 ? d.amount : d.volume * d.close * 100));

  const n = bars.length;
  const boxHigh = new Array<number>(n).fill(NaN);
  const volRatio5 = new Array<number>(n).fill(NaN);
  for (let i = boxLookback; i < n; i += 1) {
    let hi = -Infinity;
    for (let j = i - boxLookback; j < i; j += 1) {
      if (high[j] > hi) hi = high[j];
    }
    boxHigh[i] = hi;

    let sum = 0;
    let count = 0;
    for (let j = i - 5; j < i; j += 1) {
      if (j >= 0) {
        sum += volume[j];
        count += 1;
      }
    }
    if (count > 0 && sum > 0) volRatio5[i] = volume[i] / (sum / count);
  }

  let pos52w: number[] = new Array<number>(n).fill(NaN);
  if (needPos) {
    const hi52 = rollingExtremes(high, 52).max;
    const lo52 = rollingExtremes(low, 52).min;
    for (let i = 0; i < n; i += 1) {
      if (!Number.isFinite(hi52[i]) || !Number.isFinite(lo52[i])) continue;
      const span = hi52[i] - lo52[i];
      pos52w[i] = span > 0 ? ((close[i] - lo52[i]) / span) * 100 : NaN;
    }
  }

  return {
    code: '',
    bars,
    close,
    ma20,
    atr,
    amount,
    boxHigh,
    volRatio5,
    pos52w,
  };
}

/** 在第 i 周判断信号是否触发（只用 index <= i 的数据） */
function signalTriggered(
  p: PreparedSeries,
  i: number,
  rule: WeeklySignalRule,
  boxLookback: number
): boolean {
  const close = p.close[i];
  const ma20 = p.ma20[i];
  if (!Number.isFinite(close) || !Number.isFinite(ma20) || ma20 <= 0) return false;

  if (rule.requireAboveMa20 && close < ma20) return false;

  if (rule.requireMa20Rising) {
    const prev = p.ma20[i - 4];
    if (!Number.isFinite(prev) || prev <= 0 || ma20 <= prev) return false;
  }

  const atr = p.atr[i];
  if (rule.maxExtBias !== undefined) {
    if (!Number.isFinite(atr) || atr <= 0) return false;
    if ((close - ma20) / atr > rule.maxExtBias) return false;
  }

  if (rule.minAvgAmount !== undefined && rule.minAvgAmount > 0) {
    let sum = 0;
    let count = 0;
    for (let j = i - 19; j <= i; j += 1) {
      if (j >= 0) {
        sum += p.amount[j];
        count += 1;
      }
    }
    if (count < 20 || sum / count < rule.minAvgAmount) return false;
  }

  if (rule.maxPos52w !== undefined) {
    const pos = p.pos52w[i];
    if (!Number.isFinite(pos) || pos > rule.maxPos52w) return false;
  }

  if (rule.requireBoxBreakout) {
    const boxHigh = p.boxHigh[i];
    const prevClose = p.close[i - 1];
    const volRatio = p.volRatio5[i];
    if (!Number.isFinite(boxHigh)) return false;
    if (close <= boxHigh) return false;
    // 首次突破：前一周仍在箱顶之下
    if (Number.isFinite(prevClose) && prevClose > boxHigh) return false;
    if (!Number.isFinite(volRatio) || volRatio < 1.5) return false;
    // 箱体振幅需在合理区间，排除单边趋势与「织布机」
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - boxLookback; j < i; j += 1) {
      const h = p.bars[j].high;
      const l = p.bars[j].low;
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    if (lo <= 0) return false;
    const amplitude = ((hi - lo) / lo) * 100;
    if (amplitude < 8 || amplitude > 30) return false;
  }

  return true;
}

/**
 * 对全市场周K做信号回测
 * @param klines 周K数据（应为前复权）
 * @param rule 信号规则
 */
export function backtestWeeklySignals(
  klines: Map<string, KLineData[]>,
  rule: WeeklySignalRule,
  options: BacktestOptions = {}
): WeeklyBacktestResult {
  const horizons = options.horizons ?? DEFAULT_HORIZONS;
  const sampleSize = options.sampleSize ?? 400;
  const cooldown = options.cooldownWeeks ?? 8;
  const boxLookback = 10;
  const maxHorizon = Math.max(...horizons);
  const minBars = 60;

  const entries = Array.from(klines.entries()).filter(([, bars]) => bars.length >= minBars + maxHorizon + 10);
  const rand = makeRandom(20240915);
  const sampled = entries.length > sampleSize;
  const sample = reservoirSample(entries, sampleSize, rand);

  const needPos = rule.maxPos52w !== undefined;

  /** 信号样本：持有周数 -> 收益数组 */
  const signalReturns = new Map<number, number[]>();
  /** 信号样本对应的基准：持有周数 -> 基准收益数组 */
  const signalBenchmarks = new Map<number, number[]>();
  /** 全市场基准：周时间戳 -> 持有周数 -> 收益数组 */
  const baseline = new Map<number, Map<number, number[]>>();

  horizons.forEach((h) => {
    signalReturns.set(h, []);
    signalBenchmarks.set(h, []);
  });

  let signalCount = 0;

  sample.forEach(([code, rawBars]) => {
    const bars = rawBars.slice().sort((a, b) => a.time - b.time);
    const p = prepare(bars, boxLookback, needPos);
    p.code = code;

    // 预留持有期，避免把「还没走完的未来」算进去
    const lastIndex = bars.length - 1 - maxHorizon;
    if (lastIndex <= minBars) return;

    let lastSignal = -Infinity;

    for (let i = minBars; i <= lastIndex; i += 1) {
      const weekKey = startOfWeek(bars[i].time);

      // 记录全市场基准（无论是否触发信号）
      horizons.forEach((h) => {
        const future = p.close[i + h];
        const now = p.close[i];
        if (!Number.isFinite(future) || !Number.isFinite(now) || now <= 0) return;
        let byHorizon = baseline.get(weekKey);
        if (!byHorizon) {
          byHorizon = new Map<number, number[]>();
          baseline.set(weekKey, byHorizon);
        }
        let arr = byHorizon.get(h);
        if (!arr) {
          arr = [];
          byHorizon.set(h, arr);
        }
        arr.push(((future - now) / now) * 100);
      });

      if (i - lastSignal < cooldown) continue;
      if (!signalTriggered(p, i, rule, boxLookback)) continue;

      lastSignal = i;
      signalCount += 1;

      horizons.forEach((h) => {
        const future = p.close[i + h];
        const now = p.close[i];
        if (!Number.isFinite(future) || !Number.isFinite(now) || now <= 0) return;
        signalReturns.get(h)?.push(((future - now) / now) * 100);

        const bucket = baseline.get(weekKey)?.get(h);
        // 基准取「同一周、同持有期」的全市场中位收益
        const bench = bucket && bucket.length > 0 ? median(bucket) : undefined;
        if (bench !== undefined) signalBenchmarks.get(h)?.push(bench);
      });
    }
  });

  const stats: BacktestHorizonStat[] = horizons.map((h) => {
    const rets = (signalReturns.get(h) ?? []).slice().sort((a, b) => a - b);
    const benches = signalBenchmarks.get(h) ?? [];
    const samples = rets.length;

    if (samples === 0) {
      return {
        weeks: h,
        samples: 0,
        winRate: 0,
        avgReturn: 0,
        medianReturn: 0,
        benchmarkReturn: 0,
        excessReturn: 0,
        profitFactor: 0,
        worstReturn: 0,
      };
    }

    const wins = rets.filter((r) => r > 0);
    const losses = rets.filter((r) => r <= 0);
    const sum = rets.reduce((acc, v) => acc + v, 0);
    const avgReturn = sum / samples;
    const medianReturn = median(rets) ?? 0;
    const benchmarkReturn =
      benches.length > 0 ? benches.reduce((acc, v) => acc + v, 0) / benches.length : 0;

    const grossProfit = wins.reduce((acc, v) => acc + v, 0);
    const grossLoss = Math.abs(losses.reduce((acc, v) => acc + v, 0));

    return {
      weeks: h,
      samples,
      winRate: (wins.length / samples) * 100,
      avgReturn,
      medianReturn,
      benchmarkReturn,
      excessReturn: avgReturn - benchmarkReturn,
      profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
      worstReturn: rets[0],
    };
  });

  return {
    stockCount: sample.length,
    signalCount,
    horizons: stats,
    sampled,
  };
}
