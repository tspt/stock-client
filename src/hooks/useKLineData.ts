/**
 * K线数据管理Hook
 */

import { useState, useEffect } from 'react';
import { getKLineData } from '@/services/stockApi';
import { usePolling } from './usePolling';
import type { KLineData, KLinePeriod } from '@/types/stock';

interface UseKLineDataOptions {
  /** 股票代码 */
  code: string | null;
  /** K线周期 */
  period: KLinePeriod;
  /** 是否启用轮询更新 */
  enablePolling?: boolean;
}

/**
 * K线数据管理Hook
 */
export function useKLineData(options: UseKLineDataOptions) {
  const { code, period, enablePolling = false } = options;
  const [data, setData] = useState<KLineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 加载K线数据
  const fetchData = async () => {
    if (!code) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 根据周期决定加载数量
      const count = period === 'year' ? 3650 : // 10年
                    period === 'month' ? 120 :  // 10年按月
                    period === 'week' ? 520 :  // 10年按周
                    1000; // 日K及其他

      const klineData = await getKLineData(code, period, count);
      setData(klineData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('加载K线数据失败'));
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和周期变化时重新加载
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, period]);

  // 轮询更新（仅更新最新数据）
  usePolling(
    async () => {
      if (!code || !enablePolling) {
        return;
      }
      try {
        // 只获取最新几条数据，然后合并到现有数据
        const latestData = await getKLineData(code, period, 1);
        if (latestData.length > 0) {
          setData((prev) => {
            if (prev.length === 0) {
              return latestData;
            }
            const lastItem = prev[prev.length - 1];
            const newItem = latestData[0];
            // 如果时间相同，更新数据；否则添加新数据
            if (lastItem.time === newItem.time) {
              const updated = [...prev];
              updated[updated.length - 1] = newItem;
              return updated;
            } else {
              return [...prev, newItem];
            }
          });
        }
      } catch (err) {
      }
    },
    {
      enabled: enablePolling && code !== null,
      immediate: false,
    }
  );

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

