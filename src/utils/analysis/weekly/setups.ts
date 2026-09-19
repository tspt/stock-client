/**
 * 六大买入战法
 *
 * 关键约束：所有函数只接受 (panel, i)，并且只读 index <= i 的数据。
 * 这样「实时分析」与「逐周回测」调用的是同一份代码，
 * 不会出现「回测跑一套逻辑、页面跑另一套」的失真。
 *
 * 每个战法返回「命中 + 得分 + 依据」。得分采用分级：
 * 全部条件满足给满分，部分满足给部分分——
 * 目的是让「接近成型」的形态也能体现在排序里，而不是被一刀切掉。
 */

import { gapPct, lastCrossOverWithin, safe, slopeAt } from './math';
import { isStoppingCandle, isYang } from './patterns';
import type { WeeklyPanel } from './panel';
import {
  SETUP_MAX_SCORES,
  SETUP_SECONDARY_FACTOR,
  SETUP_TOTAL_CAP,
  WEEKLY_SETUP_LABELS,
  type SetupKey,
  type WeeklyConfig,
  type WeeklySetupHit,
} from './types';

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function makeHit(key: SetupKey, ratio: number, reasons: string[]): WeeklySetupHit {
  const max = SETUP_MAX_SCORES[key];
  return {
    key,
    label: WEEKLY_SETUP_LABELS[key],
    score: round1(max * ratio),
    max,
    reasons,
  };
}

/** 当周成交量相对「前 8 周均量」是否放大到 threshold 倍 */
function volumeUpVsBase8(p: WeeklyPanel, i: number, threshold: number): boolean {
  const base = safe(p.volBase8, i);
  if (base === undefined || base <= 0) return false;
  const v = p.volume[i];
  return Number.isFinite(v) && v >= base * threshold;
}

/** 当周成交量相对「前 8 周均量」是否萎缩到 threshold 倍以下 */
function volumeDownVsBase8(p: WeeklyPanel, i: number, threshold: number): boolean {
  const base = safe(p.volBase8, i);
  if (base === undefined || base <= 0) return false;
  const v = p.volume[i];
  return Number.isFinite(v) && v < base * threshold;
}

/**
 * 1. 平台突破法
 * 低位横盘 8–12 周、波动幅度≤20%、均线粘合 →
 * 某周放巨量（近 5 周均量 1.5 倍以上）收中长阳（涨幅≥5%）并站稳平台高点。
 */
function platformBreakout(
  p: WeeklyPanel,
  i: number,
  config: WeeklyConfig
): WeeklySetupHit | null {
  const amp = p.boxAmplitude[i];
  const boxHigh = p.boxHigh[i];
  const close = p.close[i];
  if (amp === undefined || boxHigh === undefined || !Number.isFinite(close)) return null;
  if (amp < config.boxAmplitudeMin || amp > config.boxAmplitudeMax) return null;

  /**
   * 均线粘合必须发生在突破之前：突破当周的大阳线会立刻抬高 MA5，
   * 若用当周粘合度判定，会系统性误杀「刚刚启动」的平台形态。
   * 因此取平台窗口（不含当周）内的最粘合值。
   */
  let converge: number | undefined;
  for (let j = Math.max(0, i - config.boxLookback); j <= i - 1; j += 1) {
    const v = p.maConverge[j];
    if (v === undefined) continue;
    if (converge === undefined || v < converge) converge = v;
  }
  if (converge === undefined || converge > config.maConvergeMax) return null;

  const volRatio = p.volRatio5[i];
  if (volRatio === undefined || volRatio < config.breakoutVolumeRatio) return null;

  const gain = p.ret1w[i];
  if (gain === undefined || gain < config.breakoutMinWeekGain) return null;

  const reasons = [
    `横盘${config.boxLookback}周振幅${amp.toFixed(1)}%`,
    `均线粘合${converge.toFixed(1)}%`,
    `量能${volRatio.toFixed(2)}倍`,
    `周涨${gain.toFixed(1)}%`,
  ];

  if (close > boxHigh) {
    return makeHit('platformBreakout', 1, [...reasons, '站稳平台高点']);
  }
  // 尚未突破但已逼近箱顶：形态基本成型，给观察分
  if (close >= boxHigh * 0.98) {
    return makeHit('platformBreakout', 0.7, [...reasons, '逼近箱顶']);
  }
  return null;
}

