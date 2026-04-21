/**
 * 统一板块数据服务 - 提供行业和概念板块的统一数据访问和缓存管理
 *
 * 核心功能：
 * 1. 统一的数据获取接口
 * 2. 智能缓存管理（每日更新一次）
 * 3. 跨页面数据共享
 */

import type {
  IndustrySectorBasicInfo,
  IndustrySectorRankData,
  ConceptSectorBasicInfo,
  ConceptSectorRankData,
} from '@/types/stock';
import { logger } from '@/utils/logger';
import { getStorage, setStorage } from '@/utils/storage';
import { CACHE_KEYS, CACHE_TTL } from '@/utils/constants';
import { getAllIndustrySectors as fetchAllIndustrySectors } from './industry-sectors';
import { getAllConceptSectors as fetchAllConceptSectors } from './concept-sectors';
import {
  getIndustrySectors as fetchIndustrySectors,
  getIndustrySectorStocks,
} from './industry-sectors';
import {
  getConceptSectors as fetchConceptSectors,
  getConceptSectorStocks,
} from './concept-sectors';

// ==================== 板块全景数据结构 ====================

export interface SectorStockSummary {
  code: string;
  name: string;
}

export interface SectorFullData {
  sectorCode: string;
  sectorName: string;
  stocks: SectorStockSummary[];
}

export interface FetchProgress {
  current: number;
  total: number;
  percent: number;
  message: string;
}

// ==================== 全量数据获取逻辑 ====================

/**
 * 获取单个板块的全部成分股（自动分页）
 */
async function fetchAllStocksForSector(
  sectorCode: string,
  sectorType: 'industry' | 'concept'
): Promise<SectorStockSummary[]> {
  const allStocks: SectorStockSummary[] = [];
  let pageNum = 1;
  let total = 0;
  const pageSize = 50; // 使用测试后的最大容量

  do {
    const result = await (sectorType === 'industry'
      ? getIndustrySectorStocks(sectorCode, 'f12', 1, pageSize, pageNum)
      : getConceptSectorStocks(sectorCode, 'f12', 1, pageSize, pageNum));

    if (pageNum === 1) total = result.total;

    const summaries = result.data.map((stock) => ({
      code: stock.code,
      name: stock.name,
    }));

    allStocks.push(...summaries);
    pageNum++;
  } while (allStocks.length < total);

  return allStocks;
}

/**
 * 批量获取所有板块的成分股
 * @param onProgress 进度回调
 */
export async function fetchAllSectorsStocks(
  onProgress?: (progress: FetchProgress) => void
): Promise<{ industry: SectorFullData[]; concept: SectorFullData[] }> {
  const [industryBasics, conceptBasics] = await Promise.all([
    getUnifiedIndustryBasic(),
    getUnifiedConceptBasic(),
  ]);

  const industryResults: SectorFullData[] = [];
  const conceptResults: SectorFullData[] = [];
  let processedCount = 0;
  const totalCount = industryBasics.length + conceptBasics.length;

  const updateProgress = (name: string) => {
    processedCount++;
    const percent = Math.round((processedCount / totalCount) * 50);
    onProgress?.({
      current: processedCount,
      total: totalCount,
      percent,
      message: `正在获取: ${name}`,
    });
  };

  // 串行处理行业板块，避免请求过猛
  for (const sector of industryBasics) {
    try {
      const stocks = await fetchAllStocksForSector(sector.code, 'industry');
      industryResults.push({ sectorCode: sector.code, sectorName: sector.name, stocks });
    } catch (error) {
      logger.error(`获取行业 ${sector.name} 成分股失败:`, error);
    }
    updateProgress(sector.name);
  }

  // 串行处理概念板块
  for (const sector of conceptBasics) {
    try {
      const stocks = await fetchAllStocksForSector(sector.code, 'concept');
      conceptResults.push({ sectorCode: sector.code, sectorName: sector.name, stocks });
    } catch (error) {
      logger.error(`获取概念 ${sector.name} 成分股失败:`, error);
    }
    updateProgress(sector.name);
  }

  return { industry: industryResults, concept: conceptResults };
}

// ==================== 缓存配置 ====================

/**
 * 缓存键定义
 * 注意：排行数据已禁用缓存，只缓存基础信息（板块列表相对稳定）
 * 已迁移至 src/utils/constants.ts 统一管理
 */
// const CACHE_KEYS = {
//   INDUSTRY_BASIC: 'unified_industry_basic_v1',
//   CONCEPT_BASIC: 'unified_concept_basic_v1',
// };

/**
 * 缓存过期时间：24小时（每天更新一次）
 * 已迁移至 src/utils/constants.ts 统一管理 (CACHE_TTL.SECTOR_BASIC)
 */
// const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ==================== 缓存数据结构 ====================

interface SectorCache<T> {
  savedAt: number;
  data: T[];
}

// ==================== 缓存工具函数 ====================

/**
 * 读取缓存数据
 */
function readCache<T>(key: string): T[] | null {
  const raw = getStorage<SectorCache<T> | null>(key, null);
  if (
    raw &&
    typeof raw.savedAt === 'number' &&
    Array.isArray(raw.data) &&
    raw.data.length > 0 &&
    Date.now() - raw.savedAt < CACHE_TTL.SECTOR_BASIC
  ) {
    return raw.data;
  }
  return null;
}

/**
 * 写入缓存数据
 */
function writeCache<T>(key: string, data: T[]): void {
  if (data.length > 0) {
    setStorage(key, {
      savedAt: Date.now(),
      data,
    });
  }
}

// ==================== 并发控制 ====================

