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
  getIncompleteSectors,
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
const MIN_REQUEST_INTERVAL = 5000; // 最小间隔 5s（配合Cookie池30秒冷却机制）

/**
 * 全局请求节流：在上一个请求完成后，强制等待指定时间
 */
async function throttleRequest(signal?: AbortSignal) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - elapsed;
    logger.debug(`[SectorStocks] 请求节流: 等待 ${waitTime}ms`);

    // 创建一个可以被 abort 的 Promise
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, waitTime);

      // 如果信号被中止，清除定时器并拒绝
      if (signal?.aborted) {
        clearTimeout(timer);
        reject(new DOMException('用户取消了请求', 'AbortError'));
      } else {
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('用户取消了请求', 'AbortError'));
          },
          { once: true }
        );
      }
    });
  }

  lastRequestTime = Date.now();
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
  const pageSize = 50;
  let hasMore = true;

  while (hasMore) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new DOMException('用户取消了请求', 'AbortError');
    }

    // 1. 请求前节流（确保与上一次请求间隔 3s）
    await throttleRequest(signal);

    try {
      const result =
        sectorType === 'industry'
          ? await getIndustrySectorStocks(sectorCode, 'f12', 1, pageSize, pageNum, signal)
          : await getConceptSectorStocks(sectorCode, 'f12', 1, pageSize, pageNum, signal);

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

      // 板块成分股数据默认不过期，只要有缓存就直接使用
      if (cachedIndustry.length > 0 && cachedConcept.length > 0) {
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
    await throttleRequest(signal);
    industryBasics = await getUnifiedIndustryBasic();

    await throttleRequest(signal);
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('[SectorStocks] 获取已被用户取消');
        break; // 跳出循环，执行后续的保存逻辑
      }
      logger.warn(`[SectorStocks] 行业板块 ${sector.name} 获取失败，已记录`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'industry',
        error,
      });
    }
  }

  // 如果已取消,保存已获取的行业板块数据
  if (signal?.aborted && industryData.length > 0) {
    const industryToSave: SectorWithStocks[] = industryData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    try {
      await saveIndustrySectors(industryToSave, false); // 全量模式(覆盖)
      logger.info(`[SectorStocks] 已保存 ${industryData.length} 个行业板块数据到 IndexedDB`);
    } catch (error) {
      logger.error('[SectorStocks] 保存行业板块数据失败:', error);
    }
  }

  // 如果已取消,不再继续获取概念板块
  if (signal?.aborted) {
    logger.info(
      `[SectorStocks] 全量获取已取消(行业阶段)。行业已保存: ${industryData.length}, 失败: ${newFailed.length}`
    );

    return {
      industry: industryData,
      concept: [], // 概念板块还未开始获取
      failed: newFailed,
    };
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('[SectorStocks] 获取已被用户取消');
        break; // 跳出循环，执行后续的保存逻辑
      }
      logger.warn(`[SectorStocks] 概念板块 ${sector.name} 获取失败，已记录`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'concept',
        error,
      });
    }
  }

  // 如果已取消,保存已获取的概念板块数据
  if (signal?.aborted && conceptData.length > 0) {
    const conceptToSave: SectorWithStocks[] = conceptData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    try {
      await saveConceptSectors(conceptToSave, true); // 增量模式
      logger.info(`[SectorStocks] 已保存 ${conceptData.length} 个概念板块数据到 IndexedDB`);
    } catch (error) {
      logger.error('[SectorStocks] 保存概念板块数据失败:', error);
    }
  }

  // 4. 保存缓存到 IndexedDB(仅在全量获取且无失败时更新完整缓存)
  if (failedSectors.length === 0 && newFailed.length === 0) {
    const industryToSave: SectorWithStocks[] = industryData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length, // 新增:记录总数
      savedAt: Date.now(),
    }));

    const conceptToSave: SectorWithStocks[] = conceptData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length, // 新增:记录总数
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
 * 合并缓存数据和新获取的数据
 */
function mergeSectorData(cached: SectorWithStocks[], newData: SectorFullData[]): SectorFullData[] {
  const cachedMap = new Map(cached.map((s) => [s.code, s]));

  // 用新数据覆盖或添加到缓存
  newData.forEach((item) => {
    cachedMap.set(item.sectorCode, {
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    });
  });

  return Array.from(cachedMap.values()).map(formatCachedDataItem);
}

function formatCachedDataItem(s: SectorWithStocks): SectorFullData {
  return {
    sectorCode: s.code,
    sectorName: s.name,
    stocks: s.children,
  };
}

/**
 * 增量获取所有板块成分股(只获取缺失或不完整的板块)
 * @param onProgress 进度回调
 * @param signal AbortSignal 用于取消请求
 */
