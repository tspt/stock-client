/**
 * 读取本地 F10 缓存中的「十大流通股东」，产出「纯数字代码 → 股东名称列表」映射，
 * 供机会分析页的「十大流通股东」筛选使用。
 *
 * 为什么读缓存而不是发请求：十大流通股东按单只股票拉取（每只 2 次请求），
 * 机会分析动辄上千只股票，逐个请求不现实；F10 抽屉加载过的股票会把数据写入
 * IndexedDB，这里直接复用，未缓存的股票按「无数据」处理（筛选时放行）。
 *
 * 缓存会在用户浏览 F10 抽屉时增长，因此订阅 f10IndexedDB 的变更通知自动重算，
 * 否则刚取到的股东数据要等刷新页面才生效。
 */

import { useEffect, useState } from 'react';
import { getAllF10Cache, subscribeF10CacheChange } from '@/utils/storage/f10IndexedDB';
import {
  buildFreeHolderNamesByCode,
  type FreeHolderNamesByCode,
} from '@/utils/analysis/freeHolderMatch';
import { logger } from '@/utils/business/logger';

/** 空映射复用同一引用，避免下游 useMemo 因新对象反复失效 */
const EMPTY_FREE_HOLDER_NAMES: FreeHolderNamesByCode = new Map();

export function useFreeHolderNames(): FreeHolderNamesByCode {
  const [namesByCode, setNamesByCode] = useState<FreeHolderNamesByCode>(
    EMPTY_FREE_HOLDER_NAMES
  );

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      try {
        const records = await getAllF10Cache();
        if (cancelled) {
          return;
        }
        setNamesByCode(buildFreeHolderNamesByCode(records));
      } catch (error) {
        logger.error('[FreeHolders] 读取 F10 缓存失败:', error);
      }
    };

    void reload();
    const unsubscribe = subscribeF10CacheChange(() => {
      void reload();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return namesByCode;
}
