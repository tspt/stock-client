/**
 * 获取所有股票列表的Hook
 */

import { useEffect } from 'react';
import { getAllStocks } from '@/services/stockApi';
import { useStockStore } from '@/stores/stockStore';

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

    const fetchAllStocks = async () => {
      setLoadingAllStocks(true);
      try {
        const stocks = await getAllStocks();
        setAllStocks(stocks);
        console.log(`[股票列表] 已加载 ${stocks.length} 只股票`);
      } catch (error) {
        console.error('[股票列表] 加载失败:', error);
      } finally {
        setLoadingAllStocks(false);
      }
    };

    fetchAllStocks();
  }, [allStocks.length, setAllStocks, setLoadingAllStocks]);

  return {
    allStocks,
    loadingAllStocks,
  };
}

