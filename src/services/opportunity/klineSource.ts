/**
 * 机会分析 K 线的唯一数据源解析入口（读取侧）。
 *
 * 与写入侧共用同一套归属策略（utils/analysis/opportunityKlinePolicy）：
 * - 普通日线分析：K 线复用 `stockHistory`——机会分析取日线时经 `getKLineData`
 *   已经旁路写入了该表，不必再把同一份日线额外落一张表；
 * - 周/月/年 与「截止日（回测）」：读 `opportunityKlineCache` 独立表
 *   （stockHistory 只存真实日线历史，这两类数据放进去会污染它）。
 */

import type { KLineData, KLinePeriod } from '@/types/stock';
import { getKLineData } from '@/services/stocks/api';
import {
  getOpportunityKlineSnapshot,
  getStocksHistory,
} from '@/utils/storage/opportunityIndexedDB';
import { needsDedicatedKlineStore } from '@/utils/analysis/opportunityKlinePolicy';
import { INITIAL_OPPORTUNITY_QUERY } from '@/utils/config/opportunityAnalysisDefaults';
import { logger } from '@/utils/business/logger';

export interface OpportunityKlineQuery {
  /** 本次分析的 K 线周期 */
  period: KLinePeriod;
  /** 截止日 YYYY-MM-DD；存在表示回测模式（数据为历史截断视角） */
  asOfDate?: string | null;
  /** 期望条数：单只按需补齐时用于截断与联网请求 */
  count?: number;
}

/**
 * 批量读取某次分析所需的 K 线。
 *
 * 只取已有数据、不主动补网：一次分析可能覆盖数千只股票，
 * 批量联网会打爆接口；缺失的代码交由上层按「跳过」语义处理。
 *
 * @param codes 需要读取的股票代码；不传表示全量
 */
export async function loadOpportunityKlines(
  query: OpportunityKlineQuery & { codes?: string[] }
): Promise<Map<string, KLineData[]>> {
  const map = new Map<string, KLineData[]>();
  // codes 传空数组表示「没有需要读取的股票」，不能当成「全量」（否则会触发一次全表读取）
  if (query.codes && query.codes.length === 0) {
    return map;
  }
  const wanted = query.codes ? new Set(query.codes) : null;

  if (!needsDedicatedKlineStore(query.period, query.asOfDate)) {
    const histories = await getStocksHistory(query.codes ?? []);
    histories.forEach((history) => {
      const bars = history.dailyLines;
      if (!bars || bars.length === 0) return;
      if (wanted && !wanted.has(history.code)) return;
      // stockHistory 存的是完整历史，按本次分析的条数截断，与分析结果口径一致、也省内存
      const truncated =
        query.count && bars.length > query.count ? bars.slice(-query.count) : bars;
      map.set(history.code, truncated);
    });
    return map;
  }

  const snapshot = await getOpportunityKlineSnapshot();
  // 表内周期与当前分析不一致说明是脏数据（如上次跑的是周线），整体忽略，
  // 否则会把周线当成日线去算指标
  if (snapshot.period && snapshot.period !== query.period) {
    logger.warn(
      `[机会分析K线] 独立缓存周期(${snapshot.period})与当前分析周期(${query.period})不一致，已忽略该缓存`
    );
    return map;
  }

  snapshot.entries.forEach(([code, bars]) => {
    if (!bars || bars.length === 0) return;
    if (wanted && !wanted.has(code)) return;
    map.set(code, bars);
  });
  return map;
}

/**
 * 单只 K 线按需补齐（供 K 线弹窗使用）：优先本地缓存，本地缺失才走通用 K 线接口
 * （该接口命中内存/stockHistory 时同样不会发请求）。
 *
 * 回测（带截止日）模式不做联网兜底：行情接口只能给「当下」数据，
 * 拿它冒充历史视角会引入未来信息。
 */
export async function fetchOpportunityKline(
  code: string,
  query: OpportunityKlineQuery
): Promise<KLineData[]> {
  const count = query.count ?? INITIAL_OPPORTUNITY_QUERY.currentCount;

  try {
    const local = await loadOpportunityKlines({ ...query, codes: [code] });
    const hit = local.get(code);
    if (hit && hit.length > 0) {
      return hit.length > count ? hit.slice(-count) : hit;
    }
  } catch (error) {
    logger.warn(`[机会分析K线] 读取 ${code} 本地缓存失败:`, error);
  }

  if (query.asOfDate) {
    return [];
  }
  return getKLineData(code, query.period, count);
}
