import type { KLineData, StockOpportunityData } from '@/types/stock';
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
}

export interface OpportunityFilterWorkerClearAICacheRequest {
  type: 'clear-ai-cache';
}

export type OpportunityFilterWorkerMessage =
  | OpportunityFilterWorkerRequest
  | OpportunityFilterWorkerSetDataFullRequest
  | OpportunityFilterWorkerSetDataPatchRequest
  | OpportunityFilterWorkerCancelRequest
  | OpportunityFilterWorkerClearAICacheRequest;

export interface OpportunityFilterWorkerResponse {
  type: 'result';
  requestId: number;
  cancelled: boolean;
  data: StockOpportunityData[];
  skipped: FilterSkippedItem[];
}
