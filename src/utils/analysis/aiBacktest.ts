/**
 * AI 胜率回评核心（纯函数，无 IO）
 *
 * 目标：把 AI 输出（趋势方向 / 置信度 / 综合评分）放到历史截面上，用**真实前向收益**
 * 衡量它到底有没有区分度，从而让「胜率」可测量。
 *
 * 口径要点：
 * - **无前视**：打分只喂「截断到截面日」的 K 线；前向收益才允许看截面日之后的数据。
 * - **剔除不可回测因子**：`peRatio` / `turnoverRate` 只有当前快照，历史不可得，
 *   一律不填（见 `buildScorableInput`），否则等于用今天的 PE 去套历史信号。
 * - **复用线上口径**：达标判定与 `latestSignalTracking.getTrackingStatus` 同源，
 *   收益快照直接复用 `buypointScenario.calculateFutureReturns`，避免第二套实现。
 * - 生存者偏差无法在本模块消除（universe 只能取本地现存股票），由报告显式标注。
 *
 * 本模块不 import services（避免 utils ↔ services 的层级回环）：
 * AI 打分函数由调用方以 `AiBacktestScorer` 注入。
 */

import type { KLineData, StockOpportunityData } from '@/types/stock';
import {
  calculateFutureReturns,
  type ReturnSnapshot,
} from '@/utils/analysis/buypointScenario';
import { formatKLineDate, quoteFromAsOfKline } from '@/utils/analysis/asOfKline';
import { calcAllIndicators, formatKDJValues } from '@/utils/analysis/indicators';
import { calculateConsolidationInLookback } from '@/utils/analysis/consolidationAnalysis';
import { calculateTrendLineInLookback } from '@/utils/analysis/trendLineAnalysis';
import { analyzeSharpMovePatterns } from '@/utils/analysis/sharpMovePatterns';
import {
  OPPORTUNITY_DEFAULT_AI_ANALYSIS,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
} from '@/utils/config/opportunityAnalysisDefaults';
import {
  AI_BACKTEST_CONFIDENCE_BUCKET_LABELS,
  AI_BACKTEST_CONFIDENCE_EDGES,
  AI_BACKTEST_GAP_FORWARD_BARS,
  AI_BACKTEST_GAP_LIMIT_BUFFER,
  AI_BACKTEST_GAP_LOOKBACK_BARS,
  AI_BACKTEST_HIT_THRESHOLD,
  AI_BACKTEST_LIMIT_DOWN,
  AI_BACKTEST_MIN_BUCKET_SAMPLES,
  type AiBacktestHorizon,
} from '@/utils/config/aiBacktestOptions';

// ==================== 类型 ====================

/** 单条回测样本：某只股票在某个截面日的打分与后续收益 */
export interface AiBacktestRow {
  code: string;
  name: string;
  /** 截面日 YYYY-MM-DD */
  sectionDate: string;
  /**
   * d1~d6 前向收益快照（%）。
   * 各口径的具体值由 `aggregateAiBacktest` 按主口径现取，
   * 因此切换口径只需重新聚合、无需重跑回评。
   */
  returns: ReturnSnapshot;
  direction: 'up' | 'down' | 'sideways';
  /** 趋势置信度 0-1 */
  confidence: number;
  /** 综合评分（回测口径：缺 PE/换手率，见 buildScorableInput） */
  totalScore: number;
  /** 技术面评分 */
  technicalScore: number;
  /** 形态评分 */
  patternScore: number;
  /** 趋势评分 */
  trendScore: number;
  /** 风险评分（越高越安全） */
  riskScore: number;
  signalCount: number;
  totalSignals: number;
  riskRewardRatio?: number;
}

/** 注入的打分函数输入 */
export interface AiBacktestScoreInput {
  /** 截断到截面日的 K 线（打分只能看这些） */
  bars: KLineData[];
  /** 由 K 线重算的可回测字段 */
  scorable: StockOpportunityData;
}

