/**
 * 量价回踩形态识别：
 * 1) 触发日：最近 N 根内出现「放量上涨」——收盘涨幅达标（或盘中触及涨停），
 *    且成交量 ≥ 前 M 日均量 × 放量倍数；可选要求当日收出长上影线。
 * 2) 回踩段：触发日之后（含触发日）出现峰值，最新收盘自峰值回撤落在设定区间；
 *    回踩期间缩量（最大量 ≤ 触发日量 × 缩量比），且收盘不破 MA10（允许容差）。
 *
 * 用于机会分析页「量价回踩」筛选：筛出「放量大涨/涨停/上影线 → 缩量回踩不破位」的股票。
 */

import type { KLineData, PullbackPatternAnalysis } from '@/types/stock';

export interface VolumePullbackOptions {
  /** 触发日回溯范围：从最新一根向前追溯的根数（含最新一根） */
  lookback?: number;
  /** 触发日最小涨幅（%） */
  minRisePct?: number;
  /** 触发日类型：any=大涨或盘中触及涨停；limitUp=必须收盘涨停 */
  triggerType?: 'any' | 'limitUp';
  /** 涨停判定阈值（%），收盘涨幅或盘中最高涨幅达到即视为涨停 */
  limitUpPct?: number;
  /** 放量倍数：触发日成交量 / 前 N 日均量 */
  volumeRatio?: number;
  /** 均量周期 */
  volumeMaPeriod?: number;
  /** 触发日后最长回踩根数 */
  maxPullbackBars?: number;
  /** 自峰值回撤下限（%） */
  minPullbackPct?: number;
  /** 自峰值回撤上限（%） */
  maxPullbackPct?: number;
  /** 缩量比上限：回踩段最大量 / 触发日量 */
  volumeShrinkRatio?: number;
  /** MA10 容差（%）：收盘 ≥ MA10 × (1 - 容差/100) 视为未破位 */
  ma10TolerancePct?: number;
  /** 是否要求触发日带长上影线 */
  requireUpperShadow?: boolean;
  /** 上影线占比阈值（%）：上影长度 / 全日振幅 × 100 */
  upperShadowRatio?: number;
}

interface ResolvedOptions {
  lookback: number;
  minRisePct: number;
  triggerType: 'any' | 'limitUp';
  limitUpPct: number;
  volumeRatio: number;
  volumeMaPeriod: number;
  maxPullbackBars: number;
  minPullbackPct: number;
  maxPullbackPct: number;
  volumeShrinkRatio: number;
  ma10TolerancePct: number;
  requireUpperShadow: boolean;
  upperShadowRatio: number;
}

/** 与 opportunityAnalysisDefaults 中的默认值保持一致；未传参时使用 */
const DEFAULT_OPTIONS: ResolvedOptions = {
  lookback: 9,
  minRisePct: 5,
  triggerType: 'any',
  limitUpPct: 9.8,
  volumeRatio: 1.8,
  volumeMaPeriod: 5,
  maxPullbackBars: 8,
  minPullbackPct: 3,
  maxPullbackPct: 15,
  volumeShrinkRatio: 0.8,
  ma10TolerancePct: 2,
  requireUpperShadow: false,
  /** 上影线占比阈值（%） */
  upperShadowRatio: 30,
};

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveOptions(options?: VolumePullbackOptions): ResolvedOptions {
  return {
    lookback: Math.max(3, Math.floor(positiveOr(options?.lookback, DEFAULT_OPTIONS.lookback))),
    minRisePct: positiveOr(options?.minRisePct, DEFAULT_OPTIONS.minRisePct),
    triggerType: options?.triggerType === 'limitUp' ? 'limitUp' : 'any',
    limitUpPct: positiveOr(options?.limitUpPct, DEFAULT_OPTIONS.limitUpPct),
    volumeRatio: positiveOr(options?.volumeRatio, DEFAULT_OPTIONS.volumeRatio),
    volumeMaPeriod: Math.max(2, Math.floor(positiveOr(options?.volumeMaPeriod, DEFAULT_OPTIONS.volumeMaPeriod))),
    maxPullbackBars: Math.max(
      1,
      Math.floor(positiveOr(options?.maxPullbackBars, DEFAULT_OPTIONS.maxPullbackBars))
    ),
    minPullbackPct:
      typeof options?.minPullbackPct === 'number' && Number.isFinite(options.minPullbackPct)
        ? Math.max(0, options.minPullbackPct)
        : DEFAULT_OPTIONS.minPullbackPct,
    maxPullbackPct: positiveOr(options?.maxPullbackPct, DEFAULT_OPTIONS.maxPullbackPct),
    volumeShrinkRatio: positiveOr(options?.volumeShrinkRatio, DEFAULT_OPTIONS.volumeShrinkRatio),
    ma10TolerancePct:
      typeof options?.ma10TolerancePct === 'number' && Number.isFinite(options.ma10TolerancePct)
        ? Math.max(0, options.ma10TolerancePct)
        : DEFAULT_OPTIONS.ma10TolerancePct,
    requireUpperShadow: options?.requireUpperShadow === true,
    upperShadowRatio: Math.min(
      100,
      positiveOr(options?.upperShadowRatio, DEFAULT_OPTIONS.upperShadowRatio)
    ),
  };
}

