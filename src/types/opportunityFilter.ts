import type { ConsolidationType, StockOpportunityData } from '@/types/stock';

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
  /** RSI指标范围 */
  rsiRange: NumberRange;
  /** RSI周期 */
  rsiPeriod: number;
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
  /** AI风险评分范围（0-100，分数越高风险越低） */
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
  /** 行业板块筛选 */
  industrySectors?: string[];
  /** 概念板块筛选 */
  conceptSectors?: string[];
  /** 行业板块反选 */
  industrySectorInvert?: boolean;
  /** 概念板块反选 */
  conceptSectorInvert?: boolean;
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