/** 注入的打分函数输出（即 AI 输出中可回测的部分） */
export interface AiBacktestScoreOutput {
  direction: 'up' | 'down' | 'sideways';
  confidence: number;
  totalScore: number;
  technicalScore: number;
  patternScore: number;
  trendScore: number;
  riskScore: number;
  signalCount: number;
  totalSignals: number;
  riskRewardRatio?: number;
}

/** AI 打分函数（由 worker 注入 `performAIAnalysis`） */
export type AiBacktestScorer = (input: AiBacktestScoreInput) => AiBacktestScoreOutput | null;

/** 分桶统计 */
export interface AiBacktestBucketStat {
  key: string;
  sampleCount: number;
  /** 收益 > 0 的比例（%） */
  winRate: number | null;
  /** 平均收益（%） */
  avgReturn: number | null;
  /** 收益 >= 阈值的比例（%） */
  hitRate: number | null;
  maxReturn: number | null;
  minReturn: number | null;
  /** 样本数是否达到最低要求（false 时上述比例不可作为结论） */
  sufficient: boolean;
}

/** 可回测的评分维度（与 `SmartRecommendationScore` 的分项一一对应） */
export type AiBacktestScoreDimensionKey = 'technical' | 'pattern' | 'trend' | 'risk';

/** 单个分项维度的统计 */
export interface AiBacktestDimensionStat {
  key: AiBacktestScoreDimensionKey;
  label: string;
  /** 该维度 vs 前向收益的逐截面 RankIC（正=分数越高后续越好） */
  ic: number | null;
  /** 等频五分桶的统计 */
  buckets: AiBacktestBucketStat[];
}

export interface AiBacktestAggregate {
  horizon: AiBacktestHorizon;
  /** 全部行数 */
  totalRows: number;
  /** 主口径收益可用的行数（截面日之后数据齐） */
  usableRows: number;
  /** 全池基准（等权平均收益），分桶的「超额」以此为参照 */
  benchmarkAvgReturn: number | null;
  overall: AiBacktestBucketStat;
  byDirection: AiBacktestBucketStat[];
  byConfidence: AiBacktestBucketStat[];
  /** 综合评分等频五分桶 */
  byTotalScore: AiBacktestBucketStat[];
  /** 四个分项评分的 IC 与等频五分桶 —— 用来定位信息来自哪个维度 */
  dimensions: AiBacktestDimensionStat[];
  /** 各截面 RankIC 的均值（置信度 vs 前向收益） */
  confidenceIC: number | null;
  /** 各截面 RankIC 的均值（综合评分 vs 前向收益） */
  scoreIC: number | null;
  minBucketSamples: number;
}

// ==================== 小工具 ====================

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ==================== 截面日 ====================

/**
 * 建「日期 → 下标」索引。
 *
 * 必须在回评前**每只股票只建一次**：如果放到每条样本里现算，
 * 默认规模下要做 截面数 × 股票数 × 根数 ≈ 千万次 `new Date` 格式化，
 * 是回评最主要的性能陷阱（`latestSignalTracking` 里记录过同一类问题）。
 */
export function buildKlineDateIndex(kline: KLineData[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < kline.length; i += 1) {
    map.set(formatKLineDate(kline[i].time), i);
  }
  return map;
}

/** 汇总一批交易日索引里出现过的全部交易日（升序） */
export function collectTradingDatesFromIndexes(dateIndexes: Array<Map<string, number>>): string[] {
  const set = new Set<string>();
  dateIndexes.forEach((index) => {
    index.forEach((_value, date) => set.add(date));
  });
  return Array.from(set).sort();
}

export interface BuildSectionDatesOptions {
  /** 取多少个截面 */
  count: number;
  /** 每 N 个交易日取一个 */
  step: number;
  /** 头部预留（保证有足够预热 K 线） */
  headMargin: number;
  /** 尾部预留（保证能算出主口径收益） */
  tailMargin: number;
}

