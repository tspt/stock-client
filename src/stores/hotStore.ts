/**
 * 热门行情Store - 市场概览 + 板块排行
 */

import { create } from 'zustand';
import { getMarketOverview, getSectorRanks } from '@/services/hot';
import type { MarketOverview } from '@/services/hot';
import type { SectorRankData } from '@/types/stock';

interface HotState {
  // 数据状态
  marketOverview: MarketOverview | null; // 市场概览
  risingSectors: SectorRankData[]; // 领涨板块
  fallingSectors: SectorRankData[]; // 领跌板块
  sectorsLoading: boolean; // 板块加载状态

  // Actions
  loadMarketOverview: () => Promise<void>; // 加载市场概览
  loadSectorRanks: () => Promise<void>; // 加载板块排行
}

export const useHotStore = create<HotState>((set) => ({
  // 初始状态
  marketOverview: null,
  risingSectors: [],
  fallingSectors: [],
  sectorsLoading: false,

  // 加载市场概览
  loadMarketOverview: async () => {
    try {
      const data = await getMarketOverview();
      set({ marketOverview: data });
    } catch (error) {
      console.error('加载市场概览失败:', error);
    }
  },

  // 加载板块排行
  loadSectorRanks: async () => {
    set({ sectorsLoading: true });
    try {
      const { rising, falling } = await getSectorRanks(20);
      set({
        risingSectors: rising,
        fallingSectors: falling,
        sectorsLoading: false,
      });
    } catch (error) {
      console.error('加载板块排行数据失败:', error);
      set({ sectorsLoading: false });
    }
  },
}));