let industryBasicFetchPromise: Promise<IndustrySectorBasicInfo[]> | null = null;
let conceptBasicFetchPromise: Promise<ConceptSectorBasicInfo[]> | null = null;
let industryRankFetchPromise: Promise<{ data: IndustrySectorRankData[]; total: number }> | null =
  null;
let conceptRankFetchPromise: Promise<{ data: ConceptSectorRankData[]; total: number }> | null =
  null;

// ==================== 行业板块服务 ====================

/**
 * 获取所有行业板块基础信息（带缓存）
 * 用于下拉选择框等场景
 */
export async function getUnifiedIndustryBasic(): Promise<IndustrySectorBasicInfo[]> {
  // 1. 尝试从缓存读取
  const cached = readCache<IndustrySectorBasicInfo>(CACHE_KEYS.INDUSTRY_BASIC);
  if (cached) {
    logger.debug('[UnifiedSectors] 使用行业基础信息缓存');
    return cached;
  }

  // 2. 检查是否有正在进行的请求
  if (industryBasicFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的行业基础信息请求');
    return industryBasicFetchPromise;
  }

  // 3. 发起新请求
  logger.debug('[UnifiedSectors] 从API获取行业基础信息');
  industryBasicFetchPromise = (async (): Promise<IndustrySectorBasicInfo[]> => {
    try {
      const data = await fetchAllIndustrySectors();
      writeCache(CACHE_KEYS.INDUSTRY_BASIC, data);
      logger.info(`[UnifiedSectors] 行业基础信息已缓存，共 ${data.length} 条`);
      return data;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取行业基础信息失败:', error);
      return [];
    } finally {
      industryBasicFetchPromise = null;
    }
  })();

  return industryBasicFetchPromise;
}

/**
 * 获取行业板块排行数据（无缓存，实时获取）
 * 用于表格展示等场景
 * @param sortOrder 排序方向: 1-降序, 0-升序
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getUnifiedIndustryRank(
  sortOrder: number = 1,
  pageSize: number = 50,
  pageNum: number = 1
): Promise<{ data: IndustrySectorRankData[]; total: number }> {
  // 检查是否有正在进行的请求（避免并发重复请求）
  if (industryRankFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的行业排行请求');
    return industryRankFetchPromise;
  }

  // 发起新请求 - 每次都从API获取实时数据
  logger.debug('[UnifiedSectors] 从API获取行业排行数据（实时）');
  const fetchPromise = (async (): Promise<{ data: IndustrySectorRankData[]; total: number }> => {
    try {
      const result = await fetchIndustrySectors('f3', sortOrder, pageSize, pageNum);
      logger.info(`[UnifiedSectors] 获取到 ${result.data.length} 条行业排行数据`);
      return result;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取行业排行数据失败:', error);
      throw error;
    } finally {
      industryRankFetchPromise = null;
    }
  })();

  industryRankFetchPromise = fetchPromise;
  return fetchPromise;
}

// ==================== 概念板块服务 ====================

/**
 * 获取所有概念板块基础信息（带缓存）
 * 用于下拉选择框等场景
 */
export async function getUnifiedConceptBasic(): Promise<ConceptSectorBasicInfo[]> {
  // 1. 尝试从缓存读取
  const cached = readCache<ConceptSectorBasicInfo>(CACHE_KEYS.CONCEPT_BASIC);
  if (cached) {
    logger.debug('[UnifiedSectors] 使用概念基础信息缓存');
    return cached;
  }

  // 2. 检查是否有正在进行的请求
  if (conceptBasicFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的概念基础信息请求');
    return conceptBasicFetchPromise;
  }

  // 3. 发起新请求
  logger.debug('[UnifiedSectors] 从API获取概念基础信息');
  conceptBasicFetchPromise = (async (): Promise<ConceptSectorBasicInfo[]> => {
    try {
      const data = await fetchAllConceptSectors();
      writeCache(CACHE_KEYS.CONCEPT_BASIC, data);
      logger.info(`[UnifiedSectors] 概念基础信息已缓存，共 ${data.length} 条`);
      return data;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取概念基础信息失败:', error);
      return [];
    } finally {
      conceptBasicFetchPromise = null;
    }
  })();

  return conceptBasicFetchPromise;
}

/**
 * 获取概念板块排行数据（无缓存，实时获取）
 * 用于表格展示等场景
 * @param sortOrder 排序方向: 1-降序, 0-升序
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getUnifiedConceptRank(
  sortOrder: number = 1,
  pageSize: number = 50,
  pageNum: number = 1
): Promise<{ data: ConceptSectorRankData[]; total: number }> {
  // 检查是否有正在进行的请求（避免并发重复请求）
  if (conceptRankFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的概念排行请求');
    return conceptRankFetchPromise;
  }

  // 发起新请求 - 每次都从API获取实时数据
  logger.debug('[UnifiedSectors] 从API获取概念排行数据（实时）');
  const fetchPromise = (async (): Promise<{ data: ConceptSectorRankData[]; total: number }> => {
    try {
      const result = await fetchConceptSectors('f3', sortOrder, pageSize, pageNum);
      logger.info(`[UnifiedSectors] 获取到 ${result.data.length} 条概念排行数据`);
      return result;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取概念排行数据失败:', error);
      throw error;
    } finally {
      conceptRankFetchPromise = null;
    }
  })();

  conceptRankFetchPromise = fetchPromise;
  return fetchPromise;
}

// ==================== 便捷导出 ====================

/**
 * 同时获取行业和概念的基础信息（用于机会分析页面）
 */
export async function getUnifiedSectorBasics(): Promise<{
  industry: IndustrySectorBasicInfo[];
  concept: ConceptSectorBasicInfo[];
}> {
  const [industry, concept] = await Promise.all([
    getUnifiedIndustryBasic(),
    getUnifiedConceptBasic(),
  ]);
  return { industry, concept };
}
