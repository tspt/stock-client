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

/** 区间是否已设置边界：起止都为空 = 该项不参与筛选 */
function isRangeActive(range?: NumberRange): boolean {
  return !!range && (range.min !== undefined || range.max !== undefined);
}

/** 取值是否缺失（未取到数据；缺失与「不达标」是两回事） */
function isMissingValue(value: number | undefined | null): boolean {
  return value === undefined || value === null || !Number.isFinite(value);
}

/**
 * 区间判定（周线页口径）：
 * 1. 区间未设置 → 通过；
 * 2. 区间已设置但个股缺值 → 通过，并回调 `onMissing` 记账
 *    （该个股不参与这一项的判定，页面据此提示「N 只未参与该项筛选」）；
 * 3. 区间已设置且取值齐全 → 按 min / max 闭区间判定。
 *
 * 为什么缺值放行：周线页的市值 / 股数 / 财务数据全部来自 IndexedDB
 * （日线缓存 `stockHistory.latestDetail` + 财务缓存 `stockFinanceMetrics`），
 * 与机会分析页「本次分析现拉、覆盖率有保证」不同，可能整批缺值。
 * 若沿用「缺值即不通过」，默认区间（市值 30~1000 亿等）会把缺数据的个股静默剔除，
 * 表现为「必须清空总市值 / 总股数默认值才看得到股票」。
 * 与 requireDailyAboveMa20「无日线数据不阻断」保持同一口径。
 */
function passRange(
  value: number | undefined,
  range: NumberRange | undefined,
  onMissing: () => void
): boolean {
  if (!range) return true;
  if (range.min === undefined && range.max === undefined) return true;
  if (isMissingValue(value)) {
    onMissing();
    return true;
  }
  if (range.min !== undefined && (value as number) < range.min) return false;
  if (range.max !== undefined && (value as number) > range.max) return false;
  return true;
}

/** 入选名单里因缺数据未参与区间判定的只数（用于页面提示，避免筛选看起来失效） */
export interface WeeklyMissingDataStats {
  /** 缺总市值 / 总股数（任一同类区间已设置） */
  marketCap: number;
  /** 缺财务指标（营收 / 净利润 / 增长率 / ROE / 资产负债率，任一相关区间已设置） */
  finance: number;
  /** 合计只数（同一只股票只计一次） */
  total: number;
}

export interface WeeklyFilterResult {
  /** 通过全部硬门槛的个股 */
  rows: WeeklyAnalysis[];
  /** 上面名单里因缺数据未参与区间判定的只数 */
  missingData: WeeklyMissingDataStats;
}

/**
 * 按综合分与趋势结构过滤，并顺带统计「缺数据未参与区间判定」的只数。
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
 * 市值 / 股数 / 财务指标同理：数据缺失时不参与该项判定，只计入 missingData。
 */
export function applyWeeklyFilters(
  rows: WeeklyAnalysis[],
  filters: WeeklyFilterOptions
): WeeklyFilterResult {
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

  const kept: WeeklyAnalysis[] = [];
  const missingData: WeeklyMissingDataStats = { marketCap: 0, finance: 0, total: 0 };

  rows.forEach((row) => {
    if (row.insufficientData || !row.quality.ok) return;

    /** 该股在市值/股数、财务指标上是否缺数据（缺数据时该项放行，入选后计入 missingData） */
    let missingMarketCap = false;
    let missingFinance = false;
    const markMarketCap = () => {
      missingMarketCap = true;
    };
    const markFinance = () => {
      missingFinance = true;
    };

    // 数据筛选：价格 / 总市值(亿) / 总股数(亿)
    // 「只用完整周」时价格按最近已收盘周收盘价判定，否则用含本周的最新价
    const price = filters.completeWeeksOnly ? row.confirmedClose ?? row.close : row.close;
    if (!passRange(price, filters.priceRange, () => {})) return;
    if (!passRange(row.marketCap, filters.marketCapRange, markMarketCap)) return;
    if (!passRange(row.totalShares, filters.totalSharesRange, markMarketCap)) return;
    // 数据筛选：总营收/归母净利润(亿) 与 增长率(%)
    if (!passRange(row.financeRevenue, filters.financeRevenueRange, markFinance)) return;
    if (!passRange(row.financeNetProfit, filters.financeNetProfitRange, markFinance)) return;
    if (!passRange(row.financeRevenueGrowth, filters.financeRevenueGrowthRange, markFinance)) return;
    if (!passRange(row.financeNetProfitGrowth, filters.financeNetProfitGrowthRange, markFinance)) {
      return;
    }
    // 数据筛选：净资产收益率 ROE(%) / 资产负债率(%)
    if (!passRange(row.financeRoe, filters.financeRoeRange, markFinance)) return;
    if (!passRange(row.financeDebtRatio, filters.financeDebtRatioRange, markFinance)) return;

    if (row.score < filters.minScore) return;
    if (filters.excludeDowntrend !== false && !row.gates.notDowntrend) return;
    if (filters.requireAboveMa60 && !row.gates.aboveMa60) return;
    // 无日线数据时跳过该项（与 WeeklyFilterOptions 注释一致），只有明确不达标才排除
    if (filters.requireDailyAboveMa20 && row.dailyAboveMa20 === false) return;

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
      if (hits.length === 0) return;
    }

    // 名称筛选：排除名称包含关键词 / 短期排除名单 / 行业分组
    if (excludedNameKeywords.length > 0 || excludedShortTermNameSet?.size || nameFilterIndustrySet) {
      const name = normalizeStockName(row.name ?? '');
      if (excludedNameKeywords.some((keyword) => name.includes(keyword))) return;
      if (excludedShortTermNameSet?.has(name)) return;
      if (nameFilterIndustrySet) {
        const hasGroupedIndustry = row.industryCode
          ? nameFilterIndustrySet.has(row.industryCode)
          : false;
        if (filters.nameFilterIndustryInvert) {
          // 反选模式：排除选中分组内的个股
          if (hasGroupedIndustry) return;
        } else if (!hasGroupedIndustry) {
          // 正常模式：只保留选中分组内的个股
          return;
        }
      }
    }

    kept.push(row);
    if (missingMarketCap) missingData.marketCap += 1;
    if (missingFinance) missingData.finance += 1;
    if (missingMarketCap || missingFinance) missingData.total += 1;
  });

  return { rows: kept, missingData };
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