/**
 * 2. 回踩低吸法
 * 上升趋势中缩量回调至 5/10/20 周均线附近，出现止跌 K 线且均线仍向上。
 */
function pullbackBuy(p: WeeklyPanel, i: number, config: WeeklyConfig): WeeklySetupHit | null {
  if (!p.maStack[i] && p.structure[i] !== 'up') return null;
  if (!p.ma20TurnUp[i]) return null;
  if (!volumeDownVsBase8(p, i, config.pullbackVolumeRatio)) return null;

  const close = p.close[i];
  const atr = safe(p.atr, i);
  if (atr === undefined || atr <= 0) return null;

  const tolerance = config.pullbackAtrTolerance * atr;
  const nearWhich: string[] = [];
  ([['MA5', p.ma5], ['MA10', p.ma10], ['MA20', p.ma20]] as const).forEach(([label, arr]) => {
    const ma = safe(arr, i);
    if (ma === undefined) return;
    if (Math.abs(close - ma) <= tolerance) nearWhich.push(label);
  });
  if (nearWhich.length === 0) return null;

  const reasons = [
    `缩量至${(p.volume[i] / (safe(p.volBase8, i) || p.volume[i])).toFixed(2)}倍`,
    `回踩${nearWhich.join('/')}`,
    '均线向上',
  ];

  const stop = isStoppingCandle(p.bars[i - 1], p.bars[i]);
  if (stop.hit) {
    return makeHit('pullbackBuy', 1, [...reasons, ...stop.reasons]);
  }
  // 缩量回踩到位但还没出止跌 K 线：等确认，给部分分
  return makeHit('pullbackBuy', 0.6, [...reasons, '待止跌K线确认']);
}

/**
 * 3. 连续堆量法
 * 连续 3 周以上温和放量形成堆量 → 中途缩量回踩不破 5/10 周均线 → 再次放量站回均线为买点。
 */
function volumePile(p: WeeklyPanel, i: number, config: WeeklyConfig): WeeklySetupHit | null {
  const weeks = config.pileWeeks;
  if (i < weeks - 1) return null;

  const pileEndsAt = (j: number): boolean => {
    if (j - weeks + 1 < 0) return false;
    for (let k = j - weeks + 1; k <= j; k += 1) {
      if (!volumeUpVsBase8(p, k, config.pileVolumeRatio)) return false;
    }
    return true;
  };

  // 堆量段：在最近 13 周内找一个「连续 weeks 周放量」的结尾
  let pileEnd = -1;
  const searchFrom = Math.max(weeks - 1, i - 13);
  for (let e = i - 1; e >= searchFrom; e -= 1) {
    if (pileEndsAt(e)) {
      pileEnd = e;
      break;
    }
  }
  // 当周本身就是堆量最后一周：形态进行中
  const pilingNow = pileEndsAt(i);

  const close = p.close[i];
  const m5 = safe(p.ma5, i);
  const m10 = safe(p.ma10, i);
  const backAboveMa = (m5 !== undefined && close >= m5) || (m10 !== undefined && close >= m10);
  const volRatio = p.volRatio5[i];
  const reVolume = volRatio !== undefined && volRatio >= config.breakoutVolumeRatio;

  if (pileEnd < 0) {
    if (pilingNow) {
      return makeHit('volumePile', 0.5, [`连续${weeks}周放量，堆量进行中`]);
    }
    return null;
  }

  // 堆量之后是否出现过「缩量回踩且不破 MA10」
  let pullbackOk = false;
  for (let j = pileEnd + 1; j < i; j += 1) {
    if (!volumeDownVsBase8(p, j, config.pullbackVolumeRatio)) continue;
    const m10j = safe(p.ma10, j);
    const notBroken = m10j === undefined || p.low[j] >= m10j * 0.98;
    if (notBroken) {
      pullbackOk = true;
      break;
    }
  }

  const reasons = [`${weeks}周堆量`];
  if (pullbackOk) reasons.push('缩量回踩未破MA10');

  if (reVolume && backAboveMa) {
    reasons.push(`放量${(volRatio ?? 0).toFixed(2)}倍站回均线`);
    return makeHit('volumePile', pullbackOk ? 1 : 0.7, reasons);
  }
  return null;
}

/**
 * 4. 均线金叉法
 * 7 周线上穿 14 周线，随后 14 周线上穿 60 周线（或 34 周线），金叉段放量，为强势股信号；
 * 5 周线金叉 10 周线为短线走好信号。
 */
