/**
 * 成分股筛选配置持久化管理
 */

import { logger } from '@/utils/business/logger';

const SECTOR_FILTER_PREFS_KEY = 'sector-constituents-filter-prefs';

export interface SectorFilterPrefs {
  searchKeyword: string;
  codeStart: string;
  codeEnd: string;
  marketTypes: string[];
  sortOrder: 'code-asc' | 'code-desc' | 'name-asc';
}

export const DEFAULT_FILTER_PREFS: SectorFilterPrefs = {
  searchKeyword: '',
  codeStart: '',
  codeEnd: '',
  marketTypes: [],
  sortOrder: 'code-asc',
};

/**
 * 加载筛选配置
 */
export function loadSectorFilterPrefs(): SectorFilterPrefs {
  try {
    const saved = localStorage.getItem(SECTOR_FILTER_PREFS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 合并默认值，确保字段完整性
      return { ...DEFAULT_FILTER_PREFS, ...parsed };
    }
  } catch (error) {
    logger.error('加载筛选配置失败:', error);
  }
  return { ...DEFAULT_FILTER_PREFS };
}

/**
 * 保存筛选配置
 */
export function saveSectorFilterPrefs(prefs: SectorFilterPrefs): void {
  try {
    localStorage.setItem(SECTOR_FILTER_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    logger.error('保存筛选配置失败:', error);
  }
}

/**
 * 清除筛选配置
 */
export function clearSectorFilterPrefs(): void {
  try {
    localStorage.removeItem(SECTOR_FILTER_PREFS_KEY);
  } catch (error) {
    logger.error('清除筛选配置失败:', error);
  }
}

/**
 * 检查是否有激活的筛选条件
 */
export function hasActiveFilters(prefs: SectorFilterPrefs): boolean {
  return (
    prefs.searchKeyword !== '' ||
    prefs.codeStart !== '' ||
    prefs.codeEnd !== '' ||
    prefs.marketTypes.length > 0 ||
    prefs.sortOrder !== 'code-asc'
  );
}
