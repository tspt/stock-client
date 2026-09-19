/**
 * 多周期共振：周线选股，日线买股
 *
 * 文档第三章要求三层共振：
 *   1. 周线站在 5 周均线上方（定方向）        —— 已在 factors 里
 *   2. 日线站在 20 日均线上方（定主力控盘）    —— 本模块
 *   3. 15 分钟图 20 日均线上穿 60 日均线       —— 无分钟级数据源，未接入
 *
 * 日线数据不单独拉取，直接复用机会分析已经落到 IndexedDB 的 stockHistory
 * （getStocksHistory 有跨页面全量缓存，周线页读它是零额外网络 IO）。
 */

import type { KLineData } from '@/types/stock';

/** 日线 MA 周期：对应「日线站在 20 日均线上方」 */
export const DAILY_MA_PERIOD = 20;

/**
 * 计算日线 MA，前 period-1 项为 NaN。
 * 单独实现而不用 indicators.calculateMA，是为了让本模块不依赖日线那套工具链。
 */
function dailyMa(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (period <= 0 || closes.length < period) return out;
  let sum = 0;
  for (let i = 0; i < closes.length; i += 1) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * 日线是否站在 20 日均线上方。
 * @returns 数据不足时返回 undefined（调用方按「缺失」处理，不惩罚）
 */
export function isDailyAboveMa(daily: KLineData[] | undefined, period = DAILY_MA_PERIOD): boolean | undefined {
  if (!daily || daily.length < period) return undefined;
  const closes = daily.map((d) => d.close).filter((v) => Number.isFinite(v) && v > 0);
  if (closes.length < period) return undefined;

  const ma = dailyMa(closes, period);
  const lastMa = ma[ma.length - 1];
  const lastClose = closes[closes.length - 1];
  if (!Number.isFinite(lastMa) || lastMa <= 0) return undefined;
  return lastClose > lastMa;
}

/**
 * 三层共振是否成立（15 分钟层缺失时按周线+日线两层判定）。
 * 用于 UI 提示「共振 2/3」。
 */
export function resonanceLayers(row: {
  pxAboveMa5?: boolean;
  dailyAboveMa20?: boolean;
  intradayGolden?: boolean;
}): { passed: number; total: number } {
  let passed = 0;
  if (row.pxAboveMa5) passed += 1;
  if (row.dailyAboveMa20 === true) passed += 1;
  if (row.intradayGolden === true) passed += 1;
  return { passed, total: 3 };
}
