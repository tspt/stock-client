/**
 * 机会分析：横盘/趋势线/单日异动首次计算与侧栏筛选面板默认值一致（单源）
 *
 * 注意：常量顺序按照界面显示顺序排列
 */

// ==================== 1. 数据筛选 ====================

/** 基础筛选默认配置 */
export const OPPORTUNITY_DEFAULT_BASIC_FILTERS = {
  /** 选择市场 */
  selectedMarket: 'hs_main' as const,
  /** 股票名称类型 */
  nameType: 'non_st' as const,
  /** 价格 */
  priceRange: { min: 3, max: 30 },
  /** 市值范围（亿） */
  marketCapRange: { min: 30, max: 500 },
  /** 总股本范围（亿） */
  totalSharesRange: { min: 1, max: 50 },
  /** 换手率范围（%） */
  turnoverRateRange: { min: 1 },
} as const;

/** 涨跌停筛选默认配置 */
export const OPPORTUNITY_DEFAULT_LIMIT_MOVES = {
  /** 涨停/跌停统计周期 */
  period: 20,
} as const;

// ==================== 2. AI分析筛选 ====================

/** AI分析筛选默认配置 */
export const OPPORTUNITY_DEFAULT_AI_ANALYSIS = {
  /** 是否启用AI分析 */
  enabled: true,
  /** AI趋势判断 - 看涨 */
  trendUp: true,
  /** AI趋势判断 - 看跌 */
  trendDown: false,
  /** AI趋势判断 - 横盘 */
  trendSideways: false,
  /** AI趋势评分最小值 */
  trendScoreMin: 50,
  /** AI风险评分最小值 */
  riskScoreMin: 50,
} as const;

// ==================== 3. 横盘筛选 ====================

export const OPPORTUNITY_DEFAULT_CONSOLIDATION = {
  lookback: 10,
  consecutive: 3,
  threshold: 1.5,
  requireClosesAboveMa10: false,
} as const;

// ==================== 4. 趋势线筛选 ====================

export const OPPORTUNITY_DEFAULT_TREND_LINE = {
  lookback: 10,
  consecutive: 3,
} as const;

// ==================== 5. 单日异动筛选 ====================

export const OPPORTUNITY_DEFAULT_SHARP_MOVE = {
  windowBars: 20,
  magnitude: 4,
} as const;

/** 异动筛选完整配置 */
export const OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL = {
  ...OPPORTUNITY_DEFAULT_SHARP_MOVE,
  /** 横盘幅度阈值（%） */
  flatThreshold: 3,
  /** 仅急跌 */
  onlyDrop: true,
  /** 仅急涨 */
  onlyRise: true,
  /** 急跌→急涨 */
  dropThenRiseLoose: true,
  /** 急涨→急跌 */
  riseThenDropLoose: true,
  /** 急跌横盘急涨 */
  dropFlatRise: false,
  /** 急涨横盘急跌 */
  riseFlatDrop: false,
} as const;

// ==================== 6. 形态筛选 ====================

/** 技术指标筛选默认配置 */
export const OPPORTUNITY_DEFAULT_INDICATORS = {
  /** RSI周期 */
  rsiPeriod: 14,
  /** 布林带阈值（0-1之间，即百分比） */
  bollingerThreshold: 0.02,
} as const;

/** K线形态识别默认配置 */
export const OPPORTUNITY_DEFAULT_CANDLESTICK = {
  /** K线形态回溯窗口大小（根数） */
  lookback: 20,
  /** 启用成交量确认 */
  useVolumeConfirmation: true,
  /** 反转形态强制成交量确认 */
  requireVolumeForReversal: true,
  /** 趋势背景回溯周期（根数） */
  trendBackgroundLookback: 10,
  /** 成交量放大倍数 */
  volumeMultiplier: 1.5,
} as const;

/** 趋势形态识别默认配置 */
export const OPPORTUNITY_DEFAULT_TREND_PATTERN = {
  /** 趋势形态回溯窗口大小（根数） */
  lookback: 20,
} as const;
