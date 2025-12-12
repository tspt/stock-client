/**
 * 股票列表管理Hook
 */

import { useEffect, useMemo } from 'react';
import { useStockStore } from '@/stores/stockStore';
import { useAlertStore } from '@/stores/alertStore';
import { getStockQuotes } from '@/services/stockApi';
import { usePolling } from './usePolling';
import type { SortType } from '@/types/stock';

/**
 * 股票列表管理Hook
 */
export function useStockList() {
  const {
    watchList,
    quotes,
    sortType,
    selectedGroupId,
    loadWatchList,
    updateQuotes,
    setSortType,
  } = useStockStore();
  const { checkAlerts, loadAlerts } = useAlertStore();

  // 加载自选股列表和提醒列表
  useEffect(() => {
    loadWatchList();
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取股票行情
  const fetchQuotes = async () => {
    if (watchList.length === 0) {
      return;
    }
    const codes = watchList.map((s) => s.code);
    const newQuotes = await getStockQuotes(codes);
    updateQuotes(newQuotes);
    
    // 行情更新后检查提醒（使用最新的quotes）
    const currentQuotes = useStockStore.getState().quotes;
    const updatedQuotes = { ...currentQuotes };
    newQuotes.forEach((quote) => {
      updatedQuotes[quote.code] = quote;
    });
    checkAlerts(updatedQuotes);
  };

  // 轮询更新行情
  usePolling(fetchQuotes, {
    enabled: watchList.length > 0,
    immediate: true,
  });

  // 筛选和排序后的列表
  const sortedList = useMemo(() => {
    const { isManualSort } = useStockStore.getState();
    let list = [...watchList];

    // 先按分组筛选
    if (selectedGroupId !== null) {
      list = list.filter(
        (stock) => stock.groupIds && stock.groupIds.includes(selectedGroupId)
      );
    }

    // 如果是手动排序，直接返回筛选后的列表
    if (isManualSort) {
      return list;
    }

    // 否则应用自动排序
    if (sortType === 'default') {
      return list;
    }

    return list.sort((a, b) => {
      const quoteA = quotes[a.code];
      const quoteB = quotes[b.code];

      if (!quoteA || !quoteB) {
        return 0;
      }

      if (sortType === 'rise') {
        return quoteB.changePercent - quoteA.changePercent;
      } else if (sortType === 'fall') {
        return quoteA.changePercent - quoteB.changePercent;
      }

      return 0;
    });
  }, [watchList, quotes, sortType, selectedGroupId]);

  return {
    watchList: sortedList,
    quotes,
    sortType,
    setSortType,
  };
}

