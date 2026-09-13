/**
 * 股票 → 行业/概念板块映射（基于 IndexedDB 成分股）
 * 机会分析与回测共用同一套构建与查找规则
 */

import {
  getIndustrySectors,
  getConceptSectors,
  onSectorStocksChange,
} from '@/utils/storage/sectorStocksIndexedDB';
import type { IndustryInfo, ConceptInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';

export type SectorInfo = { code: string; name: string };

export interface SectorStockMapping {
  industryByCode: Map<string, SectorInfo>;
  conceptsByCode: Map<string, SectorInfo[]>;
}

/**
 * 成分股代码规范化（与回测页既有规则一致）
 * 已是 SH/SZ 前缀则原样；60/68/90 → SH，00/30 → SZ
 */
export function normalizeSectorStockCode(code: string): string {
  if (code.startsWith('SH') || code.startsWith('SZ')) {
    return code;
  }
  const prefix = code.substring(0, 2);
  if (['60', '68', '90'].includes(prefix)) {
    return `SH${code}`;
  }
  if (['00', '30'].includes(prefix)) {
    return `SZ${code}`;
  }
  return code;
}

/**
 * 模块级缓存：机会分析页、回测页、板块增强都会调用本函数，
 * 板块数据未变动时直接复用，避免重复读取两套 IndexedDB 并重建映射。
 * 注意：返回的是共享 Map，调用方不应修改其内容。
 */
let cachedMapping: SectorStockMapping | null = null;
let cachedMappingPromise: Promise<SectorStockMapping> | null = null;
let invalidateRegistered = false;

/** 惰性注册失效回调（避免模块顶层副作用） */
function ensureInvalidateRegistered(): void {
  if (invalidateRegistered) {
    return;
  }
  invalidateRegistered = true;
  onSectorStocksChange(() => {
    cachedMapping = null;
    cachedMappingPromise = null;
  });
}

/** 手动失效板块映射缓存（板块数据在别处被改动时使用） */
export function invalidateSectorStockMappingCache(): void {
  cachedMapping = null;
  cachedMappingPromise = null;
}

/**
 * 加载股票 → 行业/概念映射（带缓存与并发复用）
 */
export async function loadSectorStockMapping(): Promise<SectorStockMapping> {
  ensureInvalidateRegistered();

  if (cachedMapping) {
    return cachedMapping;
  }
  if (cachedMappingPromise) {
    return cachedMappingPromise;
  }

  cachedMappingPromise = buildSectorStockMapping()
    .then((mapping) => {
      // 空结果（读取失败或库中无数据）不缓存，避免把空映射固化下来
      if (mapping.industryByCode.size > 0 || mapping.conceptsByCode.size > 0) {
        cachedMapping = mapping;
      }
      cachedMappingPromise = null;
      return mapping;
    })
    .catch((error) => {
      cachedMappingPromise = null;
      throw error;
    });

  return cachedMappingPromise;
}

/**
 * 从 IndexedDB 构建股票 → 行业/概念映射
 * 行业：同一股票只保留第一次命中的板块；概念：按板块 code 去重
 */
async function buildSectorStockMapping(): Promise<SectorStockMapping> {
  const industryByCode = new Map<string, SectorInfo>();
  const conceptsByCode = new Map<string, SectorInfo[]>();

  const t0 = performance.now();

  try {
    const [industrySectors, conceptSectors] = await Promise.all([
      getIndustrySectors(),
      getConceptSectors(),
    ]);
    const tDbRead = performance.now();

    industrySectors.forEach((sector) => {
      sector.children?.forEach((stock) => {
        const normalizedCode = normalizeSectorStockCode(stock.code);
        if (!industryByCode.has(normalizedCode)) {
          industryByCode.set(normalizedCode, { code: sector.code, name: sector.name });
        }
      });
    });

    conceptSectors.forEach((sector) => {
      sector.children?.forEach((stock) => {
        const normalizedCode = normalizeSectorStockCode(stock.code);
        const concepts = conceptsByCode.get(normalizedCode) || [];
        if (!concepts.some((item) => item.code === sector.code)) {
          concepts.push({ code: sector.code, name: sector.name });
        }
        conceptsByCode.set(normalizedCode, concepts);
      });
    });

    const tBuild = performance.now();
    const countChildren = (list: typeof industrySectors) =>
      list.reduce((sum, sector) => sum + (sector.children?.length ?? 0), 0);
    logger.info(
      `[SectorMapping] 板块映射加载完成，行业 ${industryByCode.size} 只，概念 ${conceptsByCode.size} 只；` +
        `IndexedDB 读取 ${(tDbRead - t0).toFixed(0)}ms，建 Map ${(tBuild - tDbRead).toFixed(0)}ms，` +
        `总耗时 ${(tBuild - t0).toFixed(0)}ms；` +
        `行业板块 ${industrySectors.length} 个/成分股 ${countChildren(industrySectors)} 条，` +
        `概念板块 ${conceptSectors.length} 个/成分股 ${countChildren(conceptSectors)} 条`
    );
  } catch (error) {
    logger.error('[SectorMapping] 加载板块映射失败:', error);
  }

  return { industryByCode, conceptsByCode };
}

/**
 * 查找所属行业：先按原码，再按规范化码
 */
export function getMappedIndustry(
  code: string,
  mapping: SectorStockMapping | Map<string, SectorInfo>
): SectorInfo | null {
  const industryByCode =
    mapping instanceof Map ? mapping : mapping.industryByCode;
  return (
    industryByCode.get(code) ||
    industryByCode.get(normalizeSectorStockCode(code)) ||
    null
  );
}

/**
 * 查找所属概念：先按原码，再按规范化码
 */
export function getMappedConcepts(
  code: string,
  mapping: SectorStockMapping | Map<string, SectorInfo[]>
): SectorInfo[] {
  const conceptsByCode =
    mapping instanceof Map ? mapping : mapping.conceptsByCode;
  return (
    conceptsByCode.get(code) ||
    conceptsByCode.get(normalizeSectorStockCode(code)) ||
    []
  );
}

/**
 * 转为 sectorEnhancer 使用的合并映射结构
 */
export function toCombinedSectorMapping(
  mapping: SectorStockMapping
): Map<string, { industry?: IndustryInfo; concepts?: ConceptInfo[] }> {
  const combined = new Map<string, { industry?: IndustryInfo; concepts?: ConceptInfo[] }>();

  mapping.industryByCode.forEach((industry, code) => {
    const info = combined.get(code) || {};
    info.industry = industry;
    combined.set(code, info);
  });

  mapping.conceptsByCode.forEach((concepts, code) => {
    const info = combined.get(code) || {};
    info.concepts = concepts;
    combined.set(code, info);
  });

  return combined;
}
