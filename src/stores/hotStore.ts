/**
 * 热门行情Store - 指数展示 + 板块排行
 */

import { create } from 'zustand';
import {
  getMarketOverview,
  getSectorRanks,
  getConceptSectorRanks,
  getEastMoneySectorRanks,
  getEastMoneyIndices,
} from '@/services/hot';
import type { MarketOverview, EastMoneyIndexData } from '@/services/hot';
import type { SectorRankData, ConceptSectorRankData, EastMoneySectorData } from '@/types/stock';

interface HotState {
  // 数据状态
  marketOverview: MarketOverview | null; // 市场概览(已废弃,保留用于兼容)
  risingSectors: SectorRankData[]; // 领涨板块(已废弃,保留用于兼容)
  fallingSectors: SectorRankData[]; // 领跌板块(已废弃,保留用于兼容)
  sectorsLoading: boolean; // 板块加载状态(已废弃,保留用于兼容)

  // 概念板块数据(已废弃,保留用于兼容)
  risingConceptSectors: ConceptSectorRankData[]; // 领涨概念板块
  fallingConceptSectors: ConceptSectorRankData[]; // 领跌概念板块
  conceptSectorsLoading: boolean; // 概念板块加载状态

  // 东方财富板块数据
  eastMoneyRisingSectors: EastMoneySectorData[]; // 东方财富领涨板块
  eastMoneyFallingSectors: EastMoneySectorData[]; // 东方财富领跌板块
  eastMoneySectorsLoading: boolean; // 东方财富板块加载状态

  // 指数数据
  indices: EastMoneyIndexData[]; // 指数列表
  indicesLoading: boolean; // 指数加载状态

  // Actions
  loadMarketOverview: () => Promise<void>; // 加载市场概览(已废弃)
  loadSectorRanks: () => Promise<void>; // 加载板块排行(已废弃)
  loadConceptSectorRanks: () => Promise<void>; // 加载概念板块排行(已废弃)
  loadEastMoneySectorRanks: () => Promise<void>; // 加载东方财富板块排行
  loadEastMoneyIndices: () => Promise<void>; // 加载东方财富指数数据
}

// 选择器函数，避免不必要的重渲染
export const useIndices = () => useHotStore((state) => state.indices);
export const useIndicesLoading = () => useHotStore((state) => state.indicesLoading);
export const useEastMoneyRisingSectors = () => useHotStore((state) => state.eastMoneyRisingSectors);
export const useEastMoneyFallingSectors = () =>
  useHotStore((state) => state.eastMoneyFallingSectors);
export const useEastMoneySectorsLoading = () =>
  useHotStore((state) => state.eastMoneySectorsLoading);

export const useHotStore = create<HotState>((set) => ({
  // 初始状态
  marketOverview: null,
  risingSectors: [],
  fallingSectors: [],
  sectorsLoading: false,

  // 概念板块初始状态
  risingConceptSectors: [],
  fallingConceptSectors: [],
  conceptSectorsLoading: false,

  // 东方财富板块初始状态
  eastMoneyRisingSectors: [],
  eastMoneyFallingSectors: [],
  eastMoneySectorsLoading: false,

  // 指数初始状态
  indices: [],
  indicesLoading: false,

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

  // 加载概念板块排行
  loadConceptSectorRanks: async () => {
    set({ conceptSectorsLoading: true });
    try {
      const { rising, falling } = await getConceptSectorRanks(20);
      set({
        risingConceptSectors: rising,
        fallingConceptSectors: falling,
        conceptSectorsLoading: false,
      });
    } catch (error) {
      console.error('加载概念板块排行数据失败:', error);
      set({ conceptSectorsLoading: false });
    }
  },

  // 加载东方财富板块排行
  loadEastMoneySectorRanks: async () => {
    set({ eastMoneySectorsLoading: true });
    try {
      const { rising, falling } = await getEastMoneySectorRanks(20);
      set({
        eastMoneyRisingSectors: rising,
        eastMoneyFallingSectors: falling,
        eastMoneySectorsLoading: false,
      });
    } catch (error) {
      console.error('加载东方财富板块排行数据失败:', error);
      set({ eastMoneySectorsLoading: false });
    }
  },

  // 加载东方财富指数数据 - 无感刷新
  loadEastMoneyIndices: async () => {
    try {
      const indices = await getEastMoneyIndices();
      set({ indices });
    } catch (error) {
      console.error('加载东方财富指数数据失败:', error);
    }
  },
}));
