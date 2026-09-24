/**
 * 表格排序口径（表格 ↔ K线/筹码弹窗导航共用）
 *
 * 背景：K线/筹码弹窗支持 ← / → 切换到表格上一行 / 下一行。
 * antd 的排序默认发生在表格组件内部，页面侧拿不到结果，
 * 因此这里把「取值 + 比较」抽成与 antd 完全同口径的函数：
 * - 机会分析页：列 sorter 与导航排序共用 createOpportunityColumnSorter；
 * - 周线选股 / 历史回测：直接复用列上声明的 sorter 函数复现展示顺序。
 */

import type { Key } from 'react';
import type { SortOrder } from 'antd/es/table/interface';
import type { OverviewSortConfig, StockOpportunityData, TradingSignalType } from '@/types/stock';

/**
 * 交易信号排序权重：买入类相邻、卖出类相邻，观望排在最后。
 * 升序顺序：建议买入 → 强烈买入 → 建议卖出 → 强烈卖出 → 观望（无信号始终最后）
 */
export const TRADING_SIGNAL_SORT_WEIGHT: Record<TradingSignalType, number> = {
  BUY: 0,
  STRONG_BUY: 1,
  SELL: 2,
  STRONG_SELL: 3,
  HOLD: 4,
};

/** 取记录在某一列上的排序值（口径与机会分析表格列 sorter 一致） */
export function getOpportunitySortValue(
  record: StockOpportunityData,
  key: string
): string | number | null | undefined {
  switch (key) {
    case 'consolidationStatus':
      return record.consolidation?.isConsolidation ? 1 : 0;
    case 'consolidationTypes':
      return record.consolidation?.matchedTypeLabels?.join('、') ?? '';
    case 'consolidationReason':
      return record.consolidation?.reasonText ?? '';
    case 'trendLineStatus':
      return record.trendLine?.isHit ? 1 : 0;
    case 'trendLineReason':
      return record.trendLine?.reasonText ?? '';
    case 'sharpMoveLabels':
      return record.sharpMovePatterns?.labels?.join('、') ?? '';
    case 'pullbackLabels':
      return record.pullbackPattern?.labels?.join('、') ?? '';
    case 'industry':
      return record.industry?.name ?? '';
    case 'concepts':
      return record.concepts?.map((c) => c.name).join('、') ?? '';
    case 'tradingSignal': {
      const signalType = record.tradingSignal?.type;
      // 用权重而非类型字符串排序：避免 HOLD 插在买入与卖出之间、且 STRONG_* 被字典序排到最后
      return signalType ? TRADING_SIGNAL_SORT_WEIGHT[signalType] ?? 5 : undefined;
    }
    case 'financeRevenue':
      return record.finance?.revenue;
    case 'financeNetProfit':
      return record.finance?.netProfit;
    default:
      return (record as unknown as Record<string, string | number | null | undefined>)[key];
  }
}

/** 通用比较：空值恒排在后（与 antd 的排序方向相乘后即为「升序在后、降序在前」） */
export function compareOpportunitySortValue(
  aVal: string | number | null | undefined,
  bVal: string | number | null | undefined
): number {
  if (aVal === null || aVal === undefined || aVal === '') return 1;
  if (bVal === null || bVal === undefined || bVal === '') return -1;
  if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
  return String(aVal).localeCompare(String(bVal));
}

/** 生成机会分析某一列的比较函数（表格列 sorter 与导航排序共用同一实现） */
export function createOpportunityColumnSorter(key: string) {
  return (a: StockOpportunityData, b: StockOpportunityData): number =>
    compareOpportunitySortValue(getOpportunitySortValue(a, key), getOpportunitySortValue(b, key));
}

/**
 * 按排序配置排出一份新数组，结果与 antd 表格内部排序一致：
 * antd 在 descend 时对比较结果取负（ascend 为 1、descend 为 -1），且同为稳定排序。
 */
export function sortOpportunityData<T extends StockOpportunityData>(
  data: T[],
  sortConfig: OverviewSortConfig
): T[] {
  const { key, direction } = sortConfig;
  if (!key || !direction) return data;
  const compare = createOpportunityColumnSorter(key);
  const factor = direction === 'desc' ? -1 : 1;
  return data.slice().sort((a, b) => factor * compare(a, b));
}

/** 表格当前排序状态；columnKey / order 为 null 表示未排序 */
export interface ActiveTableSorter {
  columnKey: string | null;
  order: SortOrder | null;
}

/** 复现表格顺序所需的最小列结构（antd 列上取用到的那几个字段） */
export interface SortableTableColumn {
  key?: Key;
  dataIndex?: unknown;
  sorter?: unknown;
  defaultSortOrder?: SortOrder | null;
}

/** 列 key 口径与 antd 保持一致：优先 key，其次 dataIndex */
function columnKeyOf(column: SortableTableColumn): string {
  return String(column.key ?? column.dataIndex);
}

/**
 * 取列上声明的默认排序（antd `defaultSortOrder`）。
 * 仅用于「用户还没点过表头排序」时的兜底，保证首屏导航顺序与表格一致。
 */
export function findDefaultTableSorter(
  columns: readonly SortableTableColumn[]
): ActiveTableSorter {
  const column = columns.find((item) => item.defaultSortOrder);
  if (!column) return { columnKey: null, order: null };
  return { columnKey: columnKeyOf(column), order: column.defaultSortOrder ?? null };
}

/**
 * 用列自身声明的 sorter 复现 antd 表格的展示顺序。
 * antd 内部为 `sortOrder === 'descend' ? -compareResult : compareResult`，这里保持同一口径，
 * 且同样使用稳定排序（Array.prototype.sort），因此与表格逐行一致。
 */
export function sortRowsByTableSorter<R>(
  rows: readonly R[],
  columns: readonly SortableTableColumn[],
  sorter: ActiveTableSorter
): R[] {
  const { columnKey, order } = sorter;
  if (!columnKey || !order) return rows.slice();
  const column = columns.find((item) => columnKeyOf(item) === columnKey);
  if (!column || typeof column.sorter !== 'function') return rows.slice();
  const compare = column.sorter as (a: R, b: R, sortOrder?: SortOrder) => number;
  const factor = order === 'descend' ? -1 : 1;
  return rows.slice().sort((a, b) => factor * compare(a, b, order));
}
