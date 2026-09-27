/**
 * stockHistory 记录的合并写入工具。
 *
 * 背景：`stockHistory` 有多个写入方，各自只持有部分字段
 * （详情接口只有 `latestDetail`、K 线接口只有 `dailyLines`）。
 * 若直接整条覆盖，就会用空值把对方已写入的数据抹掉
 * —— 线上真实踩过：拉个股详情会把该股的 `dailyLines` 写成空数组。
 *
 * 因此统一按「字段级合并」写入：
 * - 新值非空才覆盖，空值一律保留旧值；
 * - `dailyLines` 按时间取并集（同一时间以新数据为准），长度截到两者中更长的那份：
 *   既避免「只请求 60 根把小请求把长历史截短」，也避免记录随日积月累无限膨胀。
 *
 * 注意：这里只合并「日线」，且写入 stockHistory 的日线一律是不复权数据
 * （见 services/stocks/api.ts 的 syncDailyHistoryToIndexedDB），故按时间合并不会串口径。
 */

import type { KLineData } from '@/types/stock';
import type { StockHistoryRecord } from './opportunityIndexedDB';

/**
 * 合并日线数组：按时间取并集，冲突时新数据优先，结果不短于「旧数据」。
 *
 * @param previous 已存在的日线
 * @param incoming 本次写入的日线（空数组表示本次不涉及日线）
 */
export function mergeDailyLines(
  previous: KLineData[] | undefined,
  incoming: KLineData[] | undefined
): KLineData[] {
  const prev = previous ?? [];
  const next = incoming ?? [];

  if (next.length === 0) return prev;
  if (prev.length === 0) return next;

  const byTime = new Map<number, KLineData>();
  prev.forEach((bar) => byTime.set(bar.time, bar));
  next.forEach((bar) => byTime.set(bar.time, bar));

  const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
  const cap = Math.max(prev.length, next.length);
  return merged.length > cap ? merged.slice(-cap) : merged;
}

/**
 * 合并 stockHistory 记录：新记录只覆盖它确实持有的字段。
 */
export function mergeStockHistoryRecord(
  previous: StockHistoryRecord | undefined,
  incoming: StockHistoryRecord
): StockHistoryRecord {
  return {
    code: incoming.code,
    name: incoming.name || previous?.name || '',
    dailyLines: mergeDailyLines(previous?.dailyLines, incoming.dailyLines),
    latestQuote: incoming.latestQuote ?? previous?.latestQuote ?? null,
    latestDetail: incoming.latestDetail ?? previous?.latestDetail ?? null,
  };
}
