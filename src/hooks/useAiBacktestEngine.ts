/**
 * AI 胜率回评编排：读取日线 → 市场/名称筛选 → 裁剪股票池 → 交给 Worker 重算 → 聚合结果
 *
 * 数据源是机会分析已经在用的 `stockHistory`（不复权日线，由一键分析/K线弹窗写入），
 * **不需要额外准备数据**；除权跳空造成的失真由 Worker 侧按板别识别后整条剔除。
 *
 * 基础筛选（市场 / 名称）直接复用机会分析的匹配函数与默认值
 * （`utils/analysis/stockFiltering` + `OPPORTUNITY_DEFAULT_BASIC_FILTERS`），
 * 保证两个页面的口径与初始状态一致。
 *
 * 职责边界：
 * - 主线程负责 IO、筛选与裁剪（把全市场 K 线克隆进 Worker 会付出上百 MB 代价，
 *   因此只把 universeLimit 以内的股票发给 Worker）；
 * - Worker 负责重算与统计，避免 2 万次指标计算卡死界面。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KLineData } from '@/types/stock';
import { getStocksHistory, type StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';
import {
  aggregateAiBacktest,
  type AiBacktestAggregate,
  type AiBacktestRow,
  type AiBacktestSkipReason,
} from '@/utils/analysis/aiBacktest';
import { filterRecordsByMarketAndName } from '@/utils/analysis/stockFiltering';
import { OPPORTUNITY_DEFAULT_BASIC_FILTERS } from '@/utils/config/opportunityAnalysisDefaults';
import {
  AI_BACKTEST_DEFAULT_HORIZON,
  type AiBacktestHorizon,
} from '@/utils/config/aiBacktestOptions';
import { logger } from '@/utils/business/logger';
import type {
  AiBacktestWorkerMessage,
  AiBacktestWorkerOutboundMessage,
} from '@/workers/aiBacktestWorkerTypes';

/** 与机会分析一致的基础筛选默认值（只取回评用得上的两项） */
const DEFAULT_SELECTED_MARKET: string[] = [...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket];
const DEFAULT_NAME_TYPE: string = OPPORTUNITY_DEFAULT_BASIC_FILTERS.nameType;

export interface AiBacktestRunParams {
  /** 参与回测的股票数上限；<=0 表示全量 */
  universeLimit: number;
  sectionCount: number;
  sectionStep: number;
}

export interface AiBacktestRunSummary {
  rows: number;
  universeSize: number;
  droppedByLimit: number;
  sectionDates: string[];
  cancelled: boolean;
  /** 按原因统计被跳过的样本数（含除权跳空剔除量） */
  skipped: Partial<Record<AiBacktestSkipReason, number>>;
  /** 本次使用的筛选条件（结果标注用，避免事后分不清是全市场还是仅主板） */
  selectedMarket: string[];
  nameType: string;
}

export interface AiBacktestEngineState {
  /** 本地有日线的股票总数（未筛选） */
  localTotal: number;
  /** 通过市场/名称筛选后的股票数 */
  availableCount: number;
  /** 股票池是否仍在加载 */
  loadingUniverse: boolean;
  /** 选中的市场（多选） */
  selectedMarket: string[];
  /** 名称类型：all / st / non_st */
  nameType: string;
  /** 主口径：切换只触发本地重聚合，不重跑回评 */
  horizon: AiBacktestHorizon;
  running: boolean;
  progress: { completed: number; total: number; percent: number };
  aggregate: AiBacktestAggregate | null;
  lastRun: AiBacktestRunSummary | null;
  error: string | null;
}

export interface AiBacktestEngineActions {
  run: (params: AiBacktestRunParams) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  setSelectedMarket: (markets: string[]) => void;
  setNameType: (nameType: string) => void;
  setHorizon: (horizon: AiBacktestHorizon) => void;
}

