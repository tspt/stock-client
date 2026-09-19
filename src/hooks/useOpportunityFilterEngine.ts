import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { KLineData, StockOpportunityData, TradingSignal } from '@/types/stock';
import type { FilterSkippedItem, OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import type { OpportunityFilterWorkerOutboundMessage } from '@/workers/opportunityFilterWorkerTypes';

/** 对外暴露 signalMap 时用于替代 null 的空映射（保持引用稳定） */
const EMPTY_SIGNAL_MAP: Map<string, TradingSignal> = new Map();

export interface AIRecomputeProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface AIRecomputeResult {
  data: StockOpportunityData[];
  updatedCount: number;
  skippedCount: number;
}

function passLightFilters(item: StockOpportunityData, filters: OpportunityFilterSnapshot): boolean {
  const nameType = filters.nameType ?? 'all';
  if (nameType === 'st' || nameType === 'non_st') {
    const isST = (item.name || '').includes('ST');
    if (nameType === 'st' && !isST) return false;
    if (nameType === 'non_st' && isST) return false;
  }

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

  if (filters.totalSharesRange.min !== undefined) {
    if (item.totalShares === null || item.totalShares === undefined) return false;
    // totalShares 单位是股，筛选条件单位是亿，需要转换
    const totalSharesInYi = item.totalShares / 1e8;
    if (totalSharesInYi < filters.totalSharesRange.min) return false;
  }
  if (filters.totalSharesRange.max !== undefined) {
    if (item.totalShares === null || item.totalShares === undefined) return false;
    // totalShares 单位是股，筛选条件单位是亿，需要转换
    const totalSharesInYi = item.totalShares / 1e8;
    if (totalSharesInYi > filters.totalSharesRange.max) return false;
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

  // 总营收 / 归母净利润（筛选单位：亿元；数据需先点「获取营收净利润」才有）
  const revenueRange = filters.financeRevenueRange;
  if (revenueRange && (revenueRange.min !== undefined || revenueRange.max !== undefined)) {
    const revenue = item.finance?.revenue;
    if (revenue === null || revenue === undefined) return false;
    const revenueInYi = revenue / 1e8;
    if (revenueRange.min !== undefined && revenueInYi < revenueRange.min) return false;
    if (revenueRange.max !== undefined && revenueInYi > revenueRange.max) return false;
  }

  const netProfitRange = filters.financeNetProfitRange;
  if (netProfitRange && (netProfitRange.min !== undefined || netProfitRange.max !== undefined)) {
    const netProfit = item.finance?.netProfit;
    if (netProfit === null || netProfit === undefined) return false;
    const netProfitInYi = netProfit / 1e8;
    if (netProfitRange.min !== undefined && netProfitInYi < netProfitRange.min) return false;
    if (netProfitRange.max !== undefined && netProfitInYi > netProfitRange.max) return false;
  }

  return true;
}

interface UseOpportunityFilterEngineArgs {
  analysisData: StockOpportunityData[];
  klineDataCache: Map<string, KLineData[]>;
  filters: OpportunityFilterSnapshot;
  industrySectors?: string[];
  conceptSectors?: string[];
  industrySectorInvert?: boolean; // 行业板块反选
  conceptSectorInvert?: boolean; // 概念板块反选
  /** 需要检测交易信号的股票代码；K 线已在 Worker 内，主线程只传代码 */
  signalCodes?: string[];
}

interface UseOpportunityFilterEngineResult {
  filteredData: StockOpportunityData[];
  filtering: boolean;
  skipped: FilterSkippedItem[];
  clearAICache: () => void;
  /** 在 Worker 中批量重算 AI 分析（切换 AI 版本用），返回 null 表示被取消或不可用 */
  recomputeAI: (
    analysisData: StockOpportunityData[],
    onProgress?: (progress: AIRecomputeProgress) => void
  ) => Promise<AIRecomputeResult | null>;
  /** Worker 计算出的交易信号：code → 信号 */
  signalMap: Map<string, TradingSignal>;
  /** 交易信号检测中 */
  signalDetecting: boolean;
}

export function useOpportunityFilterEngine({
  analysisData,
  klineDataCache,
  filters,
  industrySectors,
  conceptSectors,
  industrySectorInvert = false,
  conceptSectorInvert = false,
  signalCodes,
}: UseOpportunityFilterEngineArgs): UseOpportunityFilterEngineResult {
  // Worker 返回的原始筛选结果；最终对外暴露的 filteredData 会再合并交易信号
  const [filteredRawData, setFilteredRawData] = useState<StockOpportunityData[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [skipped, setSkipped] = useState<FilterSkippedItem[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  // null 表示「尚未算出」，用于与「算完但结果为空」区分
  const [signalMap, setSignalMap] = useState<Map<string, TradingSignal> | null>(null);
  const [signalDetecting, setSignalDetecting] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const activeRequestIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const previousKlineCacheRef = useRef<Map<string, KLineData[]> | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingFiltersRef = useRef<OpportunityFilterSnapshot | null>(null);
  const pendingAnalysisDataRef = useRef<StockOpportunityData[] | null>(null);
  /** Worker 创建前暂存的最新 K 线数据，创建后立刻补发 */
  const pendingKlineEntriesRef = useRef<Array<[string, KLineData[]]> | null>(null);
  /** 进行中的 AI 重算任务（按 requestId 匹配回包） */
  const aiRecomputeRef = useRef<{
    requestId: number;
    resolve: (result: AIRecomputeResult | null) => void;
    onProgress?: (progress: AIRecomputeProgress) => void;
  } | null>(null);
  /** 进行中的交易信号检测任务 */
  const detectSignalsRef = useRef<{
    requestId: number;
    resolve: (result: Map<string, TradingSignal> | null) => void;
  } | null>(null);

  /**
   * 惰性创建筛选 Worker：只有在真正需要筛选时才创建，
   * 避免页面一挂载就加载并解析整个 worker bundle（含 AI 分析模块）。
   */
  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) {
      return workerRef.current;
    }
    if (typeof Worker === 'undefined') {
      return null;
    }

    const worker = new Worker(new URL('../workers/opportunityFilterWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<OpportunityFilterWorkerOutboundMessage>) => {
      const result = event.data;

      if (result.type === 'ai-progress') {
        const pending = aiRecomputeRef.current;
        if (pending && pending.requestId === result.requestId) {
          pending.onProgress?.({
            completed: result.completed,
            total: result.total,
            percent: result.percent,
          });
        }
        return;
      }

      if (result.type === 'signals-progress' || result.type === 'signals-result') {
        const pending = detectSignalsRef.current;
        if (!pending || pending.requestId !== result.requestId) {
          return;
        }
        if (result.type === 'signals-progress') {
          return;
        }
        detectSignalsRef.current = null;
        pending.resolve(result.cancelled ? null : new Map(result.signals));
        return;
      }

      if (result.type === 'ai-result') {
        const pending = aiRecomputeRef.current;
        if (!pending || pending.requestId !== result.requestId) {
          return;
        }
        aiRecomputeRef.current = null;
        if (result.cancelled) {
          pending.resolve(null);
          return;
        }
        pending.resolve({
          data: result.data,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
        });
        return;
      }

      if (result.type !== 'result') {
        return;
      }
      if (result.requestId !== activeRequestIdRef.current) {
        return;
      }
      if (result.cancelled) {
        return;
      }

      setFilteredRawData(result.data);
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

    // 补发 Worker 创建前已产生的 K 线数据
    if (pendingKlineEntriesRef.current) {
      worker.postMessage({
        type: 'set-data-full',
        klineDataEntries: pendingKlineEntriesRef.current,
      });
      pendingKlineEntriesRef.current = null;
    }

    return worker;
  }, []);

  useEffect(
    () => () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // 结束未完成的任务，避免 Promise 悬挂
      aiRecomputeRef.current?.resolve(null);
      aiRecomputeRef.current = null;
      detectSignalsRef.current?.resolve(null);
      detectSignalsRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  useEffect(() => {
    const previousCache = previousKlineCacheRef.current;
    if (!previousCache) {
      previousKlineCacheRef.current = new Map(klineDataCache);
      const entries = Array.from(klineDataCache.entries());
      const worker = workerRef.current;
      if (worker) {
        worker.postMessage({ type: 'set-data-full', klineDataEntries: entries });
      } else {
        // Worker 尚未创建（懒加载），暂存数据，创建后自动补发
        pendingKlineEntriesRef.current = entries;
      }
      setDataVersion((prev) => prev + 1);
      return;
    }

    const worker = workerRef.current;

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

    if (!worker) {
      // Worker 尚未创建（懒加载），暂存最新全量数据，创建后自动补发
      pendingKlineEntriesRef.current = Array.from(klineDataCache.entries());
    } else if (changedRatio > 0.35) {
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

  /** 在 Worker 中批量检测交易信号（K 线已在 Worker 内，主线程只传代码列表） */
  const detectSignals = useCallback(
    (codes: string[]): Promise<Map<string, TradingSignal> | null> =>
      new Promise((resolve) => {
        const worker = ensureWorker();
        if (!worker) {
          resolve(null);
          return;
        }

        // 取消上一批未完成的检测任务（只影响信号任务）
        const previous = detectSignalsRef.current;
        if (previous) {
          worker.postMessage({ type: 'cancel', requestId: previous.requestId, task: 'signals' });
          previous.resolve(null);
          detectSignalsRef.current = null;
        }

        const requestId = ++requestIdRef.current;
        detectSignalsRef.current = { requestId, resolve };
        worker.postMessage({ type: 'detect-signals', requestId, codes });
      }),
    [ensureWorker]
  );

  // K 线同步到 Worker 之后再检测信号：本 effect 声明在 set-data 之后，顺序有保证
  useEffect(() => {
    if (!signalCodes || signalCodes.length === 0) {
      setSignalMap(null);
      setSignalDetecting(false);
      return;
    }

    let cancelled = false;
    setSignalDetecting(true);
    void detectSignals(signalCodes).then((result) => {
      if (cancelled) {
        return;
      }
      setSignalMap(result);
      setSignalDetecting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [signalCodes, dataVersion, detectSignals]);

  // 防抖执行筛选任务
  const executeFilterTask = useCallback(() => {
    const currentAnalysisData = pendingAnalysisDataRef.current;
    const currentFilters = pendingFiltersRef.current;

    if (!currentAnalysisData || !currentFilters) {
      return;
    }

    if (currentAnalysisData.length === 0) {
      // 无数据时不需要创建 Worker，仅取消进行中的任务
      const existingWorker = workerRef.current;
      const previousRequestId = activeRequestIdRef.current;
      if (existingWorker && previousRequestId > 0) {
        existingWorker.postMessage({ type: 'cancel', requestId: previousRequestId });
      }
      // 推进请求代号，阻止旧任务回写空结果。
      activeRequestIdRef.current = ++requestIdRef.current;
      setFilteredRawData([]);
      setSkipped([]);
      setFiltering(false);
      return;
    }

    const lightFiltered = currentAnalysisData.filter((item) => {
      if (!passLightFilters(item, currentFilters)) return false;

      // 注意：行业板块和概念板块筛选已移至工作线程中执行
      // 此处不再重复执行，避免双重过滤导致的问题

      return true;
    });

    // 筛选时传递给 Worker 的数据不做 K 线缓存数量限制，保证筛选结果完整性
    // K 线缓存限制仅用于控制内存，不影响筛选逻辑
    // 真正需要筛选时才创建 Worker
    const worker = ensureWorker();
    if (!worker) {
      return;
    }

    const analysisDataForWorker = lightFiltered;
    const requestId = ++requestIdRef.current;
    const previousRequestId = activeRequestIdRef.current;
    activeRequestIdRef.current = requestId;

    if (previousRequestId > 0) {
      worker.postMessage({ type: 'cancel', requestId: previousRequestId, task: 'filter' });
    }

    setFiltering(true);

    worker.postMessage({
      type: 'filter',
      requestId,
      analysisData: analysisDataForWorker,
      filters: currentFilters,
    });
  }, [ensureWorker]);

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

  const clearAICache = useCallback(() => {
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ type: 'clear-ai-cache' });
    }
  }, []);

  /**
   * 在 Worker 中批量重算 AI 分析（切换 AI 版本场景）。
   * K 线数据已在 Worker 内维护，这里只传 analysisData，避免重复传输大对象。
   */
  const recomputeAI = useCallback(
    (
      data: StockOpportunityData[],
      onProgress?: (progress: AIRecomputeProgress) => void
    ): Promise<AIRecomputeResult | null> =>
      new Promise((resolve) => {
        const worker = ensureWorker();
        if (!worker) {
          resolve(null);
          return;
        }

        // 取消上一批未完成的重算任务（只取消 AI 任务，不影响筛选任务）
        const previous = aiRecomputeRef.current;
        if (previous) {
          worker.postMessage({ type: 'cancel', requestId: previous.requestId, task: 'ai' });
          previous.resolve(null);
          aiRecomputeRef.current = null;
        }

        const requestId = ++requestIdRef.current;
        aiRecomputeRef.current = { requestId, resolve, onProgress };
        worker.postMessage({ type: 'recompute-ai', requestId, analysisData: data });
      }),
    [ensureWorker]
  );

  /**
   * 把 Worker 计算出的交易信号合并进筛选结果。
   * 信号是异步算出来的，算好后只做一次轻量 map，不会重跑筛选。
   */
  const filteredData = useMemo(() => {
    if (!signalMap) {
      // 信号尚未就绪，保留原样，避免表格列闪烁
      return filteredRawData;
    }
    return filteredRawData.map((item) => {
      const signal = signalMap.get(item.code);
      if (signal) {
        return { ...item, tradingSignal: signal };
      }
      if (!item.tradingSignal) {
        return item;
      }
      const { tradingSignal: _unused, ...rest } = item;
      return rest;
    });
  }, [filteredRawData, signalMap]);

  return {
    filteredData,
    filtering,
    skipped,
    clearAICache,
    recomputeAI,
    signalMap: signalMap ?? EMPTY_SIGNAL_MAP,
    signalDetecting,
  };
}