function maGoldenCross(p: WeeklyPanel, i: number, config: WeeklyConfig): WeeklySetupHit | null {
  const g714 = lastCrossOverWithin(p.ma7, p.ma14, i, config.goldenCrossLookback);
  const g1460 = lastCrossOverWithin(p.ma14, p.ma60, i, config.goldenCrossLongLookback);
  const g1434 = lastCrossOverWithin(p.ma14, p.ma34, i, config.goldenCrossLongLookback);
  const g510 = lastCrossOverWithin(p.ma5, p.ma10, i, 8);

  // 金叉当周是否放量（金叉段放量才算有效）
  const volumeAtCross = (idx: number): boolean =>
    volumeUpVsBase8(p, idx, config.pileVolumeRatio);

  if (g714 >= 0 && (g1460 >= 0 || g1434 >= 0)) {
    const long = g1460 >= 0 ? 'MA60' : 'MA34';
    const volOk = volumeAtCross(g714) || volumeAtCross(Math.max(g1460, g1434));
    return makeHit(
      'maGoldenCross',
      volOk ? 1 : 0.8,
      [`MA7上穿MA14`, `MA14上穿${long}`, volOk ? '金叉段放量' : '金叉段量能一般']
    );
  }

  /**
   * 长期金叉发生在回溯窗口之外（MA14 早已站上 MA60/MA34），但 MA7 刚上穿 MA14——
   * 这属于「长期多头结构成立 + 短期再启动」，旧实现只查窗口内的交叉会整段漏掉。
   */
  const m14 = safe(p.ma14, i);
  const m60 = safe(p.ma60, i);
  const m34 = safe(p.ma34, i);
  const aboveLongNow =
    m14 !== undefined &&
    ((m60 !== undefined && m14 > m60) || (m34 !== undefined && m14 > m34));
  if (g714 >= 0 && aboveLongNow) {
    return makeHit(
      'maGoldenCross',
      volumeAtCross(g714) ? 0.8 : 0.6,
      ['MA7上穿MA14', 'MA14位于长期均线上方', '长期金叉较早发生']
    );
  }

  if (g510 >= 0 && volumeAtCross(g510)) {
    return makeHit('maGoldenCross', 0.5, ['MA5上穿MA10', '短线走好且放量']);
  }
  return null;
}

/**
 * 5. 老鸭头形态
 * 5/10 周均线金叉后股价上行 → 缩量回调，5 周均线走平靠近但不跌破 10 周线 →
 * 再次放量，5 周线重新昂头向上，MACD 在水上拒绝死叉（或小幅死叉后迅速再金叉）。
 */
function oldDuckHead(p: WeeklyPanel, i: number, config: WeeklyConfig): WeeklySetupHit | null {
  const lookback = config.duckHeadLookback;
  const g = lastCrossOverWithin(p.ma5, p.ma10, i, lookback);
  if (g < 0 || g >= i) return null;

  const baseClose = p.close[g];
  if (!Number.isFinite(baseClose) || baseClose <= 0) return null;

  // 金叉后股价上行：区间最高价较金叉时上涨 10% 以上
  let highest = -Infinity;
  for (let j = g; j <= i; j += 1) {
    if (p.high[j] > highest) highest = p.high[j];
  }
  const rose = ((highest - baseClose) / baseClose) * 100;
  if (rose < 10) return null;

  /**
   * 回调阶段两个条件：
   * 1. 出现过缩量周（「缩量回调」）；
   * 2. MA5 不得有效跌破 MA10。
   *
   * 旧实现要求「金叉后必须发生一次死叉」，与文档「走平靠近但不跌破 10 周线」直接矛盾，
   * 且与后面的「MA5 >= MA10」互斥，导致该战法永远不会命中。
   * 这里改为：文档允许「小幅死叉后迅速再度金叉」，因此给 3% 的跌破容忍度。
   */
  let shrunk = false;
  for (let j = g + 1; j <= i; j += 1) {
    const a = safe(p.ma5, j);
    const b = safe(p.ma10, j);
    if (a !== undefined && b !== undefined && b > 0 && ((a - b) / b) * 100 < -3) return null;
    if (volumeDownVsBase8(p, j, config.pullbackVolumeRatio)) shrunk = true;
  }
  if (!shrunk) return null;

  const m5 = safe(p.ma5, i);
  const m10 = safe(p.ma10, i);
  if (m5 === undefined || m10 === undefined || m10 <= 0) return null;

  // 5 周线走平靠近但不跌破 10 周线
  const gap = Math.abs(gapPct(m5, m10) ?? 999);
  if (m5 < m10 || gap > 3) return null;

  const reasons = [`金叉后上行${rose.toFixed(1)}%`, '缩量回调', `MA5贴合MA10(${gap.toFixed(1)}%)`];

  // 再次放量 + MA5 重新昂头向上
  const volRatio = p.volRatio5[i];
  const reVolume = volRatio !== undefined && volRatio >= config.pileVolumeRatio;
  const ma5Up = (slopeAt(p.ma5, i, 2) ?? 0) > 0;
  if (!reVolume || !ma5Up) return null;
  reasons.push(`放量${volRatio!.toFixed(2)}倍，MA5重新向上`);

  // MACD 水上拒绝死叉
  const dif = safe(p.macdDif, i);
  const dea = safe(p.macdDea, i);
  const waterBullish =
    dif !== undefined && dea !== undefined && dif > 0 && dea > 0 && !p.macdDeathCross[i];
  if (waterBullish) {
    reasons.push('MACD水上拒绝死叉');
    return makeHit('oldDuckHead', 1, reasons);
  }
  return makeHit('oldDuckHead', 0.85, reasons);
}

