import { useEffect, useRef, useState } from 'react';
import type { KLineData, StockOpportunityData } from '@/types/stock';
import type { FilterSkippedItem, OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import type { OpportunityFilterWorkerResponse } from '@/workers/opportunityFilterWorkerTypes';

function passLightFilters(item: StockOpportunityData, filters: OpportunityFilterSnapshot): boolean {
  if (filters.priceRange.min !== undefined && item.price < filters.priceRange.min) return false;
  if (filters.priceRange.max !== undefined && item.price > filters.priceRange.max) return false;

  if (filters.marketCapRange.min !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
    if (item.marketCap < filters.marketCapRange.min) return false;
  }
  if (filters.marketCapRange.max !== undefined && item.marketCap !== null && item.marketCap !== undefined) {
    if (item.marketCap > filters.marketCapRange.max) return false;
  }

  if (filters.turnoverRateRange.min !== undefined && item.turnoverRate !== null && item.turnoverRate !== undefined) {
    if (item.turnoverRate < filters.turnoverRateRange.min) return false;
  }
  if (filters.turnoverRateRange.max !== undefined && item.turnoverRate !== null && item.turnoverRate !== undefined) {
    if (item.turnoverRate > filters.turnoverRateRange.max) return false;
  }

  if (filters.peRatioRange.min !== undefined && item.peRatio !== null && item.peRatio !== undefined) {
    if (item.peRatio < filters.peRatioRange.min) return false;
  }
  if (filters.peRatioRange.max !== undefined && item.peRatio !== null && item.peRatio !== undefined) {
    if (item.peRatio > filters.peRatioRange.max) return false;
  }

  if (item.kdjJ !== null && item.kdjJ !== undefined) {
    if (filters.kdjJRange.min !== undefined && item.kdjJ < filters.kdjJRange.min) return false;
    if (filters.kdjJRange.max !== undefined && item.kdjJ > filters.kdjJRange.max) return false;
  }

  return true;
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

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    if (analysisData.length === 0) {
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

    const lightFiltered = analysisData.filter((item) => passLightFilters(item, filters));
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
      analysisData: lightFiltered,
      filters,
    });
  }, [analysisData, filters, dataVersion]);

  return {
    filteredData,
    filtering,
    skipped,
  };
}
