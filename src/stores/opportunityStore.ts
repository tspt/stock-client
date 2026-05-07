/**
 * 机会分析状态管理
 */

import { create } from 'zustand';
import type {
  StockOpportunityData,
  OpportunityAnalysisResult,
  OverviewSortConfig,
  KLinePeriod,
  StockInfo,
  KLineData,
} from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import { analyzeAllStocksOpportunity } from '@/services/opportunity';
import { saveOpportunityData, getOpportunityData } from '@/utils/storage/opportunityIndexedDB';
import { logger } from '@/utils/business/logger';
import {
  MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES,
  OPPORTUNITY_DEFAULT_COLUMNS,
} from '@/utils/config/constants';

function trimKlineDataCache(map: Map<string, KLineData[]>) {
  if (map.size <= MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES) return;
  const keys = [...map.keys()];
  const overflow = map.size - MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    map.delete(keys[i]);
  }
}

const OPPORTUNITY_COLUMN_CONFIG_KEY = 'opportunity_column_config';

interface OpportunityState {
  analysisData: StockOpportunityData[];
  loading: boolean;
  progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  };
  currentPeriod: KLinePeriod;
  currentCount: number;
  columnConfig: ColumnConfig[];
  sortConfig: OverviewSortConfig;
  errors: Array<{ stock: { code: string; name: string }; error: string }>;
  cancelFn: (() => void) | null;
  // K线数据缓存：Map<股票代码, K线数据数组>
  klineDataCache: Map<string, KLineData[]>;
  // 分析时间戳
  analysisTimestamp: number | null;

  startAnalysis: (period: KLinePeriod, stocks: StockInfo[], count: number) => Promise<void>;
  cancelAnalysis: () => void;
  retryFailedStocks: () => Promise<void>;
  loadCachedData: () => Promise<void>;
  updateColumnConfig: (config: ColumnConfig[]) => void;
  updateSortConfig: (config: OverviewSortConfig) => void;
  clearData: () => void;
  resetColumnConfig: () => void;
}

function initColumnConfig(): ColumnConfig[] {
  return OPPORTUNITY_DEFAULT_COLUMNS.map((col, index) => ({
    ...col,
    order: index,
  }));
}

/**
 * 向后兼容：当新增列时，将默认列合并到已保存的列配置中（保持用户原有顺序，并把新列追加到末尾）
 */
function mergeSavedColumns(saved: ColumnConfig[]): ColumnConfig[] {
  const defaults = initColumnConfig();
  const defaultMap = new Map(defaults.map((c) => [c.key, c]));

  const sortedSaved = [...saved].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const merged: ColumnConfig[] = [];

  // 先按用户保存的顺序写入（仅保留仍存在于默认列的key）
  sortedSaved.forEach((col) => {
    const def = defaultMap.get(col.key);
    if (!def) return;
    merged.push({
      ...def,
      ...col,
      order: merged.length,
    });
  });

  const existingKeys = new Set(merged.map((c) => c.key));
  // 再把新增的默认列追加
  defaults.forEach((def) => {
    if (existingKeys.has(def.key)) return;
    merged.push({ ...def, order: merged.length });
  });

  return merged;
}

