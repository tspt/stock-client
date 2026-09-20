/**
 * 机会分析页：查询条件与筛选表单的本地持久化（localStorage）
 * 与 IndexedDB 中的分析结果 + K 线缓存配合，实现纯前端筛选与二次访问还原。
 */

import type { ConsolidationType, KLinePeriod } from '@/types/stock';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
  OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS,
  OPPORTUNITY_DEFAULT_BASIC_FILTERS,
  OPPORTUNITY_DEFAULT_NAME_FILTERS,
  OPPORTUNITY_DEFAULT_AI_ANALYSIS,
  OPPORTUNITY_DEFAULT_LIMIT_MOVES,
  OPPORTUNITY_DEFAULT_VOLUME_PULLBACK,
} from '@/utils/config/opportunityAnalysisDefaults';
import { logger } from '../business/logger';
import { normalizeStockNameList } from '../format/format';

export const OPPORTUNITY_FILTER_PREFS_KEY = 'opportunity_filter_prefs';

const PREFS_VERSION = 1 as const;

/** 机会页筛选手风琴面板的 key（与 Collapse items 一致） */
export const OPPORTUNITY_FILTER_PANEL_KEYS = {
  data: 'data',
  consolidation: 'consolidation',
  trendLine: 'trendLine',
  sharpMove: 'sharpMove',
  volumePullback: 'volumePullback',
  aiAnalysis: 'aiAnalysis',
  nameFilter: 'nameFilter',
} as const;

/** 由 localStorage 中「展开」布尔字段推导当前应展开的面板（可多组同时展开） */
export function activeFilterPanelKeyFromPrefs(
  prefs: Pick<
    OpportunityFilterPrefs,
    | 'filterVisible'
    | 'consolidationFilterVisible'
    | 'trendLineFilterVisible'
    | 'sharpMoveFilterVisible'
    | 'volumePullbackFilterVisible'
    | 'nameFilterVisible'
  >
): string[] {
  const keys: string[] = [];
  if (prefs.filterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.data);
  if (prefs.consolidationFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.consolidation);
  if (prefs.trendLineFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.trendLine);
  if (prefs.sharpMoveFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.sharpMove);
  if (prefs.volumePullbackFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.volumePullback);
  if (prefs.nameFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.nameFilter);
  // 默认展开AI分析筛选
  keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.aiAnalysis);
  return keys.length > 0
    ? keys
    : [
        OPPORTUNITY_FILTER_PANEL_KEYS.data,
        OPPORTUNITY_FILTER_PANEL_KEYS.nameFilter,
        OPPORTUNITY_FILTER_PANEL_KEYS.aiAnalysis,
      ];
}

/** 将当前展开的 key（单个或多个）写回偏好里的布尔字段（供「一键分析」保存） */
export function visibilityFromActiveFilterPanelKey(
  activeKey: string | string[] | undefined
): Pick<
  OpportunityFilterPrefs,
  | 'filterVisible'
  | 'consolidationFilterVisible'
  | 'trendLineFilterVisible'
  | 'sharpMoveFilterVisible'
  | 'volumePullbackFilterVisible'
  | 'nameFilterVisible'
> {
  const keys = new Set(Array.isArray(activeKey) ? activeKey : activeKey ? [activeKey] : []);
  return {
    filterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.data),
    consolidationFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.consolidation),
    trendLineFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.trendLine),
    sharpMoveFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.sharpMove),
    volumePullbackFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.volumePullback),
    nameFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.nameFilter),
  };
}

const VALID_PERIODS: KLinePeriod[] = ['day', 'week', 'month', 'year'];
const VALID_CONSOLIDATION_TYPES: ConsolidationType[] = ['low_stable', 'high_stable', 'box'];

