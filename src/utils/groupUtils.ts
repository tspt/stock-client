/**
 * 分组工具函数
 */

import type { Group, StockInfo, StockWatchListData } from '@/types/stock';
import {
  DEFAULT_GROUP_ID,
  DEFAULT_GROUP_NAME,
  DEFAULT_GROUP_COLOR,
  MAX_GROUP_NAME_LENGTH,
} from './constants';

/**
 * 验证分组名称
 * 仅允许中文、英文、数字，长度1-10字符
 */
export function validateGroupName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false;
  }
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return false;
  }
  // 仅允许中文、英文、数字
  const regex = /^[\u4e00-\u9fa5a-zA-Z0-9]+$/;
  return regex.test(name);
}

/**
 * 生成分组ID
 */
export function generateGroupId(): string {
  return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取默认分组对象
 */
export function getDefaultGroup(): Group {
  return {
    id: DEFAULT_GROUP_ID,
    name: DEFAULT_GROUP_NAME,
    color: DEFAULT_GROUP_COLOR,
    order: 0,
  };
}

/**
 * 数据迁移：将旧格式（StockInfo[]）转换为新格式（StockWatchListData）
 */
export function migrateOldWatchList(oldList: StockInfo[]): StockWatchListData {
  // 旧数据迁移时，不创建默认分组，股票也不添加到任何分组
  const migratedList = oldList.map((stock) => ({
    ...stock,
    groupIds: undefined,
  }));

  return {
    groups: [],
    watchList: migratedList,
  };
}

/**
 * 检查数据是否为旧格式
 */
export function isOldFormat(data: unknown): data is StockInfo[] {
  return Array.isArray(data) && data.length > 0 && 'code' in data[0] && !('groups' in data);
}

