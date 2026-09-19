/**
 * 周线分析模块入口
 *
 * 使用方式：
 *   const rows = analyzeWeeklyKlines(klines, names);
 *   const picked = applyWeeklyFilters(rows, { ...DEFAULT_WEEKLY_FILTERS });
 *
 * 评分是「三段式绝对分」（趋势健康度 + 战法 + 多周期共振 − 风险），不再依赖横截面分位；
 * 但 scoreRank 仍按池内分位计算，用于展示，因此需要整批处理。
 */

import type { KLineData } from '@/types/stock';
import { DEFAULT_WEEKLY_CONFIG, computeWeeklyFactors } from './factors';
import { isDailyAboveMa } from './resonance';
import { scoreWeeklyFactors } from './score';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFilterOptions,
} from './types';

export * from './types';
export {
  DEFAULT_WEEKLY_CONFIG,
  computeWeeklyFactors,
  splitConfirmedWeeklyKlines,
  isRunningWeek,
} from './factors';
export { scoreWeeklyFactors, isBearStack } from './score';
export { buildWeeklyPanel, snapshotAt } from './panel';
export { detectSetups, totalSetupScore, setupGradeOf } from './setups';
export { computeStopLoss, detectExitSignals } from './exitRules';
export {
  backtestWeeklySetups,
  createWeeklyBacktestSession,
  summarizeBacktestTrades,
  BACKTEST_SETUP_KEYS,
  BACKTEST_EXCLUSION_LABELS,
} from './backtest';
export type {
  BacktestExitKind,
  BacktestExitPolicy,
  BacktestExclusionReason,
  WeeklyBacktestExcludedSample,
  WeeklyBacktestExclusions,
  WeeklyBacktestOptions,
  WeeklyBacktestResult,
  WeeklyBacktestSession,
  WeeklyBacktestStats,
  WeeklyBacktestTrade,
} from './backtest';
export { isDailyAboveMa, resonanceLayers, DAILY_MA_PERIOD } from './resonance';
export { pickByIndustryCap, industryKeyOf, applyWeeklyFilters } from './select';
export type { WeeklyPanel } from './panel';

/** 1 亿元（成交额单位：元） */
export const YI = 1e8;

/**
 * 默认筛选条件。
 *
 * 流动性（近 8 周成交额中位数）与 13 周动量 / 26 周涨幅 / 52 周位置 / 量能趋势
 * 这几项门槛已移除：它们是旧版「横截面动量排序」的遗留门槛，与战法逻辑直接冲突——
 * 平台突破发生在「低位横盘」（52 周位置偏低），回踩低吸要求「缩量」（量能趋势偏低）。
 */
export const DEFAULT_WEEKLY_FILTERS: WeeklyFilterOptions = {
  minScore: 0,
  /** 文档「直接排除股价长期在 60 周均线下方的个股」 */
  requireAboveMa60: true,
  /** 文档「剔除周线空头排列个股」 */
  excludeDowntrend: true,
  /**
   * 战法默认不当硬门槛：六大战法同时成立的机会极少，
   * 直接卡死会把名单筛空。勾选后才要求至少命中一个。
   */
  requireSetup: true,
  allowedSetups: undefined,
  /** 日线数据可能没拉，默认不阻断 */
  requireDailyAboveMa20: false,
};

export interface WeeklyAnalyzeOptions {
  config?: WeeklyConfig;
  /** 参与横截面参考量（scoreRank）的股票代码集合 */
  poolCodes?: Set<string> | string[] | null;
  industries?: Map<string, { code: string; name: string }>;
  /** 日线数据（复用机会分析的 stockHistory），用于多周期共振 */
  dailyKlines?: Map<string, KLineData[]>;
}

/**
 * 整批分析：先算单票因子，再做评分。
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
    const daily = options.dailyKlines?.get(code);
    return {
      ...f,
      industryCode: ind?.code ?? f.industryCode,
      industryName: ind?.name ?? f.industryName,
      dailyAboveMa20: daily ? isDailyAboveMa(daily) : undefined,
    };
  });
  return scoreWeeklyFactors(factors, config);
}
