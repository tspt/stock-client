/**
 * 热门行情Store
 */

import { create } from 'zustand';
import {
  getHotSectors,
  getHotStocks,
  getHotConcepts,
  getFundFlows,
  getMarketSentiment,
} from '@/services/hotApi';
import { getLeadingSectors, getLaggingSectors, getMarketOverview } from '@/services/tencentApi';
import type {
  HotSector,
  HotStock,
  HotConcept,
  FundFlow,
  MarketSentiment,
  HotCategory,
  HotStockSortType,
} from '@/types/hot';
import type { MarketOverview } from '@/services/tencentApi';

interface HotState {
  // 数据状态
  sectors: HotSector[];
  leadingSectors: HotSector[]; // 领涨板块
  laggingSectors: HotSector[]; // 领跌板块
  stocks: HotStock[];
  concepts: HotConcept[];
  funds: FundFlow[];
  sentiment: MarketSentiment | null;
  marketOverview: MarketOverview | null; // 市场概览

  // 加载状态
  loading: boolean;
  currentCategory: HotCategory;
  stockSortType: HotStockSortType;

  // 错误信息
  error: string | null;

  // Actions
  loadSectors: (sortBy?: 'changePercent' | 'volume' | 'amount') => Promise<void>;
  loadLeadingSectors: (limit?: number) => Promise<void>; // 加载领涨板块
  loadLaggingSectors: (limit?: number) => Promise<void>; // 加载领跌板块
  loadStocks: (sortType?: HotStockSortType, limit?: number) => Promise<void>;
  loadConcepts: (limit?: number) => Promise<void>;
  loadFunds: (sortType?: 'mainNetInflow' | 'superLarge' | 'large', limit?: number) => Promise<void>;
  loadSentiment: () => Promise<void>;
  loadMarketOverview: () => Promise<void>; // 加载市场概览
  setCurrentCategory: (category: HotCategory) => void;
  setStockSortType: (sortType: HotStockSortType) => void;
  clearError: () => void;
}

export const useHotStore = create<HotState>((set, get) => ({
  // 初始状态
  sectors: [],
  leadingSectors: [],
  laggingSectors: [],
  stocks: [],
  concepts: [],
  funds: [],
  sentiment: null,
  marketOverview: null,
  loading: false,
  currentCategory: 'leading-sectors',
  stockSortType: 'changePercent',
  error: null,

  // 加载热门板块
  loadSectors: async (sortBy = 'changePercent') => {
    set({ loading: true, error: null });
    try {
      const data = await getHotSectors(sortBy);
      set({ sectors: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载热门板块失败';
      set({ error: errorMessage, loading: false });
      console.error('加载热门板块失败:', error);
    }
  },

  // 加载领涨板块
  loadLeadingSectors: async (limit = 10) => {
    set({ loading: true, error: null });
    try {
      const data = await getLeadingSectors(limit);
      set({ leadingSectors: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载领涨板块失败';
      set({ error: errorMessage, loading: false });
      console.error('加载领涨板块失败:', error);
    }
  },

  // 加载领跌板块
  loadLaggingSectors: async (limit = 10) => {
    set({ loading: true, error: null });
    try {
      const data = await getLaggingSectors(limit);
      set({ laggingSectors: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载领跌板块失败';
      set({ error: errorMessage, loading: false });
      console.error('加载领跌板块失败:', error);
    }
  },

  // 加载热门股票
  loadStocks: async (sortType = 'changePercent', limit = 50) => {
    set({ loading: true, error: null, stockSortType: sortType });
    try {
      const data = await getHotStocks(sortType, limit);
      set({ stocks: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载热门股票失败';
      set({ error: errorMessage, loading: false });
      console.error('加载热门股票失败:', error);
    }
  },

  // 加载热门概念
  loadConcepts: async (limit = 30) => {
    set({ loading: true, error: null });
    try {
      const data = await getHotConcepts(limit);
      set({ concepts: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载热门概念失败';
      set({ error: errorMessage, loading: false });
      console.error('加载热门概念失败:', error);
    }
  },

  // 加载资金流向
  loadFunds: async (sortType = 'mainNetInflow', limit = 50) => {
    set({ loading: true, error: null });
    try {
      const data = await getFundFlows(sortType, limit);
      set({ funds: data, loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载资金流向失败';
      set({ error: errorMessage, loading: false });
      console.error('加载资金流向失败:', error);
    }
  },

  // 加载市场情绪
  loadSentiment: async () => {
    try {
      const data = await getMarketSentiment();
      set({ sentiment: data });
    } catch (error) {
      console.error('加载市场情绪失败:', error);
    }
  },

  // 加载市场概览
  loadMarketOverview: async () => {
    try {
      const data = await getMarketOverview();
      set({ marketOverview: data });
    } catch (error) {
      console.error('加载市场概览失败:', error);
    }
  },

  // 设置当前分类
  setCurrentCategory: (category: HotCategory) => {
    set({ currentCategory: category });
  },

  // 设置股票排序类型
  setStockSortType: (sortType: HotStockSortType) => {
    set({ stockSortType: sortType });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
