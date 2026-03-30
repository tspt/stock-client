import { analyzeVolumeSurgePatterns, calculateConsolidationInLookback } from '@/utils/consolidationAnalysis';
import { calculateTrendLineInLookback } from '@/utils/trendLineAnalysis';
import type { KLineData, StockOpportunityData } from '@/types/stock';
import type { OpportunityFilterWorkerMessage, OpportunityFilterWorkerResponse } from './opportunityFilterWorkerTypes';

let cancelledThroughRequestId = 0;
const YIELD_EVERY_ITEMS = 40;
let klineDataMap = new Map<string, KLineData[]>();
let latestRequestId = 0;

function parsePercentRangeOption(range: string): { min: number; max?: number } {
  if (range === '5-10') {
    return { min: 5, max: 10 };
  }
  if (range === '10+') {
    return { min: 10 };
  }
  return { min: 5, max: 10 };
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

async function runFilterTask(message: Extract<OpportunityFilterWorkerMessage, { type: 'filter' }>): Promise<void> {
  const { requestId, analysisData, filters } = message;
  const result: StockOpportunityData[] = [];
  const skipped: OpportunityFilterWorkerResponse['skipped'] = [];

  const volumeSurgeEnabled = filters.volumeSurgeDropEnabled || filters.volumeSurgeRiseEnabled;
  const parsedDropRiseRange = volumeSurgeEnabled ? parsePercentRangeOption(filters.dropRisePercentRange) : null;
  const parsedAfterDropRange = volumeSurgeEnabled ? parsePercentRangeOption(filters.afterDropPercentRange) : null;
  const parsedAfterRiseRange = volumeSurgeEnabled ? parsePercentRangeOption(filters.afterRisePercentRange) : null;

  const consolidationTypesSet =
    filters.consolidationFilterEnabled && filters.consolidationTypes.length > 0
      ? new Set(filters.consolidationTypes)
      : null;

  for (let index = 0; index < analysisData.length; index++) {
    if (shouldCancel(requestId)) {
      postCancelled(requestId);
      return;
    }

    // 分片让出事件循环，确保 cancel 消息能及时被处理。
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
          skipped.push({ code: item.code, name: item.name, reason: '横盘重算失败，已跳过重算' });
        }

        if (volumeSurgeEnabled && parsedDropRiseRange) {
          try {
            const volumeSurgePatterns = analyzeVolumeSurgePatterns(klineData, {
              dropPercentRange: parsedDropRiseRange,
              risePercentRange: parsedDropRiseRange,
              consolidationOptions: {
                period: filters.volumeSurgePeriod,
                threshold: filters.consolidationThreshold,
              },
            });
            nextItem = { ...nextItem, volumeSurgePatterns };
          } catch {
            skipped.push({ code: item.code, name: item.name, reason: '急跌/急涨重算失败，已跳过重算' });
          }
        }

        if (filters.trendLineFilterEnabled) {
          try {
            const trendLine = calculateTrendLineInLookback(klineData, {
              lookback: filters.trendLineLookback,
              consecutive: filters.trendLineConsecutive,
            });
            nextItem = { ...nextItem, trendLine };
          } catch {
            skipped.push({ code: item.code, name: item.name, reason: '趋势线重算失败，已跳过重算' });
          }
        }
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

      if (volumeSurgeEnabled && parsedDropRiseRange && parsedAfterDropRange && parsedAfterRiseRange) {
        const patterns = nextItem.volumeSurgePatterns;
        if (!patterns) {
          continue;
        }

        const percentRange = parsedDropRiseRange;
        const afterDropPercentRange = parsedAfterDropRange;
        const afterRisePercentRange = parsedAfterRiseRange;

        const afterDropAnalysisMap = new Map(
          patterns.afterDropAnalyses.map((entry) => [`${entry.period.startIndex}-${entry.period.endIndex}`, entry.analysis])
        );
        const afterRiseAnalysisMap = new Map(
          patterns.afterRiseAnalyses.map((entry) => [`${entry.period.startIndex}-${entry.period.endIndex}`, entry.analysis])
        );

        if (filters.volumeSurgeDropEnabled) {
          let dropMatched = false;
          for (const drop of patterns.dropPeriods) {
            const absChange = Math.abs(drop.changePercent);
            const percentMatch = absChange >= percentRange.min && (percentRange.max === undefined || absChange <= percentRange.max);
            if (!percentMatch) {
              continue;
            }
            if (filters.afterDropType === 'all') {
              dropMatched = true;
              break;
            }
            const analysis = afterDropAnalysisMap.get(`${drop.startIndex}-${drop.endIndex}`);
            if (!analysis) {
              continue;
            }
            if (filters.afterDropType === 'consolidation' && analysis.type === 'consolidation') {
              dropMatched = true;
              break;
            }
            if (filters.afterDropType === 'consolidation_with_rise' && analysis.type === 'consolidation_with_rise') {
              const changePercent = analysis.reboundInfo?.changePercent;
              if (
                changePercent !== undefined &&
                changePercent >= afterDropPercentRange.min &&
                (afterDropPercentRange.max === undefined || changePercent <= afterDropPercentRange.max)
              ) {
                dropMatched = true;
                break;
              }
            }
            if (filters.afterDropType === 'consolidation_with_drop' && analysis.type === 'consolidation_with_drop') {
              const changePercent = analysis.reboundInfo?.changePercent;
              const absDrop = changePercent === undefined ? undefined : Math.abs(changePercent);
              if (
                absDrop !== undefined &&
                absDrop >= afterDropPercentRange.min &&
                (afterDropPercentRange.max === undefined || absDrop <= afterDropPercentRange.max)
              ) {
                dropMatched = true;
                break;
              }
            }
          }
          if (!dropMatched) {
            continue;
          }
        }

        if (filters.volumeSurgeRiseEnabled) {
          let riseMatched = false;
          for (const rise of patterns.risePeriods) {
            const percentMatch =
              rise.changePercent >= percentRange.min &&
              (percentRange.max === undefined || rise.changePercent <= percentRange.max);
            if (!percentMatch) {
              continue;
            }
            if (filters.afterRiseType === 'all') {
              riseMatched = true;
              break;
            }
            const analysis = afterRiseAnalysisMap.get(`${rise.startIndex}-${rise.endIndex}`);
            if (!analysis) {
              continue;
            }
            if (filters.afterRiseType === 'consolidation' && analysis.type === 'consolidation') {
              riseMatched = true;
              break;
            }
            if (filters.afterRiseType === 'consolidation_with_rise' && analysis.type === 'consolidation_with_rise') {
              const changePercent = analysis.reboundInfo?.changePercent;
              if (
                changePercent !== undefined &&
                changePercent >= afterRisePercentRange.min &&
                (afterRisePercentRange.max === undefined || changePercent <= afterRisePercentRange.max)
              ) {
                riseMatched = true;
                break;
              }
            }
            if (filters.afterRiseType === 'consolidation_with_drop' && analysis.type === 'consolidation_with_drop') {
              const changePercent = analysis.reboundInfo?.changePercent;
              const absDrop = changePercent === undefined ? undefined : Math.abs(changePercent);
              if (
                absDrop !== undefined &&
                absDrop >= afterRisePercentRange.min &&
                (afterRisePercentRange.max === undefined || absDrop <= afterRisePercentRange.max)
              ) {
                riseMatched = true;
                break;
              }
            }
          }
          if (!riseMatched) {
            continue;
          }
        }
      }

      result.push(nextItem);
    } catch {
      skipped.push({ code: item.code, name: item.name, reason: '筛选计算异常，已跳过该股' });
    }
  }

  postResult({
    type: 'result',
    requestId,
    cancelled: false,
    data: result,
    skipped,
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

  // worker 侧也保护“只保留最后一次”
  if (latestRequestId > 0) {
    cancelledThroughRequestId = Math.max(cancelledThroughRequestId, latestRequestId);
  }
  latestRequestId = message.requestId;
  void runFilterTask(message);
};