export const useOpportunityStore = create<OpportunityState>((set, get) => ({
  analysisData: [],
  loading: false,
  progress: { total: 0, completed: 0, failed: 0, percent: 0 },
  currentPeriod: 'day',
  currentCount: 500,
  columnConfig: initColumnConfig(),
  sortConfig: { key: null, direction: null },
  errors: [],
  cancelFn: null,
  klineDataCache: new Map(),
  analysisTimestamp: null,

  startAnalysis: async (period, stocks, count) => {
    if (stocks.length === 0) {
      return;
    }

    set({
      loading: true,
      progress: { total: 0, completed: 0, failed: 0, percent: 0 },
      errors: [],
      currentPeriod: period,
      currentCount: count,
    });

    let cancelled = false;

    try {
      const { promise, cancel } = analyzeAllStocksOpportunity(stocks, period, count, (p) => {
        if (!cancelled) {
          set({ progress: p });
        }
      });

      // 包装一层：既调用service取消，也能阻止后续进度回调更新UI
      set({
        cancelFn: () => {
          cancelled = true;
          cancel();
        },
      });

      const { results, errors, klineDataMap } = await promise;

      if (cancelled) {
        set({ loading: false, cancelFn: null });
        return;
      }

      // 保存K线数据到缓存
      const newCache = new Map(get().klineDataCache);
      klineDataMap.forEach((klineData, code) => {
        newCache.set(code, klineData);
      });
      trimKlineDataCache(newCache);

      // 将 Map 序列化为数组格式以便保存到 IndexedDB
      const klineDataCacheArray: Array<[string, KLineData[]]> = Array.from(newCache.entries());

      const result: OpportunityAnalysisResult = {
        data: results,
        timestamp: Date.now(),
        period,
        count,
        groupId: '', // 不再使用 groupId，保留字段以保持兼容性
        total: stocks.length,
        success: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
        klineDataCache: klineDataCacheArray,
      };

      await saveOpportunityData(result);

      const formattedErrors = errors.map((err) => ({
        stock: { code: err.stock.code, name: err.stock.name },
        error: err.error.message,
      }));

      set({
        analysisData: results,
        loading: false,
        errors: formattedErrors,
        cancelFn: null,
        klineDataCache: newCache,
        analysisTimestamp: Date.now(),
      });
    } catch (error) {
      logger.error('机会分析失败:', error);
      set({ loading: false, cancelFn: null });
    }
  },

  cancelAnalysis: () => {
    const { cancelFn } = get();
    if (cancelFn) {
      cancelFn();
    }
    set({ loading: false, cancelFn: null });
  },

  retryFailedStocks: async () => {
    const state = get();
    const { errors, currentPeriod, currentCount, analysisData, klineDataCache } = state;

    if (errors.length === 0) {
      return;
    }

    // 提取失败股票
    const failedStocks: StockInfo[] = errors.map((err) => ({
      code: err.stock.code,
      name: err.stock.name,
      market: err.stock.code.startsWith('SH') ? 'SH' : 'SZ', // 根据代码推断市场
    }));

    set({
      loading: true,
      progress: { total: failedStocks.length, completed: 0, failed: 0, percent: 0 },
    });

    let cancelled = false;

    try {
      const { promise, cancel } = analyzeAllStocksOpportunity(
        failedStocks,
        currentPeriod,
        currentCount,
        (p) => {
          if (!cancelled) {
            set({ progress: p });
          }
        }
      );

      // 包装取消函数
      set({
        cancelFn: () => {
          cancelled = true;
          cancel();
        },
      });

      const { results, errors: newErrors, klineDataMap } = await promise;

      if (cancelled) {
        set({ loading: false, cancelFn: null });
        return;
      }

      // 增量合并：更新 analysisData
      const existingDataMap = new Map(analysisData.map((d) => [d.code, d]));
      results.forEach((result) => {
        if (!result.error) {
          existingDataMap.set(result.code, result); // 覆盖或添加
        }
      });
      const mergedData = Array.from(existingDataMap.values());

      // 更新 K线缓存
      const newCache = new Map(klineDataCache);
      klineDataMap.forEach((klineData, code) => {
        newCache.set(code, klineData);
      });
      trimKlineDataCache(newCache);

      // 更新错误列表：移除已成功的，保留仍失败的，添加新的失败
      const successCodes = new Set(results.filter((r) => !r.error).map((r) => r.code));
      const remainingErrors = errors.filter((err) => !successCodes.has(err.stock.code));
      const formattedNewErrors = newErrors.map((err) => ({
        stock: { code: err.stock.code, name: err.stock.name },
        error: err.error.message,
      }));

      // 按股票代码去重：优先使用新的错误信息（如果股票在新的错误列表中）
      const errorMap = new Map<string, { stock: { code: string; name: string }; error: string }>();

      // 先添加剩余的旧错误
      remainingErrors.forEach((err) => {
        errorMap.set(err.stock.code, err);
      });

      // 再用新错误覆盖（如果有新的错误信息）
      formattedNewErrors.forEach((err) => {
        errorMap.set(err.stock.code, err);
      });

      const mergedErrors = Array.from(errorMap.values());

      // 保存更新后的数据到 IndexedDB
      const klineDataCacheArray: Array<[string, KLineData[]]> = Array.from(newCache.entries());
      const result: OpportunityAnalysisResult = {
        data: mergedData,
        timestamp: Date.now(),
        period: currentPeriod,
        count: currentCount,
        groupId: '',
        total: failedStocks.length,
        success: results.filter((r) => !r.error).length,
        failed: mergedErrors.length,
        klineDataCache: klineDataCacheArray,
      };

      await saveOpportunityData(result);

      set({
        analysisData: mergedData,
        errors: mergedErrors,
        klineDataCache: newCache,
        loading: false,
        cancelFn: null,
        analysisTimestamp: Date.now(),
      });
    } catch (error) {
      logger.error('重试失败:', error);
      set({ loading: false, cancelFn: null });
    }
  },

  loadCachedData: async () => {
    try {
      const cached = await getOpportunityData();
      if (cached) {
        // 恢复 klineDataCache（从数组格式恢复为 Map）
        const klineDataCache = new Map<string, KLineData[]>();
        if (cached.klineDataCache) {
          cached.klineDataCache.forEach(([code, klineData]) => {
            klineDataCache.set(code, klineData);
          });
        }
        trimKlineDataCache(klineDataCache);

        set({
          analysisData: cached.data,
          currentPeriod: cached.period,
          currentCount: cached.count,
          klineDataCache,
          analysisTimestamp: cached.timestamp || null,
        });
      }
    } catch (error) {
      logger.error('加载机会分析缓存数据失败:', error);
    }
  },

  updateColumnConfig: (config) => {
    set({ columnConfig: config });
    try {
      localStorage.setItem(OPPORTUNITY_COLUMN_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      logger.error('保存机会分析列配置失败:', error);
    }
  },

  updateSortConfig: (config) => {
    set({ sortConfig: config });
  },

  clearData: () => {
    set({
      analysisData: [],
      progress: { total: 0, completed: 0, failed: 0, percent: 0 },
      errors: [],
      klineDataCache: new Map(),
      analysisTimestamp: null,
    });
  },

  resetColumnConfig: () => {
    const defaultConfig = initColumnConfig();
    set({ columnConfig: defaultConfig });
    try {
      localStorage.setItem(OPPORTUNITY_COLUMN_CONFIG_KEY, JSON.stringify(defaultConfig));
    } catch (error) {
      logger.error('保存机会分析列配置失败:', error);
    }
  },
}));

// 初始化时加载列配置
try {
  const saved = localStorage.getItem(OPPORTUNITY_COLUMN_CONFIG_KEY);
  if (saved) {
    const config = JSON.parse(saved) as ColumnConfig[];
    useOpportunityStore.setState({ columnConfig: mergeSavedColumns(config) });
  }
} catch (error) {
  logger.error('加载机会分析列配置失败:', error);
}
