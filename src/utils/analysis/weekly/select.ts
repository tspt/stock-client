/**
 * 周线名单：硬门槛过滤 + 全池排序后按行业上限截取 Top N
 */

import { WEEKLY_HOLD_DEFAULTS, type WeeklyAnalysis, type WeeklyFilterOptions } from './types';

const UNKNOWN_INDUSTRY = 'unknown';

export function industryKeyOf(row: { industryCode?: string }): string {
  const code = row.industryCode?.trim();
  return code ? code : UNKNOWN_INDUSTRY;
}

/**
 * 按综合分与趋势结构过滤。
 *
 * 流动性（近 8 周成交额中位数）与动量 / 52 周位置 / 量能趋势门槛已移除，
 * 不再做这些维度的硬过滤。
 *
 * 战法 / MA60 / 日线共振这几项是可配置的软门槛：
 * 默认只把「站上 60 周均线」和「剔除空头排列」设为硬性，
 * 战法默认只加分不当门槛——因为六大战法同时成立的机会极少，
 * 直接当硬门槛会把名单筛空。
 *
 * 日线共振只在「明确判定为不达标」时排除；没读到日线数据的股票跳过该项，不阻断。
 */
export function applyWeeklyFilters(
  rows: WeeklyAnalysis[],
  filters: WeeklyFilterOptions
): WeeklyAnalysis[] {
  return rows.filter((row) => {
    if (row.insufficientData || !row.quality.ok) return false;
    if (row.score < filters.minScore) return false;
    if (filters.excludeDowntrend !== false && !row.gates.notDowntrend) return false;
    if (filters.requireAboveMa60 && !row.gates.aboveMa60) return false;
    // 无日线数据时跳过该项（与 WeeklyFilterOptions 注释一致），只有明确不达标才排除
    if (filters.requireDailyAboveMa20 && row.dailyAboveMa20 === false) return false;

    if (filters.requireSetup) {
      const allowed = filters.allowedSetups;
      const hits =
        allowed && allowed.length > 0
          ? row.setups.filter((h) => allowed.includes(h.key))
          : row.setups;
      if (hits.length === 0) return false;
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
