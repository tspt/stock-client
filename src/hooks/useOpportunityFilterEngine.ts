import { useEffect, useRef, useState, useCallback } from 'react';
import type { KLineData, StockOpportunityData } from '@/types/stock';
import type { FilterSkippedItem, OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import type { OpportunityFilterWorkerResponse } from '@/workers/opportunityFilterWorkerTypes';
import { MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES } from '@/utils/constants';

function passLightFilters(item: StockOpportunityData, filters: OpportunityFilterSnapshot): boolean {
  if (filters.priceRange.min !== undefined && item.price < filters.priceRange.min) return false;
  if (filters.priceRange.max !== undefined && item.price > filters.priceRange.max) return false;

  if (filters.marketCapRange.min !== undefined) {
    if (item.marketCap === null || item.marketCap === undefined) return false;
    if (item.marketCap < filters.marketCapRange.min) return false;
  }
  if (filters.marketCapRange.max !== undefined) {
    if (item.marketCap === null || item.marketCap === undefined) return false;
    if (item.marketCap > filters.marketCapRange.max) return false;
  }

  if (filters.turnoverRateRange.min !== undefined) {
    if (item.turnoverRate === null || item.turnoverRate === undefined) return false;
    if (item.turnoverRate < filters.turnoverRateRange.min) return false;
  }
  if (filters.turnoverRateRange.max !== undefined) {
    if (item.turnoverRate === null || item.turnoverRate === undefined) return false;
    if (item.turnoverRate > filters.turnoverRateRange.max) return false;
  }

  if (filters.peRatioRange.min !== undefined) {
    if (item.peRatio === null || item.peRatio === undefined) return false;
    if (item.peRatio < filters.peRatioRange.min) return false;
  }
  if (filters.peRatioRange.max !== undefined) {
    if (item.peRatio === null || item.peRatio === undefined) return false;
    if (item.peRatio > filters.peRatioRange.max) return false;
  }

  if (filters.kdjJRange.min !== undefined || filters.kdjJRange.max !== undefined) {
    if (item.kdjJ === null || item.kdjJ === undefined) return false;
    if (filters.kdjJRange.min !== undefined && item.kdjJ < filters.kdjJRange.min) return false;
    if (filters.kdjJRange.max !== undefined && item.kdjJ > filters.kdjJRange.max) return false;
  }

  return true;
}

/** 与 K 线缓存条数上限一致；超出时优先保留缓存命中的标的，再按原顺序补足 */
function capAnalysisDataForWorker(
  lightFiltered: StockOpportunityData[],
  klineDataCache: Map<string, KLineData[]>,
  max: number
): StockOpportunityData[] {
  if (lightFiltered.length <= max) {
    return lightFiltered;
  }
  const withKline: StockOpportunityData[] = [];
  const withoutKline: StockOpportunityData[] = [];
  for (let i = 0; i < lightFiltered.length; i++) {
    const item = lightFiltered[i];
    if (klineDataCache.has(item.code)) {
      withKline.push(item);
    } else {
      withoutKline.push(item);
    }
  }
  if (withKline.length >= max) {
    return withKline.slice(0, max);
  }
  return withKline.concat(withoutKline.slice(0, max - withKline.length));
}

interface UseOpportunityFilterEngineArgs {
  analysisData: StockOpportunityData[];
  klineDataCache: Map<string, KLineData[]>;
  filters: OpportunityFilterSnapshot;
}

interface UseOpportunityFilterEngineResult {
  filteredData: StockOpportunityData[];
  filtering: boolean;
  skipped: FilterSkippedItem[];
}

export function useOpportunityFilterEngine({
  analysisData,
  klineDataCache,
  filters,
}: UseOpportunityFilterEngineArgs): UseOpportunityFilterEngineResult {
  const [filteredData, setFilteredData] = useState<StockOpportunityData[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [skipped, setSkipped] = useState<FilterSkippedItem[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const activeRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const previousKlineCacheRef = useRef<Map<string, KLineData[]> | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFiltersRef = useRef<OpportunityFilterSnapshot | null>(null);
  const pendingAnalysisDataRef = useRef<StockOpportunityData[] | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/opportunityFilterWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<OpportunityFilterWorkerResponse>) => {
      const result = event.data;
      if (result.type !== 'result') {
        return;
      }
      if (result.requestId !== activeRequestIdRef.current) {
        return;
      }
      if (result.cancelled) {
        return;
      }

      setFilteredData(result.data);
      setSkipped(result.skipped);
      setFiltering(false);
    };

    worker.onerror = () => {
      setFiltering(false);
      setSkipped((prev) => [
        ...prev,
        { code: 'worker', name: '筛选引擎', reason: '筛选 Worker 运行异常，已停止本次筛选' },
      ]);
    };

    worker.onmessageerror = () => {
      setFiltering(false);
      setSkipped((prev) => [
        ...prev,
        { code: 'worker', name: '筛选引擎', reason: '筛选 Worker 通讯异常，已停止本次筛选' },
      ]);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    const previousCache = previousKlineCacheRef.current;
    if (!previousCache) {
      worker.postMessage({
        type: 'set-data-full',
        klineDataEntries: Array.from(klineDataCache.entries()),
      });
      previousKlineCacheRef.current = new Map(klineDataCache);
      setDataVersion((prev) => prev + 1);
      return;
    }

    const upsertEntries: Array<[string, KLineData[]]> = [];
    const removeCodes: string[] = [];

    klineDataCache.forEach((klineData, code) => {
      const previousData = previousCache.get(code);
      if (previousData !== klineData) {
        upsertEntries.push([code, klineData]);
      }
    });

    previousCache.forEach((_data, code) => {
      if (!klineDataCache.has(code)) {
        removeCodes.push(code);
      }
    });

    const changedCount = upsertEntries.length + removeCodes.length;
    if (changedCount === 0) {
      return;
    }

    const baseline = Math.max(previousCache.size, klineDataCache.size, 1);
    const changedRatio = changedCount / baseline;

    if (changedRatio > 0.35) {
      worker.postMessage({
        type: 'set-data-full',
        klineDataEntries: Array.from(klineDataCache.entries()),
      });
    } else {
      worker.postMessage({
        type: 'set-data-patch',
        upsertEntries,
        removeCodes,
      });
    }

    previousKlineCacheRef.current = new Map(klineDataCache);
    setDataVersion((prev) => prev + 1);
  }, [klineDataCache]);

  // 防抖执行筛选任务
  const executeFilterTask = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    const currentAnalysisData = pendingAnalysisDataRef.current;
    const currentFilters = pendingFiltersRef.current;

    if (!currentAnalysisData || !currentFilters) {
      return;
    }

    if (currentAnalysisData.length === 0) {
      const previousRequestId = activeRequestIdRef.current;
      if (previousRequestId > 0) {
        worker.postMessage({ type: 'cancel', requestId: previousRequestId });
      }
      // 推进请求代号，阻止旧任务回写空结果。
      activeRequestIdRef.current = ++requestIdRef.current;
      setFilteredData([]);
      setSkipped([]);
      setFiltering(false);
      return;
    }

    const lightFiltered = currentAnalysisData.filter((item) =>
      passLightFilters(item, currentFilters)
    );
    const analysisDataForWorker = capAnalysisDataForWorker(
      lightFiltered,
      klineDataCache,
      MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES
    );
    const requestId = ++requestIdRef.current;
    const previousRequestId = activeRequestIdRef.current;
    activeRequestIdRef.current = requestId;

    if (previousRequestId > 0) {
      worker.postMessage({ type: 'cancel', requestId: previousRequestId });
    }

    setFiltering(true);

    worker.postMessage({
      type: 'filter',
      requestId,
      analysisData: analysisDataForWorker,
      filters: currentFilters,
    });
  }, [klineDataCache]);

  // 触发防抖筛选
  const triggerDebouncedFilter = useCallback(() => {
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 设置新的定时器，300ms 后执行
    debounceTimerRef.current = setTimeout(() => {
      executeFilterTask();
    }, 300);
  }, [executeFilterTask]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    // 更新待处理的筛选参数
    pendingFiltersRef.current = filters;
    pendingAnalysisDataRef.current = analysisData;

    // 触发防抖筛选
    triggerDebouncedFilter();

    // 清理函数
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [analysisData, filters, dataVersion, triggerDebouncedFilter]);

  return {
    filteredData,
    filtering,
    skipped,
  };
}
