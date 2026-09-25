/**
 * 股票池预过滤：市场 / 名称类型 / 行业板块 / 概念板块。
 *
 * 原为 OpportunityPage 内联实现，抽离为纯函数后便于复用与单测，
 * 同时把「行业」与「概念」两套结构一致的反选逻辑收敛为一处。
 */

import type { StockInfo } from '@/types/stock';
import { getPureCode } from '@/utils/format/format';
import {
  getMappedConcepts,
  getMappedIndustry,
  type SectorInfo,
} from '@/services/stocks/sectorMapping';

/**
 * 由选中的市场标识构建匹配函数。
 * 返回 null 表示没有任何有效市场（调用方应视为「不匹配任何股票」）。
 */
export function createMarketMatcher(markets: string[]): ((pureCode: string) => boolean) | null {
  const matchers: Array<(pureCode: string) => boolean> = [];

  markets.forEach((market) => {
    switch (market) {
      case 'hs_main':
        matchers.push((pureCode) => pureCode.startsWith('60') || pureCode.startsWith('00'));
        break;
      case 'sz_gem':
        matchers.push((pureCode) => pureCode.startsWith('30'));
        break;
    }
  });

  if (matchers.length === 0) {
    return null;
  }
  // 只要匹配任何一个选中的市场即可
  return (pureCode) => matchers.some((matcher) => matcher(pureCode));
}

/** 名称类型匹配函数：st=仅 ST / non_st=排除 ST / 其他=不限 */
export function createNameTypeMatcher(nameType: string): (isST: boolean) => boolean {
  switch (nameType) {
    case 'st':
      return (isST) => isST;
    case 'non_st':
      return (isST) => !isST;
    default:
      return () => true;
  }
}

/**
 * 单只股票是否命中「选中板块」筛选。
 *
 * - 未选中任何板块 → 始终保留（不筛选）。
 * - invert=false：命中选中板块才保留。
 * - invert=true：命中选中板块则排除（「没有板块信息」的股票在反选模式下保留）。
 */
export function matchSectorFilter(
  selectedCodes: string[] | undefined,
  matchedCodes: string[] | undefined,
  invert: boolean
): boolean {
  if (!selectedCodes || selectedCodes.length === 0) {
    return true;
  }
  const hit = !!matchedCodes && matchedCodes.some((code) => selectedCodes.includes(code));
  return invert ? !hit : hit;
}

/** 股票池预过滤参数 */
export interface StockPoolFilterOptions {
  /** 选中的市场标识（空数组＝不显示任何股票） */
  selectedMarket: string[];
  /** 名称类型：all / st / non_st */
  nameType: string;
  /** 选中/排除的行业板块代码 */
  industrySectors?: string[];
  /** 选中/排除的概念板块代码 */
  conceptSectors?: string[];
  industrySectorInvert?: boolean;
  conceptSectorInvert?: boolean;
  /** IndexedDB 成分股映射（行业/概念兜底） */
  industryMapping: Map<string, SectorInfo>;
  conceptMapping: Map<string, SectorInfo[]>;
}

/**
 * 按市场、名称类型、行业板块、概念板块一次性过滤股票池。
 * 单次遍历，匹配函数预先构建，避免在循环内重复判断。
 */
export function filterStocksByMarketAndSectors(
  stocks: StockInfo[],
  options: StockPoolFilterOptions
): StockInfo[] {
  if (stocks.length === 0) {
    return [];
  }

  const {
    selectedMarket,
    nameType,
    industrySectors,
    conceptSectors,
    industrySectorInvert = false,
    conceptSectorInvert = false,
    industryMapping,
    conceptMapping,
  } = options;

  const marketMatchFn = createMarketMatcher(selectedMarket);
  if (!marketMatchFn) {
    return [];
  }
  const nameTypeMatchFn = createNameTypeMatcher(nameType);

  return stocks.filter((stock) => {
    const pureCode = getPureCode(stock.code);

    // 市场筛选
    if (!marketMatchFn(pureCode)) return false;

    // 名称类型筛选
    if (!nameTypeMatchFn(stock.name.includes('ST'))) return false;

    // 行业板块筛选
    const industry = stock.industry || getMappedIndustry(stock.code, industryMapping) || undefined;
    if (!matchSectorFilter(industrySectors, industry ? [industry.code] : undefined, industrySectorInvert)) {
      return false;
    }

    // 概念板块筛选
    const concepts =
      stock.concepts && stock.concepts.length > 0
        ? stock.concepts
        : getMappedConcepts(stock.code, conceptMapping);
    if (!matchSectorFilter(conceptSectors, concepts?.map((c) => c.code), conceptSectorInvert)) {
      return false;
    }

    return true;
  });
}
