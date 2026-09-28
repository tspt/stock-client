/**
 * 机会分析页筛选表单状态 → 持久化偏好 / 筛选引擎快照 的唯一构造入口。
 *
 * 背景：页面原先在「卸载保存」「防抖保存」「filterSnapshot」三处以近乎逐字段重复的
 * 字面量组装同一批字段（共 60+ 项），改一个筛选项要同步改三处。这里把字段清单与
 * 归一化规则收敛到一处，页面只负责把 useState 汇总成 OpportunityFilterFormState。
 */

import type { ConsolidationType, KLinePeriod, TradingSignalType } from '@/types/stock';
import type { NumberRange, OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import {
  visibilityFromActiveFilterPanelKey,
  type OpportunityFilterPrefs,
} from '@/utils/config/opportunityFilterPrefs';
import type { AiVersion } from '@/utils/config/opportunityPageOptions';

/**
 * 筛选表单中共用的一段状态：既是持久化偏好（OpportunityFilterPrefs）的主体，
 * 也是筛选引擎快照（OpportunityFilterSnapshot）的主体。
 */
export interface OpportunityFilterFormState {
  // 数据筛选
  priceRange: NumberRange;
  marketCapRange: NumberRange;
  totalSharesRange: NumberRange;
  turnoverRateRange: NumberRange;
  peRatioRange: NumberRange;
  kdjJRange: NumberRange;
  financeRevenueRange: NumberRange;
  financeNetProfitRange: NumberRange;
  financeRevenueGrowthRange: NumberRange;
  financeNetProfitGrowthRange: NumberRange;
  financeRoeRange: NumberRange;
  financeDebtRatioRange: NumberRange;

  // 涨跌停筛选
  recentLimitUpCount: number | undefined;
  recentLimitDownCount: number | undefined;
  limitUpPeriod: number;
  limitDownPeriod: number;

  // 横盘筛选
  consolidationTypes: ConsolidationType[];
  consolidationLookback: number;
  consolidationConsecutive: number;
  consolidationThreshold: number;
  consolidationRequireAboveMa10: boolean;
  consolidationFilterEnabled: boolean;

  // 趋势线筛选
  trendLineLookback: number;
  trendLineConsecutive: number;
  trendLineFilterEnabled: boolean;

  // 单日异动筛选
  sharpMoveFilterEnabled: boolean;
  sharpMoveWindowBars: number;
  sharpMoveMagnitude: number;
  sharpMoveFlatThreshold: number;
  sharpMoveOnlyDrop: boolean;
  sharpMoveOnlyRise: boolean;
  sharpMoveDropThenRiseLoose: boolean;
  sharpMoveRiseThenDropLoose: boolean;
  sharpMoveDropFlatRise: boolean;
  sharpMoveRiseFlatDrop: boolean;

  // 量价回踩筛选
  volumePullbackFilterEnabled: boolean;
  volumePullbackLookback: number;
  volumePullbackMinRisePct: number;
  volumePullbackTriggerType: 'any' | 'limitUp';
  volumePullbackVolumeRatio: number;
  volumePullbackVolumeMaPeriod: number;
  volumePullbackMaxBars: number;
  volumePullbackMinPullbackPct: number;
  volumePullbackMaxPullbackPct: number;
  volumePullbackVolumeShrink: number;
  volumePullbackMa10TolerancePct: number;
  volumePullbackRequireUpperShadow: boolean;
  volumePullbackUpperShadowRatio: number;

  // 技术指标 / 交易信号
  rsiRange: NumberRange;
  rsiPeriod: number;
  tradingSignalTypes: TradingSignalType[];

  // AI 分析筛选
  aiAnalysisEnabled: boolean;
  aiTrendUp: boolean;
  aiTrendDown: boolean;
  aiTrendSideways: boolean;
  aiConfidenceRange: NumberRange;
  aiRecommendScoreRange: NumberRange;
  aiTechnicalScoreRange: NumberRange;
  aiPatternScoreRange: NumberRange;
  aiTrendScoreRange: NumberRange;
  aiRiskScoreRange: NumberRange;

  // 名称过滤
  enableNameKeywordFilter: boolean;
  excludedNameKeywords: string[];
  enableShortTermNameFilter: boolean;
  excludedShortTermNames: string[];
}

/** 持久化偏好中不参与筛选引擎的顶部查询条字段 */
export interface OpportunityQueryState {
  currentPeriod: KLinePeriod;
  currentCount: number;
}

/** 构造持久化偏好时的补充字段（不属于共享主体） */
export interface OpportunityFilterPrefsExtras {
  selectedMarket: string[];
  nameType: string;
  /** 当前展开的筛选面板 key，用于推导各面板可见性 */
  filterPanelActiveKey: string[];
  nameFilterIndustryGroups: string[];
  nameFilterIndustryInvert: boolean;
  /** 名称筛选面板：选中的概念板块代码（不分组，直接多选） */
  nameFilterConceptSectors: string[];
  nameFilterConceptInvert: boolean;
}

/** 由筛选表单状态构造待写入 localStorage 的偏好（与原有字段一一对应） */
export function buildOpportunityFilterPrefs(
  form: OpportunityFilterFormState,
  extras: OpportunityFilterPrefsExtras,
  query: OpportunityQueryState
): OpportunityFilterPrefs {
  return {
    version: 1,
    selectedMarket: [...extras.selectedMarket],
    nameType: extras.nameType,
    currentPeriod: query.currentPeriod,
    currentCount: query.currentCount,

    priceRange: { ...form.priceRange },
    marketCapRange: { ...form.marketCapRange },
    totalSharesRange: { ...form.totalSharesRange },
    turnoverRateRange: { ...form.turnoverRateRange },
    peRatioRange: { ...form.peRatioRange },
    kdjJRange: { ...form.kdjJRange },
    financeRevenueRange: { ...form.financeRevenueRange },
    financeNetProfitRange: { ...form.financeNetProfitRange },
    financeRevenueGrowthRange: { ...form.financeRevenueGrowthRange },
    financeNetProfitGrowthRange: { ...form.financeNetProfitGrowthRange },
    financeRoeRange: { ...form.financeRoeRange },
    financeDebtRatioRange: { ...form.financeDebtRatioRange },

    // 面板可见性由当前展开项推导
    ...visibilityFromActiveFilterPanelKey(extras.filterPanelActiveKey),

    recentLimitUpCount: form.recentLimitUpCount,
    recentLimitDownCount: form.recentLimitDownCount,
    limitUpPeriod: form.limitUpPeriod,
    limitDownPeriod: form.limitDownPeriod,

    consolidationTypes: [...form.consolidationTypes],
    consolidationLookback: form.consolidationLookback,
    consolidationConsecutive: form.consolidationConsecutive,
    consolidationThreshold: form.consolidationThreshold,
    consolidationRequireAboveMa10: form.consolidationRequireAboveMa10,
    consolidationFilterEnabled: form.consolidationFilterEnabled,

    trendLineLookback: form.trendLineLookback,
    trendLineConsecutive: form.trendLineConsecutive,
    trendLineFilterEnabled: form.trendLineFilterEnabled,

    sharpMoveFilterEnabled: form.sharpMoveFilterEnabled,
    sharpMoveWindowBars: form.sharpMoveWindowBars,
    sharpMoveMagnitude: form.sharpMoveMagnitude,
    sharpMoveFlatThreshold: form.sharpMoveFlatThreshold,
    sharpMoveOnlyDrop: form.sharpMoveOnlyDrop,
    sharpMoveOnlyRise: form.sharpMoveOnlyRise,
    sharpMoveDropThenRiseLoose: form.sharpMoveDropThenRiseLoose,
    sharpMoveRiseThenDropLoose: form.sharpMoveRiseThenDropLoose,
    sharpMoveDropFlatRise: form.sharpMoveDropFlatRise,
    sharpMoveRiseFlatDrop: form.sharpMoveRiseFlatDrop,

    volumePullbackFilterEnabled: form.volumePullbackFilterEnabled,
    volumePullbackLookback: form.volumePullbackLookback,
    volumePullbackMinRisePct: form.volumePullbackMinRisePct,
    volumePullbackTriggerType: form.volumePullbackTriggerType,
    volumePullbackVolumeRatio: form.volumePullbackVolumeRatio,
    volumePullbackVolumeMaPeriod: form.volumePullbackVolumeMaPeriod,
    volumePullbackMaxBars: form.volumePullbackMaxBars,
    volumePullbackMinPullbackPct: form.volumePullbackMinPullbackPct,
    volumePullbackMaxPullbackPct: form.volumePullbackMaxPullbackPct,
    volumePullbackVolumeShrink: form.volumePullbackVolumeShrink,
    volumePullbackMa10TolerancePct: form.volumePullbackMa10TolerancePct,
    volumePullbackRequireUpperShadow: form.volumePullbackRequireUpperShadow,
    volumePullbackUpperShadowRatio: form.volumePullbackUpperShadowRatio,

    rsiRange: { ...form.rsiRange },
    rsiPeriod: form.rsiPeriod,
    tradingSignalTypes: [...form.tradingSignalTypes],

    aiAnalysisEnabled: form.aiAnalysisEnabled,
    aiTrendUp: form.aiTrendUp,
    aiTrendDown: form.aiTrendDown,
    aiTrendSideways: form.aiTrendSideways,
    aiConfidenceRange: { ...form.aiConfidenceRange },
    aiRecommendScoreRange: { ...form.aiRecommendScoreRange },
    aiTechnicalScoreRange: { ...form.aiTechnicalScoreRange },
    aiPatternScoreRange: { ...form.aiPatternScoreRange },
    aiTrendScoreRange: { ...form.aiTrendScoreRange },
    aiRiskScoreRange: { ...form.aiRiskScoreRange },

    enableNameKeywordFilter: form.enableNameKeywordFilter,
    excludedNameKeywords: [...form.excludedNameKeywords],
    enableShortTermNameFilter: form.enableShortTermNameFilter,
    excludedShortTermNames: [...form.excludedShortTermNames],

    nameFilterIndustryGroups: [...extras.nameFilterIndustryGroups],
    nameFilterIndustryInvert: extras.nameFilterIndustryInvert,
    nameFilterConceptSectors: [...extras.nameFilterConceptSectors],
    nameFilterConceptInvert: extras.nameFilterConceptInvert,
  };
}

/** 构造筛选引擎快照时的补充字段（不属于共享主体） */
export interface OpportunityFilterSnapshotExtras {
  aiVersion: AiVersion;
  industrySectors: string[];
  conceptSectors: string[];
  industrySectorInvert: boolean;
  conceptSectorInvert: boolean;
  /** 名称筛选面板：行业分组对应的行业板块代码 */
  nameFilterIndustryCodes: string[];
  nameFilterIndustryInvert: boolean;
  /** 名称筛选面板：选中的概念板块代码（多值，命中任一即通过） */
  nameFilterConceptSectors: string[];
  nameFilterConceptInvert: boolean;
  nameType: 'all' | 'st' | 'non_st';
}

/** 由筛选表单状态构造筛选引擎快照（数组沿用状态引用，与拆分前一致） */
export function buildOpportunityFilterSnapshot(
  form: OpportunityFilterFormState,
  extras: OpportunityFilterSnapshotExtras
): OpportunityFilterSnapshot {
  return {
    ...form,
    ...extras,
  };
}
