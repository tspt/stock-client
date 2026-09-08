/**
 * 机会记录收益追踪
 * 以机会分析落盘名单为全集，记录日收盘价为买点，计算 d1-d6 收益与达标状态
 */

import type { ConceptInfo, IndustryInfo, StockRecord } from '@/types/stock';
import type { ReturnSnapshot } from '@/utils/analysis/buypointScenario';
import {
  calculateFutureReturnsFromClose,
  getTrackingStatus,
  normalizeDateKey,
  type TrackingOptions,
  type TrackingStatus,
} from '@/utils/analysis/latestSignalTracking';
import type { StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';

export interface TrackedOpportunityRecord {
  key: string;
  code: string;
  name: string;
  signalDate: string;
  signalDateKey: string;
  industry?: IndustryInfo;
  concepts: ConceptInfo[];
  trackedReturns: ReturnSnapshot;
  occurredCount: number;
  hitCount: number;
  maxReturn: number | null;
  status: TrackingStatus;
}

function pureCode(code: string): string {
  return code.replace(/^(SH|SZ)/i, '');
}

function addCodeKey(map: Map<string, StockHistoryRecord>, history: StockHistoryRecord): void {
  map.set(history.code, history);
  map.set(pureCode(history.code), history);
}

/**
 * 将机会记录展开为收益追踪行（日期 × 股票）
 */
export function buildTrackedOpportunityRecords(
  records: StockRecord[],
  histories: StockHistoryRecord[],
  options: TrackingOptions
): TrackedOpportunityRecord[] {
  const historyMap = new Map<string, StockHistoryRecord>();
  histories.forEach((history) => addCodeKey(historyMap, history));

  const rowMap = new Map<string, TrackedOpportunityRecord>();

  records.forEach((record) => {
    const signalDateKey = normalizeDateKey(record.date);
    if (!signalDateKey) return;

    record.stocks.forEach((stock) => {
      const code = stock.code?.trim();
      if (!code) return;

      const key = `${pureCode(code)}-${signalDateKey}`;
      const history = historyMap.get(code) || historyMap.get(pureCode(code));
      const trackedReturns = calculateFutureReturnsFromClose(history, signalDateKey);
      const stat = getTrackingStatus(trackedReturns, options);

      rowMap.set(key, {
        key,
        code,
        name: stock.name || code,
        signalDate: record.date,
        signalDateKey,
        industry: stock.industry,
        concepts: stock.concepts || [],
        trackedReturns,
        ...stat,
      });
    });
  });

  return Array.from(rowMap.values()).sort((a, b) => {
    if (a.signalDateKey !== b.signalDateKey) {
      return b.signalDateKey.localeCompare(a.signalDateKey);
    }
    return a.code.localeCompare(b.code);
  });
}
