/**
 * 股票数据状态管理
 */

import { create } from 'zustand';
import type { StockInfo, StockQuote, SortType, Group, StockWatchListData } from '@/types/stock';
import { getStorage, setStorage } from '@/utils/storage';
import { STORAGE_KEYS, DEFAULT_GROUP_ID, MAX_GROUP_COUNT } from '@/utils/constants';
import {
  migrateOldWatchList,
  isOldFormat,
  generateGroupId,
  getDefaultGroup,
  validateGroupName,
} from '@/utils/groupUtils';
import { message, Modal } from 'antd';

interface StockState {
  // 自选股列表
  watchList: StockInfo[];
  // 分组列表
  groups: Group[];
  // 当前选中的分组ID（null表示"全部"）
  selectedGroupId: string | null;
  // 分组管理弹窗显示状态
  groupManagerVisible: boolean;
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
  addStock: (stock: StockInfo, groupIds?: string[]) => void;
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
  // 分组管理Actions
  setGroups: (groups: Group[]) => void;
  addGroup: (group: Omit<Group, 'id' | 'order'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => Promise<void>;
  setSelectedGroupId: (id: string | null) => void;
  setGroupManagerVisible: (visible: boolean) => void;
  addStockToGroups: (stockCode: string, groupIds: string[]) => void;
  removeStockFromGroup: (stockCode: string, groupId: string) => void;
  moveGroup: (id: string, direction: 'up' | 'down') => void;
  reorderGroups: (groups: Group[]) => void;
  loadGroups: () => void;
  saveGroups: () => void;
  migrateWatchListData: () => void;
}

export const useStockStore = create<StockState>((set, get) => ({
  watchList: [],
  groups: [],
  selectedGroupId: null,
  groupManagerVisible: false,
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

  addStock: (stock, groupIds) => {
    const { watchList } = get();
    // 检查是否已存在
    if (!watchList.find((s) => s.code === stock.code)) {
      // 如果未指定分组，不添加到任何分组（groupIds为空数组或undefined）
      const newStock: StockInfo = {
        ...stock,
        groupIds: groupIds && groupIds.length > 0 ? groupIds : undefined,
      };
      const newList = [...watchList, newStock];
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
    // 先尝试迁移数据
    get().migrateWatchListData();
    
    // 加载新格式数据
    const saved = getStorage<StockWatchListData | StockInfo[]>(
      STORAGE_KEYS.WATCH_LIST,
      { groups: [], watchList: [] }
    );

    // 检查是否为旧格式
    if (isOldFormat(saved)) {
      // 如果还是旧格式，再次迁移
      const migrated = migrateOldWatchList(saved);
      set({ groups: migrated.groups, watchList: migrated.watchList });
      get().saveWatchList();
    } else {
      // 新格式
      const data = saved as StockWatchListData;
      set({ 
        groups: data.groups || [], 
        watchList: data.watchList || [] 
      });
    }
  },

  saveWatchList: () => {
    const { watchList, groups } = get();
    const data: StockWatchListData = {
      groups: groups || [],
      watchList: watchList || [],
    };
    setStorage(STORAGE_KEYS.WATCH_LIST, data);
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

  // ========== 分组管理Actions ==========

  setGroups: (groups) => {
    set({ groups });
    get().saveWatchList();
  },

  addGroup: (group) => {
    const { groups } = get();
    
    // 检查分组数量限制
    if (groups.length >= MAX_GROUP_COUNT) {
      message.warning(`最多只能创建 ${MAX_GROUP_COUNT} 个分组`);
      return;
    }

    // 验证分组名称
    if (!validateGroupName(group.name)) {
      message.error('分组名称只能包含中文、英文、数字，且长度不超过10个字符');
      return;
    }

    // 检查名称重复
    if (groups.some((g) => g.name === group.name)) {
      message.error('分组名称已存在');
      return;
    }

    const newGroup: Group = {
      ...group,
      id: generateGroupId(),
      order: groups.length > 0 ? Math.max(...groups.map((g) => g.order)) + 1 : 1,
    };

    const newGroups = [...groups, newGroup].sort((a, b) => a.order - b.order);
    set({ groups: newGroups });
    get().saveWatchList();
    message.success('分组创建成功');
  },

  updateGroup: (id, updates) => {
    const { groups } = get();

    // 如果更新名称，验证并检查重复
    if (updates.name) {
      if (!validateGroupName(updates.name)) {
        message.error('分组名称只能包含中文、英文、数字，且长度不超过10个字符');
        return;
      }
      if (groups.some((g) => g.id !== id && g.name === updates.name)) {
        message.error('分组名称已存在');
        return;
      }
    }

    const newGroups = groups.map((g) => (g.id === id ? { ...g, ...updates } : g));
    set({ groups: newGroups });
    get().saveWatchList();
    message.success('分组更新成功');
  },

  deleteGroup: async (id) => {
    const { groups, watchList } = get();
    const group = groups.find((g) => g.id === id);
    if (!group) {
      return;
    }

    // 查找该分组下的股票
    const stocksInGroup = watchList.filter(
      (stock) => stock.groupIds && stock.groupIds.includes(id)
    );

    // 确认删除
    Modal.confirm({
      title: '确认删除分组',
      content: `确定要删除分组"${group.name}"吗？该分组下的 ${stocksInGroup.length} 只股票将一起被删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        // 如果股票数量较多，显示进度
        if (stocksInGroup.length > 10) {
          const hide = message.loading('正在删除分组和股票...', 0);
          
          // 模拟进度（实际删除很快，这里主要是用户体验）
          await new Promise((resolve) => setTimeout(resolve, 500));
          
          // 删除分组和关联的股票
          const stockCodesToRemove = stocksInGroup.map((s) => s.code);
          const newWatchList = watchList.filter(
            (stock) => !stockCodesToRemove.includes(stock.code)
          );
          const newGroups = groups.filter((g) => g.id !== id);
          
          // 更新排序
          const reorderedGroups = newGroups
            .map((g, index) => ({ ...g, order: index }))
            .sort((a, b) => a.order - b.order);

          set({ groups: reorderedGroups, watchList: newWatchList });
          get().saveWatchList();
          
          hide();
          message.success(`已删除分组"${group.name}"及 ${stocksInGroup.length} 只股票`);
        } else {
          // 直接删除
          const stockCodesToRemove = stocksInGroup.map((s) => s.code);
          const newWatchList = watchList.filter(
            (stock) => !stockCodesToRemove.includes(stock.code)
          );
          const newGroups = groups.filter((g) => g.id !== id);
          
          // 更新排序
          const reorderedGroups = newGroups
            .map((g, index) => ({ ...g, order: index }))
            .sort((a, b) => a.order - b.order);

          set({ groups: reorderedGroups, watchList: newWatchList });
          get().saveWatchList();
          message.success(`已删除分组"${group.name}"及 ${stocksInGroup.length} 只股票`);
        }
      },
    });
  },

  setSelectedGroupId: (id) => {
    set({ selectedGroupId: id });
  },

  setGroupManagerVisible: (visible) => {
    set({ groupManagerVisible: visible });
  },

  addStockToGroups: (stockCode, groupIds) => {
    const { watchList } = get();
    const newWatchList = watchList.map((stock) =>
      stock.code === stockCode
        ? { ...stock, groupIds: [...new Set(groupIds)] }
        : stock
    );
    set({ watchList: newWatchList });
    get().saveWatchList();
  },

  removeStockFromGroup: (stockCode, groupId) => {
    const { watchList } = get();
    const newWatchList = watchList.map((stock) => {
      if (stock.code === stockCode && stock.groupIds) {
        const newGroupIds = stock.groupIds.filter((id) => id !== groupId);
        // 如果移除后没有分组了，groupIds设为undefined（表示不属于任何分组）
        return {
          ...stock,
          groupIds: newGroupIds.length > 0 ? newGroupIds : undefined,
        };
      }
      return stock;
    });
    set({ watchList: newWatchList });
    get().saveWatchList();
  },

  moveGroup: (id, direction) => {
    const { groups } = get();
    const index = groups.findIndex((g) => g.id === id);
    if (index === -1) return;

    const newGroups = [...groups];
    if (direction === 'up' && index > 0) {
      [newGroups[index - 1], newGroups[index]] = [newGroups[index], newGroups[index - 1]];
    } else if (direction === 'down' && index < newGroups.length - 1) {
      [newGroups[index], newGroups[index + 1]] = [newGroups[index + 1], newGroups[index]];
    }

    // 更新排序
    const reorderedGroups = newGroups.map((g, i) => ({ ...g, order: i }));
    set({ groups: reorderedGroups });
    get().saveWatchList();
  },

  reorderGroups: (newGroups) => {
    // 更新排序
    const reorderedGroups = newGroups.map((g, index) => ({ ...g, order: index }));
    set({ groups: reorderedGroups });
    get().saveWatchList();
  },

  loadGroups: () => {
    const { groups } = get();
    if (groups.length === 0) {
      get().loadWatchList();
    }
  },

  saveGroups: () => {
    get().saveWatchList();
  },

  migrateWatchListData: () => {
    const saved = getStorage<StockWatchListData | StockInfo[]>(
      STORAGE_KEYS.WATCH_LIST,
      null
    );

    if (!saved) {
      // 如果没有数据，初始化为空
      set({ groups: [], watchList: [] });
      get().saveWatchList();
      return;
    }

    // 如果是旧格式，进行迁移
    if (isOldFormat(saved)) {
      const migrated = migrateOldWatchList(saved);
      set({ groups: migrated.groups, watchList: migrated.watchList });
      get().saveWatchList();
    }
  },
}));