/**
 * 从交易日序列里选采样截面日。
 *
 * 从最新往回按 step 取 count 个，并避开头部/尾部预留区：
 * - 头部不足预热根数的截面没法打分；
 * - 尾部不足前向收益窗口的截面没法算标签。
 */
export function buildSectionDates(
  tradingDates: string[],
  options: BuildSectionDatesOptions
): string[] {
  const { count, step, headMargin, tailMargin } = options;
  if (tradingDates.length === 0 || count <= 0 || step <= 0) return [];

  const start = Math.max(0, Math.min(headMargin, tradingDates.length - 1));
  const end = tradingDates.length - tailMargin; // 开区间上界
  if (end <= start) return [];

  const picked: string[] = [];
  for (let i = end - 1; i >= start && picked.length < count; i -= step) {
    picked.push(tradingDates[i]);
  }
  return picked.reverse();
}

// ==================== 打分输入构造 ====================

/**
 * 由截断后的 K 线重算「可回测」的个股字段。
 *
 * 沿用 `analyzer.ts` 的同一批计算函数与同一套默认参数，保证与线上口径一致；
 * **刻意不填** `peRatio` / `turnoverRate`：它们只有当前快照，历史不可得，
 * 填入即构成未来函数。缺失时 AI 评分里对应的分支会自然跳过。
 *
 * `name`（ST 判定）取自当前名称，属低风险近似（历史上名称可能变化）。
 */
export function buildScorableInput(
  code: string,
  name: string,
  bars: KLineData[]
): StockOpportunityData | null {
  const quote = quoteFromAsOfKline(code, name, bars);
  if (!quote) return null;

  const { kdj, maFields } = calcAllIndicators(bars, {
    price: quote.price,
    high: quote.high,
    low: quote.low,
  });
  const formattedKDJ = formatKDJValues(kdj);

  let consolidation: StockOpportunityData['consolidation'];
  try {
    const params = OPPORTUNITY_DEFAULT_AI_ANALYSIS.consolidation;
    consolidation = calculateConsolidationInLookback(bars, {
      lookback: params.lookback,
      consecutive: params.consecutive,
      threshold: params.threshold,
      requireClosesAboveMa10: params.requireClosesAboveMa10,
    });
  } catch {
    consolidation = undefined;
  }

  let trendLine: StockOpportunityData['trendLine'];
  try {
    trendLine = calculateTrendLineInLookback(bars, {
      lookback: OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
      consecutive: OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
    });
  } catch {
    trendLine = undefined;
  }

  let sharpMovePatterns: StockOpportunityData['sharpMovePatterns'];
  try {
    sharpMovePatterns = analyzeSharpMovePatterns(
      bars,
      OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
      OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude,
      OPPORTUNITY_DEFAULT_SHARP_MOVE.flatThreshold
    );
  } catch {
    sharpMovePatterns = undefined;
  }

  return {
    code,
    name,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    amount: quote.amount,
    kdjK: formattedKDJ.kdjK,
    kdjD: formattedKDJ.kdjD,
    kdjJ: formattedKDJ.kdjJ,
    ma5: maFields.ma5,
    ma10: maFields.ma10,
    ma20: maFields.ma20,
    consolidation,
    trendLine,
    sharpMovePatterns,
    // 截面日的收盘时间：AI 打分不读该字段，用截面日而非 Date.now() 保证回测可复现
    analyzedAt: bars[bars.length - 1]?.time ?? 0,
  };
}

// ==================== 除权跳空过滤 ====================

