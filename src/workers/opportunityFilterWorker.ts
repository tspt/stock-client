import { calculateConsolidationInLookback } from '@/utils/consolidationAnalysis';
import { analyzeSharpMovePatterns } from '@/utils/sharpMovePatterns';
import { calculateTrendLineInLookback } from '@/utils/trendLineAnalysis';
import {
  calculateRSI,
  calculateMACD,
  isMACDGoldenCross,
  isMACDDeathCross,
  hasMACDDivergence,
  calculateBollingerBands,
  isNearUpperBand,
  isNearMiddleBand,
  isNearLowerBand,
} from '@/utils/technicalIndicators';
import { detectCandlestickPatternsInWindow } from '@/utils/candlestickPatterns';
import { detectTrendPatterns } from '@/utils/trendPatterns';
import type { KLineData, SharpMovePatternAnalysis, StockOpportunityData } from '@/types/stock';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import type {
  OpportunityFilterWorkerMessage,
  OpportunityFilterWorkerResponse,
} from './opportunityFilterWorkerTypes';

let cancelledThroughRequestId = 0;
const YIELD_EVERY_ITEMS = 40;
let klineDataMap = new Map<string, KLineData[]>();
let latestRequestId = 0;

// AI分析结果缓存，避免重复计算
interface AICacheEntry {
  aiAnalysis: StockOpportunityData['aiAnalysis'];
  timestamp: number;
}
const aiCacheMap = new Map<string, AICacheEntry>();
const AI_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存过期时间

function sharpMoveFilterActive(filters: OpportunityFilterSnapshot): boolean {
  return (
    filters.sharpMoveFilterEnabled &&
    (filters.sharpMoveOnlyDrop ||
      filters.sharpMoveOnlyRise ||
      filters.sharpMoveDropThenRiseLoose ||
      filters.sharpMoveRiseThenDropLoose ||
      filters.sharpMoveDropFlatRise ||
      filters.sharpMoveRiseFlatDrop)
  );
}