/**
 * 6. 三连阳回踩法
 * 周线连续 3 周收阳，回踩 5 周均线时成交量缩至前三周均量一半以下，企稳后入场。
 */
function threeYangPullback(
  p: WeeklyPanel,
  i: number,
  config: WeeklyConfig
): WeeklySetupHit | null {
  if (i < 4) return null;

  for (let j = i - 3; j <= i - 1; j += 1) {
    if (!isYang(p.bars[j])) return null;
  }

  const base3 = safe(p.volBase3, i);
  const vol = p.volume[i];
  if (base3 === undefined || base3 <= 0 || !Number.isFinite(vol)) return null;
  if (vol > base3 * config.threeYangVolumeRatio) return null;

  const reasons = ['连续3周收阳', `量缩至前三周${(vol / base3).toFixed(2)}`];

  const close = p.close[i];
  const m5 = safe(p.ma5, i);
  const atr = safe(p.atr, i);
  if (m5 !== undefined && atr !== undefined && atr > 0 && Math.abs(close - m5) <= 0.75 * atr) {
    reasons.push('回踩MA5企稳');
    return makeHit('threeYangPullback', 1, reasons);
  }
  return makeHit('threeYangPullback', 0.6, [...reasons, '尚未回踩MA5']);
}

/**
 * 检测第 i 周命中的全部战法。
 * 战法白名单由 select.ts 在过滤阶段处理，这里不做裁剪，
 * 以保证「分数」与「是否被过滤」两个关注点分离。
 */
export function detectSetups(p: WeeklyPanel, i: number, config: WeeklyConfig): WeeklySetupHit[] {
  const detectors: Array<(p: WeeklyPanel, i: number, c: WeeklyConfig) => WeeklySetupHit | null> = [
    platformBreakout,
    pullbackBuy,
    volumePile,
    maGoldenCross,
    oldDuckHead,
    threeYangPullback,
  ];

  const hits: WeeklySetupHit[] = [];
  detectors.forEach((detect) => {
    let h: WeeklySetupHit | null;
    try {
      h = detect(p, i, config);
    } catch {
      // 单只票的异常数据不应该让整批分析失败；这里按「未命中」处理
      h = null;
    }
    if (h) hits.push(h);
  });

  return hits.sort((a, b) => b.score - a.score);
}

/**
 * 战法分合计（封顶 SETUP_TOTAL_CAP）。
 *
 * 采用「最高分战法 ×1.0 + 其余 ×SETUP_SECONDARY_FACTOR」而非线性累加：
 * 六大战法彼此高度相关（平台突破常同时伴随均线金叉与连续堆量），
 * 线性累加会让同向信号叠加出虚高分。折半既保留「多战法共振」的溢价，
 * 又不至于让单一形态靠叠加冲到顶格。
 */
export function totalSetupScore(hits: WeeklySetupHit[]): number {
  if (hits.length === 0) return 0;
  const sorted = hits.slice().sort((a, b) => b.score - a.score);
  const sum =
    sorted[0].score + sorted.slice(1).reduce((acc, h) => acc + h.score, 0) * SETUP_SECONDARY_FACTOR;
  return round1(Math.min(sum, SETUP_TOTAL_CAP));
}
