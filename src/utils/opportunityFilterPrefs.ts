/**
 * 机会分析页：查询条件与筛选表单的本地持久化（localStorage）
 * 与 IndexedDB 中的分析结果 + K 线缓存配合，实现纯前端筛选与二次访问还原。
 */

import type { ConsolidationType, KLinePeriod } from '@/types/stock';

export const OPPORTUNITY_FILTER_PREFS_KEY = 'opportunity_filter_prefs';

const PREFS_VERSION = 2 as const;

/** 机会页筛选手风琴面板的 key（与 Collapse items 一致） */
export const OPPORTUNITY_FILTER_PANEL_KEYS = {
  data: 'data',
  consolidation: 'consolidation',
  trendLine: 'trendLine',
  sharpMove: 'sharpMove',
} as const;

/** 由 localStorage 中四个「展开」布尔字段推导当前应展开的面板（可多组同时展开） */
export function activeFilterPanelKeyFromPrefs(
  prefs: Pick<
    OpportunityFilterPrefs,
    'filterVisible' | 'consolidationFilterVisible' | 'trendLineFilterVisible' | 'sharpMoveFilterVisible'
  >
): string[] {
  const keys: string[] = [];
  if (prefs.filterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.data);
  if (prefs.consolidationFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.consolidation);
  if (prefs.trendLineFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.trendLine);
  if (prefs.sharpMoveFilterVisible) keys.push(OPPORTUNITY_FILTER_PANEL_KEYS.sharpMove);
  return keys.length > 0 ? keys : [OPPORTUNITY_FILTER_PANEL_KEYS.data];
}

/** 将当前展开的 key（单个或多个）写回偏好里的四个布尔字段（供「一键分析」保存） */
export function visibilityFromActiveFilterPanelKey(activeKey: string | string[] | undefined): Pick<
  OpportunityFilterPrefs,
  'filterVisible' | 'consolidationFilterVisible' | 'trendLineFilterVisible' | 'sharpMoveFilterVisible'
