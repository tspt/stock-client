/**
 * 机会分析状态管理
 */

import { create } from 'zustand';
import type {
  StockOpportunityData,
  OpportunityAnalysisResult,
  OverviewColumnConfig,
  OverviewSortConfig,
  KLinePeriod,
} from '@/types/stock';
import { analyzeAllStocksOpportunity } from '@/services/opportunityService';
import { saveOpportunityData, getOpportunityData, saveOpportunityHistory } from '@/utils/opportunityIndexedDB';
import { OPPORTUNITY_DEFAULT_COLUMNS } from '@/utils/constants';
import { useStockStore } from './stockStore';

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
  columnConfig: OverviewColumnConfig[];
  sortConfig: OverviewSortConfig;
  errors: Array<{ stock: { code: string; name: string }; error: string }>;
  cancelFn: (() => void) | null;

  startAnalysis: (period: KLinePeriod, groupId: string, count: number) => Promise<void>;
  cancelAnalysis: () => void;
  loadCachedData: () => Promise<void>;
  updateColumnConfig: (config: OverviewColumnConfig[]) => void;
  updateSortConfig: (config: OverviewSortConfig) => void;
  clearData: () => void;
  resetColumnConfig: () => void;
}

function initColumnConfig(): OverviewColumnConfig[] {
  return OPPORTUNITY_DEFAULT_COLUMNS.map((col, index) => ({
    ...col,
    order: index,
  }));
}

export const useOpportunityStore = create<OpportunityState>((set, get) => ({
  analysisData: [],
  loading: false,
  progress: { total: 0, completed: 0, failed: 0, percent: 0 },
  currentPeriod: 'day',
  currentCount: 2000,
  columnConfig: initColumnConfig(),
  sortConfig: { key: null, direction: null },
  errors: [],
  cancelFn: null,

  startAnalysis: async (period, groupId, count) => {
    const { watchList } = useStockStore.getState();

    const targetList =
      groupId && groupId !== '__all__'
        ? watchList.filter((s) => s.groupIds && s.groupIds.includes(groupId))
        : watchList;

    if (targetList.length === 0) {
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
      const { promise, cancel } = analyzeAllStocksOpportunity(targetList, period, count, (p) => {
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

      const { results, errors } = await promise;

      if (cancelled) {
        set({ loading: false, cancelFn: null });
        return;
      }

      const result: OpportunityAnalysisResult = {
        data: results,
        timestamp: Date.now(),
        period,
        count,
        groupId,
        total: targetList.length,
        success: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
      };

      await saveOpportunityData(result);
      await saveOpportunityHistory(result);

      const formattedErrors = errors.map((err) => ({
        stock: { code: err.stock.code, name: err.stock.name },
        error: err.error.message,
      }));

      set({
        analysisData: results,
        loading: false,
        errors: formattedErrors,
        cancelFn: null,
      });
    } catch (error) {
      console.error('机会分析失败:', error);
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

  loadCachedData: async () => {
    try {
      const cached = await getOpportunityData();
      if (cached) {
        set({
          analysisData: cached.data,
          currentPeriod: cached.period,
          currentCount: cached.count,
        });
      }
    } catch (error) {
      console.error('加载机会分析缓存数据失败:', error);
    }
  },

  updateColumnConfig: (config) => {
    set({ columnConfig: config });
    try {
      localStorage.setItem(OPPORTUNITY_COLUMN_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('保存机会分析列配置失败:', error);
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
    });
  },

  resetColumnConfig: () => {
    const defaultConfig = initColumnConfig();
    set({ columnConfig: defaultConfig });
    try {
      localStorage.setItem(OPPORTUNITY_COLUMN_CONFIG_KEY, JSON.stringify(defaultConfig));
    } catch (error) {
      console.error('保存机会分析列配置失败:', error);
    }
  },
}));

// 初始化时加载列配置
try {
  const saved = localStorage.getItem(OPPORTUNITY_COLUMN_CONFIG_KEY);
  if (saved) {
    const config = JSON.parse(saved) as OverviewColumnConfig[];
    useOpportunityStore.setState({ columnConfig: config });
  }
} catch (error) {
  console.error('加载机会分析列配置失败:', error);
}