/**
 * 前向收益口径 → 天数（'d5' → 5）。
 *
 * 数据源（stockHistory.dailyLines）是**不复权**日线，除权除息会在除权日留下跳空。
 * 该跳空不是亏损，但会同时污染两处：
 * 1. 打分窗口内的均线/布林/MACD → 指标失真；
 * 2. 前向收益窗口 → 收益被记成假亏损。
 * 因此这里显式识别跳空，并把受影响的样本整条剔除。
 *
 * 为什么不直接改用前复权数据：实测跳空影响面仅约 0.37% 的样本（详见
 * `docs/机会分析/AI胜率评测与相似形态重构计划.md`），为此背一整套独立数据管线不划算。
 */
/** 由代码与名称推断该股的单日最大跌幅限制（%） */
export function limitDownPercent(code: string, name: string): number {
  const pure = code.replace(/^(SH|SZ|BJ)/i, '');
  if (/^(688|300|301)/.test(pure)) return AI_BACKTEST_LIMIT_DOWN.star;
  if (/^[48]/.test(pure)) return AI_BACKTEST_LIMIT_DOWN.beijing;
  if (name.includes('ST')) return AI_BACKTEST_LIMIT_DOWN.st;
  return AI_BACKTEST_LIMIT_DOWN.main;
}

/**
 * 找出 K 线中的除权跳空下标（升序）。
 *
 * 判据：单日收盘跌幅超过该股所属板别的跌停限制 + 缓冲。A 股单日跌幅有硬上限，
 * 超过它就不可能是正常交易造成的 —— 只能是除权除息留下的缺口。
 * 上市首日、长期停牌复牌等无涨跌幅限制的合法情形也会落入此区间，误剔除无害。
 */
export function detectExDividendGaps(kline: KLineData[], code: string, name: string): number[] {
  const threshold = -(limitDownPercent(code, name) + AI_BACKTEST_GAP_LIMIT_BUFFER);
  const gaps: number[] = [];

  for (let i = 1; i < kline.length; i += 1) {
    const prev = kline[i - 1]?.close;
    const cur = kline[i]?.close;
    if (!prev || !cur || prev <= 0) continue;
    if (((cur - prev) / prev) * 100 < threshold) gaps.push(i);
  }

  return gaps;
}

/**
 * 该截面样本是否被除权跳空污染。
 *
 * - 打分窗口（截面日往前 `AI_BACKTEST_GAP_LOOKBACK_BARS` 根）内有跳空 → 指标已失真；
 * - 前向窗口（截面日之后 `AI_BACKTEST_GAP_FORWARD_BARS` 根）内有跳空 → 收益是假的。
 *
 * 前向窗口固定取最长口径、不随主口径变化：这样样本集与主口径解耦，
 * 切换 d1~d6 只需本地重聚合，结果之间也可直接比较。
 *
 * @param gapIndexes `detectExDividendGaps` 的结果（必须升序）
 */
export function isGapContaminated(gapIndexes: number[], sectionIndex: number): boolean {
  if (gapIndexes.length === 0) return false;

  const scoreStart = sectionIndex - AI_BACKTEST_GAP_LOOKBACK_BARS;
  const forwardEnd = sectionIndex + AI_BACKTEST_GAP_FORWARD_BARS;

  for (let i = 0; i < gapIndexes.length; i += 1) {
    const gap = gapIndexes[i];
    if (gap > forwardEnd) break; // 升序：后面只会更远
    if (gap > scoreStart && gap <= sectionIndex) return true;
    if (gap > sectionIndex && gap <= forwardEnd) return true;
  }

  return false;
}

// ==================== 单条样本 ====================

/** 样本被跳过的原因（用于统计剔除量，让报告能如实交代） */
export type AiBacktestSkipReason =
  | 'no-kline'
  | 'no-section-bar'
  | 'insufficient-warmup'
  | 'gap'
  | 'score-failed';

export type AiBacktestRowOutcome =
  | { ok: true; row: AiBacktestRow }
  | { ok: false; reason: AiBacktestSkipReason };

