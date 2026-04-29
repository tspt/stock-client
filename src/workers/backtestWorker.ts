import type { KLineData } from '@/types/stock';
import { runBacktestScreening } from '@/utils/analysis/backtestUtils';

interface BacktestRequest {
  requestId: string;
  code: string;
  name: string;
  klineData: KLineData[];
}

interface BacktestSignal {
  code: string;
  name: string;
  signalDate: string; // YYYY-MM-DD
  entryPrice: number;
  returns: {
    day3?: { value: number; actualDays: number }; // 可选，数据不足时为空
    day5?: { value: number; actualDays: number };
    day10?: { value: number; actualDays: number }; // 两周
    day20?: { value: number; actualDays: number }; // 一个月
  };
}

interface BacktestProgress {
  requestId: string;
  progress: number; // 0-100
  current: number;
  total: number;
}

interface BacktestResult {
  requestId: string;
  signals: BacktestSignal[];
}

self.onmessage = (e: MessageEvent<BacktestRequest>) => {
  const { requestId, code, name, klineData } = e.data;
  const signals: BacktestSignal[] = [];
  const len = klineData.length;

  if (len < 60) {
    self.postMessage({ type: 'result', requestId, signals });
    return;
  }

  // 回测所有可能的信号日期
  // startIndex: 至少需要30天历史数据才能进行形态识别
  // endIndex: 回测到最后一天，确保最近信号被统计
  const startIndex = 30;
  const endIndex = len - 1; // 回测到最后一天

  for (let i = startIndex; i <= endIndex; i++) {
    const historicalData = klineData.slice(0, i + 1);
    const lastK = historicalData[historicalData.length - 1];

    // 调用真实的筛选逻辑
    const isMatched = runBacktestScreening(klineData, i);

    if (isMatched) {
      const entryPrice = lastK.close;
      const calculateReturn = (offset: number) => {
        const futureIndex = Math.min(i + offset, len - 1);
        if (futureIndex > i) {
          // 至少有1天未来数据
          const futurePrice = klineData[futureIndex].close;
          const actualDays = futureIndex - i;
          return {
            value: Number((((futurePrice - entryPrice) / entryPrice) * 100).toFixed(2)),
            actualDays: actualDays,
          };
        }
        return undefined; // 返回 undefined 表示没有未来数据
      };

      const dateObj = new Date(lastK.time);
      const signalDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(dateObj.getDate()).padStart(2, '0')}`;

      signals.push({
        code,
        name,
        signalDate,
        entryPrice,
        returns: {
          day3: calculateReturn(3),
          day5: calculateReturn(5),
          day10: calculateReturn(10), // 两周
          day20: calculateReturn(20), // 一个月
        },
      });
    }

    if ((i - startIndex) % 100 === 0) {
      const progress = Math.round(((i - startIndex) / (endIndex - startIndex)) * 100);
      self.postMessage({
        type: 'progress',
        requestId,
        progress,
        current: i,
        total: endIndex,
      });
    }
  }

  self.postMessage({ type: 'result', requestId, signals });
};
