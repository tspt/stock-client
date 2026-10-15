/**
 * AI 胜率回评 Worker 的消息协议
 *
 * K 线数据只传一次（set-data）：截面上要反复重算指标，
 * 每次 run 都重传数千只 × 数百根会白白付出结构化克隆成本。
 */

import type { KLineData } from '@/types/stock';
import type { AiBacktestRow, AiBacktestSkipReason } from '@/utils/analysis/aiBacktest';

/** 同步回测用前复权日线（全量覆盖） */
export interface AiBacktestWorkerSetDataRequest {
  type: 'set-data';
  entries: Array<[string, { name: string; kline: KLineData[] }]>;
}

/**
 * 开始回评。
 *
 * 注意：
 * - 参与回测的股票池由主线程在 set-data 时就已裁剪（见 useAiBacktestEngine），
 *   因为把全市场 K 线结构化克隆进 Worker 会付出上百 MB 的代价；
 * - **不传主口径**：Worker 只负责产出含 d1~d6 全量快照的样本行，
 *   口径差异由主线程聚合时处理，因此切换口径无需重跑。
 */
export interface AiBacktestWorkerRunRequest {
  type: 'run';
  requestId: number;
  /** 采样截面数 */
  sectionCount: number;
  /** 采样步长（每 N 个交易日取一个截面） */
  sectionStep: number;
}

export interface AiBacktestWorkerCancelRequest {
  type: 'cancel';
  requestId: number;
}

export type AiBacktestWorkerMessage =
  | AiBacktestWorkerSetDataRequest
  | AiBacktestWorkerRunRequest
  | AiBacktestWorkerCancelRequest;

export interface AiBacktestWorkerProgressResponse {
  type: 'progress';
  requestId: number;
  completed: number;
  total: number;
  percent: number;
}

export interface AiBacktestWorkerResultResponse {
  type: 'result';
  requestId: number;
  cancelled: boolean;
  rows: AiBacktestRow[];
  /** 实际使用的截面日 */
  sectionDates: string[];
  /** 实际参与回测的股票数（即 set-data 时送进来的股票数） */
  universeSize: number;
  /** 按原因统计被跳过的样本数（含除权跳空剔除量） */
  skipped: Partial<Record<AiBacktestSkipReason, number>>;
}

export type AiBacktestWorkerOutboundMessage =
  | AiBacktestWorkerProgressResponse
  | AiBacktestWorkerResultResponse;
