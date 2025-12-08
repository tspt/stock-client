/**
 * 股票详情数据管理Hook
 */

import { useState, useEffect } from 'react';
import { getStockDetail } from '@/services/stockApi';
import { usePolling } from './usePolling';
import type { StockDetail } from '@/types/stock';

/**
 * 股票详情数据管理Hook
 * @param code 股票代码
 * @param enablePolling 是否启用轮询更新
 */
export function useStockDetail(
  code: string | null,
  enablePolling: boolean = false
) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDetail = async () => {
    if (!code) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getStockDetail(code);
      setDetail(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('获取股票详情失败');
      setError(error);
      console.error('[股票详情] 获取失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // 轮询更新
  usePolling(fetchDetail, {
    enabled: enablePolling && !!code,
    interval: 30000, // 30秒更新一次（详情数据更新频率较低）
  });

  return {
    detail,
    loading,
    error,
    refetch: fetchDetail,
  };
}

