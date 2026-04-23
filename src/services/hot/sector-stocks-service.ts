/**
 * 板块成分股全量获取服务
 * 支持分页循环获取所有行业和概念板块的成分股
 */

import { getUnifiedIndustryBasic, getUnifiedConceptBasic } from './unified-sectors';
import { getIndustrySectorStocks } from './industry-sectors';
import { getConceptSectorStocks } from './concept-sectors';
import type { IndustrySectorBasicInfo, ConceptSectorBasicInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';
import { CACHE_TTL } from '@/utils/config/constants';
import {
  saveIndustrySectors,
  saveConceptSectors,
  getIndustrySectors,
  getConceptSectors,
  type SectorWithStocks,
} from '@/utils/storage/sectorStocksIndexedDB';

// ==================== 类型定义 ====================

export interface StockSimpleInfo {
  name: string;
  code: string;
}

export interface SectorFullData {
  sectorCode: string;
  sectorName: string;
  stocks: StockSimpleInfo[];
}

export interface FailedSector {
  sectorCode: string;
  sectorName: string;
  sectorType: 'industry' | 'concept';
  error?: any;
}

export interface FetchProgress {
  current: number;
  total: number;
  percent: number;
  message: string;
}

// ==================== 全局频次控制 ====================

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 5000; // 最小间隔 5s

/**
 * 全局请求节流：在上一个请求完成后，强制等待指定时间
 */
async function throttleRequest() {
  logger.debug(`[SectorStocks] 请求节流: 等待 ${MIN_REQUEST_INTERVAL}ms`);
  await sleep(MIN_REQUEST_INTERVAL);
}

/**
 * 延迟函数
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 分页获取单个板块的所有成分股
 */
async function fetchAllStocksForSector(
  sectorCode: string,
  sectorType: 'industry' | 'concept',
  signal?: AbortSignal
): Promise<StockSimpleInfo[]> {
  const allStocks: StockSimpleInfo[] = [];
  let pageNum = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new DOMException('用户取消了请求', 'AbortError');
    }

    // 1. 请求前节流（确保与上一次请求间隔 3s）
    await throttleRequest();

    try {
      const result =
        sectorType === 'industry'
          ? await getIndustrySectorStocks(sectorCode, 'f12', 1, pageSize, pageNum)
          : await getConceptSectorStocks(sectorCode, 'f12', 1, pageSize, pageNum);

      const stocks = result.data.map((item) => ({
        name: item.name,
        code: item.code,
      }));

      allStocks.push(...stocks);

      if (allStocks.length >= result.total) {
        hasMore = false;
      } else {
        pageNum++;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error;
      }
      logger.error(`获取板块 ${sectorCode} 第 ${pageNum} 页失败:`, error);
      throw error; // 抛出错误以便上层捕获并记录
    }
  }

  return allStocks;
}

/**
 * 全量获取所有板块成分股
 * @param onProgress 进度回调
 * @param forceRefresh 是否强制刷新（忽略缓存）
 * @param failedSectors 之前失败的板块列表（用于重试）
 */
