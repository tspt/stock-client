/**
 * 机会分析 K 线的唯一数据源解析入口（读取侧）。
 *
 * 数据源只有 `stockHistory` 一处：机会分析取日线时经 `getKLineData` 已旁路写入该表，
 * 不必再额外落一份缓存（历史上的 opportunityKlineCache 独立表已废弃删除）。
 *
 * 因此只有「日线 + 无截止日」才有可复用数据；非日线周期或回测（带截止日）的截断视角
 * 在本地没有数据源，直接返回空，避免拿完整日线冒充历史视角而引入未来信息。
 */

import type { KLineData, KLinePeriod } from '@/types/stock';
import { getKLineData } from '@/services/stocks/api';
import { getStocksHistory } from '@/utils/storage/opportunityIndexedDB';
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

  // stockHistory 只收真实日线历史：非日线周期、回测（带截止日）的截断视角在本地均无数据源
  if (query.period !== 'day' || query.asOfDate) {
    logger.warn(
      `[机会分析K线] 周期(${query.period})${
        query.asOfDate ? ` / 截止日(${query.asOfDate})` : ''
      } 无可用本地数据源，返回空`
    );
    return map;
  }

  const wanted = query.codes ? new Set(query.codes) : null;
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