export interface OpportunityFilterPrefs {
  version: typeof PREFS_VERSION;
  selectedMarket: string[];
  nameType: string;
  currentPeriod: KLinePeriod;
  currentCount: number;
  priceRange: { min?: number; max?: number };
  marketCapRange: { min?: number; max?: number };
  totalSharesRange: { min?: number; max?: number };
  turnoverRateRange: { min?: number; max?: number };
  peRatioRange: { min?: number; max?: number };
  kdjJRange: { min?: number; max?: number };
  filterVisible: boolean;
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
  consolidationFilterVisible: boolean;
  trendLineLookback: number;
  trendLineConsecutive: number;
  trendLineFilterEnabled: boolean;
  trendLineFilterVisible: boolean;
  /** 单日异动筛选开关 */
  sharpMoveFilterEnabled: boolean;
  /** 单日异动筛选卡片 */
  sharpMoveFilterVisible: boolean;
  sharpMoveWindowBars: number;
  sharpMoveMagnitude: number;
  /** 横盘幅度阈值（%） */
  sharpMoveFlatThreshold: number;
  sharpMoveOnlyDrop: boolean;
  sharpMoveOnlyRise: boolean;
  sharpMoveDropThenRiseLoose: boolean;
  sharpMoveRiseThenDropLoose: boolean;
  sharpMoveDropFlatRise: boolean;
  sharpMoveRiseFlatDrop: boolean;
  /** 量价回踩筛选开关 */
  volumePullbackFilterEnabled: boolean;
  /** 量价回踩筛选卡片 */
  volumePullbackFilterVisible: boolean;
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
  /** 总营收范围（单位：亿元） */
  financeRevenueRange: { min?: number; max?: number };
  /** 归母净利润范围（单位：亿元） */
  financeNetProfitRange: { min?: number; max?: number };
  /** 总营收增长率范围（单位：%） */
  financeRevenueGrowthRange: { min?: number; max?: number };
  /** 归母净利润增长率范围（单位：%） */
  financeNetProfitGrowthRange: { min?: number; max?: number };
  /** RSI指标范围 */
  rsiRange: { min?: number; max?: number };
  /** RSI周期 */
  rsiPeriod: number;
  /** AI分析筛选 */
  aiAnalysisEnabled: boolean;
  aiTrendUp: boolean;
  aiTrendDown: boolean;
  aiTrendSideways: boolean;
  aiConfidenceRange: { min?: number; max?: number };
  aiRecommendScoreRange: { min?: number; max?: number };
  aiTechnicalScoreRange: { min?: number; max?: number };
  aiPatternScoreRange: { min?: number; max?: number };
  aiTrendScoreRange: { min?: number; max?: number };
  aiRiskScoreRange: { min?: number; max?: number };
  /** 名称筛选 */
  enableNameKeywordFilter: boolean;
  excludedNameKeywords: string[];
  /** 短期排除股票名称 */
  enableShortTermNameFilter: boolean;
  excludedShortTermNames: string[];
  /** 名称筛选面板可见性 */
  nameFilterVisible: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseRange(v: unknown): { min?: number; max?: number } {
  if (!isRecord(v)) return {};
  const out: { min?: number; max?: number } = {};
  if (isFiniteNumber(v.min)) out.min = v.min;
  if (isFiniteNumber(v.max)) out.max = v.max;
  return out;
}

/**
 * 上影占比历史上存的是 0-1 比值，统一换算为百分数（%）；
 * 非法值回落到默认阈值。
 */
function parseUpperShadowPercent(v: unknown): number {
  if (!isFiniteNumber(v) || v <= 0) {
    return OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.upperShadowRatio;
  }
  const percent = v <= 1 ? v * 100 : v;
  return Math.min(100, percent);
}

/** 解析失败或缺省时返回空数组（不选中任何横盘类型） */
function parseConsolidationTypes(v: unknown): ConsolidationType[] {
  if (!Array.isArray(v)) return [];
  const out: ConsolidationType[] = [];
  for (const item of v) {
    if (typeof item === 'string' && VALID_CONSOLIDATION_TYPES.includes(item as ConsolidationType)) {
      out.push(item as ConsolidationType);
    }
  }
  return out;
}

/** 从 localStorage 读取并校验；无效则返回 null */
export function loadOpportunityFilterPrefs(): OpportunityFilterPrefs | null {
  try {
    const raw = localStorage.getItem(OPPORTUNITY_FILTER_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p) || p.version !== PREFS_VERSION) return null;
    // 验证 selectedMarket 必须是字符串数组
    if (!Array.isArray(p.selectedMarket)) return null;
    const selectedMarket = p.selectedMarket.filter((item: any) => typeof item === 'string');
    if (typeof p.nameType !== 'string') return null;
    if (
      typeof p.currentPeriod !== 'string' ||
      !VALID_PERIODS.includes(p.currentPeriod as KLinePeriod)
    ) {
      return null;
    }
    if (!isFiniteNumber(p.currentCount) || p.currentCount < 1) return null;

    const consolidationTypes = parseConsolidationTypes(p.consolidationTypes);

    const prefs: OpportunityFilterPrefs = {
      version: PREFS_VERSION,
      selectedMarket: selectedMarket,
      nameType: p.nameType,
      currentPeriod: p.currentPeriod as KLinePeriod,
      currentCount: Math.floor(p.currentCount),
      priceRange: parseRange(p.priceRange),
      marketCapRange: parseRange(p.marketCapRange),
      totalSharesRange: parseRange(p.totalSharesRange),
      turnoverRateRange: parseRange(p.turnoverRateRange),
      peRatioRange: parseRange(p.peRatioRange),
      kdjJRange: parseRange(p.kdjJRange),
      filterVisible: p.filterVisible === false ? false : true,
      recentLimitUpCount: isFiniteNumber(p.recentLimitUpCount) ? p.recentLimitUpCount : undefined,
      recentLimitDownCount: isFiniteNumber(p.recentLimitDownCount)
        ? p.recentLimitDownCount
        : undefined,
      limitUpPeriod: isFiniteNumber(p.limitUpPeriod) ? Math.floor(p.limitUpPeriod) : 20,
      limitDownPeriod: isFiniteNumber(p.limitDownPeriod) ? Math.floor(p.limitDownPeriod) : 20,
      consolidationTypes,
      consolidationLookback: isFiniteNumber(p.consolidationLookback)
        ? Math.floor(p.consolidationLookback)
        : OPPORTUNITY_DEFAULT_CONSOLIDATION.lookback,
      consolidationConsecutive: isFiniteNumber(p.consolidationConsecutive)
        ? Math.floor(p.consolidationConsecutive)
        : OPPORTUNITY_DEFAULT_CONSOLIDATION.consecutive,
      consolidationThreshold: isFiniteNumber(p.consolidationThreshold)
        ? p.consolidationThreshold
        : OPPORTUNITY_DEFAULT_CONSOLIDATION.threshold,
      consolidationRequireAboveMa10: p.consolidationRequireAboveMa10 === true,
      consolidationFilterEnabled: p.consolidationFilterEnabled === false ? false : true,
      consolidationFilterVisible: p.consolidationFilterVisible === false ? false : true,
      trendLineLookback: isFiniteNumber(p.trendLineLookback)
        ? Math.floor(p.trendLineLookback)
        : OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
      trendLineConsecutive: isFiniteNumber(p.trendLineConsecutive)
        ? Math.floor(p.trendLineConsecutive)
        : OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
      trendLineFilterEnabled: p.trendLineFilterEnabled === true,
      trendLineFilterVisible: p.trendLineFilterVisible === false ? false : true,
      sharpMoveFilterEnabled: p.sharpMoveFilterEnabled === true,
      sharpMoveFilterVisible: p.sharpMoveFilterVisible !== false,
      sharpMoveWindowBars: isFiniteNumber(p.sharpMoveWindowBars)
        ? Math.max(1, Math.floor(p.sharpMoveWindowBars))
        : OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
      sharpMoveMagnitude:
        isFiniteNumber(p.sharpMoveMagnitude) && p.sharpMoveMagnitude > 0
          ? p.sharpMoveMagnitude
          : OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude,
      sharpMoveFlatThreshold:
        isFiniteNumber(p.sharpMoveFlatThreshold) && p.sharpMoveFlatThreshold > 0
          ? p.sharpMoveFlatThreshold
          : 3,
      sharpMoveOnlyDrop: p.sharpMoveOnlyDrop === true,
      sharpMoveOnlyRise: p.sharpMoveOnlyRise === true,
      sharpMoveDropThenRiseLoose: p.sharpMoveDropThenRiseLoose === true,
      sharpMoveRiseThenDropLoose: p.sharpMoveRiseThenDropLoose === true,
      sharpMoveDropFlatRise: p.sharpMoveDropFlatRise === true,
      sharpMoveRiseFlatDrop: p.sharpMoveRiseFlatDrop === true,
      // 量价回踩筛选
      volumePullbackFilterEnabled: p.volumePullbackFilterEnabled === true,
      volumePullbackFilterVisible: p.volumePullbackFilterVisible !== false,
      volumePullbackLookback: isFiniteNumber(p.volumePullbackLookback)
        ? Math.max(3, Math.floor(p.volumePullbackLookback))
        : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.lookback,
      volumePullbackMinRisePct:
        isFiniteNumber(p.volumePullbackMinRisePct) && p.volumePullbackMinRisePct > 0
          ? p.volumePullbackMinRisePct
          : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minRisePct,
      volumePullbackTriggerType: p.volumePullbackTriggerType === 'limitUp' ? 'limitUp' : 'any',
      volumePullbackVolumeRatio:
        isFiniteNumber(p.volumePullbackVolumeRatio) && p.volumePullbackVolumeRatio > 0
          ? p.volumePullbackVolumeRatio
          : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeRatio,
      volumePullbackVolumeMaPeriod: isFiniteNumber(p.volumePullbackVolumeMaPeriod)
        ? Math.max(2, Math.floor(p.volumePullbackVolumeMaPeriod))
        : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeMaPeriod,
      volumePullbackMaxBars: isFiniteNumber(p.volumePullbackMaxBars)
        ? Math.max(1, Math.floor(p.volumePullbackMaxBars))
        : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxBars,
      volumePullbackMinPullbackPct: isFiniteNumber(p.volumePullbackMinPullbackPct)
        ? Math.max(0, p.volumePullbackMinPullbackPct)
        : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minPullbackPct,
      volumePullbackMaxPullbackPct:
        isFiniteNumber(p.volumePullbackMaxPullbackPct) && p.volumePullbackMaxPullbackPct > 0
          ? p.volumePullbackMaxPullbackPct
          : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxPullbackPct,
      volumePullbackVolumeShrink:
        isFiniteNumber(p.volumePullbackVolumeShrink) && p.volumePullbackVolumeShrink > 0
          ? p.volumePullbackVolumeShrink
          : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeShrink,
      volumePullbackMa10TolerancePct: isFiniteNumber(p.volumePullbackMa10TolerancePct)
        ? Math.max(0, p.volumePullbackMa10TolerancePct)
        : OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.ma10TolerancePct,
      volumePullbackRequireUpperShadow: p.volumePullbackRequireUpperShadow === true,
      volumePullbackUpperShadowRatio: parseUpperShadowPercent(p.volumePullbackUpperShadowRatio),
      // 总营收 / 归母净利润（亿元）
      financeRevenueRange: parseRange(p.financeRevenueRange),
      financeNetProfitRange: parseRange(p.financeNetProfitRange),
      // 总营收增长率 / 归母净利润增长率（%）
      financeRevenueGrowthRange: parseRange(p.financeRevenueGrowthRange),
      financeNetProfitGrowthRange: parseRange(p.financeNetProfitGrowthRange),
      // 新增技术指标筛选
      rsiRange: parseRange(p.rsiRange),
      rsiPeriod: isFiniteNumber(p.rsiPeriod) ? Math.floor(p.rsiPeriod) : 6,
      // AI分析筛选
      aiAnalysisEnabled: p.aiAnalysisEnabled === true,
      aiTrendUp: p.aiTrendUp === true,
      aiTrendDown: p.aiTrendDown === true,
      aiTrendSideways: p.aiTrendSideways === true,
      aiConfidenceRange: parseRange(p.aiConfidenceRange),
      aiRecommendScoreRange: parseRange(p.aiRecommendScoreRange),
      aiTechnicalScoreRange: parseRange(p.aiTechnicalScoreRange),
      aiPatternScoreRange: parseRange(p.aiPatternScoreRange),
      aiTrendScoreRange: parseRange(p.aiTrendScoreRange),
      aiRiskScoreRange: parseRange(p.aiRiskScoreRange),
      enableNameKeywordFilter: p.enableNameKeywordFilter === false ? false : true,
      excludedNameKeywords: Array.isArray(p.excludedNameKeywords)
        ? normalizeStockNameList(p.excludedNameKeywords.filter((item: any) => typeof item === 'string'))
        : [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedNameKeywords],
      enableShortTermNameFilter: p.enableShortTermNameFilter === false ? false : true,
      excludedShortTermNames: Array.isArray(p.excludedShortTermNames)
        ? normalizeStockNameList(p.excludedShortTermNames.filter((item: any) => typeof item === 'string'))
        : [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedShortTermNames],
      nameFilterVisible: p.nameFilterVisible === false ? false : true,
    };

    return prefs;
  } catch {
    return null;
  }
}

