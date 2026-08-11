import type {
  LatestScenarioSignal,
  ReturnSnapshot,
} from '@/utils/analysis/buypointScenario';
import type { StockRecord } from '@/types/stock';
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
  trackedReturns: ReturnSnapshot;
  occurredCount: number;
  hitCount: number;
  maxReturn: number | null;
  status: TrackingStatus;
}

export interface TrackingOptions {
  threshold: number;
  minHitCount: number;
}

const HORIZONS: Array<{ key: keyof ReturnSnapshot; days: number }> = [
  { key: 'd1', days: 1 },
  { key: 'd2', days: 2 },
  { key: 'd3', days: 3 },
  { key: 'd5', days: 5 },
  { key: 'd10', days: 10 },
];

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

function calculateFutureReturns(
  history: StockHistoryRecord | undefined,
  signal: LatestScenarioSignal
): ReturnSnapshot {
  const returns: ReturnSnapshot = { d1: null, d2: null, d3: null, d5: null, d10: null };
  const lines = history?.dailyLines || [];
  if (lines.length === 0) return returns;

  const signalDateKey = normalizeDateKey(signal.date);
  const index = lines.findIndex((line) => formatKlineDate(line.time) === signalDateKey);
  if (index < 0) return returns;

  const entry = signal.close || lines[index]?.close;
  if (!entry || entry <= 0) return returns;

  HORIZONS.forEach((horizon) => {
    const target = lines[index + horizon.days];
    if (!target?.close) return;
    returns[horizon.key] = Number((((target.close - entry) / entry) * 100).toFixed(2));
  });

  return returns;
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

export function buildTrackedLatestSignals(
  files: LatestBuyPointFile[],
  histories: StockHistoryRecord[],
  records: StockRecord[],
  options: TrackingOptions
): TrackedLatestSignal[] {
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
      const trackedReturns = calculateFutureReturns(historyMap.get(signal.code) || historyMap.get(pureCode(signal.code)), signal);
      const stat = getTrackingStatus(trackedReturns, options);

      return [{
        ...signal,
        sourceFile: file.fileName,
        signalDate: signal.date,
        signalDateKey,
        opportunityRecordHit,
        trackedReturns,
        ...stat,
      }];
    });
  });

  return rows.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return (b.lift || 0) - (a.lift || 0);
  });
}
