/**
 * 机会分析：横盘/趋势线/单日异动首次计算与侧栏筛选面板默认值一致（单源）
 */

export const OPPORTUNITY_DEFAULT_CONSOLIDATION = {
  lookback: 10,
  consecutive: 3,
  threshold: 1.5,
  requireClosesAboveMa10: false,
} as const;

export const OPPORTUNITY_DEFAULT_TREND_LINE = {
  lookback: 10,
  consecutive: 3,
} as const;

export const OPPORTUNITY_DEFAULT_SHARP_MOVE = {
  windowBars: 20,
  magnitude: 6,
} as const;
