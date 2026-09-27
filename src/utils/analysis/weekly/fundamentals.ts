/**
 * 基本面（总市值 / 总股数 / 营收 / 净利润及其增长率 / ROE / 资产负债率）的构造与合并。
 *
 * 单位约定（与机会分析页、周线筛选口径一致）：
 * - marketCap：亿元（腾讯详情接口字段 45 的原始单位）
 * - totalShares：亿股（机会分析给的是「股」，需 /1e8；由市值反推时 市值(亿)/价格(元) 即为亿股）
 * - financeRevenue / financeNetProfit：亿元
 * - financeRevenueGrowth / financeNetProfitGrowth：%
 *
 * 数据来源（周线页口径，均不额外发网络请求）：
 * 1. 总市值 / 总股数：日线 IndexedDB（`stockHistory.latestDetail`）为首选来源
 *    —— 记录按 code 长期保留，比「只覆盖最近一次分析」的机会分析结果覆盖面更广，
 *    也包含只看过个股详情（DetailPage）的股票；
 * 2. 机会分析结果（`opportunity.latest`）：只用来兜底补齐日线缓存里没有市值的个股（同源，单位一致）；
 * 3. 财务指标（营收/净利润/增长率/ROE/资产负债率）：财务 IndexedDB（`stockFinanceMetrics`），
 *    由「获取财务指标」写入，跨重启复用。
 *
 * 取不到数据的个股对应字段为 undefined，筛选侧按「缺值不参与该项筛选」处理
 * （见 select.ts 的 passRange），避免默认区间把缺数据个股静默剔除。
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
 * 机会分析结果里与市值/股数相关的字段。
 * 只声明这几个字段，页面可直接把 `result.data` 传进来，无需依赖完整数据结构。
 */
export interface OpportunityMarketCapSource {
  code: string;
  /** 总市值（亿元） */
  marketCap?: number;
  /** 总股数（股，机会分析输出的原始单位） */
  totalShares?: number;
  /** 最新价（元） */
  price?: number;
}

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

/** 从单条日线缓存记录取出「总市值(亿)」，取不到返回 undefined */
function marketCapOf(record: StockHistoryRecord): number | undefined {
  const marketCap = record.latestDetail?.marketCap;
  return marketCap !== undefined && Number.isFinite(marketCap) ? marketCap : undefined;
}

/**
 * 最近可得价格（元）：优先日线缓存里的最新行情价，其次最后一根日K的收盘价。
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
 * 用日线 IndexedDB（`stockHistory`）写入总市值 / 总股数——市值与股数的首选来源，同 code 覆盖写入。
 *
 * 覆盖而不是「只补缺失」：日线缓存的 `latestDetail` 就是详情接口原值，按 code 长期保留，
 * 比机会分析只存一条 `latest`（每次分析整体覆盖，只覆盖最近一批股票）覆盖面更广、也更贴近个股当前状态。
 * 价格取不到时只写市值，总股数留空（筛选侧会按缺值跳过）。
 */
export function applyMarketCapFromHistories(
  map: FundamentalsMap,
  histories: StockHistoryRecord[]
): void {
  histories.forEach((record) => {
    const marketCap = marketCapOf(record);
    if (marketCap === undefined) return;
    const price = latestPriceOf(record);
    const prev = map.get(record.code) ?? {};
    map.set(record.code, {
      ...prev,
      marketCap,
      // 市值(亿) / 价格(元) = 总股数(亿股)
      totalShares: price !== undefined ? marketCap / price : undefined,
    });
  });
}

/**
 * 用机会分析结果兜底补齐总市值 / 总股数。
 *
 * 只补日线缓存没覆盖到的个股（机会分析结果与详情接口同源、单位一致，
 * 但它在 IndexedDB 里只有一条 `latest` 记录，覆盖面受最近一次分析的股票池限制），
 * 已有值不覆盖。
 */
export function fillMarketCapFromOpportunity(
  map: FundamentalsMap,
  data: readonly OpportunityMarketCapSource[]
): void {
  data.forEach((item) => {
    const prev = map.get(item.code) ?? {};
    if (prev.marketCap !== undefined && prev.totalShares !== undefined) return;
    const totalShares =
      item.totalShares !== undefined
        ? item.totalShares / YI
        : item.marketCap !== undefined && item.price !== undefined && item.price > 0
          ? item.marketCap / item.price
          : undefined;
    map.set(item.code, {
      ...prev,
      marketCap: prev.marketCap ?? item.marketCap,
      totalShares: prev.totalShares ?? totalShares,
    });
  });
}
