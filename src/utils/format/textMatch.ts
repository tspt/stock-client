/**
 * 股票列表的文本模糊匹配（名称 / 带前缀代码 / 纯数字代码）。
 */

import { getPureCode } from '@/utils/format/format';

/** 待匹配的最小结构 */
export interface KeywordMatchTarget {
  name?: string;
  code?: string;
}

/**
 * 名称、代码或纯数字代码任一命中关键词即视为匹配（大小写不敏感）。
 * 内部统一使用 getPureCode 去除市场前缀，避免各处手写正则。
 */
export function matchStockKeyword(item: KeywordMatchTarget, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) {
    return true;
  }
  const name = (item.name || '').toLowerCase();
  const code = (item.code || '').toLowerCase();
  const pureCode = getPureCode(item.code || '').toLowerCase();
  return name.includes(kw) || code.includes(kw) || pureCode.includes(kw);
}

/** 过滤列表；关键词为空时原样返回（保持引用不变，避免多余渲染） */
export function filterByStockKeyword<T extends KeywordMatchTarget>(
  items: T[],
  keyword: string
): T[] {
  if (!keyword.trim()) {
    return items;
  }
  return items.filter((item) => matchStockKeyword(item, keyword));
}