export async function fetchRemainingSectorsStocks(
  onProgress?: (progress: FetchProgress) => void,
  signal?: AbortSignal
): Promise<{
  industry: SectorFullData[];
  concept: SectorFullData[];
  failed: FailedSector[];
}> {
  logger.info('[SectorStocks] 开始增量获取模式');

  // 1. 获取所有板块基础信息
  await throttleRequest(signal);
  const industryBasics = await getUnifiedIndustryBasic();

  await throttleRequest(signal);
  const conceptBasics = await getUnifiedConceptBasic();

  // 2. 从 IndexedDB 读取已缓存的数据
  const [cachedIndustry, cachedConcept] = await Promise.all([
    getIndustrySectors(),
    getConceptSectors(),
  ]);

  // 3. 筛选出需要获取的板块(未缓存或不完整)
  const industryToFetch = await getIncompleteSectors(industryBasics, cachedIndustry, 'industry');
  const conceptToFetch = await getIncompleteSectors(conceptBasics, cachedConcept, 'concept');

  logger.info(
    `[SectorStocks] 需要获取的行业板块: ${industryToFetch.length}/${industryBasics.length}`
  );
  logger.info(
    `[SectorStocks] 需要获取的概念板块: ${conceptToFetch.length}/${conceptBasics.length}`
  );

  // 如果所有板块都已完整,直接返回缓存数据
  if (industryToFetch.length === 0 && conceptToFetch.length === 0) {
    logger.info('[SectorStocks] 所有板块数据已完整,无需获取');
    return {
      industry: formatCachedData(cachedIndustry),
      concept: formatCachedData(cachedConcept),
      failed: [],
    };
  }

  // 4. 串行获取需要更新的板块成分股
  const totalSectors = industryToFetch.length + conceptToFetch.length;
  let completedCount = 0;
  const industryData: SectorFullData[] = [];
  const conceptData: SectorFullData[] = [];
  const newFailed: FailedSector[] = [];

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

  // 获取行业板块
  for (const sector of industryToFetch) {
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('[SectorStocks] 获取已被用户取消');
        break; // 跳出循环，执行后续的保存逻辑
      }
      logger.warn(`[SectorStocks] 行业板块 ${sector.name} 获取失败`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'industry',
        error,
      });
    }
  }

  // 如果已取消,保存已获取的行业板块数据
  if (signal?.aborted && industryData.length > 0) {
    const industryToSave: SectorWithStocks[] = industryData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    try {
      await saveIndustrySectors(industryToSave, true); // 增量模式
      logger.info(`[SectorStocks] 已保存 ${industryData.length} 个行业板块数据到 IndexedDB`);
    } catch (error) {
      logger.error('[SectorStocks] 保存行业板块数据失败:', error);
    }
  }

  // 如果已取消,不再继续获取概念板块
  if (signal?.aborted) {
    const mergedIndustry = mergeSectorData(cachedIndustry, industryData);
    logger.info(
      `[SectorStocks] 增量获取已取消。已保存: ${industryData.length}, 失败: ${newFailed.length}`
    );

    return {
      industry: mergedIndustry,
      concept: formatCachedData(cachedConcept), // 返回原始缓存的概念数据
      failed: newFailed,
    };
  }

  // 获取概念板块
  for (const sector of conceptToFetch) {
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        logger.info('[SectorStocks] 获取已被用户取消');
        break; // 跳出循环，执行后续的保存逻辑
      }
      logger.warn(`[SectorStocks] 概念板块 ${sector.name} 获取失败`);
      newFailed.push({
        sectorCode: sector.code,
        sectorName: sector.name,
        sectorType: 'concept',
        error,
      });
    }
  }

  // 如果已取消,保存已获取的概念板块数据
  if (signal?.aborted && conceptData.length > 0) {
    const conceptToSave: SectorWithStocks[] = conceptData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    try {
      await saveConceptSectors(conceptToSave, true); // 增量模式
      logger.info(`[SectorStocks] 已保存 ${conceptData.length} 个概念板块数据到 IndexedDB`);
    } catch (error) {
      logger.error('[SectorStocks] 保存概念板块数据失败:', error);
    }
  }

  // 5. 增量保存到 IndexedDB
  if (industryData.length > 0 || conceptData.length > 0) {
    const industryToSave: SectorWithStocks[] = industryData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    const conceptToSave: SectorWithStocks[] = conceptData.map((item) => ({
      code: item.sectorCode,
      name: item.sectorName,
      children: item.stocks,
      total: item.stocks.length,
      savedAt: Date.now(),
    }));

    try {
      await Promise.all([
        saveIndustrySectors(industryToSave, true), // 增量模式
        saveConceptSectors(conceptToSave, true), // 增量模式
      ]);
      logger.info('[SectorStocks] 增量数据已成功存入 IndexedDB');
    } catch (error) {
      logger.error('[SectorStocks] 存入 IndexedDB 失败:', error);
    }
  }

  // 6. 合并缓存数据和新获取的数据
  const mergedIndustry = mergeSectorData(cachedIndustry, industryData);
  const mergedConcept = mergeSectorData(cachedConcept, conceptData);

  logger.info(
    `[SectorStocks] 增量获取完成。成功: ${completedCount - newFailed.length}, 失败: ${
      newFailed.length
    }`
  );

  return {
    industry: mergedIndustry,
    concept: mergedConcept,
    failed: newFailed,
  };
}

/**
 * 清除 IndexedDB 中的板块成分股缓存
 */
export async function clearSectorStocksCache(): Promise<void> {
  const { clearSectorStocksDB } = await import('@/utils/storage/sectorStocksIndexedDB');
  await clearSectorStocksDB();
  logger.info('[SectorStocks] IndexedDB 缓存已清除');
}
