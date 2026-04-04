import { calculateConsolidationInLookback } from '@/utils/consolidationAnalysis';
import { analyzeSharpMovePatterns } from '@/utils/sharpMovePatterns';
import { calculateTrendLineInLookback } from '@/utils/trendLineAnalysis';
import type { KLineData, SharpMovePatternAnalysis, StockOpportunityData } from '@/types/stock';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import type { OpportunityFilterWorkerMessage, OpportunityFilterWorkerResponse } from './opportunityFilterWorkerTypes';
import { MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES } from '@/utils/constants';

let cancelledThroughRequestId = 0;
const YIELD_EVERY_ITEMS = 40;
let klineDataMap = new Map<string, KLineData[]>();
let latestRequestId = 0;

function sharpMoveFilterActive(filters: OpportunityFilterSnapshot): boolean {
  return (
    filters.sharpMoveOnlyDrop ||
    filters.sharpMoveOnlyRise ||
    filters.sharpMoveDropThenRiseLoose ||
    filters.sharpMoveRiseThenDropLoose ||
    filters.sharpMoveDropFlatRise ||
    filters.sharpMoveRiseFlatDrop
  );
}

/** 勾选多项时，满足任一命中即通过（OR） */
function passesSharpMoveFilter(
  patterns: SharpMovePatternAnalysis | undefined,
  filters: OpportunityFilterSnapshot
): boolean {
  if (!sharpMoveFilterActive(filters)) {
    return true;
  }
  if (!patterns) {
    return false;
  }
  if (filters.sharpMoveOnlyDrop && patterns.onlyDrop) return true;
  if (filters.sharpMoveOnlyRise && patterns.onlyRise) return true;
  if (filters.sharpMoveDropThenRiseLoose && patterns.dropThenRiseLoose) return true;
  if (filters.sharpMoveRiseThenDropLoose && patterns.riseThenDropLoose) return true;
  if (filters.sharpMoveDropFlatRise && patterns.dropThenFlatThenRise) return true;
  if (filters.sharpMoveRiseFlatDrop && patterns.riseThenFlatThenDrop) return true;
  return false;
}

function countLimitUpDown(klineData: KLineData[], period: number, isST: boolean): { limitUp: number; limitDown: number } {
  if (!klineData || klineData.length < 2 || period <= 0) {
    return { limitUp: 0, limitDown: 0 };
  }

  const limitThreshold = isST ? 4.5 : 9.5;
  const recentData = klineData.slice(-period);
  let limitUpCount = 0;
  let limitDownCount = 0;

  for (let i = 1; i < recentData.length; i++) {
    const current = recentData[i];
    const prev = recentData[i - 1];
    if (prev.close <= 0) {
      continue;
    }
    const changePercent = ((current.close - prev.close) / prev.close) * 100;
    if (changePercent >= limitThreshold) {
      limitUpCount++;
    } else if (changePercent <= -limitThreshold) {
      limitDownCount++;
    }
  }

  return { limitUp: limitUpCount, limitDown: limitDownCount };
}

function postResult(response: OpportunityFilterWorkerResponse): void {
  self.postMessage(response);
}

function shouldCancel(requestId: number): boolean {
  return requestId <= cancelledThroughRequestId;
}

function postCancelled(requestId: number): void {
  postResult({
    type: 'result',
    requestId,
    cancelled: true,
    data: [],
    skipped: [],
  });
}

function mergeSkippedReason(
  map: Map<string, { code: string; name: string; reasons: string[] }>,
  code: string,
  name: string,
  reason: string
): void {
  const prev = map.get(code);
  if (prev) {
    prev.reasons.push(reason);
  } else {
    map.set(code, { code, name, reasons: [reason] });
  }
}

function skippedMapToArray(
  map: Map<string, { code: string; name: string; reasons: string[] }>
): OpportunityFilterWorkerResponse['skipped'] {
  return Array.from(map.values()).map(({ code, name, reasons }) => ({
    code,
    name,
    reason: reasons.join('；'),
  }));
}

