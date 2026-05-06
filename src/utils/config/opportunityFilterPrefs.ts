/**
 * 机会分析页：查询条件与筛选表单的本地持久化（localStorage）
 * 与 IndexedDB 中的分析结果 + K 线缓存配合，实现纯前端筛选与二次访问还原。
 */

import type { ConsolidationType, KLinePeriod } from '@/types/stock';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
} from '@/utils/config/opportunityAnalysisDefaults';
import { logger } from '../business/logger';

export const OPPORTUNITY_FILTER_PREFS_KEY = 'opportunity_filter_prefs';

const PREFS_VERSION = 1 as const;

/** 机会页筛选手风琴面板的 key（与 Collapse items 一致） */
export const OPPORTUNITY_FILTER_PANEL_KEYS = {
  data: 'data',
  consolidation: 'consolidation',
  trendLine: 'trendLine',
  sharpMove: 'sharpMove',
  technicalIndicators: 'technicalIndicators',
  aiAnalysis: 'aiAnalysis',
} as const;

/** 由 localStorage 中四个「展开」布尔字段推导当前应展开的面板（可多组同时展开） */
export function activeFilterPanelKeyFromPrefs(
  prefs: Pick<
    OpportunityFilterPrefs,
    | 'filterVisible'
    | 'consolidationFilterVisible'
    | 'trendLineFilterVisible'
    | 'sharpMoveFilterVisible'
  >
): string[] {
  const keys: string[] = [];
  if (prefs.filterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.data);
  if (prefs.consolidationFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.consolidation);
  if (prefs.trendLineFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.trendLine);
  if (prefs.sharpMoveFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.sharpMove);
  // 默认展开形态分析和AI分析筛选
  keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.technicalIndicators);
  keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.aiAnalysis);
  return keys.length > 0
    ? keys
    : [
        OPPORTUNITY_FILTER_PANEL_KEYS.data,
        OPPORTUNITY_FILTER_PANEL_KEYS.technicalIndicators,
        OPPORTUNITY_FILTER_PANEL_KEYS.aiAnalysis,
      ];
}

/** 将当前展开的 key（单个或多个）写回偏好里的四个布尔字段（供「一键分析」保存） */
export function visibilityFromActiveFilterPanelKey(
  activeKey: string | string[] | undefined
): Pick<
  OpportunityFilterPrefs,
  | 'filterVisible'
  | 'consolidationFilterVisible'
  | 'trendLineFilterVisible'
  | 'sharpMoveFilterVisible'
> {
  const keys = new Set(Array.isArray(activeKey) ? activeKey : activeKey ? [activeKey] : []);
  return {
    filterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.data),
    consolidationFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.consolidation),
    trendLineFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.trendLine),
    sharpMoveFilterVisible: keys.has(OPPORTUNITY_FILTER_PANEL_KEYS.sharpMove),
  };
}

const VALID_PERIODS: KLinePeriod[] = ['day', 'week', 'month', 'year'];
const VALID_CONSOLIDATION_TYPES: ConsolidationType[] = ['low_stable', 'high_stable', 'box'];

export interface OpportunityFilterPrefs {
  version: typeof PREFS_VERSION;
  selectedMarket: string;
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
  /** RSI指标范围 */
  rsiRange: { min?: number; max?: number };
  /** RSI周期 */
  rsiPeriod: number;
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
    if (typeof p.selectedMarket !== 'string' || typeof p.nameType !== 'string') return null;
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
      selectedMarket: p.selectedMarket,
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
      // 新增技术指标筛选
      rsiRange: parseRange(p.rsiRange),
      rsiPeriod: isFiniteNumber(p.rsiPeriod) ? Math.floor(p.rsiPeriod) : 6,
      // K线形态筛选 - 单根
      candlestickHammer: p.candlestickHammer === true,
      candlestickShootingStar: p.candlestickShootingStar === true,
      candlestickDoji: p.candlestickDoji === true,
      // K线形态筛选 - 双根
      candlestickEngulfingBullish: p.candlestickEngulfingBullish === true,
      candlestickEngulfingBearish: p.candlestickEngulfingBearish === true,
      candlestickHaramiBullish: p.candlestickHaramiBullish === true,
      candlestickHaramiBearish: p.candlestickHaramiBearish === true,
      // K线形态筛选 - 三根
      candlestickMorningStar: p.candlestickMorningStar === true,
      candlestickEveningStar: p.candlestickEveningStar === true,
      candlestickDarkCloudCover: p.candlestickDarkCloudCover === true,
      candlestickPiercing: p.candlestickPiercing === true,
      candlestickThreeBlackCrows: p.candlestickThreeBlackCrows === true,
      candlestickThreeWhiteSoldiers: p.candlestickThreeWhiteSoldiers === true,
      candlestickLookback: isFiniteNumber(p.candlestickLookback)
        ? Math.floor(p.candlestickLookback)
        : 20,
      // 趋势形态筛选
      trendUptrend: p.trendUptrend === true,
      trendDowntrend: p.trendDowntrend === true,
      trendSideways: p.trendSideways === true,
      trendBreakout: p.trendBreakout === true,
      trendBreakdown: p.trendBreakdown === true,
      trendLookback: isFiniteNumber(p.trendLookback) ? Math.floor(p.trendLookback) : 20,
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
    recentLimitUpCount: undefined,
    recentLimitDownCount: undefined,
    limitUpPeriod: 20,
    limitDownPeriod: 20,
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
    // 新增技术指标筛选默认值
    rsiRange: {},
    rsiPeriod: 6,
    // K线形态筛选默认值 - 单根
    candlestickHammer: false,
    candlestickShootingStar: false,
    candlestickDoji: false,
    // K线形态筛选默认值 - 双根
    candlestickEngulfingBullish: false,
    candlestickEngulfingBearish: false,
    candlestickHaramiBullish: false,
    candlestickHaramiBearish: false,
    // K线形态筛选默认值 - 三根
    candlestickMorningStar: false,
    candlestickEveningStar: false,
    candlestickDarkCloudCover: false,
    candlestickPiercing: false,
    candlestickThreeBlackCrows: false,
    candlestickThreeWhiteSoldiers: false,
    candlestickLookback: 20,
    // 趋势形态筛选默认值
    trendUptrend: false,
    trendDowntrend: false,
    trendSideways: false,
    trendBreakout: false,
    trendBreakdown: false,
    trendLookback: 20,
    // AI分析筛选默认值
    aiAnalysisEnabled: false,
    aiTrendUp: false,
    aiTrendDown: false,
    aiTrendSideways: false,
    aiConfidenceRange: {},
    aiRecommendScoreRange: {},
    aiTechnicalScoreRange: {},
    aiPatternScoreRange: {},
    aiTrendScoreRange: {},
    aiRiskScoreRange: {},
  };
}

