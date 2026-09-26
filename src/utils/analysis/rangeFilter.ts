/**
 * 可选数值区间的通用匹配工具（机会分析 / 周线筛选共用）。
 *
 * 语义约定（与原有内联判断完全一致，用于消除筛选引擎中的大量重复分支）：
 * - range 为空对象或 min/max 均为 undefined 时视为「该项不筛选」，直接命中；
 * - 一旦设置了任一边界，value 缺失（null / undefined）视为不命中（无法证明达标）；
 * - min / max 为闭区间。
 */

import type { NumberRange } from '@/types/opportunityFilter';

/**
 * 判断数值是否落在可选区间内。
 *
 * @param value 待判断数值；缺失时按「不命中」处理（当区间已设置边界）
 * @param range 可选区间
 */
export function matchOptionalRange(
  value: number | null | undefined,
  range: NumberRange | undefined
): boolean {
  if (!range) return true;
  const hasMin = range.min !== undefined;
  const hasMax = range.max !== undefined;
  if (!hasMin && !hasMax) return true;
  if (value === null || value === undefined) return false;
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
  unitPerDisplay: number
): boolean {
  if (value === null || value === undefined) {
    return matchOptionalRange(undefined, range);
  }
  return matchOptionalRange(value / unitPerDisplay, range);
}