export function saveOpportunityFilterPrefs(prefs: OpportunityFilterPrefs): void {
  try {
    localStorage.setItem(OPPORTUNITY_FILTER_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    logger.warn('保存机会分析筛选偏好失败:', e);
  }
}

export function clearOpportunityFilterPrefs(): void {
  try {
    localStorage.removeItem(OPPORTUNITY_FILTER_PREFS_KEY);
  } catch (e) {
    logger.warn('清除机会分析筛选偏好失败:', e);
  }
}

/** 与 OpportunityPage 中 INITIAL_FILTER_STATE 的筛选项默认值保持一致（不含市场/名称/周期/K 线数量） */
export function getDefaultFilterPrefsFields(): Omit<
  OpportunityFilterPrefs,
  'version' | 'selectedMarket' | 'nameType' | 'currentPeriod' | 'currentCount'
> {
  return {
    priceRange: { min: 3, max: 30 },
    marketCapRange: { min: 30, max: 500 },
    totalSharesRange: { min: 1, max: 50 },
    turnoverRateRange: { min: 1 },
    peRatioRange: {},
    kdjJRange: {},
    filterVisible: true,
    recentLimitUpCount: OPPORTUNITY_DEFAULT_LIMIT_MOVES.minLimitUpCount,
    recentLimitDownCount: undefined,
    limitUpPeriod: OPPORTUNITY_DEFAULT_LIMIT_MOVES.period,
    limitDownPeriod: OPPORTUNITY_DEFAULT_LIMIT_MOVES.period,
    consolidationTypes: [],
    consolidationLookback: OPPORTUNITY_DEFAULT_CONSOLIDATION.lookback,
    consolidationConsecutive: OPPORTUNITY_DEFAULT_CONSOLIDATION.consecutive,
    consolidationThreshold: OPPORTUNITY_DEFAULT_CONSOLIDATION.threshold,
    consolidationRequireAboveMa10: OPPORTUNITY_DEFAULT_CONSOLIDATION.requireClosesAboveMa10,
    consolidationFilterEnabled: true,
    consolidationFilterVisible: true,
    trendLineLookback: OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
    trendLineConsecutive: OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
    trendLineFilterEnabled: false,
    trendLineFilterVisible: true,
    sharpMoveFilterEnabled: false,
    sharpMoveFilterVisible: true,
    sharpMoveWindowBars: OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
    sharpMoveMagnitude: OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude,
    sharpMoveFlatThreshold: 3,
    sharpMoveOnlyDrop: false,
    sharpMoveOnlyRise: false,
    sharpMoveDropThenRiseLoose: false,
    sharpMoveRiseThenDropLoose: false,
    sharpMoveDropFlatRise: false,
    sharpMoveRiseFlatDrop: false,
    // 量价回踩筛选默认值
    volumePullbackFilterEnabled: false,
    volumePullbackFilterVisible: true,
    volumePullbackLookback: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.lookback,
    volumePullbackMinRisePct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minRisePct,
    volumePullbackTriggerType: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.triggerType,
    volumePullbackVolumeRatio: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeRatio,
    volumePullbackVolumeMaPeriod: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeMaPeriod,
    volumePullbackMaxBars: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxBars,
    volumePullbackMinPullbackPct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minPullbackPct,
    volumePullbackMaxPullbackPct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxPullbackPct,
    volumePullbackVolumeShrink: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeShrink,
    volumePullbackMa10TolerancePct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.ma10TolerancePct,
    volumePullbackRequireUpperShadow: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.requireUpperShadow,
    volumePullbackUpperShadowRatio: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.upperShadowRatio,
    // 总营收 / 归母净利润（亿元）
    financeRevenueRange: {},
    financeNetProfitRange: {},
    // 总营收增长率 / 归母净利润增长率（%）
    financeRevenueGrowthRange: {},
    financeNetProfitGrowthRange: {},
    // 新增技术指标筛选默认值
    rsiRange: {},
    rsiPeriod: 6,
    // AI分析筛选默认值
    aiAnalysisEnabled: false,
    aiTrendUp: false,
    aiTrendDown: false,
    aiTrendSideways: false,
    aiConfidenceRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.confidenceMin },
    aiRecommendScoreRange: {},
    aiTechnicalScoreRange: {},
    aiPatternScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.patternScoreMin },
    aiTrendScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendScoreMin },
    aiRiskScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.riskScoreMin },
    enableNameKeywordFilter: true,
    excludedNameKeywords: [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedNameKeywords],
    enableShortTermNameFilter: true,
    excludedShortTermNames: [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedShortTermNames],
    nameFilterVisible: true,
  };
}

