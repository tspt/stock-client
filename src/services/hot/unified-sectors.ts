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
import { getAllIndustrySectors as fetchAllIndustrySectors } from './industry-sectors';
import { getAllConceptSectors as fetchAllConceptSectors } from './concept-sectors';
import { getIndustrySectors as fetchIndustrySectors } from './industry-sectors';
import { getConceptSectors as fetchConceptSectors } from './concept-sectors';

// ==================== 缓存配置 ====================

/**
 * 缓存键定义
 */
const CACHE_KEYS = {
  INDUSTRY_BASIC: 'unified_industry_basic_v1',
  CONCEPT_BASIC: 'unified_concept_basic_v1',
  INDUSTRY_RANK: 'unified_industry_rank_v1',
  CONCEPT_RANK: 'unified_concept_rank_v1',
};

/**
 * 缓存过期时间：24小时（每天更新一次）
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
    Date.now() - raw.savedAt < CACHE_TTL_MS
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
 * 获取行业板块排行数据（带缓存）
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
  // 注意：排行数据包含分页和排序参数，不适合全局缓存
  // 这里只缓存第一页的降序数据作为热点数据
  const shouldCache = pageNum === 1 && sortOrder === 1 && pageSize === 50;

  if (shouldCache) {
    const cached = readCache<IndustrySectorRankData>(CACHE_KEYS.INDUSTRY_RANK);
    if (cached) {
      logger.debug('[UnifiedSectors] 使用行业排行缓存');
      return { data: cached, total: cached.length };
    }
  }

  // 检查是否有正在进行的请求
  if (shouldCache && industryRankFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的行业排行请求');
    return industryRankFetchPromise;
  }

  // 发起新请求
  logger.debug('[UnifiedSectors] 从API获取行业排行数据');
  const fetchPromise = (async (): Promise<{ data: IndustrySectorRankData[]; total: number }> => {
    try {
      const result = await fetchIndustrySectors('f3', sortOrder, pageSize, pageNum);

      // 只缓存首页降序数据
      if (shouldCache && result.data.length > 0) {
        writeCache(CACHE_KEYS.INDUSTRY_RANK, result.data);
        logger.info(`[UnifiedSectors] 行业排行数据已缓存，共 ${result.data.length} 条`);
      }

      return result;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取行业排行数据失败:', error);
      throw error;
    } finally {
      if (shouldCache) {
        industryRankFetchPromise = null;
      }
    }
  })();

  if (shouldCache) {
    industryRankFetchPromise = fetchPromise;
  }

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
 * 获取概念板块排行数据（带缓存）
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
  // 注意：排行数据包含分页和排序参数，不适合全局缓存
  // 这里只缓存第一页的降序数据作为热点数据
  const shouldCache = pageNum === 1 && sortOrder === 1 && pageSize === 50;

  if (shouldCache) {
    const cached = readCache<ConceptSectorRankData>(CACHE_KEYS.CONCEPT_RANK);
    if (cached) {
      logger.debug('[UnifiedSectors] 使用概念排行缓存');
      return { data: cached, total: cached.length };
    }
  }

  // 检查是否有正在进行的请求
  if (shouldCache && conceptRankFetchPromise) {
    logger.debug('[UnifiedSectors] 复用进行中的概念排行请求');
    return conceptRankFetchPromise;
  }

  // 发起新请求
  logger.debug('[UnifiedSectors] 从API获取概念排行数据');
  const fetchPromise = (async (): Promise<{ data: ConceptSectorRankData[]; total: number }> => {
    try {
      const result = await fetchConceptSectors('f3', sortOrder, pageSize, pageNum);

      // 只缓存首页降序数据
      if (shouldCache && result.data.length > 0) {
        writeCache(CACHE_KEYS.CONCEPT_RANK, result.data);
        logger.info(`[UnifiedSectors] 概念排行数据已缓存，共 ${result.data.length} 条`);
      }

      return result;
    } catch (error) {
      logger.error('[UnifiedSectors] 获取概念排行数据失败:', error);
      throw error;
    } finally {
      if (shouldCache) {
        conceptRankFetchPromise = null;
      }
    }
  })();

  if (shouldCache) {
    conceptRankFetchPromise = fetchPromise;
  }

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

/**
 * 清除所有板块缓存（用于手动刷新）
 * 包括新旧缓存键，确保完全清理
 */
export function clearUnifiedSectorCache(): void {
  // 新缓存键
  const newKeys = [
    'unified_industry_basic_v1',
    'unified_concept_basic_v1',
    'unified_industry_rank_v1',
    'unified_concept_rank_v1',
  ];

  // 旧缓存键（向后兼容）
  const oldKeys = ['all_industry_sectors_v1', 'all_concept_sectors_v1'];

  [...newKeys, ...oldKeys].forEach((key) => {
    setStorage(key, null);
  });

  logger.info('[UnifiedSectors] 已清除所有板块缓存（包括新旧缓存键）');
}