/** 清理过期的AI缓存 */
function cleanupExpiredAICache(): void {
  const now = Date.now();
  for (const [code, entry] of aiCacheMap.entries()) {
    if (now - entry.timestamp > AI_CACHE_TTL) {
      aiCacheMap.delete(code);
    }
  }
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

/** 检查技术指标筛选是否激活 */
function technicalIndicatorsFilterActive(filters: OpportunityFilterSnapshot): boolean {
  return (
    filters.rsiRange.min !== undefined ||
    filters.rsiRange.max !== undefined ||
    filters.macdGoldenCross ||
    filters.macdDeathCross ||
    filters.macdDivergence ||
    filters.bollingerUpper ||
    filters.bollingerMiddle ||
    filters.bollingerLower ||
    // 单根形态
    filters.candlestickHammer ||
    filters.candlestickShootingStar ||
    filters.candlestickDoji ||
    // 双根形态
    filters.candlestickEngulfingBullish ||
    filters.candlestickEngulfingBearish ||
    filters.candlestickHaramiBullish ||
    filters.candlestickHaramiBearish ||
    // 三根形态
    filters.candlestickMorningStar ||
    filters.candlestickEveningStar ||
    filters.candlestickDarkCloudCover ||
    filters.candlestickPiercing ||
    filters.candlestickThreeBlackCrows ||
    filters.candlestickThreeWhiteSoldiers ||
    // 趋势形态
    filters.trendUptrend ||
    filters.trendDowntrend ||
    filters.trendSideways ||
    filters.trendBreakout ||
    filters.trendBreakdown
  );
}

/** 检查AI分析筛选是否激活（至少有一个子条件启用） */
function aiAnalysisFilterActive(filters: OpportunityFilterSnapshot): boolean {
  if (!filters.aiAnalysisEnabled) {
    return false;
  }
  return (
    filters.aiTrendUp ||
    filters.aiTrendDown ||
    filters.aiTrendSideways ||
    filters.aiConfidenceRange.min !== undefined ||
    filters.aiConfidenceRange.max !== undefined ||
    filters.aiRecommendScoreRange.min !== undefined ||
    filters.aiRecommendScoreRange.max !== undefined ||
    filters.aiTechnicalScoreRange.min !== undefined ||
    filters.aiTechnicalScoreRange.max !== undefined ||
    filters.aiPatternScoreRange.min !== undefined ||
    filters.aiPatternScoreRange.max !== undefined ||
    filters.aiTrendScoreRange.min !== undefined ||
    filters.aiTrendScoreRange.max !== undefined ||
    filters.aiRiskScoreRange.min !== undefined ||
    filters.aiRiskScoreRange.max !== undefined ||
    filters.aiRequireSimilarPatterns ||
    filters.aiMinSimilarity !== undefined ||
    filters.aiMinSignalCount !== undefined ||
    filters.aiPatternWinRateRange.min !== undefined ||
    filters.aiPatternWinRateRange.max !== undefined ||
    filters.aiMinRiskRewardRatio !== undefined
  );
}

/** 检查是否通过技术指标筛选 */
function passesTechnicalIndicatorsFilter(
  klineData: KLineData[],
  filters: OpportunityFilterSnapshot
): boolean {
  // 如果没有激活任何技术指标筛选，直接通过
  if (!technicalIndicatorsFilterActive(filters)) {
    return true;
  }

  if (!klineData || klineData.length === 0) {
    return false;
  }

  const len = klineData.length;
  const lastClose = klineData[len - 1].close;

  // RSI筛选
  if (filters.rsiRange.min !== undefined || filters.rsiRange.max !== undefined) {
    const rsiPeriod = filters.rsiPeriod || 6;
    const rsi = calculateRSI(klineData, rsiPeriod);
    const lastRSI = rsi[len - 1];

    if (lastRSI === null) {
      return false;
    }

    if (filters.rsiRange.min !== undefined && lastRSI < filters.rsiRange.min) {
      return false;
    }
    if (filters.rsiRange.max !== undefined && lastRSI > filters.rsiRange.max) {
      return false;
    }
  }

  // MACD筛选（OR关系：至少满足一个勾选的条件即可）
  if (filters.macdGoldenCross || filters.macdDeathCross || filters.macdDivergence) {
    const macd = calculateMACD(klineData);

    const isGolden = filters.macdGoldenCross && isMACDGoldenCross(macd.dif, macd.dea, len - 1);
    const isDeath = filters.macdDeathCross && isMACDDeathCross(macd.dif, macd.dea, len - 1);
    const isDiv = filters.macdDivergence && hasMACDDivergence(klineData, macd.dif, 20);

    if (!isGolden && !isDeath && !isDiv) {
      return false;
    }
  }

  // 布林带筛选
  if (filters.bollingerUpper || filters.bollingerMiddle || filters.bollingerLower) {
    const bb = calculateBollingerBands(klineData, 20, 2);
    const lastUpper = bb.upper[len - 1];
    const lastMiddle = bb.middle[len - 1];
    const lastLower = bb.lower[len - 1];

    const nearUpper = isNearUpperBand(lastClose, lastUpper, lastMiddle, lastLower);
    const nearMiddle = isNearMiddleBand(lastClose, lastUpper, lastMiddle, lastLower);
    const nearLower = isNearLowerBand(lastClose, lastUpper, lastMiddle, lastLower);

    // 至少满足一个布林带条件
    const bbMatched =
      (filters.bollingerUpper && nearUpper) ||
      (filters.bollingerMiddle && nearMiddle) ||
      (filters.bollingerLower && nearLower);

    if (!bbMatched) {
      return false;
    }
  }

  // K线形态筛选（回溯窗口内任一位置存在即通过）
  if (
    filters.candlestickHammer ||
    filters.candlestickShootingStar ||
    filters.candlestickDoji ||
    filters.candlestickEngulfingBullish ||
    filters.candlestickEngulfingBearish ||
    filters.candlestickHaramiBullish ||
    filters.candlestickHaramiBearish ||
    filters.candlestickMorningStar ||
    filters.candlestickEveningStar ||
    filters.candlestickDarkCloudCover ||
    filters.candlestickPiercing ||
    filters.candlestickThreeBlackCrows ||
    filters.candlestickThreeWhiteSoldiers
  ) {
    const candlestickLookback = filters.candlestickLookback || 20;
    const patterns = detectCandlestickPatternsInWindow(klineData, candlestickLookback);

    // 单根形态
    const singlePatternMatched =
      (filters.candlestickHammer && patterns.hammer) ||
      (filters.candlestickShootingStar && patterns.shootingStar) ||
      (filters.candlestickDoji && patterns.doji);

    // 双根形态
    const doublePatternMatched =
      (filters.candlestickEngulfingBullish && patterns.engulfingBullish) ||
      (filters.candlestickEngulfingBearish && patterns.engulfingBearish) ||
      (filters.candlestickHaramiBullish && patterns.haramiBullish) ||
      (filters.candlestickHaramiBearish && patterns.haramiBearish);

    // 三根形态
    const triplePatternMatched =
      (filters.candlestickMorningStar && patterns.morningStar) ||
      (filters.candlestickEveningStar && patterns.eveningStar) ||
      (filters.candlestickDarkCloudCover && patterns.darkCloudCover) ||
      (filters.candlestickPiercing && patterns.piercing) ||
      (filters.candlestickThreeBlackCrows && patterns.threeBlackCrows) ||
      (filters.candlestickThreeWhiteSoldiers && patterns.threeWhiteSoldiers);

    // 任一形态匹配即通过
    const patternMatched = singlePatternMatched || doublePatternMatched || triplePatternMatched;

    if (!patternMatched) {
      return false;
    }
  }

  // 趋势形态筛选
  if (
    filters.trendUptrend ||
    filters.trendDowntrend ||
    filters.trendSideways ||
    filters.trendBreakout ||
    filters.trendBreakdown
  ) {
    const trendLookback = filters.trendLookback || 20;
    const trends = detectTrendPatterns(klineData, trendLookback);

    const trendMatched =
      (filters.trendUptrend && trends.uptrend) ||
      (filters.trendDowntrend && trends.downtrend) ||
      (filters.trendSideways && trends.sideways) ||
      (filters.trendBreakout && trends.breakout) ||
      (filters.trendBreakdown && trends.breakdown);

    if (!trendMatched) {
      return false;
    }
  }

  return true;
}

/** 检查是否通过AI分析筛选 */
function passesAIFilter(
  item: StockOpportunityData,
  filters: OpportunityFilterSnapshot
): { passed: boolean; reason?: string } {
  // 如果未启用AI筛选，直接通过
  if (!filters.aiAnalysisEnabled) {
    return { passed: true };
  }

  // 快速失败：如果没有AI分析数据，不通过
  if (!item.aiAnalysis) {
    return { passed: false, reason: '缺少AI分析数据' };
  }

  const { trendPrediction, recommendation, similarPatterns } = item.aiAnalysis;

  // 1. 趋势预测筛选（勾选多项时为OR关系）
  if (filters.aiTrendUp || filters.aiTrendDown || filters.aiTrendSideways) {
    if (!trendPrediction) {
      return { passed: false, reason: '缺少趋势预测数据' };
    }

    const trendMatched =
      (filters.aiTrendUp && trendPrediction.direction === 'up') ||
      (filters.aiTrendDown && trendPrediction.direction === 'down') ||
      (filters.aiTrendSideways && trendPrediction.direction === 'sideways');

    if (!trendMatched) {
      const expectedTrends = [];
      if (filters.aiTrendUp) expectedTrends.push('上涨');
      if (filters.aiTrendDown) expectedTrends.push('下跌');
      if (filters.aiTrendSideways) expectedTrends.push('横盘');
      const actualTrend =
        trendPrediction.direction === 'up'
          ? '上涨'
          : trendPrediction.direction === 'down'
          ? '下跌'
          : '横盘';
      return {
        passed: false,
        reason: `趋势不匹配：期望[${expectedTrends.join('/')}]，实际为${actualTrend}`,
      };
    }
  }

  // 2. 置信度范围筛选（0-1转换为0-100）
  if (filters.aiConfidenceRange.min !== undefined || filters.aiConfidenceRange.max !== undefined) {
    if (!trendPrediction) {
      return { passed: false, reason: '缺少趋势预测数据' };
    }

    const confidencePercent = trendPrediction.confidence * 100;

    if (
      filters.aiConfidenceRange.min !== undefined &&
      confidencePercent < filters.aiConfidenceRange.min
    ) {
      return {
        passed: false,
        reason: `置信度过低：${confidencePercent.toFixed(1)}% < ${filters.aiConfidenceRange.min}%`,
      };
    }
    if (
      filters.aiConfidenceRange.max !== undefined &&
      confidencePercent > filters.aiConfidenceRange.max
    ) {
      return {
        passed: false,
        reason: `置信度过高：${confidencePercent.toFixed(1)}% > ${filters.aiConfidenceRange.max}%`,
      };
    }
  }

  // 3-7. 统一处理各类评分范围筛选（减少代码重复）
  const scoreChecks: Array<{
    name: string;
    range: { min?: number; max?: number };
    value: number | undefined | null;
    missingReason: string;
  }> = [
    {
      name: '综合评分',
      range: filters.aiRecommendScoreRange,
      value: recommendation?.totalScore,
      missingReason: '缺少综合评分数据',
    },
    {
      name: '技术面评分',
      range: filters.aiTechnicalScoreRange,
      value: recommendation?.technicalScore,
      missingReason: '缺少技术面评分数据',
    },
    {
      name: '形态评分',
      range: filters.aiPatternScoreRange,
      value: recommendation?.patternScore,
      missingReason: '缺少形态评分数据',
    },
    {
      name: '趋势评分',
      range: filters.aiTrendScoreRange,
      value: recommendation?.trendScore,
      missingReason: '缺少趋势评分数据',
    },
    {
      name: '风险评分',
      range: filters.aiRiskScoreRange,
      value: recommendation?.riskScore,
      missingReason: '缺少风险评分数据',
    },
  ];

  for (const check of scoreChecks) {
    if (check.range.min !== undefined || check.range.max !== undefined) {
      if (check.value === undefined || check.value === null) {
        return { passed: false, reason: check.missingReason };
      }

      if (check.range.min !== undefined && check.value < check.range.min) {
        return {
          passed: false,
          reason: `${check.name}过低：${check.value} < ${check.range.min}`,
        };
      }
      if (check.range.max !== undefined && check.value > check.range.max) {
        return {
          passed: false,
          reason: `${check.name}过高：${check.value} > ${check.range.max}`,
        };
      }
    }
  }

  // 8-9. 相似形态筛选（合并检查，避免重复）
  if (filters.aiRequireSimilarPatterns || filters.aiMinSimilarity !== undefined) {
    if (!similarPatterns || similarPatterns.length === 0) {
      return { passed: false, reason: '无相似形态匹配' };
    }

    // 9. 相似形态最低相似度筛选（0-1转换为0-100）
    if (filters.aiMinSimilarity !== undefined) {
      const minSimilarityPercent = filters.aiMinSimilarity;
      const hasMatchedPattern = similarPatterns.some(
        (pattern) => pattern.similarity * 100 >= minSimilarityPercent
      );

      if (!hasMatchedPattern) {
        return {
          passed: false,
          reason: `相似度不足：最高相似度 < ${minSimilarityPercent}%`,
        };
      }
    }
  }

  // 10. 信号共识筛选：要求最少N个信号方向一致
  if (filters.aiMinSignalCount !== undefined) {
    if (!trendPrediction) {
      return { passed: false, reason: '缺少趋势预测数据' };
    }
    if (trendPrediction.signalCount < filters.aiMinSignalCount) {
      return {
        passed: false,
        reason: `信号共识不足：${trendPrediction.signalCount}/${trendPrediction.totalSignals} < ${filters.aiMinSignalCount}个`,
      };
    }
  }

  // 11. 相似形态历史胜率筛选（0-1转换为0-100）
  const { patternWinRate } = item.aiAnalysis;
  if (
    filters.aiPatternWinRateRange.min !== undefined ||
    filters.aiPatternWinRateRange.max !== undefined
  ) {
    if (patternWinRate === undefined || patternWinRate === null) {
      return { passed: false, reason: '缺少相似形态胜率数据' };
    }
    const winRatePercent = patternWinRate * 100;
    if (
      filters.aiPatternWinRateRange.min !== undefined &&
      winRatePercent < filters.aiPatternWinRateRange.min
    ) {
      return {
        passed: false,
        reason: `形态胜率过低：${winRatePercent.toFixed(0)}% < ${
          filters.aiPatternWinRateRange.min
        }%`,
      };
    }
    if (
      filters.aiPatternWinRateRange.max !== undefined &&
      winRatePercent > filters.aiPatternWinRateRange.max
    ) {
      return {
        passed: false,
        reason: `形态胜率过高：${winRatePercent.toFixed(0)}% > ${
          filters.aiPatternWinRateRange.max
        }%`,
      };
    }
  }

  // 12. 风险收益比筛选
  if (filters.aiMinRiskRewardRatio !== undefined) {
    if (!trendPrediction || trendPrediction.riskRewardRatio === undefined) {
      return { passed: false, reason: '缺少风险收益比数据' };
    }
    if (trendPrediction.riskRewardRatio < filters.aiMinRiskRewardRatio) {
      return {
        passed: false,
        reason: `风险收益比不足：${trendPrediction.riskRewardRatio.toFixed(1)} < ${
          filters.aiMinRiskRewardRatio
        }`,
      };
    }
  }

  // --- 专业版增强逻辑 ---

  // 4. 时间衰减因子 (Time Decay)
  let effectiveConfidence = trendPrediction?.confidence || 0;
  if (filters.aiEnableTimeDecay && item.analysisTimestamp) {
    const hoursPassed = (Date.now() - item.analysisTimestamp) / (1000 * 3600);
    const decayRate = filters.aiDecayRate || 0.1;
    effectiveConfidence = effectiveConfidence * Math.exp(-decayRate * hoursPassed);
  }

  // 1. 加权评分模式 (Weighted Scoring)
  if (filters.aiEnableWeightedScoring && recommendation) {
    const weights = filters.aiWeights || {
      confidence: 0.3,
      totalScore: 0.4,
      technicalScore: 0.2,
      riskScore: 0.1,
    };

    // 归一化处理 (将不同量纲映射到 0-100)
    const normConfidence = effectiveConfidence * 100;
    const normTotal = recommendation.totalScore || 0;
    const normTech = recommendation.technicalScore || 0;
    const normRisk = recommendation.riskScore || 0;

    const compositeScore =
      normConfidence * weights.confidence +
      normTotal * weights.totalScore +
      normTech * weights.technicalScore +
      normRisk * weights.riskScore;

    if (filters.aiMinCompositeScore !== undefined && compositeScore < filters.aiMinCompositeScore) {
      return {
        passed: false,
        reason: `加权综合得分不足：${compositeScore.toFixed(1)} < ${filters.aiMinCompositeScore}`,
      };
    }
  }

  // 2. 一致性校验 (Consistency Check)
  if (filters.aiEnableConsistencyCheck && trendPrediction && recommendation) {
    const divergenceThreshold = filters.aiMaxDivergence || 40;

    // 如果看涨但风险极高，或看跌但技术面极强，视为不一致
    if (trendPrediction.direction === 'up' && recommendation.riskScore < divergenceThreshold) {
      return { passed: false, reason: '信号冲突：看涨趋势与高风险评分不一致' };
    }
    if (
      trendPrediction.direction === 'down' &&
      recommendation.technicalScore > 100 - divergenceThreshold
    ) {
      return { passed: false, reason: '信号冲突：看跌趋势与强技术面不一致' };
    }
  }

  // 5. 回测胜率联动 (Backtest Integration)
  if (filters.aiMinHistoricalWinRate !== undefined) {
    const winRate = item.aiAnalysis?.patternWinRate;
    if (winRate === undefined || winRate === null) {
      return { passed: false, reason: '缺少历史回测胜率数据' };
    }
    if (winRate * 100 < filters.aiMinHistoricalWinRate) {
      return {
        passed: false,
        reason: `历史胜率不足：${(winRate * 100).toFixed(0)}% < ${filters.aiMinHistoricalWinRate}%`,
      };
    }
  }

  if (filters.aiMinAvgRiskReward !== undefined) {
    const rr = trendPrediction?.riskRewardRatio;
    if (rr === undefined) {
      return { passed: false, reason: '缺少盈亏比数据' };
    }
    if (rr < filters.aiMinAvgRiskReward) {
      return {
        passed: false,
        reason: `平均盈亏比不足：${rr.toFixed(1)} < ${filters.aiMinAvgRiskReward}`,
      };
    }
  }

  // 3. 相对排名筛选 (Percentile Ranking)
  // 注意：百分位筛选通常需要在所有数据处理完后进行排序截取，
  // 在单条过滤函数中我们暂时标记，由主循环统一处理排序和截取。
  if (filters.aiTopPercentile !== undefined) {
    // 这里我们暂时不直接返回 false，而是依赖后续的全局排序逻辑
    // 为了简化，我们在主循环外处理此逻辑，或者在此处仅做初步标记
  }

  return { passed: true };
}

function countLimitUpDown(
  klineData: KLineData[],
  period: number,
  isST: boolean
): { limitUp: number; limitDown: number } {
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

async function runFilterTask(
  message: Extract<OpportunityFilterWorkerMessage, { type: 'filter' }>
): Promise<void> {
  const { requestId, filters, analysisData } = message;
  const result: StockOpportunityData[] = [];
  const skippedMap = new Map<string, { code: string; name: string; reasons: string[] }>();

  // 清理过期的AI缓存
  cleanupExpiredAICache();

  const rawWb = filters.sharpMoveWindowBars;
  const sharpMoveWindowBars =
    typeof rawWb === 'number' && Number.isFinite(rawWb) && rawWb > 0
      ? Math.max(1, Math.floor(rawWb))
      : 60;
  const rawMag = filters.sharpMoveMagnitude;
  const sharpMoveMagnitude =
    typeof rawMag === 'number' && Number.isFinite(rawMag) && rawMag > 0 ? rawMag : 6;
  const rawFlat = filters.sharpMoveFlatThreshold;
  const sharpMoveFlatThreshold =
    typeof rawFlat === 'number' && Number.isFinite(rawFlat) && rawFlat > 0 ? rawFlat : 3;

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

      // 智能判断是否需要重算各指标（仅在有K线数据且筛选条件启用时重算）
      const needConsolidationRecalc = consolidationTypesSet !== null;
      const needTrendLineRecalc = filters.trendLineFilterEnabled;
      const needSharpMoveRecalc = sharpMoveFilterActive(filters);

      if (klineData && klineData.length > 0) {
        // 仅在需要时重算横盘分析
        if (needConsolidationRecalc) {
          try {
            // 检查是否有缓存的横盘分析结果且参数匹配
            const cachedConsolidation = item.consolidation;
            const paramsMatch =
              cachedConsolidation &&
              cachedConsolidation.lookback === filters.consolidationLookback &&
              cachedConsolidation.period === filters.consolidationConsecutive &&
              cachedConsolidation.threshold === filters.consolidationThreshold;

            if (paramsMatch) {
              // 使用缓存结果，无需重算
              nextItem = { ...nextItem, consolidation: cachedConsolidation };
            } else {
              // 参数不匹配或无缓存，重新计算
              const consolidation = calculateConsolidationInLookback(klineData, {
                lookback: filters.consolidationLookback,
                consecutive: filters.consolidationConsecutive,
                threshold: filters.consolidationThreshold,
                requireClosesAboveMa10: filters.consolidationRequireAboveMa10,
              });
              nextItem = { ...nextItem, consolidation };
            }
          } catch {
            mergeSkippedReason(skippedMap, item.code, item.name, '横盘重算失败，已跳过重算');
          }
        }

        // 仅在需要时重算单日异动
        if (needSharpMoveRecalc) {
          try {
            const sharpMovePatterns = analyzeSharpMovePatterns(
              klineData,
              sharpMoveWindowBars,
              sharpMoveMagnitude,
              sharpMoveFlatThreshold
            );
            nextItem = { ...nextItem, sharpMovePatterns };
          } catch {
            mergeSkippedReason(skippedMap, item.code, item.name, '单日异动重算失败，已跳过重算');
            nextItem = { ...nextItem, sharpMovePatterns: undefined };
          }
        }

        // 仅在需要时重算趋势线
        if (needTrendLineRecalc) {
          try {
            const trendLine = calculateTrendLineInLookback(klineData, {
              lookback: filters.trendLineLookback,
              consecutive: filters.trendLineConsecutive,
            });
            nextItem = { ...nextItem, trendLine };
          } catch {
            mergeSkippedReason(skippedMap, item.code, item.name, '趋势线重算失败，已跳过重算');
          }
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

      // 新增：技术指标与形态筛选
      if (!passesTechnicalIndicatorsFilter(klineData || [], filters)) {
        continue;
      }

      // AI分析筛选
      // 提前判断：AI筛选未启用或无子条件激活时直接通过
      if (aiAnalysisFilterActive(filters)) {
        // 查找AI分析数据：优先用item自带的，其次用缓存，都没有则不通过
        let aiAnalysis = nextItem.aiAnalysis;
        if (!aiAnalysis) {
          const cachedEntry = aiCacheMap.get(nextItem.code);
          if (cachedEntry && Date.now() - cachedEntry.timestamp <= AI_CACHE_TTL) {
            aiAnalysis = cachedEntry.aiAnalysis;
          }
        }

        if (!aiAnalysis) {
          mergeSkippedReason(skippedMap, item.code, item.name, 'AI筛选：缺少AI分析数据');
          continue;
        }

        const itemForAIFilter = { ...nextItem, aiAnalysis };
        const aiFilterResult = passesAIFilter(itemForAIFilter, filters);
        if (!aiFilterResult.passed) {
          mergeSkippedReason(
            skippedMap,
            item.code,
            item.name,
            `AI筛选：${aiFilterResult.reason || '未通过'}`
          );
          continue;
        }

        // 将有AI分析结果的item写入缓存（用于后续筛选任务复用）
        if (!nextItem.aiAnalysis && aiAnalysis) {
          aiCacheMap.set(nextItem.code, { aiAnalysis, timestamp: Date.now() });
        }

        nextItem = itemForAIFilter;
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
