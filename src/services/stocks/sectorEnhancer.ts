/**
 * 股票板块信息增强服务
 * 为股票列表动态添加行业和概念板块信息
 */

import { getIndustrySectors, getConceptSectors } from '@/utils/storage/sectorStocksIndexedDB';
import type { StockInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';

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
    logger.error('[SectorEnhancer] 构建板块映射失败:', error);
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
 * 清除板块映射缓存并更新 LocalStorage 中的股票数据
 * 将行业和概念信息持久化到 biying_hslt_stock_list_v1
 */
export async function clearSectorMappingCache(): Promise<void> {
  logger.info('[SectorEnhancer] 开始同步板块信息到股票列表...');

  try {
    // 1. 重新构建映射表
    const mapping = await buildSectorMapping();
    logger.info(`[SectorEnhancer] 映射表构建完成，共 ${mapping.size} 只股票`);

    // 2. 读取 LocalStorage 中的股票列表
    const { getStorage, setStorage } = await import('@/utils/storage/storage');
    const { CACHE_KEYS } = await import('@/utils/config/constants');

    interface BiyingHsltListCache {
      savedAt: number;
      stocks: StockInfo[];
    }

    const cached = getStorage<BiyingHsltListCache | null>(CACHE_KEYS.BIYING_STOCK_LIST, null);

    if (!cached || !cached.stocks || cached.stocks.length === 0) {
      logger.warn('[SectorEnhancer] LocalStorage 中没有股票列表数据，跳过同步');
      return;
    }

    // 3. 为每只股票添加行业和概念信息
    const enhancedStocks = cached.stocks.map((stock) => {
      const sectorInfo = mapping.get(stock.code);
      return {
        ...stock,
        industry: sectorInfo?.industry,
        concepts: sectorInfo?.concepts,
      };
    });

    // 4. 统计有板块信息的股票数量
    const withIndustry = enhancedStocks.filter((s) => s.industry).length;
    const withConcepts = enhancedStocks.filter((s) => s.concepts && s.concepts.length > 0).length;

    logger.info(
      `[SectorEnhancer] 同步完成：${withIndustry} 只股票有行业信息，${withConcepts} 只股票有概念信息`
    );

    // 5. 更新 LocalStorage（保持原有的 savedAt 时间戳）
    setStorage(CACHE_KEYS.BIYING_STOCK_LIST, {
      savedAt: cached.savedAt,
      stocks: enhancedStocks,
    });

    logger.info('[SectorEnhancer] 股票列表已更新，板块信息已持久化');

    // 6. 清除内存缓存（下次读取时会使用更新后的数据）
    mappingCache = null;
  } catch (error) {
    logger.error('[SectorEnhancer] 同步板块信息失败:', error);
    throw error;
  }
}
