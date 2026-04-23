/**
 * 技术指标计算 Web Worker
 * 将耗时的指标计算移到 Worker 线程，避免阻塞主线程
 */

import type { KLineData } from '@/types/stock';
import { calculateAllMA, calculateKDJ, calculateAllRSI } from '@/utils/analysis/indicators';
import { detectCandlestickPatternsInWindow } from '@/utils/analysis/candlestickPatterns';

interface WorkerMessage {
  type: 'CALCULATE_INDICATORS';
  data: {
    klineData: KLineData[];
    period: string;
    patternWindow?: number;
  };
}

interface WorkerResponse {
  type: 'INDICATORS_RESULT' | 'ERROR';
  data?: {
    maData: ReturnType<typeof calculateAllMA>;
    kdjData: ReturnType<typeof calculateKDJ>;
    rsiData: ReturnType<typeof calculateAllRSI>;
    patterns: ReturnType<typeof detectCandlestickPatternsInWindow>;
  };
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;

  if (type === 'CALCULATE_INDICATORS') {
    try {
      const { klineData, period, patternWindow = 20 } = data;

      // 并行计算所有指标
      const maData = calculateAllMA(klineData);
      const kdjData = calculateKDJ(klineData);
      const rsiData = calculateAllRSI(klineData);
      const patterns = detectCandlestickPatternsInWindow(klineData, patternWindow);

      const response: WorkerResponse = {
        type: 'INDICATORS_RESULT',
        data: {
          maData,
          kdjData,
          rsiData,
          patterns,
        },
      };

      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  }
};

export {};
