/**
 * 将「按需拉取」的营收 / 归母净利润指标合并到股票行。
 *
 * 属于纯内存态合并（不参与分析持久化），未命中缓存的股票原样返回，
 * 命中时返回新对象以触发 React 更新。
 */

import type { StockFinanceMetrics } from '@/types/stock';

/**
 * 把 financeMap 中的指标按 code 合并进列表。
 * financeMap 为空时直接返回原数组引用。
 */
export function mergeFinanceMetrics<T extends { code: string }>(
  items: T[],
  financeMap: Record<string, StockFinanceMetrics>
): Array<T & { finance?: StockFinanceMetrics }> {
  if (Object.keys(financeMap).length === 0) {
    return items;
  }
  return items.map((item) => {
    const finance = financeMap[item.code];
    return finance ? { ...item, finance } : item;
  });
}
