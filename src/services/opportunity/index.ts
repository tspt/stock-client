/**
 * 机会分析服务模块
 */

export { analyzeAllStocksOpportunity } from './analyzer';
export { performAIAnalysis, predictTrend, findSimilarPatterns } from './ai';
export type {
  StockOpportunityData,
  AIAnalysisResult,
  TrendPrediction,
  SimilarPatternMatch,
} from '@/types/stock';
