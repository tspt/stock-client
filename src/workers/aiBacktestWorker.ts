/**
 * AI 胜率回评 Worker
 *
 * 为什么必须放 Worker：一次回评要对「截面数 × 股票数」个 (股票, 截面) 组合重算
 * 一整套指标（MA/RSI/MACD/布林/KDJ/形态），默认规模即 20 × 1000 = 2 万次 O(n) 计算，
 * 放主线程会长时间卡死界面。
 *
 * 性能要点：每只股票的「日期 → 下标」索引与「除权跳空下标」都在 set-data 时只算一次。
 * 若放到每条样本里现算，会退化成千万次 `new Date` 格式化与重复扫描。
 *
 * AI 打分直接复用线上实现 `ai-v5.0.performAIAnalysis`（不传股票池 → 跳过相似形态），
 * 保证回测评的是**真实的线上管线**，而不是第二套近似实现。
 *
 * 数据源是不复权的 stockHistory 日线；除权跳空由 `detectExDividendGaps` 识别后
 * 整条剔除（见 `utils/analysis/aiBacktest`）。
 */

import { performAIAnalysis } from '@/services/opportunity/ai-v5.0';
import {
  buildBacktestRow,
  buildKlineDateIndex,
  buildSectionDates,
  collectTradingDatesFromIndexes,
  detectExDividendGaps,
  type AiBacktestRow,
  type AiBacktestScorer,
  type AiBacktestSkipReason,
} from '@/utils/analysis/aiBacktest';
import {
  AI_BACKTEST_MIN_WARMUP_BARS,
  AI_BACKTEST_TAIL_RESERVE_BARS,
} from '@/utils/config/aiBacktestOptions';
import type { KLineData } from '@/types/stock';
import type {
  AiBacktestWorkerMessage,
  AiBacktestWorkerOutboundMessage,
} from './aiBacktestWorkerTypes';

interface BacktestStock {
  name: string;
  /** 完整日线（时间从旧到新） */
  kline: KLineData[];
  /** 日期(YYYY-MM-DD) → 下标，set-data 时只建一次 */
  dateIndex: Map<string, number>;
  /** 除权跳空下标（升序），set-data 时只算一次 */
  gapIndexes: number[];
}

/** 参与回评的股票数据 */
let stockMap = new Map<string, BacktestStock>();
/** set-data 后预先算好的交易日序列，run 时复用 */
let tradingDates: string[] = [];

let cancelledThroughRequestId = 0;
/** 每处理多少个 (股票, 截面) 组合让出一次主线程 */
const YIELD_EVERY_ITEMS = 200;

/**
 * 线上 AI 管线的最小适配：只取可回测的字段。
 *
 * 不传 `allStockData` → `performAIAnalysis` 跳过相似形态识别
 * （那部分依赖全池比对，不参与评分）。
 */
const scoreWithLivePipeline: AiBacktestScorer = ({ bars, scorable }) => {
  try {
    const result = performAIAnalysis(bars, scorable);
    const trend = result.trendPrediction;
    const rec = result.recommendation;
    if (!trend || !rec) return null;
    return {
      direction: trend.direction,
      confidence: trend.confidence,
      totalScore: rec.totalScore,
      // 分项评分一并带出：总评分 IC 只能说明「整体有没有信息」，
      // 分项 IC 才能定位信息来自哪个维度，决定该强化哪部分逻辑
      technicalScore: rec.technicalScore,
      patternScore: rec.patternScore,
      trendScore: rec.trendScore,
      riskScore: rec.riskScore,
      signalCount: trend.signalCount,
      totalSignals: trend.totalSignals,
      riskRewardRatio: trend.riskRewardRatio,
    };
  } catch {
    return null;
  }
};

function post(message: AiBacktestWorkerOutboundMessage): void {
  self.postMessage(message);
}

function shouldCancel(requestId: number): boolean {
  return requestId <= cancelledThroughRequestId;
}

async function runBacktest(
  message: Extract<AiBacktestWorkerMessage, { type: 'run' }>
): Promise<void> {
  const { requestId, sectionCount, sectionStep } = message;

  const codes = Array.from(stockMap.keys()).sort();
  const universeSize = codes.length;

  const sectionDates = buildSectionDates(tradingDates, {
    count: sectionCount,
    step: sectionStep,
    headMargin: AI_BACKTEST_MIN_WARMUP_BARS,
    tailMargin: AI_BACKTEST_TAIL_RESERVE_BARS,
  });

  const total = sectionDates.length * universeSize;
  const rows: AiBacktestRow[] = [];
  const skipped: Partial<Record<AiBacktestSkipReason, number>> = {};
  let completed = 0;

  const tally = (reason: AiBacktestSkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  const postProgress = (force = false) => {
    if (!force && completed % YIELD_EVERY_ITEMS !== 0) return;
    post({
      type: 'progress',
      requestId,
      completed,
      total,
      percent: total > 0 ? Math.floor((completed / total) * 100) : 100,
    });
  };

  const postCancelled = () => {
    post({
      type: 'result',
      requestId,
      cancelled: true,
      rows: [],
      sectionDates,
      universeSize,
      skipped,
    });
  };

  postProgress(true);

  for (const sectionDate of sectionDates) {
    if (shouldCancel(requestId)) {
      postCancelled();
      return;
    }

    for (const code of codes) {
      const stock = stockMap.get(code);
      if (stock) {
        const outcome = buildBacktestRow({
          code,
          name: stock.name,
          kline: stock.kline,
          sectionIndex: stock.dateIndex.get(sectionDate) ?? null,
          sectionDate,
          minWarmupBars: AI_BACKTEST_MIN_WARMUP_BARS,
          gapIndexes: stock.gapIndexes,
          score: scoreWithLivePipeline,
        });

        if (outcome.ok) rows.push(outcome.row);
        else tally(outcome.reason);
      }

      completed += 1;
      if (completed % YIELD_EVERY_ITEMS === 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        if (shouldCancel(requestId)) {
          postCancelled();
          return;
        }
        postProgress();
      }
    }

    postProgress(true);
  }

  post({
    type: 'result',
    requestId,
    cancelled: false,
    rows,
    sectionDates,
    universeSize,
    skipped,
  });
}

self.onmessage = (event: MessageEvent<AiBacktestWorkerMessage>) => {
  const message = event.data;

  if (message.type === 'set-data') {
    stockMap = new Map(
      message.entries.map(([code, item]) => [
        code,
        {
          name: item.name,
          kline: item.kline,
          dateIndex: buildKlineDateIndex(item.kline),
          gapIndexes: detectExDividendGaps(item.kline, code, item.name),
        },
      ])
    );
    tradingDates = collectTradingDatesFromIndexes(
      Array.from(stockMap.values()).map((item) => item.dateIndex)
    );
    return;
  }

  if (message.type === 'cancel') {
    cancelledThroughRequestId = Math.max(cancelledThroughRequestId, message.requestId);
    return;
  }

  if (message.type === 'run') {
    // 上一轮若仍在跑，直接作废：避免两轮循环交错把结果写乱
    cancelledThroughRequestId = Math.max(cancelledThroughRequestId, message.requestId - 1);
    void runBacktest(message);
  }
};
