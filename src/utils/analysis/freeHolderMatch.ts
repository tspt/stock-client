/**
 * 机会分析「十大流通股东」筛选：把 F10 缓存记录整理成「代码 → 股东名称列表」，
 * 并按关键词做模糊（包含）匹配。
 *
 * 数据来源是本地 F10 缓存（utils/storage/f10IndexedDB），只有用户加载过 F10 的
 * 股票才有数据。因此约定「无数据即放行」：没有十大流通股东数据的股票照常展示，
 * 避免把尚未取数的标的整体剔除。
 */

import type { F10CacheRecord } from '@/types/f10';
import { getPureCode, normalizeStockName } from '@/utils/format/format';

/** 纯数字代码 → 十大流通股东名称列表（只收录确实有数据的股票） */
export type FreeHolderNamesByCode = Map<string, string[]>;

/**
 * 从 F10 缓存记录提取「纯数字代码 → 股东名称列表」。
 * 代码统一用 getPureCode 归一：F10 缓存主键是 SH600000 这类统一格式，
 * 与不同来源的代码写法对齐后再做查表，避免格式差异导致匹配整体失效。
 * 无 freeHolders 区块或名单为空时不写入，读取侧据此判定「无数据」。
 */
export function buildFreeHolderNamesByCode(records: F10CacheRecord[]): FreeHolderNamesByCode {
  const map: FreeHolderNamesByCode = new Map();
  for (const record of records) {
    const code = getPureCode(record.code || '');
    if (!code) {
      continue;
    }
    const names = (record.freeHolders?.data ?? [])
      .map((item) => normalizeStockName(item.holderName || ''))
      .filter(Boolean);
    if (names.length > 0) {
      map.set(code, names);
    }
  }
  return map;
}

/** 查某只股票的股东名称列表；无数据返回 undefined（调用方据此放行） */
export function getFreeHolderNames(
  map: FreeHolderNamesByCode,
  code: string
): string[] | undefined {
  if (map.size === 0 || !code) {
    return undefined;
  }
  return map.get(getPureCode(code));
}

/**
 * 十大流通股东关键词匹配（模糊包含，大小写不敏感）。
 * - 关键词为空：不过滤，返回 true；
 * - 该股票无十大流通股东数据：放行，返回 true；
 * - 有数据：任一股东名称包含任一关键词即匹配。
 */
export function matchFreeHolderKeywords(
  names: string[] | undefined,
  keywords: string[]
): boolean {
  const normalized = keywords.map((keyword) => normalizeStockName(keyword).toLowerCase()).filter(Boolean);
  if (normalized.length === 0 || !names || names.length === 0) {
    return true;
  }
  return names.some((name) => {
    const value = normalizeStockName(name).toLowerCase();
    return normalized.some((keyword) => value.includes(keyword));
  });
}
