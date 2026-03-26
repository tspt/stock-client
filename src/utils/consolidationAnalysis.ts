/**
 * 横盘分析工具函数
 */

import type {
  AfterSurgeAnalysis,
  ConsolidationAnalysis,
  ConsolidationMatch,
  ConsolidationType,
  KLineData,
  VolumeSurgePatternAnalysis,
  VolumeSurgePeriod,
} from '@/types/stock';

const EPSILON = 1e-6;

export const CONSOLIDATION_TYPE_LABELS: Record<ConsolidationType, string> = {
  low_stable: '低点稳定型',
  high_stable: '高点稳定型',
  box: '箱体型',
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function hasMeaningfulDifference(values: number[]): boolean {
  if (values.length < 2) {
    return false;
  }

  return Math.max(...values) - Math.min(...values) > EPSILON;
}

function calculateRangePercent(minValue: number, maxValue: number): number {
  if (minValue <= 0 || maxValue < minValue) {
    return 0;
  }

  return ((maxValue - minValue) / minValue) * 100;
}

function calculateStrength(metric: number, threshold: number): number {
  if (threshold <= 0) {
    return 0;
  }

  return round(Math.max(0, Math.min(100, 100 - (metric / threshold) * 100)));
}

function createMatch(
  type: ConsolidationType,
  reason: string,
  strength: number
): ConsolidationMatch {
  return {
    type,
    label: CONSOLIDATION_TYPE_LABELS[type],
    reason,
    strength,
  };
}

/**
 * 按三种结构识别横盘：
 * 1. 低点稳定型
 * 2. 高点稳定型
 * 3. 箱体型
 */
export function calculateConsolidation(
  klineData: KLineData[],
  options: {
    period: number;
    threshold: number;
  }
): ConsolidationAnalysis {
  const period = Math.max(1, Math.floor(options.period));
  const threshold = options.threshold;

  if (!klineData || klineData.length < period || threshold < 0) {
    return {
      period,
      threshold,
      isConsolidation: false,
      matchedTypes: [],
      matchedTypeLabels: [],
      matches: [],
      reasonText: 'K线数据不足，无法识别横盘结构',
      strength: 0,
      metrics: {
        lowRangePercent: 0,
        highRangePercent: 0,
        closeChanged: false,
        highChanged: false,
        lowChanged: false,
      },
    };
  }

  const recent = klineData.slice(-period);
  const lows = recent.map((item) => item.low);
  const highs = recent.map((item) => item.high);
  const closes = recent.map((item) => item.close);

  const lowRangePercent = round(calculateRangePercent(Math.min(...lows), Math.max(...lows)));
  const highRangePercent = round(calculateRangePercent(Math.min(...highs), Math.max(...highs)));
  const closeChanged = hasMeaningfulDifference(closes);
  const highChanged = hasMeaningfulDifference(highs);
  const lowChanged = hasMeaningfulDifference(lows);

  const matches: ConsolidationMatch[] = [];

  if (lowRangePercent <= threshold && closeChanged && highChanged) {
    matches.push(
      createMatch(
        'low_stable',
        `近${period}天最低价波动${lowRangePercent}%，收盘价与最高价存在差异`,
        calculateStrength(lowRangePercent, threshold)
      )
    );
  }

  if (highRangePercent <= threshold && closeChanged && lowChanged) {
    matches.push(
      createMatch(
        'high_stable',
        `近${period}天最高价波动${highRangePercent}%，收盘价与最低价存在差异`,
        calculateStrength(highRangePercent, threshold)
      )
    );
  }

  if (lowRangePercent <= threshold && highRangePercent <= threshold && closeChanged) {
    matches.push(
      createMatch(
        'box',
        `近${period}天最低价波动${lowRangePercent}%，最高价波动${highRangePercent}%，收盘价存在差异`,
        round((calculateStrength(lowRangePercent, threshold) + calculateStrength(highRangePercent, threshold)) / 2)
      )
    );
  }

  const matchedTypes = matches.map((item) => item.type);
  const matchedTypeLabels = matches.map((item) => item.label);

  return {
    period,
    threshold,
    isConsolidation: matches.length > 0,
    matchedTypes,
    matchedTypeLabels,
    matches,
    reasonText: matches.length > 0 ? matches.map((item) => item.reason).join('；') : `近${period}天未命中横盘结构`,
    strength: matches.length > 0 ? Math.max(...matches.map((item) => item.strength)) : 0,
    metrics: {
      lowRangePercent,
      highRangePercent,
      closeChanged,
      highChanged,
      lowChanged,
    },
  };
}

/**
 * 检测单日急跌（去掉放量逻辑）
 * @param klineData K线数据
 * @param dropPercentRange 急跌幅度范围 {min: 5, max: 10}（百分比）
 */
export function detectVolumeSurgeDrop(
  klineData: KLineData[],
  dropPercentRange: { min: number; max?: number } = { min: 5, max: 10 }
): VolumeSurgePeriod[] {
  if (!klineData || klineData.length < 2) {
    return [];
  }

  const periods: VolumeSurgePeriod[] = [];

  // 单日模式：遍历每一天，检查当天相对于前一天的跌幅
  for (let i = 1; i < klineData.length; i++) {
    const prev = klineData[i - 1];
    const current = klineData[i];

    if (prev.close <= 0) continue;

    // 计算当天跌幅
    const changePercent = ((current.close - prev.close) / prev.close) * 100;
    const absDrop = Math.abs(changePercent);

    // 检查是否急跌
    const isDrop = changePercent < 0;
    const isSharpDrop =
      absDrop >= dropPercentRange.min &&
      (dropPercentRange.max === undefined || absDrop <= dropPercentRange.max);

    if (!isDrop || !isSharpDrop) continue;

    periods.push({
      startIndex: i - 1,
      endIndex: i,
      startPrice: prev.close,
      endPrice: current.close,
      changePercent: Number(changePercent.toFixed(2)),
      days: 1,
    });
  }

  return periods;
}

/**
 * 检测单日急涨（去掉放量逻辑）
 * @param klineData K线数据
 * @param risePercentRange 急涨幅度范围 {min: 5, max: 10}（百分比）
 */
export function detectVolumeSurgeRise(
  klineData: KLineData[],
  risePercentRange: { min: number; max?: number } = { min: 5, max: 10 }
): VolumeSurgePeriod[] {
  if (!klineData || klineData.length < 2) {
    return [];
  }

  const periods: VolumeSurgePeriod[] = [];

  // 单日模式：遍历每一天，检查当天相对于前一天的涨幅
  for (let i = 1; i < klineData.length; i++) {
    const prev = klineData[i - 1];
    const current = klineData[i];

    if (prev.close <= 0) continue;

    // 计算当天涨幅
    const changePercent = ((current.close - prev.close) / prev.close) * 100;

    // 检查是否急涨
    const isRise = changePercent > 0;
    const isSharpRise =
      changePercent >= risePercentRange.min &&
      (risePercentRange.max === undefined || changePercent <= risePercentRange.max);

    if (!isRise || !isSharpRise) continue;

    periods.push({
      startIndex: i - 1,
      endIndex: i,
      startPrice: prev.close,
      endPrice: current.close,
      changePercent: Number(changePercent.toFixed(2)),
      days: 1,
    });
  }

  return periods;
}

/**
 * 分析急跌后的情况
 * @param klineData K线数据
 * @param dropPeriod 急跌周期信息
 * @param consolidationOptions 横盘分析选项
 */
export function analyzeAfterSurgeDrop(
  klineData: KLineData[],
  dropPeriod: VolumeSurgePeriod,
  consolidationOptions: {
    period: number;
    threshold: number;
  }
): AfterSurgeAnalysis {
  // 急跌结束后的第二天开始计算
  const afterDropStartIndex = dropPeriod.endIndex + 2;
  if (afterDropStartIndex >= klineData.length) {
    return { type: 'none' };
  }

  const afterDropData = klineData.slice(afterDropStartIndex);
  if (afterDropData.length < consolidationOptions.period) {
    return { type: 'none' };
  }

  const consolidationCheckData = afterDropData.slice(0, consolidationOptions.period);
  const consolidation = calculateConsolidation(consolidationCheckData, consolidationOptions);

  // 只检查最近period天的横盘情况
  const recentConsolidationData = consolidationCheckData;

  if (!consolidation.isConsolidation) {
    return { type: 'none' };
  }

  // 检测横盘后的上涨/下跌（去掉放量逻辑）
  const afterConsolidationStartIndex = afterDropStartIndex + consolidationOptions.period;
  if (afterConsolidationStartIndex < klineData.length) {
    const afterConsolidationData = klineData.slice(afterConsolidationStartIndex);
    const checkPeriod = Math.min(10, afterConsolidationData.length); // 检查横盘后10天

    if (checkPeriod >= 1) {
      const consolidationEndPrice =
        recentConsolidationData[recentConsolidationData.length - 1].close;
      
      // 检查是否有上涨或下跌
      for (let i = 0; i < checkPeriod; i++) {
        const currentPrice = afterConsolidationData[i].close;
        const changePercent = ((currentPrice - consolidationEndPrice) / consolidationEndPrice) * 100;

        // 如果上涨超过3%，返回横盘后上涨
        if (changePercent > 3) {
          return {
            type: 'consolidation_with_rise',
            consolidationInfo: {
              startIndex: afterDropStartIndex,
              endIndex: afterDropStartIndex + consolidationOptions.period - 1,
              strength: consolidation.strength,
              days: consolidationOptions.period,
            },
            reboundInfo: {
              startIndex: afterConsolidationStartIndex,
              endIndex: afterConsolidationStartIndex + i,
              changePercent: Number(changePercent.toFixed(2)),
            },
          };
        }

        // 如果下跌超过3%，返回横盘后下跌
        if (changePercent < -3) {
          return {
            type: 'consolidation_with_drop',
            consolidationInfo: {
              startIndex: afterDropStartIndex,
              endIndex: afterDropStartIndex + consolidationOptions.period - 1,
              strength: consolidation.strength,
              days: consolidationOptions.period,
            },
            reboundInfo: {
              startIndex: afterConsolidationStartIndex,
              endIndex: afterConsolidationStartIndex + i,
              changePercent: Number(changePercent.toFixed(2)),
            },
          };
        }
      }
    }
  }

  return {
    type: 'consolidation',
    consolidationInfo: {
      startIndex: afterDropStartIndex,
      endIndex: afterDropStartIndex + consolidationOptions.period - 1,
      strength: consolidation.strength,
      days: consolidationOptions.period,
    },
  };
}

/**
 * 分析拉升后的情况
 * @param klineData K线数据
 * @param risePeriod 拉升周期信息
 * @param consolidationOptions 横盘分析选项
 */
export function analyzeAfterSurgeRise(
  klineData: KLineData[],
  risePeriod: VolumeSurgePeriod,
  consolidationOptions: {
    period: number;
    threshold: number;
  }
): AfterSurgeAnalysis {
  // 拉升结束后的第二天开始计算
  const afterRiseStartIndex = risePeriod.endIndex + 2;
  if (afterRiseStartIndex >= klineData.length) {
    return { type: 'none' };
  }

  const afterRiseData = klineData.slice(afterRiseStartIndex);
  if (afterRiseData.length < consolidationOptions.period) {
    return { type: 'none' };
  }

  const consolidationCheckData = afterRiseData.slice(0, consolidationOptions.period);
  const consolidation = calculateConsolidation(consolidationCheckData, consolidationOptions);

  // 只检查最近period天的横盘情况
  const recentConsolidationData = consolidationCheckData;

  if (!consolidation.isConsolidation) {
    return { type: 'none' };
  }

  // 检测横盘后的上涨/下跌（去掉放量逻辑）
  const afterConsolidationStartIndex = afterRiseStartIndex + consolidationOptions.period;
  if (afterConsolidationStartIndex < klineData.length) {
    const afterConsolidationData = klineData.slice(afterConsolidationStartIndex);
    const checkPeriod = Math.min(10, afterConsolidationData.length); // 检查横盘后10天

    if (checkPeriod >= 1) {
      const consolidationEndPrice =
        recentConsolidationData[recentConsolidationData.length - 1].close;
      
      // 检查是否有上涨或下跌
      for (let i = 0; i < checkPeriod; i++) {
        const currentPrice = afterConsolidationData[i].close;
        const changePercent = ((currentPrice - consolidationEndPrice) / consolidationEndPrice) * 100;

        // 如果上涨超过3%，返回横盘后上涨
        if (changePercent > 3) {
          return {
            type: 'consolidation_with_rise',
            consolidationInfo: {
              startIndex: afterRiseStartIndex,
              endIndex: afterRiseStartIndex + consolidationOptions.period - 1,
              strength: consolidation.strength,
              days: consolidationOptions.period,
            },
            reboundInfo: {
              startIndex: afterConsolidationStartIndex,
              endIndex: afterConsolidationStartIndex + i,
              changePercent: Number(changePercent.toFixed(2)),
            },
          };
        }

        // 如果下跌超过3%，返回横盘后下跌
        if (changePercent < -3) {
          return {
            type: 'consolidation_with_drop',
            consolidationInfo: {
              startIndex: afterRiseStartIndex,
              endIndex: afterRiseStartIndex + consolidationOptions.period - 1,
              strength: consolidation.strength,
              days: consolidationOptions.period,
            },
            reboundInfo: {
              startIndex: afterConsolidationStartIndex,
              endIndex: afterConsolidationStartIndex + i,
              changePercent: Number(changePercent.toFixed(2)),
            },
          };
        }
      }
    }
  }

  return {
    type: 'consolidation',
    consolidationInfo: {
      startIndex: afterRiseStartIndex,
      endIndex: afterRiseStartIndex + consolidationOptions.period - 1,
      strength: consolidation.strength,
      days: consolidationOptions.period,
    },
  };
}

/**
 * 综合分析急跌/急涨模式（单日模式，去掉放量逻辑）
 * @param klineData K线数据
 * @param options 分析选项
 */
export function analyzeVolumeSurgePatterns(
  klineData: KLineData[],
  options: {
    dropPercentRange?: { min: number; max?: number };
    risePercentRange?: { min: number; max?: number };
    consolidationOptions?: {
      period: number;
      threshold: number;
    };
  } = {}
): VolumeSurgePatternAnalysis {
  const {
    dropPercentRange = { min: 5, max: 10 },
    risePercentRange = { min: 5, max: 10 },
    consolidationOptions = {
      period: 3,
      threshold: 2,
    },
  } = options;

  // 检测单日急跌
  const dropPeriods = detectVolumeSurgeDrop(klineData, dropPercentRange);

  // 检测单日急涨
  const risePeriods = detectVolumeSurgeRise(klineData, risePercentRange);

  // 分析每个急跌周期后的情况
  const afterDropAnalyses = dropPeriods.map((period) => ({
    period,
    analysis: analyzeAfterSurgeDrop(klineData, period, consolidationOptions),
  }));

  // 分析每个急涨周期后的情况
  const afterRiseAnalyses = risePeriods.map((period) => ({
    period,
    analysis: analyzeAfterSurgeRise(klineData, period, consolidationOptions),
  }));

  return {
    dropPeriods,
    risePeriods,
    afterDropAnalyses,
    afterRiseAnalyses,
    dropCount: dropPeriods.length,
    riseCount: risePeriods.length,
  };
}
