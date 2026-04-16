/**
 * Services 统一导出
 * 提供向后兼容的接口，逐步迁移到新路径
 */

// Hot 模块
export { getMarketOverview } from './hot';
export type { MarketOverview } from './hot';
export { getRisingSectors, getFallingSectors, getSectorRanks } from './hot';

// Stocks 模块
export {
  getAllStocks,
  getStockQuotes,
  getStockDetail,
  getKLineData,
  searchStockLocal,
} from './stocks';

// Alerts 模块
export { sendAlertNotification } from './alerts';
export { initNotificationNavigation } from './alerts';

// Overview 模块
export { analyzeAllStocks } from './overview';

// Opportunity 模块
export { analyzeAllStocksOpportunity } from './opportunity';
export { performAIAnalysis, predictTrend, findSimilarPatterns } from './opportunity';

// Fundamental 模块
export { getFundamentalAnalysis } from './fundamental';

// Core 模块
export { cacheManager, apiCache } from './core';
export type { CacheConfig } from './core';
