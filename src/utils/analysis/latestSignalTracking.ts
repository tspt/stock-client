import type {
  LatestScenarioSignal,
  ReturnSnapshot,
} from '@/utils/analysis/buypointScenario';
import { getLatestSignalOdds } from '@/utils/analysis/buypointScenario';
import type { KLineData, StockRecord } from '@/types/stock';
import type { StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';

export type TrackingStatus = 'tracking' | 'passed' | 'failed';

export interface LatestBuyPointFile {
  fileName: string;
  fileBaseName: string;
  filePath?: string;
  content: {
    items?: LatestScenarioSignal[];
  };
}

export interface TrackedLatestSignal extends LatestScenarioSignal {
  sourceFile: string;
  signalDate: string;
  signalDateKey: string;
  opportunityRecordHit: boolean;
  hotRankHit: boolean;
  trackedReturns: ReturnSnapshot;
  occurredCount: number;
  hitCount: number;
  maxReturn: number | null;
  status: TrackingStatus;
}

/**
 * 未套用阈值参数的行：命中/达标状态由 getTrackingStatus 在渲染期派生，
 * 与加载阶段解耦，避免调阈值触发全量 IO。
 */
export type TrackedLatestSignalBase = Omit<
  TrackedLatestSignal,
  'occurredCount' | 'hitCount' | 'maxReturn' | 'status'
>;

export interface TrackingOptions {
  threshold: number;
  minHitCount: number;
}

const HORIZONS: Array<{ key: keyof ReturnSnapshot; days: number }> = [
  { key: 'd1', days: 1 },
  { key: 'd2', days: 2 },
  { key: 'd3', days: 3 },
  { key: 'd4', days: 4 },
  { key: 'd5', days: 5 },
  { key: 'd6', days: 6 },
];

/** 收益快照的全部口径（d1~d6），供批量统计复用，避免重复展开 */
export const RETURN_HORIZON_KEYS: Array<keyof ReturnSnapshot> = HORIZONS.map((h) => h.key);

/** 提取已发生的收益值（未发生的口径不计入） */
export function collectReturnValues(returns: ReturnSnapshot): number[] {
  const values: number[] = [];
  for (let i = 0; i < RETURN_HORIZON_KEYS.length; i++) {
    const value = returns[RETURN_HORIZON_KEYS[i]];
    if (value != null) values.push(value);
  }
  return values;
}

export function normalizeDateKey(date: string): string {
  return date.trim().replace(/\//g, '-');
}

function formatKlineDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * K 线数组 → "日期(YYYY-MM-DD) → 下标" 索引缓存。
 *
 * 原来每条信号都用 findIndex 线性扫描整段 K 线，且每次比较都要 new Date + 三次 getter
 * + 两次 padStart + 模板字符串，复杂度是 O(信号数 × K线长度)，十万级信号时会产生
 * 数千万次 Date 分配，是历史回测页最主要的主线程阻塞点。
 * 这里按 dailyLines 数组引用缓存一份索引，每条信号只需一次 Map 查询。
 */
const klineDateIndexCache = new WeakMap<KLineData[], Map<string, number>>();

function getKlineDateIndexMap(lines: KLineData[]): Map<string, number> {
  const cached = klineDateIndexCache.get(lines);
  if (cached) return cached;

  const map = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    map.set(formatKlineDate(lines[i].time), i);
  }
  klineDateIndexCache.set(lines, map);
  return map;
}

function pureCode(code: string): string {
  return code.replace(/^(SH|SZ)/i, '');
}

function addCodeKey(map: Map<string, StockHistoryRecord>, history: StockHistoryRecord): void {
  map.set(history.code, history);
  map.set(pureCode(history.code), history);
}

function buildOpportunityRecordMap(records: StockRecord[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  records.forEach((record) => {
    const codes = new Set<string>();
    record.stocks.forEach((stock) => {
      codes.add(stock.code);
      codes.add(pureCode(stock.code));
    });
    map.set(record.date, codes);
  });
  return map;
}

/**
 * 按信号日收盘价计算买入后 1-6 日累计收益（收盘对收盘）
 * @param history 日K历史
 * @param signalDate 信号日 YYYY-MM-DD
 * @param entryClose 可选买入价；缺省用信号日 K 线收盘价
 */
export function calculateFutureReturnsFromClose(
  history: StockHistoryRecord | undefined,
  signalDate: string,
  entryClose?: number | null
): ReturnSnapshot {
  const returns: ReturnSnapshot = { d1: null, d2: null, d3: null, d4: null, d5: null, d6: null };
  const lines = history?.dailyLines || [];
  if (lines.length === 0) return returns;

  const signalDateKey = normalizeDateKey(signalDate);
  const index = getKlineDateIndexMap(lines).get(signalDateKey);
  if (index == null) return returns;

  const entry = entryClose || lines[index]?.close;
  if (!entry || entry <= 0) return returns;

  HORIZONS.forEach((horizon) => {
    const target = lines[index + horizon.days];
    if (!target?.close) return;
    returns[horizon.key] = Number((((target.close - entry) / entry) * 100).toFixed(2));
  });

  return returns;
}

function calculateFutureReturns(
  history: StockHistoryRecord | undefined,
  signal: LatestScenarioSignal
): ReturnSnapshot {
  return calculateFutureReturnsFromClose(history, signal.date, signal.close);
}

export function getTrackingStatus(
  returns: ReturnSnapshot,
  options: TrackingOptions
): Pick<TrackedLatestSignal, 'occurredCount' | 'hitCount' | 'maxReturn' | 'status'> {
  const values = HORIZONS.map((horizon) => returns[horizon.key]).filter(
    (value): value is number => value != null
  );
  const occurredCount = values.length;
  const hitCount = values.filter((value) => value >= options.threshold).length;
  const remainingCount = HORIZONS.length - occurredCount;
  const maxReturn = values.length > 0 ? Math.max(...values) : null;

  let status: TrackingStatus = 'tracking';
  if (hitCount >= options.minHitCount) {
    status = 'passed';
  } else if (hitCount + remainingCount < options.minHitCount) {
    status = 'failed';
  }

  return { occurredCount, hitCount, maxReturn, status };
}

/** 赔率分优先，其次信号日期，再次 lift（不使用 localeCompare，中文排序开销过高） */
export function compareTrackedSignals(
  a: TrackedLatestSignalBase,
  b: TrackedLatestSignalBase
): number {
  if ((b.oddsScore || 0) !== (a.oddsScore || 0)) return (b.oddsScore || 0) - (a.oddsScore || 0);
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  return (b.lift || 0) - (a.lift || 0);
}

/**
 * 构建买点追踪行。
 *
 * 注意：这里**不计算** occurredCount/hitCount/maxReturn/status —— 它们依赖阈值参数，
 * 若在此处计算，改一次阈值就要重新读文件、重新加载行情。调用方请用 getTrackingStatus
 * 在 useMemo 中派生，这样调参数只是纯计算，不再触发 IO。
 */
export function buildTrackedLatestSignals(
  files: LatestBuyPointFile[],
  histories: StockHistoryRecord[],
  records: StockRecord[],
  hotRankCodeMap: Map<string, Set<string>> = new Map()
): TrackedLatestSignalBase[] {
  const historyMap = new Map<string, StockHistoryRecord>();
  histories.forEach((history) => addCodeKey(historyMap, history));
  const recordMap = buildOpportunityRecordMap(records);

  const rows = files.flatMap((file) => {
    const fileDateKey = normalizeDateKey(file.fileBaseName);
    const items = Array.isArray(file.content?.items) ? file.content.items : [];
    return items.flatMap((signal) => {
      const signalDateKey = normalizeDateKey(signal.date);
      if (signalDateKey !== fileDateKey) return [];

      const recordCodes = recordMap.get(fileDateKey);
      const opportunityRecordHit =
        !!recordCodes && (recordCodes.has(signal.code) || recordCodes.has(pureCode(signal.code)));
      const hotCodes = hotRankCodeMap.get(signalDateKey);
      const hotRankHit =
        !!hotCodes && (hotCodes.has(signal.code) || hotCodes.has(pureCode(signal.code)));
      const trackedReturns = calculateFutureReturns(historyMap.get(signal.code) || historyMap.get(pureCode(signal.code)), signal);
      // 采用最新经过双通道与排雷增强的赔率计算逻辑，确保评分实时对齐
      const odds = getLatestSignalOdds(signal);

      return [{
        ...signal,
        ...odds,
        sourceFile: file.fileName,
        signalDate: signal.date,
        signalDateKey,
        opportunityRecordHit,
        hotRankHit,
        trackedReturns,
      }];
    });
  });

  return rows.sort(compareTrackedSignals);
}