/** 触发日之前 period 根（不含触发日）的均量；不足或均量为 0 时返回 null */
function averageVolumeBefore(klineData: KLineData[], index: number, period: number): number | null {
  const start = index - period;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i < index; i++) {
    sum += klineData[i].volume ?? 0;
  }
  const avg = sum / period;
  return avg > 0 ? avg : null;
}

/** 截止 index（含）的 period 日均收盘价 */
function smaAt(klineData: KLineData[], index: number, period: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += klineData[i].close;
  }
  const avg = sum / period;
  return avg > 0 ? avg : null;
}

/** 上影线长度占全日振幅的百分比（0-100，无振幅时返回 0） */
function upperShadowPercentOf(bar: KLineData): number {
  const range = bar.high - bar.low;
  if (!(range > 0)) return 0;
  const bodyTop = Math.max(bar.open, bar.close);
  return (Math.max(0, bar.high - bodyTop) / range) * 100;
}

function toFixed1(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

/** 未命中时的诊断信息（记录最近一个「放量上涨」候选的失败点） */
interface CandidateDiagnostics {
  triggerIndex: number;
  triggerChangePercent: number;
  triggerVolumeRatio: number;
  triggerUpperShadowRatio: number;
  /** 触发日上影占比是否达标（未要求长上影时为 true） */
  upperShadowOk: boolean;
  isLimitUp: boolean;
  peakPrice: number;
  peakBarsAgo: number;
  pullbackPercent: number;
  pullbackVolumeRatio: number;
  closeToMa10Percent: number;
}

export function analyzeVolumePullback(
  klineData: KLineData[],
  options?: VolumePullbackOptions
): PullbackPatternAnalysis {
  const opt = resolveOptions(options);
  const len = klineData?.length ?? 0;

  const params: PullbackPatternAnalysis['params'] = {
    lookback: opt.lookback,
    minRisePct: opt.minRisePct,
    triggerType: opt.triggerType,
    volumeRatio: opt.volumeRatio,
    volumeMaPeriod: opt.volumeMaPeriod,
    maxPullbackBars: opt.maxPullbackBars,
    minPullbackPct: opt.minPullbackPct,
    maxPullbackPct: opt.maxPullbackPct,
    volumeShrinkRatio: opt.volumeShrinkRatio,
    ma10TolerancePct: opt.ma10TolerancePct,
    requireUpperShadow: opt.requireUpperShadow,
    upperShadowRatio: opt.upperShadowRatio,
  };

  const base = (
    reasonText: string,
    partial: PullbackPatternAnalysis['partial'],
    extra?: Partial<PullbackPatternAnalysis>
  ): PullbackPatternAnalysis => ({
    isHit: false,
    labels: [],
    reasonText,
    partial,
    params,
    ...extra,
  });

  // 至少需要：均量周期 + 1（触发日与均量）、1 根回踩、10 日均线
  const minBars = Math.max(opt.volumeMaPeriod + 2, 12);
  if (len < minBars) {
    return base('数据不足', {
      hasVolumeSurge: false,
      hasPullback: false,
      shrinksVolume: false,
      holdsMa10: false,
    });
  }

  const lastIndex = len - 1;
  const lastClose = klineData[lastIndex].close;

  // 触发日候选：最新根不能作为触发日（否则没有回踩），且落在「触发日回溯范围」内。
  // 触发日距今根数同时就是回踩段根数，其上限由 maxPullbackBars 决定。
  const earliest = Math.max(1, len - opt.lookback);
  const latest = lastIndex - 1;

  let diagnostics: CandidateDiagnostics | null = null;

  for (let i = latest; i >= earliest; i--) {
    const bar = klineData[i];
    const prevClose = klineData[i - 1].close;
    if (!(prevClose > 0) || !(bar.close > 0)) continue;

    const changePct = ((bar.close - prevClose) / prevClose) * 100;
    const intradayHighPct = bar.high > 0 ? ((bar.high - prevClose) / prevClose) * 100 : changePct;
    const isLimitUpClose = changePct >= opt.limitUpPct;
    const isTouchLimitUp = intradayHighPct >= opt.limitUpPct;

    // 触发日条件一：涨幅达标（涨停 / 大涨 / 盘中触及涨停）
    const riseHit =
      opt.triggerType === 'limitUp'
        ? isLimitUpClose
        : changePct >= opt.minRisePct || isTouchLimitUp;
    if (!riseHit) continue;

    // 触发日条件二：放量（对比触发日之前 M 日均量）
    const avgVol = averageVolumeBefore(klineData, i, opt.volumeMaPeriod);
    if (!avgVol) continue;
    const volumeRatio = (bar.volume ?? 0) / avgVol;
    if (volumeRatio < opt.volumeRatio) continue;

    // 触发日条件三：长上影线（可选）；不通过时仍记录诊断信息，稍后再跳过
    const upperShadowPercent = upperShadowPercentOf(bar);
    const upperShadowOk = !opt.requireUpperShadow || upperShadowPercent >= opt.upperShadowRatio;

    // 回踩段根数：触发日之后到最新一根
    const pullbackBars = lastIndex - i;
    if (pullbackBars < 1 || pullbackBars > opt.maxPullbackBars) continue;

    // 峰值（触发日与之后各根的最高价取最大）
    let peakPrice = bar.high;
    let peakIndex = i;
    let maxPullbackVolume = 0;
    for (let t = i + 1; t <= lastIndex; t++) {
      const tBar = klineData[t];
      if (tBar.high > peakPrice) {
        peakPrice = tBar.high;
        peakIndex = t;
      }
      maxPullbackVolume = Math.max(maxPullbackVolume, tBar.volume ?? 0);
    }
    if (!(peakPrice > 0)) continue;

    const peakBarsAgo = lastIndex - peakIndex;
    const pullbackPercent = ((peakPrice - lastClose) / peakPrice) * 100;
    const pullbackVolumeRatio = bar.volume > 0 ? maxPullbackVolume / bar.volume : Number.POSITIVE_INFINITY;
    const ma10 = smaAt(klineData, lastIndex, 10);
    const closeToMa10Percent = ma10 ? ((lastClose - ma10) / ma10) * 100 : Number.NaN;

    // 记录最近（从新往旧）的放量上涨候选，供未命中时给出原因
    if (!diagnostics) {
      diagnostics = {
        triggerIndex: i,
        triggerChangePercent: changePct,
        triggerVolumeRatio: volumeRatio,
        triggerUpperShadowRatio: upperShadowPercent,
        upperShadowOk,
        isLimitUp: isLimitUpClose,
        peakPrice,
        peakBarsAgo,
        pullbackPercent,
        pullbackVolumeRatio,
        closeToMa10Percent,
      };
    }

    if (!upperShadowOk) continue;

    // 回踩条件一：仍在回踩中（峰值不是最后一根）且回撤幅度在区间内
    const inPullback = peakIndex < lastIndex;
    const pullbackInRange =
      inPullback && pullbackPercent >= opt.minPullbackPct && pullbackPercent <= opt.maxPullbackPct;
    if (!pullbackInRange) continue;

    // 回踩条件二：缩量
    const shrinksVolume = pullbackVolumeRatio <= opt.volumeShrinkRatio;
    if (!shrinksVolume) continue;

    // 回踩条件三：不破 MA10（允许容差）
    const holdsMa10 = ma10 !== null && lastClose >= ma10 * (1 - opt.ma10TolerancePct / 100);
    if (!holdsMa10) continue;

    // ✅ 全部命中
    const labels: string[] = [];
    if (isLimitUpClose) {
      labels.push('涨停');
    } else if (isTouchLimitUp) {
      labels.push('触及涨停');
    } else {
      labels.push(`大涨${toFixed1(changePct)}%`);
    }
    labels.push(`放量${volumeRatio.toFixed(2)}倍`);
    if (upperShadowPercent >= opt.upperShadowRatio) {
      labels.push(`长上影${upperShadowPercent.toFixed(0)}%`);
    }
    labels.push(`回踩${toFixed1(pullbackPercent)}%`);
    if (pullbackVolumeRatio < 1) {
      labels.push(`缩量${pullbackVolumeRatio.toFixed(2)}`);
    }
    labels.push(ma10 !== null && closeToMa10Percent >= 0 ? '站上MA10' : 'MA10附近');

    const triggerBarsAgo = lastIndex - i;
    const reasonText =
      `${triggerBarsAgo}根前放量上涨${toFixed1(changePct)}%（量比${volumeRatio.toFixed(2)}），` +
      `回踩${toFixed1(pullbackPercent)}%（峰值${peakBarsAgo}根前，量能${pullbackVolumeRatio.toFixed(2)}倍）` +
      (ma10 !== null ? `，收盘距MA10 ${closeToMa10Percent >= 0 ? '+' : ''}${toFixed1(closeToMa10Percent)}%` : '');

    return {
      isHit: true,
      triggerIndex: i,
      triggerBarsAgo,
      triggerChangePercent: changePct,
      triggerVolumeRatio: volumeRatio,
      triggerUpperShadowRatio: upperShadowPercent,
      peakPrice,
      peakBarsAgo,
      pullbackPercent,
      pullbackVolumeRatio,
      closeToMa10Percent: Number.isFinite(closeToMa10Percent) ? closeToMa10Percent : undefined,
      labels,
      reasonText,
      partial: {
        hasVolumeSurge: true,
        hasPullback: true,
        shrinksVolume: true,
        holdsMa10: true,
      },
      params,
    };
  }

  if (diagnostics) {
    const d = diagnostics;
    const partial = {
      hasVolumeSurge: true,
      hasPullback: d.peakBarsAgo > 0 && d.pullbackPercent >= opt.minPullbackPct,
      shrinksVolume: d.pullbackVolumeRatio <= opt.volumeShrinkRatio,
      holdsMa10:
        Number.isFinite(d.closeToMa10Percent) &&
        d.closeToMa10Percent >= -opt.ma10TolerancePct,
    };

    const fails: string[] = [];
    if (!d.upperShadowOk) {
      fails.push(
        `触发日上影占比${d.triggerUpperShadowRatio.toFixed(0)}%不足${opt.upperShadowRatio}%`
      );
    }
    if (!partial.hasPullback) {
      fails.push(
        d.peakBarsAgo === 0
          ? '仍在新高未回踩'
          : `回撤${toFixed1(d.pullbackPercent)}%不在${opt.minPullbackPct}~${opt.maxPullbackPct}%`
      );
    }
    if (!partial.shrinksVolume) {
      fails.push(`回踩未缩量（${Number.isFinite(d.pullbackVolumeRatio) ? d.pullbackVolumeRatio.toFixed(2) : '∞'}倍）`);
    }
    if (!partial.holdsMa10) {
      fails.push(`收盘跌破MA10（${toFixed1(d.closeToMa10Percent)}%）`);
    }

    return base(
      `有放量上涨但${fails.length > 0 ? fails.join('、') : '整体未达标'}`,
      partial,
      {
        triggerIndex: d.triggerIndex,
        triggerBarsAgo: lastIndex - d.triggerIndex,
        triggerChangePercent: d.triggerChangePercent,
        triggerVolumeRatio: d.triggerVolumeRatio,
        triggerUpperShadowRatio: d.triggerUpperShadowRatio,
        peakPrice: d.peakPrice,
        peakBarsAgo: d.peakBarsAgo,
        pullbackPercent: d.pullbackPercent,
        pullbackVolumeRatio: Number.isFinite(d.pullbackVolumeRatio) ? d.pullbackVolumeRatio : undefined,
        closeToMa10Percent: Number.isFinite(d.closeToMa10Percent) ? d.closeToMa10Percent : undefined,
      }
    );
  }

  return base('未找到放量上涨的触发日', {
    hasVolumeSurge: false,
    hasPullback: false,
    shrinksVolume: false,
    holdsMa10: false,
  });
}
