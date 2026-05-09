/**
 * 股票板块信息增强服务
 * 为股票列表动态添加行业和概念板块信息
 */

import { getIndustrySectors, getConceptSectors } from '@/utils/storage/sectorStocksIndexedDB';
import type { StockInfo } from '@/types/stock';

export interface EnhancedStockInfo extends StockInfo {
  industry?: string; // 所属行业板块代码
  concepts?: string[]; // 所属概念板块代码列表
}

interface SectorMappingCache {
  mapping: Map<string, { industry?: string; concepts?: string[] }>;
  timestamp: number;
}

// 模块级别的缓存
let mappingCache: SectorMappingCache | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

/**
 * 从 IndexedDB 构建股票 -> 板块映射表
 */
async function buildSectorMapping(): Promise<
  Map<string, { industry?: string; concepts?: string[] }>
> {
  const mapping = new Map<string, { industry?: string; concepts?: string[] }>();

  try {
    // 1. 获取行业板块
    const industrySectors = await getIndustrySectors();
    industrySectors.forEach((sector) => {
      sector.children?.forEach((stock) => {
        if (!mapping.has(stock.code)) {
          mapping.set(stock.code, {});
        }
        const info = mapping.get(stock.code)!;
        info.industry = sector.code;
      });
    });

    // 2. 获取概念板块
    const conceptSectors = await getConceptSectors();
    conceptSectors.forEach((sector) => {
      sector.children?.forEach((stock) => {
        if (!mapping.has(stock.code)) {
          mapping.set(stock.code, {});
        }
        const info = mapping.get(stock.code)!;
        if (!info.concepts) {
          info.concepts = [];
        }
        info.concepts.push(sector.code);
      });
    });
  } catch (error) {
    console.error('[SectorEnhancer] 构建板块映射失败:', error);
  }

  return mapping;
}

/**
 * 获取板块映射表（带缓存）
 */
export async function getStockSectorMapping(): Promise<
  Map<string, { industry?: string; concepts?: string[] }>
> {
  const now = Date.now();

  // 检查缓存是否有效（24小时）
  if (mappingCache && now - mappingCache.timestamp < CACHE_TTL) {
    return mappingCache.mapping;
  }

  // 重新构建
  const mapping = await buildSectorMapping();
  mappingCache = { mapping, timestamp: now };

  return mapping;
}

/**
 * 增强股票列表，添加行业和概念信息
 */
export async function enhanceStocksWithSectors(stocks: StockInfo[]): Promise<EnhancedStockInfo[]> {
  const mapping = await getStockSectorMapping();

  return stocks.map((stock) => {
    const sectorInfo = mapping.get(stock.code);
    return {
      ...stock,
      industry: sectorInfo?.industry,
      concepts: sectorInfo?.concepts,
    };
  });
}

/**
 * 清除板块映射缓存（当板块成分股更新时调用）
 */
export function clearSectorMappingCache(): void {
  mappingCache = null;
  console.log('[SectorEnhancer] 板块映射缓存已清除');
}
