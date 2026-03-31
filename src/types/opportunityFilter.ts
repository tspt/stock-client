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