> {
  const keys = new Set(
    Array.isArray(activeKey) ? activeKey : activeKey ? [activeKey] : []
  );
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
  /** 单日异动筛选卡片 */
  sharpMoveFilterVisible: boolean;
  sharpMoveWindowBars: number;
  sharpMoveMagnitude: number;
  sharpMoveOnlyDrop: boolean;
  sharpMoveOnlyRise: boolean;
  sharpMoveDropThenRiseLoose: boolean;
  sharpMoveRiseThenDropLoose: boolean;
  sharpMoveDropFlatRise: boolean;
  sharpMoveRiseFlatDrop: boolean;
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

/** 解析失败或缺省时返回全部类型，避免旧数据无该字段时整份偏好被拒收 */
function parseConsolidationTypes(v: unknown): ConsolidationType[] {
  if (!Array.isArray(v)) return [...VALID_CONSOLIDATION_TYPES];
  const out: ConsolidationType[] = [];
  for (const item of v) {
    if (typeof item === 'string' && VALID_CONSOLIDATION_TYPES.includes(item as ConsolidationType)) {
      out.push(item as ConsolidationType);
    }
  }
  return out.length > 0 ? out : [...VALID_CONSOLIDATION_TYPES];
}

/** 从 localStorage 读取并校验；无效则返回 null */
export function loadOpportunityFilterPrefs(): OpportunityFilterPrefs | null {
  try {
    const raw = localStorage.getItem(OPPORTUNITY_FILTER_PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!isRecord(p) || (p.version !== 1 && p.version !== 2)) return null;
    if (typeof p.selectedMarket !== 'string' || typeof p.nameType !== 'string') return null;
    if (typeof p.currentPeriod !== 'string' || !VALID_PERIODS.includes(p.currentPeriod as KLinePeriod)) {
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
      turnoverRateRange: parseRange(p.turnoverRateRange),
      peRatioRange: parseRange(p.peRatioRange),
      kdjJRange: parseRange(p.kdjJRange),
      filterVisible: p.filterVisible === false ? false : true,
      recentLimitUpCount: isFiniteNumber(p.recentLimitUpCount) ? p.recentLimitUpCount : undefined,
      recentLimitDownCount: isFiniteNumber(p.recentLimitDownCount) ? p.recentLimitDownCount : undefined,
      limitUpPeriod: isFiniteNumber(p.limitUpPeriod) ? Math.floor(p.limitUpPeriod) : 20,
      limitDownPeriod: isFiniteNumber(p.limitDownPeriod) ? Math.floor(p.limitDownPeriod) : 20,
      consolidationTypes,
      consolidationLookback: isFiniteNumber(p.consolidationLookback) ? Math.floor(p.consolidationLookback) : 10,
      consolidationConsecutive: isFiniteNumber(p.consolidationConsecutive) ? Math.floor(p.consolidationConsecutive) : 3,
      consolidationThreshold: isFiniteNumber(p.consolidationThreshold) ? p.consolidationThreshold : 1.5,
      consolidationRequireAboveMa10: p.consolidationRequireAboveMa10 === true,
      consolidationFilterEnabled: p.consolidationFilterEnabled === false ? false : true,
      consolidationFilterVisible: p.consolidationFilterVisible === false ? false : true,
      trendLineLookback: isFiniteNumber(p.trendLineLookback) ? Math.floor(p.trendLineLookback) : 10,
      trendLineConsecutive: isFiniteNumber(p.trendLineConsecutive) ? Math.floor(p.trendLineConsecutive) : 3,
      trendLineFilterEnabled: p.trendLineFilterEnabled === true,
      trendLineFilterVisible: p.trendLineFilterVisible === false ? false : true,
      sharpMoveFilterVisible:
        p.sharpMoveFilterVisible === false
          ? false
          : p.volumeSurgeFilterVisible === false
            ? false
            : true,
      sharpMoveWindowBars: (() => {
        if (isFiniteNumber(p.sharpMoveWindowBars)) {
          return Math.max(1, Math.floor(p.sharpMoveWindowBars as number));
        }
        if (isFiniteNumber(p.volumeSurgeLookback)) {
          return Math.max(1, Math.floor(p.volumeSurgeLookback as number));
        }
        return 60;
      })(),
      sharpMoveMagnitude: (() => {
        if (isFiniteNumber(p.sharpMoveMagnitude) && (p.sharpMoveMagnitude as number) > 0) {
          return p.sharpMoveMagnitude as number;
        }
        if (isFiniteNumber(p.dropRiseMagnitude) && (p.dropRiseMagnitude as number) > 0) {
          return p.dropRiseMagnitude as number;
        }
        const legacy = p.dropRisePercentRange;
        if (legacy === '10+') return 10;
        return 6;
      })(),
      sharpMoveOnlyDrop: p.sharpMoveOnlyDrop === true,
      sharpMoveOnlyRise: p.sharpMoveOnlyRise === true,
      sharpMoveDropThenRiseLoose: p.sharpMoveDropThenRiseLoose === true,
      sharpMoveRiseThenDropLoose: p.sharpMoveRiseThenDropLoose === true,
      sharpMoveDropFlatRise: p.sharpMoveDropFlatRise === true,
      sharpMoveRiseFlatDrop: p.sharpMoveRiseFlatDrop === true,
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
    console.warn('保存机会分析筛选偏好失败:', e);
  }
}

export function clearOpportunityFilterPrefs(): void {
  try {
    localStorage.removeItem(OPPORTUNITY_FILTER_PREFS_KEY);
  } catch (e) {
    console.warn('清除机会分析筛选偏好失败:', e);
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
    turnoverRateRange: { min: 1 },
    peRatioRange: {},
    kdjJRange: {},
    filterVisible: true,
    recentLimitUpCount: undefined,
    recentLimitDownCount: undefined,
    limitUpPeriod: 20,
    limitDownPeriod: 20,
    consolidationTypes: [...VALID_CONSOLIDATION_TYPES],
    consolidationLookback: 10,
    consolidationConsecutive: 3,
    consolidationThreshold: 1.5,
    consolidationRequireAboveMa10: false,
    consolidationFilterEnabled: true,
    consolidationFilterVisible: true,
    trendLineLookback: 10,
    trendLineConsecutive: 3,
    trendLineFilterEnabled: false,
    trendLineFilterVisible: true,
    sharpMoveFilterVisible: true,
    sharpMoveWindowBars: 60,
    sharpMoveMagnitude: 6,
    sharpMoveOnlyDrop: false,
    sharpMoveOnlyRise: false,
    sharpMoveDropThenRiseLoose: false,
    sharpMoveRiseThenDropLoose: false,
    sharpMoveDropFlatRise: false,
    sharpMoveRiseFlatDrop: false,
  };
}

/** 与 INITIAL_OPPORTUNITY_QUERY + 页面默认市场/名称类型一致 */
export const DEFAULT_QUERY_PREFS_FIELDS = {
  selectedMarket: 'hs_main',
  nameType: 'non_st',
  currentPeriod: 'day' as KLinePeriod,
  currentCount: 300,
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
  setSharpMoveWindowBars: (v: number) => void;
  setSharpMoveMagnitude: (v: number) => void;
  setSharpMoveOnlyDrop: (v: boolean) => void;
  setSharpMoveOnlyRise: (v: boolean) => void;
  setSharpMoveDropThenRiseLoose: (v: boolean) => void;
  setSharpMoveRiseThenDropLoose: (v: boolean) => void;
  setSharpMoveDropFlatRise: (v: boolean) => void;
  setSharpMoveRiseFlatDrop: (v: boolean) => void;
}

export function applyOpportunityFilterPrefsToState(
  prefs: OpportunityFilterPrefs,
  actions: OpportunityFilterPrefsApplyActions
): void {
  actions.setSelectedMarket(prefs.selectedMarket);
  actions.setNameType(prefs.nameType);
  actions.setPriceRange({ ...prefs.priceRange });
  actions.setMarketCapRange({ ...prefs.marketCapRange });
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
  actions.setSharpMoveWindowBars(prefs.sharpMoveWindowBars);
  actions.setSharpMoveMagnitude(prefs.sharpMoveMagnitude);
  actions.setSharpMoveOnlyDrop(prefs.sharpMoveOnlyDrop);
  actions.setSharpMoveOnlyRise(prefs.sharpMoveOnlyRise);
  actions.setSharpMoveDropThenRiseLoose(prefs.sharpMoveDropThenRiseLoose);
  actions.setSharpMoveRiseThenDropLoose(prefs.sharpMoveRiseThenDropLoose);
  actions.setSharpMoveDropFlatRise(prefs.sharpMoveDropFlatRise);
  actions.setSharpMoveRiseFlatDrop(prefs.sharpMoveRiseFlatDrop);
}
