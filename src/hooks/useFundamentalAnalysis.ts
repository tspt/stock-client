/**
 * 基本面分析数据Hook
 */

import { useState, useEffect } from 'react';
import { getFundamentalAnalysis } from '@/services/fundamental';
import type { FundamentalAnalysis } from '@/types/stock';

export function useFundamentalAnalysis(code: string) {
  const [data, setData] = useState<FundamentalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!code) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getFundamentalAnalysis(code)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('获取基本面数据失败'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return {
    data,
    loading,
    error,
  };
}
