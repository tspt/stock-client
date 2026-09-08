/**
 * 股票板块信息增强服务
 * 为股票列表动态添加行业和概念板块信息
 */

import type { StockInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';
import { loadSectorStockMapping, toCombinedSectorMapping } from './sectorMapping';

/**
 * 从 IndexedDB 构建股票 -> 板块映射表（与展示侧共用规则）
 */
async function buildSectorMapping() {
  const mapping = await loadSectorStockMapping();
  return toCombinedSectorMapping(mapping);
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
  } catch (error) {
    logger.error('[SectorEnhancer] 同步板块信息失败:', error);
    throw error;
  }
}
