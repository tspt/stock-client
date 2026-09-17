/**
 * 周线名单：全池排序后按行业上限截取 Top N
 */

import { WEEKLY_HOLD_DEFAULTS, type WeeklyAnalysis } from './types';

const UNKNOWN_INDUSTRY = 'unknown';

export function industryKeyOf(row: { industryCode?: string }): string {
  const code = row.industryCode?.trim();
  return code ? code : UNKNOWN_INDUSTRY;
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
