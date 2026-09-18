/**
 * 周线名单：硬门槛过滤 + 全池排序后按行业上限截取 Top N
 */

import { WEEKLY_HOLD_DEFAULTS, type WeeklyAnalysis, type WeeklyFilterOptions } from './types';

const UNKNOWN_INDUSTRY = 'unknown';

export function industryKeyOf(row: { industryCode?: string }): string {
  const code = row.industryCode?.trim();
  return code ? code : UNKNOWN_INDUSTRY;
}

/** 按流动性、动量、位置、量能活跃度过滤；缺字段视为不满足 */
export function applyWeeklyFilters(
  rows: WeeklyAnalysis[],
  filters: WeeklyFilterOptions
): WeeklyAnalysis[] {
  return rows.filter((row) => {
    if (row.insufficientData || !row.quality.ok) return false;
    if (row.score < filters.minScore) return false;
    if (filters.minAvgAmount > 0) {
      const amt = row.amount8wMedian ?? row.avgAmount20w;
      if (amt === undefined || amt < filters.minAvgAmount) return false;
    }
    if (filters.minRet13wSkip1 !== undefined) {
      if (row.ret13wSkip1 === undefined || row.ret13wSkip1 < filters.minRet13wSkip1) return false;
    }
    if (filters.minRet26w !== undefined) {
      if (row.ret26w === undefined || row.ret26w < filters.minRet26w) return false;
    }
    if (filters.minPos52w !== undefined) {
      if (row.pos52w === undefined || row.pos52w < filters.minPos52w) return false;
    }
    if (filters.maxPos52w !== undefined) {
      if (row.pos52w === undefined || row.pos52w > filters.maxPos52w) return false;
    }
    if (filters.minVolTrend4_26 !== undefined) {
      if (row.volTrend4_26 === undefined || row.volTrend4_26 < filters.minVolTrend4_26) return false;
    }
    return true;
  });
}

export function pickByIndustryCap(
  rows: WeeklyAnalysis[],
  options: {
    maxPerIndustry?: number;
    maxHoldings?: number;
    excludeCodes?: Set<string>;
  } = {}
): WeeklyAnalysis[] {
  const maxPerIndustry = options.maxPerIndustry ?? WEEKLY_HOLD_DEFAULTS.maxPerIndustry;
  const maxHoldings = options.maxHoldings ?? WEEKLY_HOLD_DEFAULTS.maxHoldings;
  const exclude = options.excludeCodes;
  const counts = new Map<string, number>();
  const out: WeeklyAnalysis[] = [];
  const sorted = rows
    .filter((row) => row.passed && !row.insufficientData)
    .slice()
    .sort((a, b) => b.score - a.score);

  for (const row of sorted) {
    if (exclude?.has(row.code)) continue;
    const key = industryKeyOf(row);
    const used = counts.get(key) ?? 0;
    if (used >= maxPerIndustry) continue;
    counts.set(key, used + 1);
    out.push(row);
    if (out.length >= maxHoldings) break;
  }
  return out;
}
