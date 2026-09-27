/**
 * 财务指标报告期工具。
 *
 * 存储层不再保留写入时间戳（updatedAt），因此「最后更新 / 最新财报」这类展示
 * 改由财报自身的披露日期（publishDate）或报告期（reportDate）推导，
 * 避免为展示而多存一个与业务无关的字段。
 */

import type { StockFinanceMetrics } from '@/types/stock';

/** 最小记录形状：只要带 metrics 即可参与推导 */
interface FinanceRecordLike {
  metrics?: StockFinanceMetrics;
}

/**
 * YYYYMMDD（或带分隔符的日期串）→ 本地时间戳。
 * 仅用于比较报告期先后，非法 / 缺失值一律返回 0。
 */
export function parseFinanceDateKey(dateKey?: string | null): number {
  if (!dateKey) return 0;
  const digits = String(dateKey).replace(/\D/g, '');
  if (digits.length !== 8) return 0;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const time = new Date(year, month - 1, day).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * 取记录集中最新一期财报的时间戳：优先披露日期，缺失时回退报告期。
 * 全无有效日期时返回 0，由展示层判定为「未知」。
 */
export function getLatestFinanceReportTime(records: FinanceRecordLike[]): number {
  return records.reduce((latest, record) => {
    const { metrics } = record;
    if (!metrics) return latest;
    const time =
      parseFinanceDateKey(metrics.publishDate) || parseFinanceDateKey(metrics.reportDate);
    return Math.max(latest, time);
  }, 0);
}
