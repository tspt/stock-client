/**
 * 股票数据状态管理
 */

import { create } from 'zustand';
import type { StockInfo, StockQuote, SortType } from '@/types/stock';
import { getStorage, setStorage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/utils/constants';

interface StockState {
  // 自选股列表
  watchList: StockInfo[];
  // 股票行情数据
  quotes: Record<string, StockQuote>;
  // 排序方式
  sortType: SortType;
  // 是否使用手动排序（手动排序时，不应用自动排序）
  isManualSort: boolean;
  // 当前选中的股票
  selectedStock: string | null;
  // 所有股票列表（用于本地搜索）
  allStocks: StockInfo[];
  // 是否正在加载所有股票列表
  loadingAllStocks: boolean;

  // Actions
  setWatchList: (list: StockInfo[]) => void;
  addStock: (stock: StockInfo) => void;
  removeStock: (code: string) => void;
  updateQuotes: (quotes: StockQuote[]) => void;
  setSortType: (type: SortType) => void;
  setSelectedStock: (code: string | null) => void;
  loadWatchList: () => void;
  saveWatchList: () => void;
  setAllStocks: (stocks: StockInfo[]) => void;
  setLoadingAllStocks: (loading: boolean) => void;
  // 手动排序方法
  moveStockUp: (code: string) => void;
  moveStockDown: (code: string) => void;
  moveStockToTop: (code: string) => void;
  moveStockToBottom: (code: string) => void;
}

export const useStockStore = create<StockState>((set, get) => ({
  watchList: [],
  quotes: {},
  sortType: 'default',
  isManualSort: false,
  selectedStock: null,
  allStocks: [],
  loadingAllStocks: false,

  setWatchList: (list) => {
    set({ watchList: list });
    get().saveWatchList();
  },

  addStock: (stock) => {
    const { watchList } = get();
    // 检查是否已存在
    if (!watchList.find((s) => s.code === stock.code)) {
      const newList = [...watchList, stock];
      set({ watchList: newList });
      get().saveWatchList();
    }
  },

  removeStock: (code) => {
    const { watchList, quotes } = get();
    const newList = watchList.filter((s) => s.code !== code);
    const newQuotes = { ...quotes };
    delete newQuotes[code];
    set({ watchList: newList, quotes: newQuotes });
    get().saveWatchList();
  },

  updateQuotes: (newQuotes) => {
    const { quotes } = get();
    const updatedQuotes = { ...quotes };
    newQuotes.forEach((quote) => {
      updatedQuotes[quote.code] = quote;
    });
    set({ quotes: updatedQuotes });
  },

  setSortType: (type) => {
    // 如果切换到非默认排序，关闭手动排序模式
    if (type !== 'default') {
      set({ sortType: type, isManualSort: false });
    } else {
      set({ sortType: type });
    }
  },

  setSelectedStock: (code) => {
    set({ selectedStock: code });
  },

  loadWatchList: () => {
    const saved = getStorage<StockInfo[]>(STORAGE_KEYS.WATCH_LIST, []);
    set({ watchList: saved });
  },

  saveWatchList: () => {
    const { watchList } = get();
    setStorage(STORAGE_KEYS.WATCH_LIST, watchList);
  },

  setAllStocks: (stocks) => {
    set({ allStocks: stocks });
  },

  setLoadingAllStocks: (loading) => {
    set({ loadingAllStocks: loading });
  },

  // 手动排序：上移
  moveStockUp: (code) => {
    const { watchList } = get();
    const index = watchList.findIndex((s) => s.code === code);
    if (index > 0) {
      const newList = [...watchList];
      [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
      set({ watchList: newList, isManualSort: true });
      get().saveWatchList();
    }
  },

  // 手动排序：下移
  moveStockDown: (code) => {
    const { watchList } = get();
    const index = watchList.findIndex((s) => s.code === code);
    if (index >= 0 && index < watchList.length - 1) {
      const newList = [...watchList];
      [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
      set({ watchList: newList, isManualSort: true });
      get().saveWatchList();
    }
  },

  // 手动排序：置顶
  moveStockToTop: (code) => {
    const { watchList } = get();
    const index = watchList.findIndex((s) => s.code === code);
    if (index > 0) {
      const newList = [...watchList];
      const [item] = newList.splice(index, 1);
      newList.unshift(item);
      set({ watchList: newList, isManualSort: true });
      get().saveWatchList();
    }
  },

  // 手动排序：置尾
  moveStockToBottom: (code) => {
    const { watchList } = get();
    const index = watchList.findIndex((s) => s.code === code);
    if (index >= 0 && index < watchList.length - 1) {
      const newList = [...watchList];
      const [item] = newList.splice(index, 1);
      newList.push(item);
      set({ watchList: newList, isManualSort: true });
      get().saveWatchList();
    }
  },
}));