/** 与 INITIAL_OPPORTUNITY_QUERY + 页面默认市场/名称类型一致 */
export const DEFAULT_QUERY_PREFS_FIELDS = {
  selectedMarket: 'hs_main',
  nameType: 'non_st',
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
  setSelectedMarket: (v: string) => void;
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
  // 新增技术指标筛选 actions
  setRsiRange: (v: { min?: number; max?: number }) => void;
  setRsiPeriod: (v: number) => void;
  // K线形态筛选 actions - 单根
  setCandlestickHammer: (v: boolean) => void;
  setCandlestickShootingStar: (v: boolean) => void;
  setCandlestickDoji: (v: boolean) => void;
  // K线形态筛选 actions - 双根
  setCandlestickEngulfingBullish: (v: boolean) => void;
  setCandlestickEngulfingBearish: (v: boolean) => void;
  setCandlestickHaramiBullish: (v: boolean) => void;
  setCandlestickHaramiBearish: (v: boolean) => void;
  // K线形态筛选 actions - 三根
  setCandlestickMorningStar: (v: boolean) => void;
  setCandlestickEveningStar: (v: boolean) => void;
  setCandlestickDarkCloudCover: (v: boolean) => void;
  setCandlestickPiercing: (v: boolean) => void;
  setCandlestickThreeBlackCrows: (v: boolean) => void;
  setCandlestickThreeWhiteSoldiers: (v: boolean) => void;
  setCandlestickLookback: (v: number) => void;
  // 趋势形态筛选 actions
  setTrendUptrend: (v: boolean) => void;
  setTrendDowntrend: (v: boolean) => void;
  setTrendSideways: (v: boolean) => void;
  setTrendBreakout: (v: boolean) => void;
  setTrendBreakdown: (v: boolean) => void;
  setTrendLookback: (v: number) => void;
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
  // 应用新增技术指标筛选
  actions.setRsiRange({ ...prefs.rsiRange });
  actions.setRsiPeriod(prefs.rsiPeriod);
  // 应用K线形态筛选 - 单根
  actions.setCandlestickHammer(prefs.candlestickHammer);
  actions.setCandlestickShootingStar(prefs.candlestickShootingStar);
  actions.setCandlestickDoji(prefs.candlestickDoji);
  // 应用K线形态筛选 - 双根
  actions.setCandlestickEngulfingBullish(prefs.candlestickEngulfingBullish);
  actions.setCandlestickEngulfingBearish(prefs.candlestickEngulfingBearish);
  actions.setCandlestickHaramiBullish(prefs.candlestickHaramiBullish);
  actions.setCandlestickHaramiBearish(prefs.candlestickHaramiBearish);
  // 应用K线形态筛选 - 三根
  actions.setCandlestickMorningStar(prefs.candlestickMorningStar);
  actions.setCandlestickEveningStar(prefs.candlestickEveningStar);
  actions.setCandlestickDarkCloudCover(prefs.candlestickDarkCloudCover);
  actions.setCandlestickPiercing(prefs.candlestickPiercing);
  actions.setCandlestickThreeBlackCrows(prefs.candlestickThreeBlackCrows);
  actions.setCandlestickThreeWhiteSoldiers(prefs.candlestickThreeWhiteSoldiers);
  actions.setCandlestickLookback(prefs.candlestickLookback);
  // 应用趋势形态筛选
  actions.setTrendUptrend(prefs.trendUptrend);
  actions.setTrendDowntrend(prefs.trendDowntrend);
  actions.setTrendSideways(prefs.trendSideways);
  actions.setTrendBreakout(prefs.trendBreakout);
  actions.setTrendBreakdown(prefs.trendBreakdown);
  actions.setTrendLookback(prefs.trendLookback);
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
}
