/**
 * 周线分析模块入口
 *
 * 使用方式（必须整批处理，因为评分依赖横截面分位）：
 *   const rows = analyzeWeeklyKlines(klines, names);
 *   const picked = applyWeeklyFilters(rows, { minScore: 0, minAvgAmount });
 */

import type { KLineData } from '@/types/stock';
import { DEFAULT_WEEKLY_CONFIG, computeWeeklyFactors } from './factors';
import { scoreWeeklyFactors } from './score';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFilterOptions,
} from './types';

export * from './types';
export { DEFAULT_WEEKLY_CONFIG, computeWeeklyFactors, splitConfirmedWeeklyKlines, isRunningWeek } from './factors';
export { scoreWeeklyFactors } from './score';
export { buildWeeklyPanel, snapshotAt } from './panel';
export { backtestHoldStrategy } from './holdStrategy';
export type { HoldStrategyResult, HoldPositionView, HoldStrategyOptions } from './holdStrategy';
export { pickByIndustryCap, industryKeyOf } from './select';
export type { WeeklyPanel } from './panel';

/** 1 亿元（成交额单位：元） */
export const YI = 1e8;

export const DEFAULT_WEEKLY_FILTERS: WeeklyFilterOptions = {
  minScore: 0,
  minAvgAmount: 3 * YI,
};

export interface WeeklyAnalyzeOptions {
  config?: WeeklyConfig;
  /**
   * 参与横截面评分的股票代码集合。
   * 评分是「池内排名」，必须与当前市场筛选一致。
   */
  poolCodes?: Set<string> | string[] | null;
  industries?: Map<string, { code: string; name: string }>;
  minLiquidity?: number;
}

/**
 * 整批分析：先算单票因子，再做横截面评分。
 */
export function analyzeWeeklyKlines(
  klines: Map<string, KLineData[]>,
  names: Map<string, string>,
  options: WeeklyAnalyzeOptions = {}
): WeeklyAnalysis[] {
  const config = options.config ?? DEFAULT_WEEKLY_CONFIG;
  const pool = options.poolCodes
    ? options.poolCodes instanceof Set
      ? options.poolCodes
      : new Set(options.poolCodes)
    : null;

  const entries = pool
    ? Array.from(klines.entries()).filter(([code]) => pool.has(code))
    : Array.from(klines.entries());

  const factors = entries.map(([code, kline]) => {
    const f = computeWeeklyFactors(code, names.get(code) ?? '', kline, config);
    const ind = options.industries?.get(code);
    if (!ind) return f;
    return { ...f, industryCode: ind.code, industryName: ind.name };
  });
  return scoreWeeklyFactors(factors, config, options.minLiquidity);
}

/** 按流动性与最低分过滤 */
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
    return true;
  });
}
