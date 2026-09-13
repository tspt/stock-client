import type { KLineData, StockOpportunityData, TradingSignal } from '@/types/stock';
import type { FilterSkippedItem, OpportunityFilterSnapshot } from '@/types/opportunityFilter';

export interface OpportunityFilterWorkerRequest {
  type: 'filter';
  requestId: number;
  analysisData: StockOpportunityData[];
  filters: OpportunityFilterSnapshot;
}

export interface OpportunityFilterWorkerSetDataFullRequest {
  type: 'set-data-full';
  klineDataEntries: Array<[string, KLineData[]]>;
}

export interface OpportunityFilterWorkerSetDataPatchRequest {
  type: 'set-data-patch';
  upsertEntries: Array<[string, KLineData[]]>;
  removeCodes: string[];
}

export interface OpportunityFilterWorkerCancelRequest {
  type: 'cancel';
  requestId: number;
  /** 指定取消哪类任务；不传则全部取消（兼容旧行为） */
  task?: 'filter' | 'ai' | 'signals';
}

export interface OpportunityFilterWorkerClearAICacheRequest {
  type: 'clear-ai-cache';
}

/** 批量重算 AI 分析（切换 AI 版本时使用，在 Worker 中执行避免阻塞主线程） */
export interface OpportunityFilterWorkerRecomputeAIRequest {
  type: 'recompute-ai';
  requestId: number;
  analysisData: StockOpportunityData[];
}

/** 批量检测交易信号（在 Worker 中执行，K 线数据已由 set-data 同步） */
export interface OpportunityFilterWorkerDetectSignalsRequest {
  type: 'detect-signals';
  requestId: number;
  codes: string[];
}

export type OpportunityFilterWorkerMessage =
  | OpportunityFilterWorkerRequest
  | OpportunityFilterWorkerSetDataFullRequest
  | OpportunityFilterWorkerSetDataPatchRequest
  | OpportunityFilterWorkerCancelRequest
  | OpportunityFilterWorkerClearAICacheRequest
  | OpportunityFilterWorkerRecomputeAIRequest
  | OpportunityFilterWorkerDetectSignalsRequest;

export interface OpportunityFilterWorkerResponse {
  type: 'result';
  requestId: number;
  cancelled: boolean;
  data: StockOpportunityData[];
  skipped: FilterSkippedItem[];
}

export interface OpportunityFilterWorkerAIProgressResponse {
  type: 'ai-progress';
  requestId: number;
  completed: number;
  total: number;
  percent: number;
}

export interface OpportunityFilterWorkerAIResultResponse {
  type: 'ai-result';
  requestId: number;
  cancelled: boolean;
  data: StockOpportunityData[];
  updatedCount: number;
  skippedCount: number;
}

export interface OpportunityFilterWorkerSignalsProgressResponse {
  type: 'signals-progress';
  requestId: number;
  completed: number;
  total: number;
  percent: number;
}

export interface OpportunityFilterWorkerSignalsResultResponse {
  type: 'signals-result';
  requestId: number;
  cancelled: boolean;
  signals: Array<[string, TradingSignal]>;
}

/** Worker → 主线程 的全部响应 */
export type OpportunityFilterWorkerOutboundMessage =
  | OpportunityFilterWorkerResponse
  | OpportunityFilterWorkerAIProgressResponse
  | OpportunityFilterWorkerAIResultResponse
  | OpportunityFilterWorkerSignalsProgressResponse
  | OpportunityFilterWorkerSignalsResultResponse;
