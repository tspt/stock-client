/**
 * 周线分析模块入口
 *
 * 使用方式（必须整批处理，因为评分依赖横截面分位）：
 *   const rows = analyzeWeeklyKlines(klines, names);
 *   const picked = applyWeeklyFilters(rows, PRESETS[0].filters);
 */

import type { KLineData } from '@/types/stock';
import { DEFAULT_WEEKLY_CONFIG, computeWeeklyFactors } from './factors';
import { scoreWeeklyFactors } from './score';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFilterOptions,
} from './types';
import type { WeeklySignalRule } from './backtest';

export * from './types';
export { DEFAULT_WEEKLY_CONFIG, computeWeeklyFactors, splitConfirmedWeeklyKlines, isRunningWeek } from './factors';
export { scoreWeeklyFactors } from './score';
export { backtestWeeklySignals } from './backtest';
export type { WeeklySignalRule, BacktestOptions } from './backtest';

/** 1 亿元（成交额单位：元） */
export const YI = 1e8;

export const DEFAULT_WEEKLY_FILTERS: WeeklyFilterOptions = {
  minScore: 50,
  minAvgAmount: 3 * YI,
  minRsRank: 0,
  maxPos52w: 100,
  maxExtBias: 4,
  maxAtrPct: 15,
  requireUptrend: false,
  requireAboveMa20: false,
  requirePattern: false,
  excludeDowntrend: true,
};

export interface WeeklyPreset {
  key: string;
  label: string;
  hint: string;
  filters: WeeklyFilterOptions;
}

export const WEEKLY_PRESETS: WeeklyPreset[] = [
  {
    key: 'leader',
    label: '强势领涨（推荐）',
    hint: '相对强度居前 + 中期趋势向上 + 位置未极端：赚的是「强者恒强」的钱，回撤靠周MA20 止损',
    filters: {
      minScore: 50,
      minAvgAmount: 5 * YI,
      minRsRank: 55,
      maxPos52w: 100,
      maxExtBias: 4,
      maxAtrPct: 15,
      requireUptrend: true,
      requireAboveMa20: true,
      requirePattern: false,
      excludeDowntrend: true,
    },
  },
  {
    key: 'breakout',
    label: '箱体突破',
    hint: '10 周箱体首次放量突破：弹性最大，止损放箱顶，破位即走，不在突破周最高价追',
    filters: {
      minScore: 45,
      minAvgAmount: 5 * YI,
      minRsRank: 50,
      maxPos52w: 100,
      maxExtBias: 5,
      maxAtrPct: 18,
      requireUptrend: false,
      requireAboveMa20: false,
      requirePattern: true,
      excludeDowntrend: true,
    },
  },
  {
    key: 'low',
    label: '低位埋伏',
    hint: '52 周分位偏低但已站上周MA20：位置有安全边际，代价是需要更长时间等待，仓位宜小',
    filters: {
      minScore: 45,
      minAvgAmount: 3 * YI,
      minRsRank: 40,
      maxPos52w: 45,
      maxExtBias: 3,
      maxAtrPct: 15,
      requireUptrend: false,
      requireAboveMa20: true,
      requirePattern: false,
      excludeDowntrend: true,
    },
  },
  {
    key: 'steady',
    label: '低波动稳健',
    hint: '过滤高波动投机品种，只要走得稳的：适合不想盯盘、按周线持有的人群',
    filters: {
      minScore: 50,
      minAvgAmount: 10 * YI,
      minRsRank: 50,
      maxPos52w: 95,
      maxExtBias: 2.5,
      maxAtrPct: 8,
      requireUptrend: true,
      requireAboveMa20: true,
      requirePattern: false,
      excludeDowntrend: true,
    },
  },
  {
    key: 'all',
    label: '全部（按评分排序）',
    hint: '只做数据质量与流动性过滤，其余不设限：适合人工翻看前列，或验证筛选条件是否过严',
    filters: {
      minScore: 0,
      minAvgAmount: 1 * YI,
      minRsRank: 0,
      maxPos52w: 100,
      maxExtBias: 99,
      maxAtrPct: 99,
      requireUptrend: false,
      requireAboveMa20: false,
      requirePattern: false,
      excludeDowntrend: false,
    },
  },
];

/**
 * 整批分析：先算单票因子，再做横截面评分。
 * 单只股票无法独立完成评分（分位需要总体），因此必须传入整批数据。
 */
export function analyzeWeeklyKlines(
  klines: Map<string, KLineData[]>,
  names: Map<string, string>,
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG
): WeeklyAnalysis[] {
  const factors = Array.from(klines.entries()).map(([code, kline]) =>
    computeWeeklyFactors(code, names.get(code) ?? '', kline, config)
  );
  return scoreWeeklyFactors(factors, config);
}

/** 按筛选条件过滤结果 */
export function applyWeeklyFilters(
  rows: WeeklyAnalysis[],
  filters: WeeklyFilterOptions
): WeeklyAnalysis[] {
  return rows.filter((row) => {
    if (row.insufficientData || !row.quality.ok) return false;
    if (row.score < filters.minScore) return false;

    // 流动性是一票否决项：无量突破在周线级别几乎都是噪音
    if (filters.minAvgAmount > 0) {
      if (row.avgAmount20w === undefined || row.avgAmount20w < filters.minAvgAmount) return false;
    }
    if (filters.minRsRank > 0 && (row.rsRank ?? 0) < filters.minRsRank) return false;
    if (row.pos52w !== undefined && row.pos52w > filters.maxPos52w) return false;
    if (row.extBias !== undefined && row.extBias > filters.maxExtBias) return false;
    if (row.atrPct !== undefined && row.atrPct > filters.maxAtrPct) return false;
    if (filters.requireUptrend && row.structure !== 'up') return false;
    if (filters.requireAboveMa20 && !row.pxAboveMa20) return false;
    if (filters.requirePattern && !(row.boxBreakout || row.boxBreakoutFirst)) return false;
    if (filters.excludeDowntrend && row.structure === 'down') return false;
    return true;
  });
}

/** 把 UI 筛选条件映射为回测信号规则，保证「回测的就是我选的」 */
export function toSignalRule(filters: WeeklyFilterOptions): WeeklySignalRule {
  return {
    requireAboveMa20: filters.requireAboveMa20,
    requireMa20Rising: filters.requireUptrend,
    requireBoxBreakout: filters.requirePattern,
    maxExtBias: filters.maxExtBias < 99 ? filters.maxExtBias : undefined,
    minAvgAmount: filters.minAvgAmount > 0 ? filters.minAvgAmount : undefined,
    maxPos52w: filters.maxPos52w < 100 ? filters.maxPos52w : undefined,
  };
}
