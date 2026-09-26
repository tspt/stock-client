/**
 * 机会分析 K 线的存储归属策略。
 *
 * 写入（utils/storage/opportunityIndexedDB）与读取（services/opportunity/klineSource）
 * 共用本判定，避免「写进去的和读出来的」不是同一套口径。
 *
 * 背景：
 * - `stockHistory.dailyLines` 只收真实的日线历史（api.ts 里明确只有 period === 'day' 才写），
 *   而机会分析取日线时经 `getKLineData` 已经旁路写入了该表，无需重复落盘；
 * - 周/月/年线写进 `dailyLines` 会污染日线数据（历史上「周线覆盖日线」导致分析/导出失真）；
 * - 截止日（回测）模式的数据是按历史某日截断的「回看视角」，写回 stockHistory 会污染真实历史。
 *
 * 因此只有后两类必须落 `opportunityKlineCache` 独立表。
 */

import type { KLinePeriod } from '@/types/stock';

/**
 * 该次分析的 K 线是否需要写入/读取独立缓存表 opportunityKlineCache。
 *
 * @param period 本次分析的 K 线周期
 * @param asOfDate 截止日（YYYY-MM-DD），仅存在于回测模式
 */
export function needsDedicatedKlineStore(
  period: KLinePeriod,
  asOfDate?: string | null
): boolean {
  // 非日线：stockHistory 只收日线，写进去会污染真实历史
  if (period !== 'day') return true;
  // 日线 + 截止日：数据被截断到某个历史日期，同样不能写回 stockHistory
  return Boolean(asOfDate);
}
