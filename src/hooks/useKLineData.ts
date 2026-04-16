/**
 * K线数据管理Hook
 */

import { useState, useEffect } from 'react';
import { getKLineData } from '@/services/stocks';
import { KLINE_POLLING_INTERVAL_MS } from '@/utils/constants';
import { usePolling } from './usePolling';
import { klineCache } from '@/utils/klineCache';
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

  // 加载K线数据（带缓存）
  const fetchData = async () => {
    if (!code) {
      setData([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 先尝试从缓存获取
      const cachedData = klineCache.get(code, period);
      if (cachedData && cachedData.length > 0) {
        console.log(`[KLine Cache Hit] ${code} ${period}`);
        setData(cachedData);
        setLoading(false);
        return;
      }

      console.log(`[KLine Cache Miss] ${code} ${period}, fetching from API...`);

      // 根据周期决定加载数量
      const count =
        period === 'year'
          ? 3650 // 10年
          : period === 'month'
          ? 120 // 10年按月
          : period === 'week'
          ? 520 // 10年按周
          : 1000; // 日K及其他

      const klineData = await getKLineData(code, period, count);

      // 存入缓存
      if (klineData && klineData.length > 0) {
        klineCache.set(code, period, klineData);
      }

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
            let updated: KLineData[];
            if (lastItem.time === newItem.time) {
              updated = [...prev];
              updated[updated.length - 1] = newItem;
            } else {
              updated = [...prev, newItem];
            }

            // 更新缓存
            klineCache.set(code, period, updated);
            return updated;
          });
        }
      } catch (err) {
        // 静默失败，不影响用户体验
      }
    },
    {
      enabled: enablePolling && code !== null,
      immediate: false,
      interval: KLINE_POLLING_INTERVAL_MS,
    }
  );

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}
