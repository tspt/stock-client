import type { ConsolidationType, StockOpportunityData, TradingSignalType } from '@/types/stock';

export interface NumberRange {
  min?: number;
  max?: number;
}

export interface OpportunityFilterSnapshot {
  priceRange: NumberRange;
  marketCapRange: NumberRange;
  totalSharesRange: NumberRange;
  turnoverRateRange: NumberRange;
  peRatioRange: NumberRange;
  kdjJRange: NumberRange;
  recentLimitUpCount?: number;
  recentLimitDownCount?: number;
  limitUpPeriod: number;
  limitDownPeriod: number;
  consolidationTypes: ConsolidationType[];
  consolidationLookback: number;
  consolidationConsecutive: number;
  consolidationThreshold: number;
  consolidationRequireAboveMa10: boolean;
  consolidationFilterEnabled: boolean;
  trendLineLookback: number;
  trendLineConsecutive: number;
  trendLineFilterEnabled: boolean;
  /** 单日异动筛选开关 */
  sharpMoveFilterEnabled: boolean;
  /** 单日异动筛选：最近 N 根 K 线 */
  sharpMoveWindowBars: number;
  /** 单日涨跌阈值 M（%） */
  sharpMoveMagnitude: number;
  /** 横盘幅度阈值（%），用于判断急跌横盘急涨等形态中的“横盘” */
  sharpMoveFlatThreshold: number;
  /** 以下多选，满足任一即入选（OR） */
  sharpMoveOnlyDrop: boolean;
  sharpMoveOnlyRise: boolean;
  sharpMoveDropThenRiseLoose: boolean;
  sharpMoveRiseThenDropLoose: boolean;
  sharpMoveDropFlatRise: boolean;
  sharpMoveRiseFlatDrop: boolean;
  /** 量价回踩筛选开关（放量上涨 → 缩量回踩不破 MA10） */
  volumePullbackFilterEnabled: boolean;
  /** 触发日回溯范围：从最新一根向前追溯的根数（含最新一根） */
  volumePullbackLookback: number;
  /** 触发日最小涨幅（%） */
  volumePullbackMinRisePct: number;
  /** 触发日类型：any=大涨或盘中触及涨停；limitUp=必须收盘涨停 */
  volumePullbackTriggerType: 'any' | 'limitUp';
  /** 放量倍数：触发日成交量 / 前 N 日均量 */
  volumePullbackVolumeRatio: number;
  /** 均量周期 */
  volumePullbackVolumeMaPeriod: number;
  /** 触发日后最长回踩根数 */
  volumePullbackMaxBars: number;
  /** 自峰值回撤下限（%） */
  volumePullbackMinPullbackPct: number;
  /** 自峰值回撤上限（%） */
  volumePullbackMaxPullbackPct: number;
  /** 缩量比上限：回踩段最大量 / 触发日量 */
  volumePullbackVolumeShrink: number;
  /** MA10 容差（%）：收盘 ≥ MA10 × (1 - 容差/100) 视为未破位 */
  volumePullbackMa10TolerancePct: number;
  /** 是否要求触发日带长上影线 */
  volumePullbackRequireUpperShadow: boolean;
  /** 上影线占比阈值（%）：上影长度 / 全日振幅 */
  volumePullbackUpperShadowRatio: number;
  /** 总营收范围（单位：亿元，数据来自「获取营收净利润」） */
  financeRevenueRange?: NumberRange;
  /** 归母净利润范围（单位：亿元，数据来自「获取营收净利润」） */
  financeNetProfitRange?: NumberRange;
  /** 总营收增长率范围（单位：%，数据来自「获取营收净利润」） */
  financeRevenueGrowthRange?: NumberRange;
  /** 归母净利润增长率范围（单位：%，数据来自「获取营收净利润」） */
  financeNetProfitGrowthRange?: NumberRange;
  /** RSI指标范围 */
  rsiRange: NumberRange;
  /** RSI周期 */
  rsiPeriod: number;
  /**
   * 交易信号筛选：勾选任一信号类型即入选（OR）；
   * 空数组 / 不传表示不按交易信号筛选。无信号（K 线不足 60 根）视为不命中。
   */
  tradingSignalTypes?: TradingSignalType[];
  /** 布林带阈值（0-1之间，默认0.02即2%） */
  bollingerThreshold: number;
  /** MACD金叉 */
  macdGoldenCross: boolean;
  /** MACD死叉 */
  macdDeathCross: boolean;
  /** MACD背离 */
  macdDivergence: boolean;
  /** 布林带上轨 */
  bollingerUpper: boolean;
  /** 布林带中轨 */
  bollingerMiddle: boolean;
  /** 布林带下轨 */
  bollingerLower: boolean;
  /** AI分析筛选开关 */
  aiAnalysisEnabled: boolean;
  /** AI趋势预测方向筛选 */
  aiTrendUp: boolean;
  aiTrendDown: boolean;
  aiTrendSideways: boolean;
  /** AI趋势预测置信度范围（0-1，转换为0-100显示） */
  aiConfidenceRange: NumberRange;
  /** AI智能推荐综合评分范围（0-100） */
  aiRecommendScoreRange: NumberRange;
  /** AI技术面评分范围（0-100） */
  aiTechnicalScoreRange: NumberRange;
  /** AI形态评分范围（0-100） */
  aiPatternScoreRange: NumberRange;
  /** AI趋势评分范围（0-100） */
  aiTrendScoreRange: NumberRange;
  /** AI安全评分范围（0-100，分数越高越安全） */
  aiRiskScoreRange: NumberRange;
  /** v3.0 新增：信号共识筛选 */
  aiSignalConfluence?: boolean; // 是否要求信号共识
  aiMinSignalCount?: number; // 最少支持信号数量（默认4）
  aiMinSignalRatio?: number; // 最小信号比例（默认0.6）
  /** v3.0 新增：相似形态胜率筛选 */
  aiPatternWinRateRange?: NumberRange; // 相似形态胜率范围（0-100%）
  aiMinSimilarPatterns?: number; // 最少相似股票数量（默认3）
  /** v3.0 新增：风险收益比筛选 */
  aiMinRiskRewardRatio?: number; // 最小风险收益比（默认2.0）
  /** 当前使用的 AI 版本 */
  aiVersion?: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
  /** 行业板块筛选 */
  industrySectors?: string[];
  /** 概念板块筛选 */
  conceptSectors?: string[];
  /** 行业板块反选 */
  industrySectorInvert?: boolean;
  /** 名称筛选面板：行业分组对应的行业板块代码（独立于顶部「行业」筛选） */
  nameFilterIndustryCodes?: string[];
  /** 名称筛选面板：行业分组反选（独立于顶部「行业」筛选） */
  nameFilterIndustryInvert?: boolean;
  /** 概念板块反选 */
  conceptSectorInvert?: boolean;
  /** 股票名称类型：全部 / ST / 非ST（基于分析结果最新名称二次过滤） */
  nameType?: 'all' | 'st' | 'non_st';
  /** 名称筛选 - 是否启用名称包含过滤 */
  enableNameKeywordFilter?: boolean;
  /** 名称包含过滤 - 排除包含这些关键词的股票名称 */
  excludedNameKeywords?: string[];
  /** 短期排除股票名称 - 是否启用 */
  enableShortTermNameFilter?: boolean;
  /** 短期排除股票名称列表 */
  excludedShortTermNames?: string[];
}

export interface FilterSkippedItem {
  code: string;
  name: string;
  reason: string;
}

export interface OpportunityFilterResult {
  data: StockOpportunityData[];
  skipped: FilterSkippedItem[];
}