export interface BuildBacktestRowInput {
  code: string;
  name: string;
  /** 完整日线（含截面日之后的数据，供计算前向收益） */
  kline: KLineData[];
  /** 截面日在 kline 中的下标（由 buildKlineDateIndex 解析，未上市/停牌时为 null） */
  sectionIndex: number | null;
  sectionDate: string;
  minWarmupBars: number;
  /** 该股的除权跳空下标（由 detectExDividendGaps 预先算好，每只股票只算一次） */
  gapIndexes: number[];
  score: AiBacktestScorer;
}

/**
 * 构造一条回测样本；不满足条件时返回跳过原因。
 *
 * 关键：`bars`（截断到截面日）用于打分，`kline`（完整）用于算前向收益 —— 两者分开，
 * 保证打分侧无前视、收益侧能看到未来。
 *
 * `sectionIndex` 由调用方用预处理好的日期索引解析：为 null 表示该股在截面日
 * 没有 K 线（未上市 / 停牌 / 缺数据），直接跳过 —— 这正是我们要的语义。
 *
 * 不接收主口径：d1~d6 全量存入 `returns`，口径差异留到聚合阶段处理。
 */
export function buildBacktestRow(input: BuildBacktestRowInput): AiBacktestRowOutcome {
  const { code, name, kline, sectionIndex, sectionDate, minWarmupBars, gapIndexes, score } = input;

  if (!kline || kline.length === 0) return { ok: false, reason: 'no-kline' };
  if (sectionIndex == null || sectionIndex < 0 || sectionIndex >= kline.length) {
    return { ok: false, reason: 'no-section-bar' };
  }

  // 预热不足：指标未稳定，强行打分只会污染统计
  if (sectionIndex + 1 < minWarmupBars) return { ok: false, reason: 'insufficient-warmup' };

  // 除权跳空污染：指标与收益都不可信，整条剔除
  if (isGapContaminated(gapIndexes, sectionIndex)) {
    return { ok: false, reason: 'gap' };
  }

  const bars = kline.slice(0, sectionIndex + 1);

  const scorable = buildScorableInput(code, name, bars);
  if (!scorable) return { ok: false, reason: 'score-failed' };

  const scored = score({ bars, scorable });
  if (!scored) return { ok: false, reason: 'score-failed' };

  return {
    ok: true,
    row: {
      code,
      name,
      sectionDate,
      returns: calculateFutureReturns(kline, sectionIndex),
      direction: scored.direction,
      confidence: scored.confidence,
      totalScore: scored.totalScore,
      technicalScore: scored.technicalScore,
      patternScore: scored.patternScore,
      trendScore: scored.trendScore,
      riskScore: scored.riskScore,
      signalCount: scored.signalCount,
      totalSignals: scored.totalSignals,
      riskRewardRatio: scored.riskRewardRatio,
    },
  };
}

// ==================== 分桶与统计 ====================

/** 按边界二分（左闭右开，最后一桶右闭）取桶下标 */
function bucketIndexOf(value: number, edges: readonly number[]): number {
  if (edges.length < 2) return 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const isLast = i === edges.length - 2;
    if (value >= edges[i] && (isLast ? value <= edges[i + 1] : value < edges[i + 1])) {
      return i;
    }
  }
  return value < edges[0] ? 0 : edges.length - 2;
}

function statOf(
  key: string,
  values: number[],
  hitThreshold: number,
  minSamples: number
): AiBacktestBucketStat {
  if (values.length === 0) {
    return {
      key,
      sampleCount: 0,
      winRate: null,
      avgReturn: null,
      hitRate: null,
      maxReturn: null,
      minReturn: null,
      sufficient: false,
    };
  }

  const winCount = values.filter((v) => v > 0).length;
  const hitCount = values.filter((v) => v >= hitThreshold).length;
  const avg = mean(values);

  // 不能用 Math.max(...values)：样本量上万后展开实参会超出引擎参数上限而爆栈
  // （实测 18 万条即触发 RangeError）。这里显式循环求极值。
  let maxReturn = values[0];
  let minReturn = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > maxReturn) maxReturn = values[i];
    if (values[i] < minReturn) minReturn = values[i];
  }

  return {
    key,
    sampleCount: values.length,
    winRate: round2((winCount / values.length) * 100),
    avgReturn: avg == null ? null : round2(avg),
    hitRate: round2((hitCount / values.length) * 100),
    maxReturn: round2(maxReturn),
    minReturn: round2(minReturn),
    sufficient: values.length >= minSamples,
  };
}

