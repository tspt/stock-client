/**
 * 机会分析页：查询条件与筛选表单的本地持久化（localStorage）
 * 与 IndexedDB 中的分析结果 + K 线缓存配合，实现纯前端筛选与二次访问还原。
 */

import type { ConsolidationType, KLinePeriod } from '@/types/stock';

export const OPPORTUNITY_FILTER_PREFS_KEY = 'opportunity_filter_prefs';

const PREFS_VERSION = 1 as const;

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
  volumeSurgeFilterVisible: boolean;
  volumeSurgeDropEnabled: boolean;
  volumeSurgeRiseEnabled: boolean;
  volumeSurgePeriod: number;
  dropRisePercentRange: string;
  afterDropType: string;
  afterRiseType: string;
  afterDropPercentRange: string;
  afterRisePercentRange: string;
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
    if (!isRecord(p) || p.version !== PREFS_VERSION) return null;
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
      volumeSurgeFilterVisible: p.volumeSurgeFilterVisible === false ? false : true,
      volumeSurgeDropEnabled: p.volumeSurgeDropEnabled === true,
      volumeSurgeRiseEnabled: p.volumeSurgeRiseEnabled === true,
      volumeSurgePeriod: isFiniteNumber(p.volumeSurgePeriod) ? Math.floor(p.volumeSurgePeriod) : 10,
      dropRisePercentRange: typeof p.dropRisePercentRange === 'string' ? p.dropRisePercentRange : '5-10',
      afterDropType: typeof p.afterDropType === 'string' ? p.afterDropType : 'all',
      afterRiseType: typeof p.afterRiseType === 'string' ? p.afterRiseType : 'all',
      afterDropPercentRange: typeof p.afterDropPercentRange === 'string' ? p.afterDropPercentRange : '5-10',
      afterRisePercentRange: typeof p.afterRisePercentRange === 'string' ? p.afterRisePercentRange : '5-10',
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
    volumeSurgeFilterVisible: true,
    volumeSurgeDropEnabled: false,
    volumeSurgeRiseEnabled: false,
    volumeSurgePeriod: 10,
    dropRisePercentRange: '5-10',
    afterDropType: 'all',
    afterRiseType: 'all',
    afterDropPercentRange: '5-10',
    afterRisePercentRange: '5-10',
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
  setFilterVisible: (v: boolean) => void;
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
  setConsolidationFilterVisible: (v: boolean) => void;
  setTrendLineLookback: (v: number) => void;
  setTrendLineConsecutive: (v: number) => void;
  setTrendLineFilterEnabled: (v: boolean) => void;
  setTrendLineFilterVisible: (v: boolean) => void;
  setVolumeSurgeFilterVisible: (v: boolean) => void;
  setVolumeSurgeDropEnabled: (v: boolean) => void;
  setVolumeSurgeRiseEnabled: (v: boolean) => void;
  setVolumeSurgePeriod: (v: number) => void;
  setDropRisePercentRange: (v: string) => void;
  setAfterDropType: (v: string) => void;
  setAfterRiseType: (v: string) => void;
  setAfterDropPercentRange: (v: string) => void;
  setAfterRisePercentRange: (v: string) => void;
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
  actions.setFilterVisible(prefs.filterVisible);
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
  actions.setConsolidationFilterVisible(prefs.consolidationFilterVisible);
  actions.setTrendLineLookback(prefs.trendLineLookback);
  actions.setTrendLineConsecutive(prefs.trendLineConsecutive);
  actions.setTrendLineFilterEnabled(prefs.trendLineFilterEnabled);
  actions.setTrendLineFilterVisible(prefs.trendLineFilterVisible);
  actions.setVolumeSurgeFilterVisible(prefs.volumeSurgeFilterVisible);
  actions.setVolumeSurgeDropEnabled(prefs.volumeSurgeDropEnabled);
  actions.setVolumeSurgeRiseEnabled(prefs.volumeSurgeRiseEnabled);
  actions.setVolumeSurgePeriod(prefs.volumeSurgePeriod);
  actions.setDropRisePercentRange(prefs.dropRisePercentRange);
  actions.setAfterDropType(prefs.afterDropType);
  actions.setAfterRiseType(prefs.afterRiseType);
  actions.setAfterDropPercentRange(prefs.afterDropPercentRange);
  actions.setAfterRisePercentRange(prefs.afterRisePercentRange);
}
