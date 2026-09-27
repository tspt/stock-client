/**
 * 临时股票列表（仅内存）
 *
 * 使用场景：在 K 线 / 筹码抽屉（DailyChartDrawer）底部点「加入临时列表」收集当前股票，
 * 再到机会分析页顶部的「导出/设置 → 导出临时列表(PNG)」把收集到的股票名称导出为图片。
 *
 * 与 themeStore 一样是全局 store，因此机会分析页与回测页共用同一个列表；
 * 不做持久化，关闭应用即清空。
 */

import { create } from 'zustand';

/** 列表项：只保留名称展示所需的最小信息，code 仅用于去重 */
export interface TempStockItem {
  code: string;
  name: string;
}

interface TempStockListState {
  items: TempStockItem[];
  /** 加入一只；已存在（同 code）时返回 false，不重复添加 */
  addStock: (item: TempStockItem) => boolean;
  /** 按 code 移除一只 */
  removeStock: (code: string) => void;
  /** 清空整个列表 */
  clear: () => void;
}

export const useTempStockListStore = create<TempStockListState>((set, get) => ({
  items: [],

  addStock: (item) => {
    if (!item.code) {
      return false;
    }
    if (get().items.some((i) => i.code === item.code)) {
      return false;
    }
    set((state) => ({ items: [...state.items, item] }));
    return true;
  },

  removeStock: (code) =>
    set((state) => ({ items: state.items.filter((i) => i.code !== code) })),

  clear: () => set({ items: [] }),
}));