/** 与 INITIAL_OPPORTUNITY_QUERY + 页面默认市场/名称类型一致 */
export const DEFAULT_QUERY_PREFS_FIELDS = {
  selectedMarket: [...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket], // 默认选中沪深主板和创业板
  nameType: OPPORTUNITY_DEFAULT_BASIC_FILTERS.nameType,
  currentPeriod: 'day' as KLinePeriod,
  currentCount: 500,
};

/** 若已有保存的偏好，仅将顶部查询条恢复为默认并写回 */
export function patchSavedPrefsQueryToDefaults(): void {
  const cur = loadOpportunityFilterPrefs();
  if (!cur) return;
  saveOpportunityFilterPrefs({
    ...cur,
    ...DEFAULT_QUERY_PREFS_FIELDS,
    version: PREFS_VERSION,
  });
}

/** 若已有保存的偏好，仅将下方筛选表单恢复为默认并写回 */
export function patchSavedPrefsFiltersToDefaults(): void {
  const cur = loadOpportunityFilterPrefs();
  if (!cur) return;
  saveOpportunityFilterPrefs({
    ...cur,
    ...getDefaultFilterPrefsFields(),
    version: PREFS_VERSION,
  });
}

/** 将已校验的偏好写回页面 state（不含 store 的 period/count，由调用方按是否有缓存决定） */
export interface OpportunityFilterPrefsApplyActions {
  setSelectedMarket: (v: string[]) => void;
  setNameType: (v: string) => void;
  setPriceRange: (v: { min?: number; max?: number }) => void;
  setMarketCapRange: (v: { min?: number; max?: number }) => void;
  setTotalSharesRange: (v: { min?: number; max?: number }) => void;
  setTurnoverRateRange: (v: { min?: number; max?: number }) => void;
  setPeRatioRange: (v: { min?: number; max?: number }) => void;
  setKdjJRange: (v: { min?: number; max?: number }) => void;
  setFilterPanelActiveKey: (v: string[]) => void;
  setRecentLimitUpCount: (v: number | undefined) => void;
  setRecentLimitDownCount: (v: number | undefined) => void;
  setLimitUpPeriod: (v: number) => void;
  setLimitDownPeriod: (v: number) => void;
  setConsolidationTypes: (v: ConsolidationType[]) => void;
  setConsolidationLookback: (v: number) => void;
  setConsolidationConsecutive: (v: number) => void;
  setConsolidationThreshold: (v: number) => void;
  setConsolidationRequireAboveMa10: (v: boolean) => void;
  setConsolidationFilterEnabled: (v: boolean) => void;
  setTrendLineLookback: (v: number) => void;
  setTrendLineConsecutive: (v: number) => void;
  setTrendLineFilterEnabled: (v: boolean) => void;
  setSharpMoveFilterEnabled: (v: boolean) => void;
  setSharpMoveWindowBars: (v: number) => void;
  setSharpMoveMagnitude: (v: number) => void;
  setSharpMoveFlatThreshold: (v: number) => void;
  setSharpMoveOnlyDrop: (v: boolean) => void;
  setSharpMoveOnlyRise: (v: boolean) => void;
  setSharpMoveDropThenRiseLoose: (v: boolean) => void;
  setSharpMoveRiseThenDropLoose: (v: boolean) => void;
  setSharpMoveDropFlatRise: (v: boolean) => void;
  setSharpMoveRiseFlatDrop: (v: boolean) => void;
  // 量价回踩筛选 actions
  setVolumePullbackFilterEnabled: (v: boolean) => void;
  setVolumePullbackLookback: (v: number) => void;
  setVolumePullbackMinRisePct: (v: number) => void;
  setVolumePullbackTriggerType: (v: 'any' | 'limitUp') => void;
  setVolumePullbackVolumeRatio: (v: number) => void;
  setVolumePullbackVolumeMaPeriod: (v: number) => void;
  setVolumePullbackMaxBars: (v: number) => void;
  setVolumePullbackMinPullbackPct: (v: number) => void;
  setVolumePullbackMaxPullbackPct: (v: number) => void;
  setVolumePullbackVolumeShrink: (v: number) => void;
  setVolumePullbackMa10TolerancePct: (v: number) => void;
  setVolumePullbackRequireUpperShadow: (v: boolean) => void;
  setVolumePullbackUpperShadowRatio: (v: number) => void;
  // 总营收 / 归母净利润 actions
  setFinanceRevenueRange: (v: { min?: number; max?: number }) => void;
  setFinanceNetProfitRange: (v: { min?: number; max?: number }) => void;
  // 总营收增长率 / 归母净利润增长率 actions
  setFinanceRevenueGrowthRange: (v: { min?: number; max?: number }) => void;
  setFinanceNetProfitGrowthRange: (v: { min?: number; max?: number }) => void;
  // 新增技术指标筛选 actions
  setRsiRange: (v: { min?: number; max?: number }) => void;
  setRsiPeriod: (v: number) => void;
  // AI分析筛选 actions
  setAiAnalysisEnabled: (v: boolean) => void;
  setAiTrendUp: (v: boolean) => void;
  setAiTrendDown: (v: boolean) => void;
  setAiTrendSideways: (v: boolean) => void;
  setAiConfidenceRange: (v: { min?: number; max?: number }) => void;
  setAiRecommendScoreRange: (v: { min?: number; max?: number }) => void;
  setAiTechnicalScoreRange: (v: { min?: number; max?: number }) => void;
  setAiPatternScoreRange: (v: { min?: number; max?: number }) => void;
  setAiTrendScoreRange: (v: { min?: number; max?: number }) => void;
  setAiRiskScoreRange: (v: { min?: number; max?: number }) => void;
  /** 名称筛选 actions */
  setEnableNameKeywordFilter: (v: boolean) => void;
  setExcludedNameKeywords: (v: string[]) => void;
  /** 短期排除股票名称 actions */
  setEnableShortTermNameFilter: (v: boolean) => void;
  setExcludedShortTermNames: (v: string[]) => void;
}

