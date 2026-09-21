/**
 * 筹码分布专用 K 线服务（含换手率）
 *
 * 背景：东方财富行情页的筹码分布（`#chart-cyq`）没有服务端接口——
 * 网上流传的 `push2his.../stock/cyq/get` 实际返回 404，官网是前端拉到普通 K 线后本地推算。
 * 而筹码算法必须依赖「换手率」，因此这里只需要解决「取到带换手率的 K 线」。
 *
 * 数据源：沿用项目里已稳定运行的腾讯 K 线通道
 * （`proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get`）。
 * 该接口每根 K 线的第 8 个字段就是换手率（%），与东财 `hsl` 一致（实测差异 ≤ 0.01）。
 *
 * ⚠️ 不直接复用 `getKLineData`：日线会命中 stockHistory 的 IndexedDB 缓存，
 * 而历史缓存里没有换手率字段，会导致筹码全部为 0。这里走独立拉取 + 独立内存缓存。
 */

import axios from 'axios';
import type { ChipAdjust, ChipKlineBar, ChipPeriod } from '@/types/chipDistribution';
import { getMarketFromCode, getPureCode } from '@/utils/format/format';
import { apiCache } from '@/utils/storage/apiCache';
import { API_BASE, useLocalProxy } from '@/config/environment';
import { CHIP_KLINE_CACHE_TTL, CHIP_KLINE_LIMIT } from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';

const KLINE_API_PATH = '/ifzqgtimg/appstock/app/newfqkline/get';

/** 腾讯 K 线周期参数 */
const PERIOD_MAP: Record<ChipPeriod, string> = { day: 'day', week: 'week' };

/**
 * 腾讯 K 线单根字段下标。
 * [0]日期 [1]开 [2]收 [3]高 [4]低 [5]成交量(手) [6]空对象
 * [7]换手率(%) [8]成交额(万元) [9]标记
 */
const COLUMN = {
  date: 0,
  open: 1,
  close: 2,
  high: 3,
  low: 4,
  volume: 5,
  turnoverRate: 7,
  amountWan: 8,
} as const;

/** 万元 → 元 */
const WAN = 10000;

export interface FetchChipKlineOptions {
  /** K 线周期，默认周线（与周线选股页面口径一致） */
  period?: ChipPeriod;
  /** 复权方式，默认前复权 */
  adjust?: ChipAdjust;
  /** 拉取根数，默认 210 */
  limit?: number;
}

interface TencentKlineResponse {
  code?: number;
  data?: Record<string, Record<string, unknown>>;
}

/** 把 "YYYY-MM-DD" 解析为本地时区零点时间戳 */
function parseDate(dateStr: string): number | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    return null;
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const time = new Date(year, month, day).getTime();
  return Number.isFinite(time) ? time : null;
}

/** 解析一根腾讯 K 线 */
function parseKlineRow(row: unknown): ChipKlineBar | null {
  if (!Array.isArray(row)) {
    return null;
  }

  const rawDate = String(row[COLUMN.date] ?? '').trim();
  const time = parseDate(rawDate);
  if (time === null) {
    return null;
  }

  const open = Number(row[COLUMN.open]);
  const close = Number(row[COLUMN.close]);
  const high = Number(row[COLUMN.high]);
  const low = Number(row[COLUMN.low]);
  if (![open, close, high, low].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }

  const volume = Number(row[COLUMN.volume]);
  const turnoverRate = Number(row[COLUMN.turnoverRate]);
  const amountWan = Number(row[COLUMN.amountWan]);

  return {
    time,
    date: rawDate,
    open,
    close,
    high,
    low,
    volume: Number.isFinite(volume) ? volume : 0,
    amount: Number.isFinite(amountWan) ? amountWan * WAN : 0,
    // 换手率缺失（老数据/异常）时按 0 处理，筹码算法会退化为不衰减
    turnoverRate: Number.isFinite(turnoverRate) ? turnoverRate : 0,
  };
}

/** 从「_var=kline_xxx=」响应文本中取出 JSON 对象 */
function extractJson(text: unknown, apiType: string): TencentKlineResponse {
  if (text && typeof text === 'object') {
    return text as TencentKlineResponse;
  }
  if (typeof text !== 'string') {
    throw new Error('腾讯 K 线响应格式异常');
  }
  const regex = new RegExp(`kline_${apiType}\\s*=\\s*({[\\s\\S]+?})(?:;|$)`, 'm');
  const match = text.match(regex);
  if (!match || !match[1]) {
    throw new Error(`响应中未匹配到 kline_${apiType} 变量`);
  }
  return JSON.parse(match[1]) as TencentKlineResponse;
}

/**
 * 拉取「带换手率」的 K 线（升序）
 *
 * @param code 统一格式代码（SH600000 / SZ000001）
 */
export async function fetchChipKlineBars(
  code: string,
  options: FetchChipKlineOptions = {}
): Promise<ChipKlineBar[]> {
  const pureCode = getPureCode(code);
  if (!pureCode) {
    return [];
  }

  const period = options.period ?? 'week';
  const adjust = options.adjust ?? 'qfq';
  const limit = options.limit ?? CHIP_KLINE_LIMIT;

  const cacheKey = `chip-kline:${pureCode}:${period}:${adjust}:${limit}`;
  const cached = apiCache.get<ChipKlineBar[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const market = getMarketFromCode(code);
  const marketCode = market === 'SH' ? `sh${pureCode}` : `sz${pureCode}`;
  const apiType = PERIOD_MAP[period];

  // 第 6 位为复权参数：qfq 前复权 / hfq 后复权 / 留空不复权
  const param = `${marketCode},${apiType},,,${limit},${adjust === 'none' ? '' : adjust}`;
  const baseUrl = useLocalProxy
    ? `${API_BASE.KLINE}${KLINE_API_PATH}`
    : `https://proxy.finance.qq.com${KLINE_API_PATH}`;
  const url = `${baseUrl}?_var=kline_${apiType}&param=${encodeURIComponent(param)}&r=${Math.random()}`;

  try {
    const response = await axios.get(url);
    const payload = extractJson(response.data, apiType);

    if (payload.code !== 0 || !payload.data) {
      logger.warn(`[chipKlineService] ${code} 腾讯 K 线返回异常，code=${payload.code}`);
      return [];
    }

    const stockCodeKey = Object.keys(payload.data).find(
      (key) => key.toLowerCase().startsWith('sh') || key.toLowerCase().startsWith('sz')
    );
    if (!stockCodeKey) {
      logger.warn(`[chipKlineService] ${code} 腾讯 K 线响应中找不到股票节点`);
      return [];
    }

    const stockData = payload.data[stockCodeKey];
    // 带复权参数时腾讯会把数据放在 qfqweek / hfqday 之类的 key 下
    const periodKeys = adjust === 'none' ? [apiType] : [`${adjust}${apiType}`, apiType];
    const rows = periodKeys
      .map((key) => stockData?.[key])
      .find((value) => Array.isArray(value));

    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn(
        `[chipKlineService] ${code} 腾讯 K 线未找到数据（period=${apiType}, adjust=${adjust}）`
      );
      return [];
    }

    const bars = rows
      .map(parseKlineRow)
      .filter((bar): bar is ChipKlineBar => bar !== null)
      .sort((a, b) => a.time - b.time);

    if (bars.length > 0) {
      apiCache.set(cacheKey, bars, CHIP_KLINE_CACHE_TTL);
    }
    return bars;
  } catch (error) {
    logger.error(`[chipKlineService] ${code} 拉取筹码 K 线失败:`, error);
    return [];
  }
}
