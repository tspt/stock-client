/**
 * 周线名单：硬门槛过滤 + 全池排序后按行业上限截取 Top N
 */

import type { NumberRange } from '@/types/opportunityFilter';
import { normalizeStockName } from '@/utils/format/format';
import { setupGradeOf } from './setups';
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
/**
 * 区间判定：未设置范围视为通过；范围已设置但取值缺失视为不通过
 * （与机会分析 passLightFilters 的口径一致）。
 */
function withinRange(value: number | undefined, range?: NumberRange): boolean {
  if (!range || (range.min === undefined && range.max === undefined)) return true;
  if (value === undefined || value === null || !Number.isFinite(value)) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

export function applyWeeklyFilters(
  rows: WeeklyAnalysis[],
  filters: WeeklyFilterOptions
): WeeklyAnalysis[] {
  const allowedSetups = filters.allowedSetups;
  const allowedGrades = filters.setupGrades;
  /** 档位过滤本质上就是「命中战法」的加强版，两者共用同一段判定 */
  const setupFilterActive =
    filters.requireSetup === true || (allowedGrades !== undefined && allowedGrades.length > 0);

  /**
   * 名称筛选（与机会分析页一致）：
   * - 「排除名称包含」按去空白后的名称做子串匹配；
   * - 「短期排除股票名称」按去空白后的全名精确匹配；
   * - 「行业分组」按行业代码判定，反选模式下没有行业归属的个股保留（与机会分析口径一致）。
   */
  const excludedNameKeywords =
    filters.enableNameKeywordFilter === false
      ? []
      : (filters.excludedNameKeywords ?? []).map(normalizeStockName).filter(Boolean);
  const excludedShortTermNameSet =
    filters.enableShortTermNameFilter === false
      ? null
      : new Set((filters.excludedShortTermNames ?? []).map(normalizeStockName).filter(Boolean));
  const nameFilterIndustrySet =
    filters.nameFilterIndustryCodes && filters.nameFilterIndustryCodes.length > 0
      ? new Set(filters.nameFilterIndustryCodes)
      : null;

  return rows.filter((row) => {
    if (row.insufficientData || !row.quality.ok) return false;
    // 数据筛选：价格 / 总市值(亿) / 总股数(亿)
    // 「只用完整周」时价格按最近已收盘周收盘价判定，否则用含本周的最新价
    const price = filters.completeWeeksOnly ? row.confirmedClose ?? row.close : row.close;
    if (!withinRange(price, filters.priceRange)) return false;
    if (!withinRange(row.marketCap, filters.marketCapRange)) return false;
    if (!withinRange(row.totalShares, filters.totalSharesRange)) return false;
    // 数据筛选：总营收/归母净利润(亿) 与 增长率(%)
    if (!withinRange(row.financeRevenue, filters.financeRevenueRange)) return false;
    if (!withinRange(row.financeNetProfit, filters.financeNetProfitRange)) return false;
    if (!withinRange(row.financeRevenueGrowth, filters.financeRevenueGrowthRange)) return false;
    if (!withinRange(row.financeNetProfitGrowth, filters.financeNetProfitGrowthRange)) return false;
    if (row.score < filters.minScore) return false;
    if (filters.excludeDowntrend !== false && !row.gates.notDowntrend) return false;
    if (filters.requireAboveMa60 && !row.gates.aboveMa60) return false;
    // 无日线数据时跳过该项（与 WeeklyFilterOptions 注释一致），只有明确不达标才排除
    if (filters.requireDailyAboveMa20 && row.dailyAboveMa20 === false) return false;

    if (setupFilterActive) {
      /**
       * 白名单与档位必须落在「同一个战法」上：
       * 若两者分开判定，「平台突破满分档 + 均线金叉部分档」这类组合会被错误放行。
       */
      const hits = row.setups.filter(
        (h) =>
          (allowedSetups === undefined ||
            allowedSetups.length === 0 ||
            allowedSetups.includes(h.key)) &&
          (allowedGrades === undefined || allowedGrades.includes(setupGradeOf(h)))
      );
      if (hits.length === 0) return false;
    }

    // 名称筛选：排除名称包含关键词 / 短期排除名单 / 行业分组
    if (excludedNameKeywords.length > 0 || excludedShortTermNameSet?.size || nameFilterIndustrySet) {
      const name = normalizeStockName(row.name ?? '');
      if (excludedNameKeywords.some((keyword) => name.includes(keyword))) return false;
      if (excludedShortTermNameSet?.has(name)) return false;
      if (nameFilterIndustrySet) {
        const hasGroupedIndustry = row.industryCode
          ? nameFilterIndustrySet.has(row.industryCode)
          : false;
        if (filters.nameFilterIndustryInvert) {
          // 反选模式：排除选中分组内的个股
          if (hasGroupedIndustry) return false;
        } else if (!hasGroupedIndustry) {
          // 正常模式：只保留选中分组内的个股
          return false;
        }
      }
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