const EMPTY_PROGRESS = { completed: 0, total: 0, percent: 0 };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function useAiBacktestEngine(): AiBacktestEngineState & AiBacktestEngineActions {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  /** 本地有日线的记录（不含筛选），用于实时预览筛选后的股票数 */
  const recordsRef = useRef<StockHistoryRecord[]>([]);
  /** 本次 run 送进 Worker 的股票数（用于计算被上限截掉的数量） */
  const sentCountRef = useRef(0);

  const [localTotal, setLocalTotal] = useState(0);
  const [loadingUniverse, setLoadingUniverse] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<string[]>(DEFAULT_SELECTED_MARKET);
  const [nameType, setNameType] = useState<string>(DEFAULT_NAME_TYPE);
  const [horizon, setHorizon] = useState<AiBacktestHorizon>(AI_BACKTEST_DEFAULT_HORIZON);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  /** 回评产出的样本行；口径切换时只对它重新聚合 */
  const [rows, setRows] = useState<AiBacktestRow[]>([]);
  const [lastRun, setLastRun] = useState<AiBacktestRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 加载本地日线存量（stockHistory 全量读取带跨页面缓存，重复调用代价很低） */
  const loadUniverse = useCallback(async (): Promise<StockHistoryRecord[]> => {
    const histories = await getStocksHistory([]);
    const usable = histories.filter((item) => item.dailyLines && item.dailyLines.length > 0);
    recordsRef.current = usable;
    setLocalTotal(usable.length);
    return usable;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadUniverse();
      } catch (err) {
        logger.warn('[AI回评] 读取日线存量失败:', err);
      } finally {
        if (alive) setLoadingUniverse(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadUniverse]);

  /** 筛选后的股票数：随筛选条件实时更新，供 UI 预览 */
  const availableCount = useMemo(
    () =>
      filterRecordsByMarketAndName(recordsRef.current, { selectedMarket, nameType }).length,
    // localTotal 参与依赖：记录加载完成后才能重算出正确的数量
    [selectedMarket, nameType, localTotal]
  );

  /** 聚合结果：只依赖样本行与主口径，故切换口径是纯计算、不重跑回评 */
  const aggregate = useMemo(
    () => (rows.length > 0 ? aggregateAiBacktest(rows, horizon) : null),
    [rows, horizon]
  );

  const disposeWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  useEffect(() => disposeWorker, [disposeWorker]);

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current;
    if (typeof Worker === 'undefined') return null;

    const worker = new Worker(new URL('../workers/aiBacktestWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    return worker;
  }, []);

  const run = useCallback(
    async (params: AiBacktestRunParams) => {
      setRunning(true);
      setError(null);
      setProgress(EMPTY_PROGRESS);

      const worker = ensureWorker();
      if (!worker) {
        setError('当前环境不支持 Worker，无法执行回评');
        setRunning(false);
        return;
      }

      try {
        // 1. 重新读取（stockHistory 全量读取有跨页面缓存，且写入时会失效，故能拿到最新数据）
        const usable = await loadUniverse();

        // 2. 市场 / 名称筛选（与机会分析同一套匹配语义）
        const filtered = filterRecordsByMarketAndName(usable, { selectedMarket, nameType });

        if (filtered.length === 0) {
          setError(
            usable.length === 0
              ? '本地还没有日线数据，请先在「机会分析」页执行一次一键分析'
              : '当前市场/名称条件没有筛出任何股票，请放宽筛选条件'
          );
          setRunning(false);
          return;
        }

        // 3. 按上限裁剪后再送 Worker：全市场 K 线的结构化克隆代价过高
        const codes = filtered.map((item) => item.code).sort();
        const limitedCodes =
          params.universeLimit > 0 ? codes.slice(0, params.universeLimit) : codes;
        const byCode = new Map(filtered.map((item) => [item.code, item]));

        sentCountRef.current = limitedCodes.length;
        const entries: Array<[string, { name: string; kline: KLineData[] }]> = limitedCodes.map(
          (code) => {
            const record = byCode.get(code);
            return [code, { name: record?.name || code, kline: record?.dailyLines ?? [] }];
          }
        );

        requestIdRef.current += 1;
        const requestId = requestIdRef.current;

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            worker.removeEventListener('message', handler);
            worker.removeEventListener('error', onError);
          };

          const handler = (event: MessageEvent<AiBacktestWorkerOutboundMessage>) => {
            const message = event.data;
            if (message.requestId !== requestId) return;

            if (message.type === 'progress') {
              setProgress({
                completed: message.completed,
                total: message.total,
                percent: message.percent,
              });
              return;
            }

            cleanup();
            if (message.cancelled) {
              setRows([]);
              setLastRun({
                rows: 0,
                universeSize: message.universeSize,
                droppedByLimit: sentCountRef.current - message.universeSize,
                sectionDates: message.sectionDates,
                cancelled: true,
                skipped: message.skipped,
                selectedMarket,
                nameType,
              });
              resolve();
              return;
            }

            setRows(message.rows);
            setLastRun({
              rows: message.rows.length,
              universeSize: message.universeSize,
              droppedByLimit: sentCountRef.current - message.universeSize,
              sectionDates: message.sectionDates,
              cancelled: false,
              skipped: message.skipped,
              selectedMarket,
              nameType,
            });
            resolve();
          };

          const onError = (event: ErrorEvent) => {
            cleanup();
            reject(new Error(event.message || 'Worker 执行异常'));
          };

          worker.addEventListener('message', handler);
          worker.addEventListener('error', onError);
          const setDataMessage: AiBacktestWorkerMessage = { type: 'set-data', entries };
          worker.postMessage(setDataMessage);
          const runMessage: AiBacktestWorkerMessage = {
            type: 'run',
            requestId,
            sectionCount: params.sectionCount,
            sectionStep: params.sectionStep,
          };
          worker.postMessage(runMessage);
        });
      } catch (err) {
        logger.error('[AI回评] 执行失败:', err);
        setError(`回评失败：${toErrorMessage(err)}`);
      } finally {
        setRunning(false);
      }
    },
    [ensureWorker, loadUniverse, selectedMarket, nameType]
  );

  const cancel = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const message: AiBacktestWorkerMessage = {
      type: 'cancel',
      requestId: requestIdRef.current,
    };
    worker.postMessage(message);
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setLastRun(null);
    setError(null);
    setProgress(EMPTY_PROGRESS);
  }, []);

  return {
    localTotal,
    availableCount,
    loadingUniverse,
    selectedMarket,
    nameType,
    horizon,
    running,
    progress,
    aggregate,
    lastRun,
    error,
    run,
    cancel,
    reset,
    setSelectedMarket,
    setNameType,
    setHorizon,
  };
}
