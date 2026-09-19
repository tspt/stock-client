/**
 * 基本面分析服务模块
 */

export { getFundamentalAnalysis } from './api';
export {
  getSinaFinanceMetrics,
  getSinaFinanceMetricsBatch,
} from './sinaFinance';
export type { SinaFinanceBatchOptions } from './sinaFinance';
export type {
  FundamentalAnalysis,
  FinancialStatement,
  ValuationAnalysis,
  IndustryComparison,
  ResearchReportSummary,
  StockFinanceMetrics,
} from '@/types/stock';
