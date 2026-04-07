import type { ConsolidationType, StockOpportunityData } from '@/types/stock';

export interface NumberRange {
  min?: number;
  max?: number;
}

export interface OpportunityFilterSnapshot {
  priceRange: NumberRange;
  marketCapRange: NumberRange;
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
  /** 单日异动筛选：最近 N 根 K 线 */
  sharpMoveWindowBars: number;
  /** 单日涨跌阈值 M（%） */
  sharpMoveMagnitude: number;
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
