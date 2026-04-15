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
  /** K线形态筛选 - 单根 */
  candlestickHammer: boolean;
  candlestickShootingStar: boolean;
  candlestickDoji: boolean;
  /** K线形态筛选 - 双根 */
  candlestickEngulfingBullish: boolean;
  candlestickEngulfingBearish: boolean;
  candlestickHaramiBullish: boolean;
  candlestickHaramiBearish: boolean;
  /** K线形态筛选 - 三根 */
  candlestickMorningStar: boolean;
  candlestickEveningStar: boolean;
  candlestickDarkCloudCover: boolean;
  candlestickPiercing: boolean;
  candlestickThreeBlackCrows: boolean;
  candlestickThreeWhiteSoldiers: boolean;
  /** K线形态回溯窗口大小（根数） */
  candlestickLookback: number;
  /** 趋势形态筛选 */
  trendUptrend: boolean;
  trendDowntrend: boolean;
  trendSideways: boolean;
  trendBreakout: boolean;
  trendBreakdown: boolean;
  /** 趋势形态回溯窗口大小（根数） */
  trendLookback: number;
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
  /** 是否要求有相似形态匹配 */
  aiRequireSimilarPatterns: boolean;
  /** 相似形态最低相似度（0-1，转换为0-100显示） */
  aiMinSimilarity?: number;
  /** AI信号共识：要求最少N个信号方向一致 */
  aiMinSignalCount?: number;
  /** AI相似形态历史胜率范围（0-100%） */
  aiPatternWinRateRange: NumberRange;
  /** AI最低风险收益比 */
  aiMinRiskRewardRatio?: number;
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
