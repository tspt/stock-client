/**
 * 行业板块 Store
 */

import { create } from 'zustand';
import { SHENWAN_INDUSTRIES } from '@/data/shenwanIndustries';
import type { ShenwanIndustry } from '@/types/stock';

interface SectorState {
  /** 选中的行业 */
  selectedIndustry: ShenwanIndustry | null;
  /** 搜索关键词 */
  searchKeyword: string;

  // Actions
  setSelectedIndustry: (industry: ShenwanIndustry | null) => void;
  setSearchKeyword: (keyword: string) => void;
}

export const useSectorStore = create<SectorState>((set) => ({
  selectedIndustry: null,
  searchKeyword: '',

  setSelectedIndustry: (industry) => set({ selectedIndustry: industry }),
  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
}));