async function runFilterTask(message: Extract<OpportunityFilterWorkerMessage, { type: 'filter' }>): Promise<void> {
  const { requestId, filters } = message;
  const analysisData =
    message.analysisData.length > MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES
      ? message.analysisData.slice(0, MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES)
      : message.analysisData;
  const result: StockOpportunityData[] = [];
  const skippedMap = new Map<string, { code: string; name: string; reasons: string[] }>();

  const rawWb = filters.sharpMoveWindowBars;
  const sharpMoveWindowBars =
    typeof rawWb === 'number' && Number.isFinite(rawWb) && rawWb > 0 ? Math.max(1, Math.floor(rawWb)) : 60;
  const rawMag = filters.sharpMoveMagnitude;
  const sharpMoveMagnitude =
    typeof rawMag === 'number' && Number.isFinite(rawMag) && rawMag > 0 ? rawMag : 6;

  /** 启用横盘且勾选至少一种类型时按类型过滤；启用但未选任何类型则视为不按类型过滤（与其它条件照常组合） */
  const consolidationTypesSet =
    filters.consolidationFilterEnabled && filters.consolidationTypes.length > 0
      ? new Set(filters.consolidationTypes)
      : null;

  for (let index = 0; index < analysisData.length; index++) {
    if (shouldCancel(requestId)) {
      postCancelled(requestId);
      return;
    }

    if (index > 0 && index % YIELD_EVERY_ITEMS === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      if (shouldCancel(requestId)) {
        postCancelled(requestId);
        return;
      }
    }

    const item = analysisData[index];

    try {
      let nextItem: StockOpportunityData = item;
      const klineData = klineDataMap.get(item.code);

      if (klineData && klineData.length > 0) {
        try {
          const consolidation = calculateConsolidationInLookback(klineData, {
            lookback: filters.consolidationLookback,
            consecutive: filters.consolidationConsecutive,
            threshold: filters.consolidationThreshold,
            requireClosesAboveMa10: filters.consolidationRequireAboveMa10,
          });
          nextItem = { ...nextItem, consolidation };
        } catch {
          mergeSkippedReason(skippedMap, item.code, item.name, '横盘重算失败，已跳过重算');
        }

        try {
          const sharpMovePatterns = analyzeSharpMovePatterns(klineData, sharpMoveWindowBars, sharpMoveMagnitude);
          nextItem = { ...nextItem, sharpMovePatterns };
        } catch {
          mergeSkippedReason(skippedMap, item.code, item.name, '单日异动重算失败，已跳过重算');
          nextItem = { ...nextItem, sharpMovePatterns: undefined };
        }

        /** 与横盘、单日异动一致：有 K 线即用面板参数重算，便于列表与筛选条件一致；是否剔除行由 trendLineFilterEnabled 决定 */
        try {
          const trendLine = calculateTrendLineInLookback(klineData, {
            lookback: filters.trendLineLookback,
            consecutive: filters.trendLineConsecutive,
          });
          nextItem = { ...nextItem, trendLine };
        } catch {
          mergeSkippedReason(skippedMap, item.code, item.name, '趋势线重算失败，已跳过重算');
        }
      } else {
        nextItem = { ...nextItem, sharpMovePatterns: undefined };
      }

      if (consolidationTypesSet) {
        if (!nextItem.consolidation || !nextItem.consolidation.isConsolidation) {
          continue;
        }
        const matchedTypes = nextItem.consolidation.matchedTypes ?? [];
        const hasMatchedType = matchedTypes.some((type) => consolidationTypesSet.has(type));
        if (!hasMatchedType) {
          continue;
        }
      }

      if (filters.trendLineFilterEnabled && !nextItem.trendLine?.isHit) {
        continue;
      }

      if (filters.recentLimitUpCount !== undefined || filters.recentLimitDownCount !== undefined) {
        const hasKlineData = !!klineData && klineData.length > 0;
        if (!hasKlineData) {
          continue;
        }

        const isST = nextItem.name.includes('ST');
        const maxPeriod = Math.max(filters.limitUpPeriod, filters.limitDownPeriod);
        const combinedCounts = countLimitUpDown(klineData, maxPeriod, isST);

        if (filters.recentLimitUpCount !== undefined) {
          const upCount =
            filters.limitUpPeriod === maxPeriod
              ? combinedCounts.limitUp
              : countLimitUpDown(klineData, filters.limitUpPeriod, isST).limitUp;
          if (upCount < filters.recentLimitUpCount) {
            continue;
          }
        }

        if (filters.recentLimitDownCount !== undefined) {
          const downCount =
            filters.limitDownPeriod === maxPeriod
              ? combinedCounts.limitDown
              : countLimitUpDown(klineData, filters.limitDownPeriod, isST).limitDown;
          if (downCount < filters.recentLimitDownCount) {
            continue;
          }
        }
      }

      if (!passesSharpMoveFilter(nextItem.sharpMovePatterns, filters)) {
        continue;
      }

      result.push(nextItem);
    } catch {
      mergeSkippedReason(skippedMap, item.code, item.name, '筛选计算异常，已跳过该股');
    }
  }

  postResult({
    type: 'result',
    requestId,
    cancelled: false,
    data: result,
    skipped: skippedMapToArray(skippedMap),
  });
}

self.onmessage = (event: MessageEvent<OpportunityFilterWorkerMessage>) => {
  const message = event.data;
  if (message.type === 'set-data-full') {
    klineDataMap = new Map<string, KLineData[]>(message.klineDataEntries);
    return;
  }
  if (message.type === 'set-data-patch') {
    message.upsertEntries.forEach(([code, klineData]) => {
      klineDataMap.set(code, klineData);
    });
    message.removeCodes.forEach((code) => {
      klineDataMap.delete(code);
    });
    return;
  }
  if (message.type === 'cancel') {
    cancelledThroughRequestId = Math.max(cancelledThroughRequestId, message.requestId);
    return;
  }

  if (latestRequestId > 0) {
    cancelledThroughRequestId = Math.max(cancelledThroughRequestId, latestRequestId);
  }
  latestRequestId = message.requestId;
  void runFilterTask(message);
};
