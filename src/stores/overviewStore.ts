/**
 * 数据概况状态管理
 */

import { create } from 'zustand';
import type {
  StockOverviewData,
  OverviewAnalysisResult,
  OverviewSortConfig,
  KLinePeriod,
} from '@/types/stock';
import type { ColumnConfig } from '@/types/common';
import { analyzeAllStocks } from '@/services/overviewService';
import { saveOverviewData, getOverviewData, saveOverviewHistory } from '@/utils/indexedDB';
import { OVERVIEW_DEFAULT_COLUMNS } from '@/utils/constants';
import { useStockStore } from './stockStore';

interface OverviewState {
  // 分析结果数据
  analysisData: StockOverviewData[];
  // 是否正在分析
  loading: boolean;
  // 进度信息
  progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  };
  // 当前K线周期
  currentPeriod: KLinePeriod;
  // 列配置
  columnConfig: ColumnConfig[];
  // 排序配置
  sortConfig: OverviewSortConfig;
  // 错误列表
  errors: Array<{ stock: { code: string; name: string }; error: string }>;
  // 取消函数
  cancelFn: (() => void) | null;

  // Actions
  startAnalysis: (period: KLinePeriod, groupId?: string, count?: number) => Promise<void>;
  cancelAnalysis: () => void;
  loadCachedData: () => Promise<void>;
  updateColumnConfig: (config: ColumnConfig[]) => void;
  updateSortConfig: (config: OverviewSortConfig) => void;
  clearData: () => void;
  resetColumnConfig: () => void;
}

// 初始化列配置
function initColumnConfig(): ColumnConfig[] {
  return OVERVIEW_DEFAULT_COLUMNS.map((col, index) => ({
    ...col,
    order: index,
  }));
}

export const useOverviewStore = create<OverviewState>((set, get) => ({
  analysisData: [],
  loading: false,
  progress: {
    total: 0,
    completed: 0,
    failed: 0,
    percent: 0,
  },
  currentPeriod: 'day',
  columnConfig: initColumnConfig(),
  sortConfig: {
    key: null,
    direction: null,
  },
  errors: [],
  cancelFn: null,

  startAnalysis: async (period: KLinePeriod, groupId?: string, count: number = 300) => {
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
    });

    let cancelled = false;

    try {
      const { promise, cancel } = analyzeAllStocks(
        targetList,
        period,
        count,
        (progress) => {
          if (!cancelled) {
            set({ progress });
          }
        },
        () => cancelled
      );

      // 设置cancel函数
      set({ cancelFn: cancel });

      // 等待分析完成
      const { results, errors } = await promise;

      if (cancelled) {
        set({ loading: false, cancelFn: null });
        return;
      }

      // 保存结果
      const result: OverviewAnalysisResult = {
        data: results,
        timestamp: Date.now(),
        period,
        total: targetList.length,
        success: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
      };

      // 保存到IndexedDB
      await saveOverviewData(result);
      await saveOverviewHistory(result);

      // 格式化错误列表
      const formattedErrors = errors.map((err) => ({
        stock: {
          code: err.stock.code,
          name: err.stock.name,
        },
        error: err.error.message,
      }));

      set({
        analysisData: results,
        loading: false,
        errors: formattedErrors,
        cancelFn: null,
      });
    } catch (error) {
      console.error('分析失败:', error);
      set({
        loading: false,
        cancelFn: null,
      });
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
      const cached = await getOverviewData();
      if (cached) {
        set({
          analysisData: cached.data,
          currentPeriod: cached.period,
        });
      }
    } catch (error) {
      console.error('加载缓存数据失败:', error);
    }
  },

  updateColumnConfig: (config: ColumnConfig[]) => {
    set({ columnConfig: config });
    // 保存到localStorage
    try {
      localStorage.setItem('overview_column_config', JSON.stringify(config));
    } catch (error) {
      console.error('保存列配置失败:', error);
    }
  },

  updateSortConfig: (config: OverviewSortConfig) => {
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
      localStorage.setItem('overview_column_config', JSON.stringify(defaultConfig));
    } catch (error) {
      console.error('保存列配置失败:', error);
    }
  },
}));

// 初始化时加载列配置
try {
  const saved = localStorage.getItem('overview_column_config');
  if (saved) {
    const config = JSON.parse(saved) as ColumnConfig[];
    useOverviewStore.setState({ columnConfig: config });
  }
} catch (error) {
  console.error('加载列配置失败:', error);
}
