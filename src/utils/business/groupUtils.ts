/**
 * 分组工具函数
 */

import type { Group, StockInfo } from '@/types/stock';
import { MAX_GROUP_NAME_LENGTH } from '../config/constants';
import { BUILTIN_GROUP_SELF_ID } from '../config/constants';

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
 * 当前选中的分组标签下若没有任何自选股，则切换到第一个「能看到股票」的分组，
 * 避免默认停在「自选」而股票只加入了自定义分组时列表长期为空。
 */
export function ensureSelectedGroupIdForWatchList(
  watchList: StockInfo[],
  groups: Group[],
  selectedGroupId: string
): string {
  if (watchList.length === 0) {
    return selectedGroupId;
  }
  const hasStockInGroup = (groupId: string) =>
    watchList.some((s) => s.groupIds && s.groupIds.includes(groupId));
  if (hasStockInGroup(selectedGroupId)) {
    return selectedGroupId;
  }
  if (hasStockInGroup(BUILTIN_GROUP_SELF_ID)) {
    return BUILTIN_GROUP_SELF_ID;
  }
  const orderedTabIds = [
    BUILTIN_GROUP_SELF_ID,
    ...[...groups].sort((a, b) => a.order - b.order).map((g) => g.id),
  ];
  const matched = orderedTabIds.find((id) => hasStockInGroup(id));
  if (matched) {
    return matched;
  }
  const fallback = watchList[0]?.groupIds?.[0];
  return fallback ?? BUILTIN_GROUP_SELF_ID;
}
