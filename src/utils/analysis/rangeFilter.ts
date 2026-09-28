/**
 * 可选数值区间的通用匹配工具（机会分析 / 周线筛选共用）。
 *
 * 语义约定（与原有内联判断完全一致，用于消除筛选引擎中的大量重复分支）：
 * - range 为空对象或 min/max 均为 undefined 时视为「该项不筛选」，直接命中；
 * - 一旦设置了任一边界，value 缺失（null / undefined）默认视为不命中（无法证明达标）；
 * - min / max 为闭区间。
 *
 * 注意：通过 {@link PASS_WHEN_MISSING} 可把「缺失」改为放行，
 * 用于「缺少数据不应导致股票被剔除」的筛选场景（见机会分析筛选引擎）。
 */

import type { NumberRange } from '@/types/opportunityFilter';

/** 区间匹配的可选行为配置 */
export interface MatchRangeOptions {
  /**
   * value 缺失（null / undefined）时是否直接视为命中。
   * - false（默认）：保持旧语义，设了边界即视为不达标；
   * - true：无法证明不达标，放行，避免因「未获取到数据」把股票误剔除。
   */
  passWhenMissing?: boolean;
}

/**
 * 「缺失即放行」预设：机会分析筛选统一使用。
 * 缺少某项数据的股票不做该项过滤、照常展示；只有确实取到值且不达标时才剔除。
 */
export const PASS_WHEN_MISSING: MatchRangeOptions = { passWhenMissing: true };

/**
 * 判断数值是否落在可选区间内。
 *
 * @param value 待判断数值；缺失时默认按「不命中」处理（当区间已设置边界），
 *              可通过 options.passWhenMissing 改为「命中」
 * @param range 可选区间
 * @param options 匹配行为配置，默认保持旧语义
 */
export function matchOptionalRange(
  value: number | null | undefined,
  range: NumberRange | undefined,
  options?: MatchRangeOptions
): boolean {
  if (!range) return true;
  const hasMin = range.min !== undefined;
  const hasMax = range.max !== undefined;
  if (!hasMin && !hasMax) return true;
  if (value === null || value === undefined) {
    return options?.passWhenMissing === true;
  }
  if (hasMin && value < (range.min as number)) return false;
  if (hasMax && value > (range.max as number)) return false;
  return true;
}

/**
 * 把「原始单位」换算为目标筛选单位后再匹配。
 * 例：总股本原始单位为股、筛选单位为亿股，unitPerDisplay 传 1e8。
 */
export function matchOptionalRangeWithScale(
  value: number | null | undefined,
  range: NumberRange | undefined,
  unitPerDisplay: number,
  options?: MatchRangeOptions
): boolean {
  if (value === null || value === undefined) {
    return matchOptionalRange(undefined, range, options);
  }
  return matchOptionalRange(value / unitPerDisplay, range, options);
}
