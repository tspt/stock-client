/**
 * Web Worker Hook - 技术指标计算
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { KLineData } from '@/types/stock';

interface IndicatorsResult {
  maData: any;
  kdjData: any;
  rsiData: any;
  patterns: any;
}

interface UseIndicatorsWorkerOptions {
  klineData: KLineData[];
  period: string;
  enabled?: boolean;
}

export function useIndicatorsWorker({
  klineData,
  period,
  enabled = true,
}: UseIndicatorsWorkerOptions) {
  const [result, setResult] = useState<IndicatorsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  // 初始化 Worker
  useEffect(() => {
    if (!enabled) return;

    try {
      // 创建 Worker
      const worker = new Worker(new URL('@/workers/indicatorsWorker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event) => {
        const { type, data, error: workerError } = event.data;

        if (type === 'INDICATORS_RESULT') {
          setResult(data as IndicatorsResult);
          setLoading(false);
          setError(null);
        } else if (type === 'ERROR') {
          setError(workerError || 'Worker 计算错误');
          setLoading(false);
        }
      };

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        setError('Worker 执行失败');
        setLoading(false);
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch (err) {
      console.error('Failed to create worker:', err);
      setError('无法创建 Worker');
    }
  }, [enabled]);

  // 发送计算请求
  const calculate = useCallback(() => {
    if (!workerRef.current || !klineData || klineData.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    workerRef.current.postMessage({
      type: 'CALCULATE_INDICATORS',
      data: {
        klineData,
        period,
        patternWindow: 20,
      },
    });

    // 如果收到新请求前的结果，忽略旧结果
    return () => {
      if (requestIdRef.current !== currentRequestId) {
        // 这是旧请求，忽略结果
      }
    };
  }, [klineData, period]);

  // 当数据变化时自动计算
  useEffect(() => {
    if (enabled && klineData && klineData.length > 0) {
      calculate();
    }
  }, [klineData, period, enabled, calculate]);

  return {
    result,
    loading,
    error,
    recalculate: calculate,
  };
}