/** 平均秩（并列取平均），用于 Spearman */
function rankOf(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/** Spearman 秩相关；样本 < 5 或某侧无变异时返回 null */
export function spearmanRankCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;

  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/**
 * 逐截面计算 RankIC 再取均值。
 *
 * 不把全部样本混在一起算相关性：同一截面的样本高度截面相关，
 * 混算会严重高估信息系数。行业惯例是按截面算 IC 再平均。
 */
function meanSectionIC(
  rows: AiBacktestRow[],
  horizon: AiBacktestHorizon,
  pickX: (row: AiBacktestRow) => number
): number | null {
  const bySection = new Map<string, AiBacktestRow[]>();
  rows.forEach((row) => {
    if (returnOf(row, horizon) == null) return;
    const list = bySection.get(row.sectionDate);
    if (list) list.push(row);
    else bySection.set(row.sectionDate, [row]);
  });

  const ics: number[] = [];
  bySection.forEach((list) => {
    const ic = spearmanRankCorrelation(
      list.map(pickX),
      list.map((row) => returnOf(row, horizon) as number)
    );
    if (ic != null) ics.push(ic);
  });

  const avg = mean(ics);
  return avg == null ? null : round4(avg);
}

/** 分桶聚合：返回「桶下标 → 收益数组」 */
function groupByBucket(
  rows: AiBacktestRow[],
  horizon: AiBacktestHorizon,
  edges: readonly number[],
  pickValue: (row: AiBacktestRow) => number
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  rows.forEach((row) => {
    const value = returnOf(row, horizon);
    if (value == null) return;
    const idx = bucketIndexOf(pickValue(row), edges);
    const list = groups.get(idx);
    if (list) list.push(value);
    else groups.set(idx, [value]);
  });
  return groups;
}

const DIRECTION_LABELS: Array<{ key: 'up' | 'down' | 'sideways'; label: string }> = [
  { key: 'up', label: '看涨' },
  { key: 'down', label: '看跌' },
  { key: 'sideways', label: '横盘' },
];

/** 分项维度的取值方式 */
const SCORE_DIMENSIONS: Array<{
  key: AiBacktestScoreDimensionKey;
  label: string;
  pick: (row: AiBacktestRow) => number;
}> = [
  { key: 'technical', label: '技术面', pick: (row) => row.technicalScore },
  { key: 'pattern', label: '形态', pick: (row) => row.patternScore },
  { key: 'trend', label: '趋势', pick: (row) => row.trendScore },
  { key: 'risk', label: '风险', pick: (row) => row.riskScore },
];

/** 等频五分桶标签 */
const QUINTILE_LABELS = ['最低20%', '20%~40%', '40%~60%', '60%~80%', '最高20%'];

/**
 * 按数据分布计算等频桶的边界（含首尾 ±Infinity）。
 *
 * 为什么不用固定边界：实测固定边界会产出退化桶（如「70~80」仅 44 条、「≥80」0 条），
 * 这种桶无法判断单调性。等频桶保证每桶样本量接近，单调性才真的可测。
 *
 * @param values 全量取值（不分桶的样本都算，让分布反映真实情况）
 * @param count 桶数
 */
export function quantileEdges(values: number[], count: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const inner: number[] = [];

  for (let i = 1; i < count; i += 1) {
    const rank = (i / count) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    inner.push(
      low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
    );
  }

  return [-Infinity, ...inner, Infinity];
}

/** 单个分项维度的统计（IC + 等频五分桶） */
function dimensionStat(
  dim: (typeof SCORE_DIMENSIONS)[number],
  rows: AiBacktestRow[],
  horizon: AiBacktestHorizon
): AiBacktestDimensionStat {
  const edges = quantileEdges(rows.map(dim.pick), QUINTILE_LABELS.length);
  const groups = groupByBucket(rows, horizon, edges, dim.pick);

  return {
    key: dim.key,
    label: dim.label,
    ic: meanSectionIC(rows, horizon, dim.pick),
    buckets: QUINTILE_LABELS.map((label, idx) =>
      statOf(
        label,
        groups.get(idx) ?? [],
        AI_BACKTEST_HIT_THRESHOLD,
        AI_BACKTEST_MIN_BUCKET_SAMPLES
      )
    ),
  };
}

/** 按主口径取该样本的前向收益（未发生为 null） */
function returnOf(row: AiBacktestRow, horizon: AiBacktestHorizon): number | null {
  return row.returns[horizon] ?? null;
}

/**
 * 聚合回测结果。
 *
 * 主口径只在这里生效：收益从 `row.returns[horizon]` 现取，
 * 因此同一批 rows 可以反复聚合成不同口径，**无需重跑回评**。
 *
 * @param rows 全部样本
 * @param horizon 主口径
 */
export function aggregateAiBacktest(
  rows: AiBacktestRow[],
  horizon: AiBacktestHorizon
): AiBacktestAggregate {
  const usable = rows.filter((row) => returnOf(row, horizon) != null);
  const allValues = usable.map((row) => returnOf(row, horizon) as number);

  const overall = statOf(
    '全部',
    allValues,
    AI_BACKTEST_HIT_THRESHOLD,
    AI_BACKTEST_MIN_BUCKET_SAMPLES
  );

  const byDirection = DIRECTION_LABELS.map(({ key, label }) =>
    statOf(
      label,
      usable.filter((row) => row.direction === key).map((row) => returnOf(row, horizon) as number),
      AI_BACKTEST_HIT_THRESHOLD,
      AI_BACKTEST_MIN_BUCKET_SAMPLES
    )
  );

  const confidenceGroups = groupByBucket(
    rows,
    horizon,
    AI_BACKTEST_CONFIDENCE_EDGES,
    (row) => row.confidence
  );
  const byConfidence = AI_BACKTEST_CONFIDENCE_BUCKET_LABELS.map((label, idx) =>
    statOf(
      label,
      confidenceGroups.get(idx) ?? [],
      AI_BACKTEST_HIT_THRESHOLD,
      AI_BACKTEST_MIN_BUCKET_SAMPLES
    )
  );

  const scoreGroups = groupByBucket(
    rows,
    horizon,
    quantileEdges(rows.map((row) => row.totalScore), QUINTILE_LABELS.length),
    (row) => row.totalScore
  );
  const byTotalScore = QUINTILE_LABELS.map((label, idx) =>
    statOf(label, scoreGroups.get(idx) ?? [], AI_BACKTEST_HIT_THRESHOLD, AI_BACKTEST_MIN_BUCKET_SAMPLES)
  );

  return {
    horizon,
    totalRows: rows.length,
    usableRows: usable.length,
    benchmarkAvgReturn: overall.avgReturn,
    overall,
    byDirection,
    byConfidence,
    byTotalScore,
    dimensions: SCORE_DIMENSIONS.map((dim) => dimensionStat(dim, rows, horizon)),
    confidenceIC: meanSectionIC(rows, horizon, (row) => row.confidence),
    scoreIC: meanSectionIC(rows, horizon, (row) => row.totalScore),
    minBucketSamples: AI_BACKTEST_MIN_BUCKET_SAMPLES,
  };
}