export function applyOpportunityFilterPrefsToState(
  prefs: OpportunityFilterPrefs,
  actions: OpportunityFilterPrefsApplyActions
): void {
  actions.setSelectedMarket(prefs.selectedMarket);
  actions.setNameType(prefs.nameType);
  actions.setPriceRange({ ...prefs.priceRange });
  actions.setMarketCapRange({ ...prefs.marketCapRange });
  actions.setTotalSharesRange({ ...prefs.totalSharesRange });
  actions.setTurnoverRateRange({ ...prefs.turnoverRateRange });
  actions.setPeRatioRange({ ...prefs.peRatioRange });
  actions.setKdjJRange({ ...prefs.kdjJRange });
  actions.setFilterPanelActiveKey(activeFilterPanelKeyFromPrefs(prefs));
  actions.setRecentLimitUpCount(prefs.recentLimitUpCount);
  actions.setRecentLimitDownCount(prefs.recentLimitDownCount);
  actions.setLimitUpPeriod(prefs.limitUpPeriod);
  actions.setLimitDownPeriod(prefs.limitDownPeriod);
  actions.setConsolidationTypes([...prefs.consolidationTypes]);
  actions.setConsolidationLookback(prefs.consolidationLookback);
  actions.setConsolidationConsecutive(prefs.consolidationConsecutive);
  actions.setConsolidationThreshold(prefs.consolidationThreshold);
  actions.setConsolidationRequireAboveMa10(prefs.consolidationRequireAboveMa10);
  actions.setConsolidationFilterEnabled(prefs.consolidationFilterEnabled);
  actions.setTrendLineLookback(prefs.trendLineLookback);
  actions.setTrendLineConsecutive(prefs.trendLineConsecutive);
  actions.setTrendLineFilterEnabled(prefs.trendLineFilterEnabled);
  actions.setSharpMoveFilterEnabled(prefs.sharpMoveFilterEnabled);
  actions.setSharpMoveWindowBars(prefs.sharpMoveWindowBars);
  actions.setSharpMoveMagnitude(prefs.sharpMoveMagnitude);
  actions.setSharpMoveFlatThreshold(prefs.sharpMoveFlatThreshold);
  actions.setSharpMoveOnlyDrop(prefs.sharpMoveOnlyDrop);
  actions.setSharpMoveOnlyRise(prefs.sharpMoveOnlyRise);
  actions.setSharpMoveDropThenRiseLoose(prefs.sharpMoveDropThenRiseLoose);
  actions.setSharpMoveRiseThenDropLoose(prefs.sharpMoveRiseThenDropLoose);
  actions.setSharpMoveDropFlatRise(prefs.sharpMoveDropFlatRise);
  actions.setSharpMoveRiseFlatDrop(prefs.sharpMoveRiseFlatDrop);
  // 应用量价回踩筛选
  actions.setVolumePullbackFilterEnabled(prefs.volumePullbackFilterEnabled);
  actions.setVolumePullbackLookback(prefs.volumePullbackLookback);
  actions.setVolumePullbackMinRisePct(prefs.volumePullbackMinRisePct);
  actions.setVolumePullbackTriggerType(prefs.volumePullbackTriggerType);
  actions.setVolumePullbackVolumeRatio(prefs.volumePullbackVolumeRatio);
  actions.setVolumePullbackVolumeMaPeriod(prefs.volumePullbackVolumeMaPeriod);
  actions.setVolumePullbackMaxBars(prefs.volumePullbackMaxBars);
  actions.setVolumePullbackMinPullbackPct(prefs.volumePullbackMinPullbackPct);
  actions.setVolumePullbackMaxPullbackPct(prefs.volumePullbackMaxPullbackPct);
  actions.setVolumePullbackVolumeShrink(prefs.volumePullbackVolumeShrink);
  actions.setVolumePullbackMa10TolerancePct(prefs.volumePullbackMa10TolerancePct);
  actions.setVolumePullbackRequireUpperShadow(prefs.volumePullbackRequireUpperShadow);
  actions.setVolumePullbackUpperShadowRatio(prefs.volumePullbackUpperShadowRatio);
  // 应用总营收 / 归母净利润
  actions.setFinanceRevenueRange({ ...prefs.financeRevenueRange });
  actions.setFinanceNetProfitRange({ ...prefs.financeNetProfitRange });
  // 应用总营收增长率 / 归母净利润增长率
  actions.setFinanceRevenueGrowthRange({ ...prefs.financeRevenueGrowthRange });
  actions.setFinanceNetProfitGrowthRange({ ...prefs.financeNetProfitGrowthRange });
  // 应用新增技术指标筛选
  actions.setRsiRange({ ...prefs.rsiRange });
  actions.setRsiPeriod(prefs.rsiPeriod);
  // 应用AI分析筛选
  actions.setAiAnalysisEnabled(prefs.aiAnalysisEnabled);
  actions.setAiTrendUp(prefs.aiTrendUp);
  actions.setAiTrendDown(prefs.aiTrendDown);
  actions.setAiTrendSideways(prefs.aiTrendSideways);
  actions.setAiConfidenceRange({ ...prefs.aiConfidenceRange });
  actions.setAiRecommendScoreRange({ ...prefs.aiRecommendScoreRange });
  actions.setAiTechnicalScoreRange({ ...prefs.aiTechnicalScoreRange });
  actions.setAiPatternScoreRange({ ...prefs.aiPatternScoreRange });
  actions.setAiTrendScoreRange({ ...prefs.aiTrendScoreRange });
  actions.setAiRiskScoreRange({ ...prefs.aiRiskScoreRange });
  // 应用名称筛选
  actions.setEnableNameKeywordFilter(prefs.enableNameKeywordFilter);
  actions.setExcludedNameKeywords([...prefs.excludedNameKeywords]);
  // 应用短期排除股票名称
  actions.setEnableShortTermNameFilter(prefs.enableShortTermNameFilter);
  actions.setExcludedShortTermNames([...prefs.excludedShortTermNames]);
}