export async function fetchAllSectorsStocks(
  onProgress?: (progress: FetchProgress) => void,
  forceRefresh: boolean = false,
  failedSectors: FailedSector[] = [],
  signal?: AbortSignal
): Promise<{
  industry: SectorFullData[];
  concept: SectorFullData[];
  failed: FailedSector[];
}> {
  // 1. 检查缓存（仅在非重试且非强制刷新时）
  if (!forceRefresh && failedSectors.length === 0) {
    try {
      const [cachedIndustry, cachedConcept] = await Promise.all([
        getIndustrySectors(),
        getConceptSectors(),
      ]);

      if (
        cachedIndustry.length > 0 &&
        cachedConcept.length > 0 &&
        cachedIndustry.every(
          (s) => s.savedAt && Date.now() - s.savedAt < CACHE_TTL.SECTOR_STOCKS_FULL
        )
      ) {
        logger.info('[SectorStocks] 使用 IndexedDB 缓存数据');
        return {
          industry: formatCachedData(cachedIndustry),
          concept: formatCachedData(cachedConcept),
          failed: [],
        };
      }
    } catch (error) {
      logger.warn('[SectorStocks] 读取 IndexedDB 缓存失败，将重新获取', error);
    }
  }

  let industryBasics: IndustrySectorBasicInfo[] = [];
  let conceptBasics: ConceptSectorBasicInfo[] = [];
  const newFailed: FailedSector[] = [...failedSectors];

  // 如果是重试模式，只处理失败的板块；否则获取全量列表
  if (failedSectors.length > 0) {
    industryBasics = failedSectors
      .filter((s) => s.sectorType === 'industry')
      .map((s) => ({ code: s.sectorCode, name: s.sectorName } as any));
    conceptBasics = failedSectors
      .filter((s) => s.sectorType === 'concept')
      .map((s) => ({ code: s.sectorCode, name: s.sectorName } as any));
  } else {
    // 串行获取基础列表，避免开局并发
    await throttleRequest();
    industryBasics = await getUnifiedIndustryBasic();

    await throttleRequest();
    conceptBasics = await getUnifiedConceptBasic();
  }

  const totalSectors = industryBasics.length + conceptBasics.length;
  let completedCount = 0;
  const industryData: SectorFullData[] = [];
  const conceptData: SectorFullData[] = [];

  const updateProgress = (message: string) => {
    completedCount++;
    const percent = Math.round((completedCount / totalSectors) * 100);
    onProgress?.({
      current: completedCount,
      total: totalSectors,
      percent,
      message,
    });
  };

  // 2. 串行获取行业板块成分股
  for (const sector of industryBasics) {
    if (signal?.aborted) {
      logger.info('[SectorStocks] 获取已被用户取消');
      break;
    }
    updateProgress(`正在获取行业: ${sector.name}`);
    try {
      const stocks = await fetchAllStocksForSector(sector.code, 'industry', signal);
      industryData.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        stocks,
      });
    } catch (error) {
      logger.warn(`[SectorStocks] 行业板块 ${sector.name} 获取失败，已记录`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'industry',
        error,
      });
    }
  }

  // 3. 串行获取概念板块成分股
  for (const sector of conceptBasics) {
    if (signal?.aborted) {
      logger.info('[SectorStocks] 获取已被用户取消');
      break;
    }
    updateProgress(`正在获取概念: ${sector.name}`);
    try {
      const stocks = await fetchAllStocksForSector(sector.code, 'concept', signal);
      conceptData.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        stocks,
      });
    } catch (error) {
      logger.warn(`[SectorStocks] 概念板块 ${sector.name} 获取失败，已记录`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'concept',
        error,
      });
    }
  }

  // 4. 保存缓存到 IndexedDB（仅在全量获取且无失败时更新完整缓存）
  if (failedSectors.length === 0 && newFailed.length === 0) {
    const industryToSave: SectorWithStocks[] = industryData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      savedAt: Date.now(),
    }));

    const conceptToSave: SectorWithStocks[] = conceptData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      savedAt: Date.now(),
    }));

    try {
      await Promise.all([saveIndustrySectors(industryToSave), saveConceptSectors(conceptToSave)]);
      logger.info('[SectorStocks] 数据已成功存入 IndexedDB');
    } catch (error) {
      logger.error('[SectorStocks] 存入 IndexedDB 失败:', error);
    }
  }

  logger.info(
    `[SectorStocks] 获取完成。成功: ${completedCount - newFailed.length}, 失败: ${newFailed.length}`
  );
  return { industry: industryData, concept: conceptData, failed: newFailed };
}

/**
 * 格式化缓存数据
 */
function formatCachedData(sectors: SectorWithStocks[]): SectorFullData[] {
  return sectors.map((s) => ({
    sectorCode: s.code,
    sectorName: s.name,
    stocks: s.children,
  }));
}

/**
 * 清除 IndexedDB 中的板块成分股缓存
 */
export async function clearSectorStocksCache(): Promise<void> {
  const { clearSectorStocksDB } = await import('@/utils/storage/sectorStocksIndexedDB');
  await clearSectorStocksDB();
  logger.info('[SectorStocks] IndexedDB 缓存已清除');
}
