/**
 * K 线纵轴价格区间推导。
 *
 * 用途：把「当前 dataZoom 可见窗口 + 均线」换算成一个整齐的价格上下限，
 * 同一个区间同时赋给左侧 K 线主图与右侧筹码面板，从而「同一价格落在同一水平线」。
 * 纯函数，不依赖 ECharts / React，便于单测。
 */

import type { KLineData } from '@/types/stock';

/** 价格区间（K 线主图与筹码面板共享） */
export interface PriceRange {
  min: number;
  max: number;
}

/**
 * 计算「整齐」的纵轴上下限（步长取 1/2/2.5/5 × 10^n）。
 * 上下限取整后，两侧坐标轴给出的刻度文字才会一致且可读。
 *
 * @param splitCount 纵轴分段数，必须与 K 线主图 yAxis.splitNumber 一致
 */
export function nicePriceRange(min: number, max: number, splitCount: number): PriceRange | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null;
  }
  const rawStep = (max - min) / splitCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;

  return {
    min: Number((Math.floor(min / step) * step).toFixed(6)),
    max: Number((Math.ceil(max / step) * step).toFixed(6)),
  };
}

export interface ComputeVisiblePriceRangeInput {
  kline: KLineData[];
  /**
   * 均线序列（MA5/10/20/30/60…）。
   * 均线可能冲出 K 线高低点（如下跌初期的 MA60），必须一并纳入，
   * 否则主图上的均线会被裁掉。
   */
  maSeries: number[][];
  /** 当前 dataZoom 可见窗口（百分比），是左右两张图的唯一真源 */
  zoom: { start: number; end: number };
  /** 纵轴分段数，须与主图 yAxis.splitNumber 一致 */
  splitCount: number;
}

/**
 * 可见区间 + 均线 → 整齐的价格上下限。
 * 数据不足或区间非法时返回 null，调用方据此退回 ECharts 自适应。
 */
export function computeVisiblePriceRange({
  kline,
  maSeries,
  zoom,
  splitCount,
}: ComputeVisiblePriceRangeInput): PriceRange | null {
  const total = kline.length;
  if (total === 0) {
    return null;
  }

  // 两端各多取 1 根，避免边界蜡烛被裁掉
  const startIndex = Math.max(0, Math.floor((zoom.start / 100) * (total - 1)) - 1);
  const endIndex = Math.min(total - 1, Math.ceil((zoom.end / 100) * (total - 1)) + 1);
  if (endIndex <= startIndex) {
    return null;
  }

  let low = Infinity;
  let high = -Infinity;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const bar = kline[i];
    if (!bar) continue;
    if (bar.low < low) low = bar.low;
    if (bar.high > high) high = bar.high;
  }

  for (const series of maSeries) {
    for (let i = startIndex; i <= endIndex; i += 1) {
      const value = series[i];
      if (!Number.isFinite(value)) continue;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }

  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return null;
  }

  // 上下各留 2% 余量，避免蜡烛贴着边框
  const padding = (high - low) * 0.02;
  return nicePriceRange(low - padding, high + padding, splitCount);
}
