/**
 * 热门行情Store - 仅保留市场概览
 */

import { create } from 'zustand';
import { getMarketOverview } from '@/services/tencentApi';
import type { MarketOverview } from '@/services/tencentApi';

interface HotState {
  // 数据状态
  marketOverview: MarketOverview | null; // 市场概览

  // Actions
  loadMarketOverview: () => Promise<void>; // 加载市场概览
}

export const useHotStore = create<HotState>((set) => ({
  // 初始状态
  marketOverview: null,

  // 加载市场概览
  loadMarketOverview: async () => {
    try {
      const data = await getMarketOverview();
      set({ marketOverview: data });
    } catch (error) {
      console.error('加载市场概览失败:', error);
    }
  },
}));
