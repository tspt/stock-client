/**
 * 获取所有股票列表的Hook
 */

import { useEffect } from 'react';
import { getAllStocks } from '@/services/stockApi';
import { useStockStore } from '@/stores/stockStore';

// 模块级别的 Promise 缓存，确保同一请求只执行一次
let loadingPromise: Promise<void> | null = null;

/**
 * 获取所有股票列表Hook
 */
export function useAllStocks() {
  const { allStocks, loadingAllStocks, setAllStocks, setLoadingAllStocks } = useStockStore();

  useEffect(() => {
    // 如果已经有数据，不再重复加载
    if (allStocks.length > 0) {
      return;
    }

    // 如果正在加载中，不再重复调用
    if (loadingAllStocks || loadingPromise) {
      return;
    }

    // 创建并缓存 Promise，确保只执行一次
    loadingPromise = (async () => {
      setLoadingAllStocks(true);
      try {
        const stocks = await getAllStocks();
        setAllStocks(stocks);
      } catch (error) {
      } finally {
        setLoadingAllStocks(false);
        loadingPromise = null;
      }
    })();
  }, [allStocks.length, loadingAllStocks, setAllStocks, setLoadingAllStocks]);

  return {
    allStocks,
    loadingAllStocks,
  };
}
