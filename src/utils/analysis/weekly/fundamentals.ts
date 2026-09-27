/**
 * 基本面（总市值 / 总股数 / 营收 / 净利润及其增长率 / ROE / 资产负债率）的构造与合并。
 *
 * 单位约定（与机会分析页、周线筛选口径一致）：
 * - marketCap：亿元（腾讯详情接口字段 45 的原始单位）
 * - totalShares：亿股（机会分析给的是「股」，需 /1e8；由市值反推时 市值(亿)/价格(元) 即为亿股）
 * - financeRevenue / financeNetProfit：亿元
 * - financeRevenueGrowth / financeNetProfitGrowth：%
 *
 * 数据来源与优先级：
 * 1. 机会分析（IndexedDB `opportunity.latest`）：口径最权威，但只覆盖「最近一次分析过的那批股票」；
 * 2. 日K缓存（IndexedDB `stockHistory.latestDetail`）：覆盖面可能更广，仅用于补齐缺失项，不覆盖已有值。
 */

import type { StockFinanceMetrics } from '@/types/stock';
import type { StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';
import { YI } from './index';

/** 单只股票的基本面（均为筛选单位：亿 / 亿股 / %） */
export interface FundamentalsEntry {
  marketCap?: number;
  totalShares?: number;
  financeRevenue?: number;
  financeNetProfit?: number;
  financeRevenueGrowth?: number;
  financeNetProfitGrowth?: number;
  /** 净资产收益率 ROE（%），接口原值已是百分数 */
  financeRoe?: number;
  /** 资产负债率（%），接口原值已是百分数 */
  financeDebtRatio?: number;
}

/** code → 基本面 */
export type FundamentalsMap = Map<string, FundamentalsEntry>;

/**
 * 把单只股票的最新财务指标折算成「亿元 / %」写入基本面 Map。
 * 与既有实现保持一致：指标缺失时对应字段写为 undefined。
 * ROE / 资产负债率接口原值已是百分数，直接透传。
 */
export function applyFinanceMetrics(
  map: FundamentalsMap,
  code: string,
  metrics: StockFinanceMetrics
): void {
  const prev = map.get(code) ?? {};
  map.set(code, {
    ...prev,
    financeRevenue: metrics.revenue !== undefined ? metrics.revenue / YI : undefined,
    financeNetProfit: metrics.netProfit !== undefined ? metrics.netProfit / YI : undefined,
    financeRevenueGrowth: metrics.revenueYoy,
    financeNetProfitGrowth: metrics.netProfitYoy,
    financeRoe: metrics.roe,
    financeDebtRatio: metrics.debtRatio,
  });
}

/** 从单条日K缓存记录取出「总市值(亿)」，取不到返回 undefined */
function marketCapOf(record: StockHistoryRecord): number | undefined {
  const marketCap = record.latestDetail?.marketCap;
  return marketCap !== undefined && Number.isFinite(marketCap) ? marketCap : undefined;
}

/**
 * 最近可得价格（元）：优先日K缓存里的最新行情价，其次最后一根日K的收盘价。
 * 仅用于把「总市值(亿)」换算成「总股数(亿股)」。
 */
function latestPriceOf(record: StockHistoryRecord): number | undefined {
  const quotePrice = record.latestQuote?.price;
  if (quotePrice !== undefined && Number.isFinite(quotePrice) && quotePrice > 0) return quotePrice;
  const lastBar = record.dailyLines?.[record.dailyLines.length - 1];
  const close = lastBar?.close;
  return close !== undefined && Number.isFinite(close) && close > 0 ? close : undefined;
}

/**
 * 用日K缓存（stockHistory）兜底补齐总市值 / 总股数。
 *
 * 修复背景：机会分析在 IndexedDB 里只写一条 `latest` 记录，每次分析都整体覆盖，
 * 因此只覆盖「最近一次分析过的那批股票」；周线页股票池通常更大，其余股票此前
 * 取不到 marketCap / totalShares，会被 applyWeeklyFilters 的 withinRange
 * 直接判定为不通过（表现为「总市值 / 总股数」筛选不生效或结果异常）。
 *
 * 只补缺失项：机会分析已给出的值更权威，不覆盖。
 */
export function mergeFundamentalsFromHistories(
  map: FundamentalsMap,
  histories: StockHistoryRecord[]
): void {
  histories.forEach((record) => {
    const marketCap = marketCapOf(record);
    if (marketCap === undefined) return;
    const prev = map.get(record.code) ?? {};
    if (prev.marketCap !== undefined && prev.totalShares !== undefined) return;
    const price = latestPriceOf(record);
    map.set(record.code, {
      ...prev,
      marketCap: prev.marketCap ?? marketCap,
      totalShares: prev.totalShares ?? (price !== undefined ? marketCap / price : undefined),
    });
  });
}
