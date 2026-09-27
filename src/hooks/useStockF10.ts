/**
 * F10 资料面板的聚合 Hook：把三个区块的懒加载状态聚合成一个返回值。
 *
 * 页面 / 组件只需要 `useStockF10(code, open)` 一次，即可拿到
 * 股东人数、十大流通股东、机构持仓三个区块各自的「数据 / 加载中 / 错误 / 加载按钮」。
 * 三个区块互相独立：加载其中一个不会触发另外两个的请求。
 */

import type { FreeHolderItem, HolderNumItem, OrgHoldingItem } from '@/types/f10';
import { fetchFreeHolders, fetchHolderNum, fetchOrgHoldings } from '@/services/fundamental';
import { saveF10Section } from '@/utils/storage/f10IndexedDB';
import { F10_HOLDER_NUM_MAX_PERIODS } from '@/utils/config/constants';
import { useF10Section, type F10SectionAdapter, type UseF10SectionResult } from './useF10Section';

/**
 * 三个区块的适配器。
 * 必须是模块级常量：hook 内部依赖其引用稳定，写在组件里会导致缓存读取副作用反复执行。
 */

const HOLDER_NUM_ADAPTER: F10SectionAdapter<HolderNumItem> = {
  fetchData: fetchHolderNum,
  /**
   * 读取时只保留最近 `F10_HOLDER_NUM_MAX_PERIODS` 期。
   * 早期版本写入过全量（实测可达 44 期）的缓存，这里直接截断，
   * 不做数据迁移——与「股东人数最多 12 期、不考虑历史数据兼容」的约定一致。
   */
  read: (record) =>
    record.holderNum
      ? { ...record.holderNum, data: record.holderNum.data.slice(0, F10_HOLDER_NUM_MAX_PERIODS) }
      : null,
  write: (code, data, updatedAt) => saveF10Section(code, 'holderNum', { updatedAt, data }),
};

const FREE_HOLDER_ADAPTER: F10SectionAdapter<FreeHolderItem> = {
  fetchData: (code) => fetchFreeHolders(code),
  read: (record) => (record.freeHolders ? { ...record.freeHolders } : null),
  write: (code, data, updatedAt) =>
    saveF10Section(code, 'freeHolders', {
      updatedAt,
      // 记录该批数据所属报告期：服务层据此决定是否还能复用「精准请求」
      endDate: data[0]?.endDate ?? '',
      data,
    }),
};

const ORG_HOLDING_ADAPTER: F10SectionAdapter<OrgHoldingItem> = {
  fetchData: (code) => fetchOrgHoldings(code),
  read: (record) => (record.orgHoldings ? { ...record.orgHoldings } : null),
  write: (code, data, updatedAt) => saveF10Section(code, 'orgHoldings', { updatedAt, data }),
};

export interface UseStockF10Result {
  holderNum: UseF10SectionResult<HolderNumItem>;
  freeHolders: UseF10SectionResult<FreeHolderItem>;
  orgHoldings: UseF10SectionResult<OrgHoldingItem>;
}

/**
 * @param code 统一格式股票代码（SH600000 / SZ000001）
 * @param enabled 是否启用（通常为抽屉是否打开）
 */
export function useStockF10(code: string, enabled: boolean): UseStockF10Result {
  return {
    holderNum: useF10Section(code, enabled, HOLDER_NUM_ADAPTER),
    freeHolders: useF10Section(code, enabled, FREE_HOLDER_ADAPTER),
    orgHoldings: useF10Section(code, enabled, ORG_HOLDING_ADAPTER),
  };
}
