/**
 * 筹码分布数据 Hook
 *
 * 按需（弹窗打开时）拉取东财带换手率 K 线并本地推算筹码分布，
 * 数据源与算法说明见 `@/services/stocks/chipKlineService` 与 `@/utils/analysis/chipDistribution`。
 */

import { useCallback, useEffect, useState } from 'react';
import type { ChipDistribution, ChipKlineBar, ChipPeriod } from '@/types/chipDistribution';
import { fetchChipKlineBars } from '@/services/stocks/chipKlineService';
import { calculateChipDistribution } from '@/utils/analysis/chipDistribution';
import { logger } from '@/utils/business/logger';

export interface UseChipDistributionResult {
  /** 筹码分布结果，未就绪时为 null */
  distribution: ChipDistribution | null;
  /** 计算所用的 K 线（升序） */
  bars: ChipKlineBar[];
  loading: boolean;
  error: string | null;
  /** 忽略缓存重新拉取 */
  reload: () => void;
}

const EMPTY: Omit<UseChipDistributionResult, 'reload'> = {
  distribution: null,
  bars: [],
  loading: false,
  error: null,
};

/**
 * @param code 统一格式代码（SH600000 / SZ000001）
 * @param period K 线周期（日线口径与东财官网一致，周线与周线选股页面一致）
 * @param enabled 是否启用（通常为弹窗是否打开）
 */
export function useChipDistribution(
  code: string,
  period: ChipPeriod,
  enabled: boolean
): UseChipDistributionResult {
  const [state, setState] = useState(EMPTY);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !code) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    void (async () => {
      try {
        const bars = await fetchChipKlineBars(code, { period });
        if (cancelled) {
          return;
        }
        if (bars.length === 0) {
          setState({ ...EMPTY, error: '未获取到K线数据' });
          return;
        }

        const distribution = calculateChipDistribution(bars);
        if (cancelled) {
          return;
        }
        setState({
          distribution,
          bars,
          loading: false,
          error: distribution ? null : '筹码分布计算失败',
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        logger.error(`[useChipDistribution] ${code} 计算筹码分布失败:`, error);
        setState({
          ...EMPTY,
          error: error instanceof Error ? error.message : '筹码分布加载失败',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, period, enabled, reloadToken]);

  return { ...state, reload };
}
