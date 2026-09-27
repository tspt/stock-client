/**
 * 东方财富 F10 资料服务：股东人数 / 十大流通股东 / 机构持仓
 *
 * 接口与字段说明见 `docs/回测优化/历史买点/获取股东人数.md`，上游为
 * `datacenter.eastmoney.com/securities/api/data/v1/get`（与 push2 行情域名不同，
 * 因此走 `/api/eastmoney-f10` 专用代理，见 `config/environment.ts` 的 F10 说明）。
 *
 * 约定：
 * 1. 请求失败一律抛出异常（不静默返回空数组），由 hook 转成区块级错误提示——
 *    否则「接口不通」与「该股没有数据」在界面上无法区分；
 * 2. 接口返回空列表属于正常情况，返回 `[]`；
 * 3. 东财大量字段可能是 `null`（如早期报告期的持股占比），统一解析为 `null`。
 */

import type { FreeHolderItem, HolderNumItem, OrgHoldingItem } from '@/types/f10';
import { getMarketFromCode, getPureCode } from '@/utils/format/format';
import CookiePoolManager from '@/utils/storage/cookiePoolManager';
import { API_BASE } from '@/config/environment';
import { logger } from '@/utils/business/logger';
import {
  API_TIMEOUT,
  F10_HOLDER_NUM_MAX_PERIODS,
  F10_MAX_PAGE_SIZE,
  STOCK_CLIENT_COOKIE_POOL_HEADER,
  STOCK_CLIENT_UA_HEADER,
} from '@/utils/config/constants';
import { F10_ORG_TYPE_DEFAULT } from '@/utils/config/f10';

/** F10 数据接口路径（挂载在 datacenter.eastmoney.com 下） */
const F10_API_PATH = '/securities/api/data/v1/get';

/** 机构持仓一次拉取的报告期数量（约 10 个季度） */
const ORG_HOLDING_PAGE_SIZE = 10;

/** 各接口请求的字段清单：属于请求契约，与对应解析函数强耦合，故与解析放在一起 */
const HOLDER_NUM_COLUMNS = [
  'SECUCODE',
  'SECURITY_CODE',
  'END_DATE',
  'HOLDER_TOTAL_NUM',
  'TOTAL_NUM_RATIO',
  'AVG_FREE_SHARES',
  'AVG_FREESHARES_RATIO',
  'HOLD_FOCUS',
  'PRICE',
  'AVG_HOLD_AMT',
  'HOLD_RATIO_TOTAL',
  'FREEHOLD_RATIO_TOTAL',
].join(',');

const FREE_HOLDER_COLUMNS = [
  'SECUCODE',
  'SECURITY_CODE',
  'END_DATE',
  'HOLDER_NEW',
  'HOLDER_NAME',
  'HOLDER_TYPE',
  'SHARES_TYPE',
  'HOLD_NUM',
  'FREE_HOLDNUM_RATIO',
  'HOLD_NUM_CHANGE',
  'NEW_CHANGE_RATIO',
  'HOLDER_RANK',
].join(',');

/** 接口统一返回结构 */
interface DatacenterResponse<T> {
  success?: boolean;
  message?: string;
  code?: number;
  result?: { data?: T[]; count?: number; pages?: number } | null;
}

interface DatacenterQuery {
  reportName: string;
  columns: string;
  filter: string;
  sortColumns: string;
  sortTypes: string;
  pageSize: number;
}

/** `603396` + `SH` → `603396.SH`；无法识别市场时返回空串 */
function buildSecuCode(code: string): string {
  const pureCode = getPureCode(code);
  const market = getMarketFromCode(code);
  if (!pureCode || !market) {
    return '';
  }
  return `${pureCode}.${market}`;
}

function requireSecuCode(code: string): string {
  const secucode = buildSecuCode(code);
  if (!secucode) {
    throw new Error(`无法识别股票代码的市场归属: ${code}`);
  }
  return secucode;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

/** `2026-06-30 00:00:00` → `2026-06-30` */
function toDateOnly(value: unknown): string {
  const text = toText(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

/**
 * 发起一次 F10 数据请求
 *
 * 说明：F10 是公开资料，没有 Cookie 也能取；若 Cookie 池里有可用 Cookie 则一并带上
 * （经自定义头交给本地代理转成真实 Cookie），不参与 Cookie 池的健康度记账。
 */
async function fetchDatacenter<T>(query: DatacenterQuery): Promise<T[]> {
  const search = new URLSearchParams({
    reportName: query.reportName,
    columns: query.columns,
    filter: query.filter,
    quoteColumns: '',
    pageNumber: '1',
    pageSize: String(query.pageSize),
    sortTypes: query.sortTypes,
    sortColumns: query.sortColumns,
    source: 'HSF10',
    client: 'PC',
  });
  const url = `${API_BASE.F10}${F10_API_PATH}?${search.toString()}`;

  const headers: Record<string, string> = { Accept: '*/*' };
  const cookie = CookiePoolManager.getInstance().getNextCookie();
  if (cookie) {
    headers[STOCK_CLIENT_COOKIE_POOL_HEADER] = cookie;
  }
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    headers[STOCK_CLIENT_UA_HEADER] = navigator.userAgent;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const payload = (await response.json()) as DatacenterResponse<T>;
    if (payload?.success === false) {
      throw new Error(payload.message || '东财 F10 接口返回失败');
    }
    const rows = payload?.result?.data;
    if (!Array.isArray(rows)) {
      // result 为 null 时表示该股确实没有此类数据，属于正常空态
      logger.warn(`[F10Service] ${query.reportName} 未返回数据`);
      return [];
    }
    return rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[F10Service] ${query.reportName} 请求失败:`, message);
    throw new Error(`F10 数据请求失败：${message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 股东人数原始行 */
interface RawHolderNum {
  END_DATE?: string;
  HOLDER_TOTAL_NUM?: number;
  TOTAL_NUM_RATIO?: number;
  AVG_FREE_SHARES?: number;
  AVG_FREESHARES_RATIO?: number;
  HOLD_FOCUS?: string;
  PRICE?: number;
  AVG_HOLD_AMT?: number;
  HOLD_RATIO_TOTAL?: number;
  FREEHOLD_RATIO_TOTAL?: number;
}

/** 十大流通股东原始行 */
interface RawFreeHolder {
  END_DATE?: string;
  HOLDER_NAME?: string;
  HOLDER_TYPE?: string;
  HOLD_NUM?: number;
  FREE_HOLDNUM_RATIO?: number;
  HOLD_NUM_CHANGE?: string;
  NEW_CHANGE_RATIO?: string;
  HOLDER_RANK?: number;
}

/** 机构持仓原始行 */
interface RawOrgHolding {
  REPORT_DATE?: string;
  TOTAL_ORG_NUM?: number;
  TOTAL_FREE_SHARES?: number;
  TOTAL_SHARES?: number;
  TOTAL_MARKET_CAP?: number;
  TOTAL_SHARES_RATIO?: number;
  ALL_SHARES_RATIO?: number;
  CHANGE_RATIO?: number;
  IS_INCREASE?: string;
  CLOSE_PRICE?: number;
}

function mapHolderNum(row: RawHolderNum): HolderNumItem {
  return {
    endDate: toDateOnly(row.END_DATE),
    holderTotalNum: toNumber(row.HOLDER_TOTAL_NUM),
    totalNumRatio: toNumber(row.TOTAL_NUM_RATIO),
    avgFreeShares: toNumber(row.AVG_FREE_SHARES),
    avgFreeSharesRatio: toNumber(row.AVG_FREESHARES_RATIO),
    holdFocus: toText(row.HOLD_FOCUS),
    price: toNumber(row.PRICE),
    avgHoldAmt: toNumber(row.AVG_HOLD_AMT),
    holdRatioTotal: toNumber(row.HOLD_RATIO_TOTAL),
    freeHoldRatioTotal: toNumber(row.FREEHOLD_RATIO_TOTAL),
  };
}

function mapFreeHolder(row: RawFreeHolder): FreeHolderItem {
  return {
    endDate: toDateOnly(row.END_DATE),
    holderName: toText(row.HOLDER_NAME),
    holderType: toText(row.HOLDER_TYPE),
    holdNum: toNumber(row.HOLD_NUM),
    freeHoldNumRatio: toNumber(row.FREE_HOLDNUM_RATIO),
    holdNumChange: toText(row.HOLD_NUM_CHANGE),
    newChangeRatio: toText(row.NEW_CHANGE_RATIO),
    holderRank: toNumber(row.HOLDER_RANK) ?? 0,
  };
}

function mapOrgHolding(row: RawOrgHolding): OrgHoldingItem {
  return {
    reportDate: toDateOnly(row.REPORT_DATE),
    totalOrgNum: toNumber(row.TOTAL_ORG_NUM),
    totalFreeShares: toNumber(row.TOTAL_FREE_SHARES),
    totalShares: toNumber(row.TOTAL_SHARES),
    totalMarketCap: toNumber(row.TOTAL_MARKET_CAP),
    totalSharesRatio: toNumber(row.TOTAL_SHARES_RATIO),
    allSharesRatio: toNumber(row.ALL_SHARES_RATIO),
    changeRatio: toNumber(row.CHANGE_RATIO),
    isIncrease: toText(row.IS_INCREASE),
    closePrice: toNumber(row.CLOSE_PRICE),
  };
}

/**
 * 获取股东人数（按报告期倒序，仅最近 `F10_HOLDER_NUM_MAX_PERIODS` 期）
 *
 * 接口本身返回全部历史，这里直接把 pageSize 当「期数上限」用：
 * 接口按 END_DATE 倒序，取前 N 条即最新的 N 期，既少传数据也少占缓存。
 *
 * @param code 统一格式股票代码（SH600000 / SZ000001）
 */
export async function fetchHolderNum(code: string): Promise<HolderNumItem[]> {
  const secucode = requireSecuCode(code);
  const rows = await fetchDatacenter<RawHolderNum>({
    reportName: 'RPT_F10_EH_HOLDERNUM',
    columns: HOLDER_NUM_COLUMNS,
    filter: `(SECUCODE="${secucode}")`,
    sortColumns: 'END_DATE',
    sortTypes: '-1',
    pageSize: F10_HOLDER_NUM_MAX_PERIODS,
  });
  return rows
    .map(mapHolderNum)
    .filter((item) => Boolean(item.endDate))
    // 兜底截断：正常情况下 rows 不会超过 pageSize，防止上游无视 pageSize 时把旧期数带进来
    .slice(0, F10_HOLDER_NUM_MAX_PERIODS);
}

/**
 * 查「十大流通股东」自己的最新报告期：按 END_DATE 倒序取第一条（只取 END_DATE 一列，开销极小）。
 *
 * 为什么必须取自本接口、而不是股东人数接口的 END_DATE：
 * 股东人数表里混有大量「只披露户数」的中途数据（如 2021-08-10 / 2020-11-20 / 2020-07-31），
 * 这些日期在十大流通股东表里并不存在，拿来当过滤条件会直接查出 0 行。
 *
 * 另一个不能采用的方案是「不带报告期过滤 + 客户端取最新一期」：
 * 东财在按 HOLDER_RANK 排序时会把**所有报告期的同一名次混排**在一起
 * （实测 603396 共 35 个报告期 350 行，rank1 的 35 行排在最前），
 * 单页被截断后最新报告期只能拿到前几名，结果不完整。
 */
async function fetchLatestFreeHolderEndDate(secucode: string): Promise<string> {
  const rows = await fetchDatacenter<{ END_DATE?: string }>({
    reportName: 'RPT_F10_EH_FREEHOLDERS',
    columns: 'END_DATE',
    filter: `(SECUCODE="${secucode}")`,
    sortColumns: 'END_DATE',
    sortTypes: '-1',
    pageSize: 1,
  });
  return toDateOnly(rows[0]?.END_DATE);
}

/**
 * 获取十大流通股东（最新报告期的前十大）
 *
 * 两步走，与 `docs/回测优化/历史买点/获取股东人数.md` 一致：
 * 1. 先不带报告期过滤、按 END_DATE 倒序取一条，从返回数据里拿到最新报告期；
 * 2. 再把该报告期作为 `END_DATE` 过滤条件，按 HOLDER_RANK 升序取完整名单。
 *
 * 第二步必须过滤：东财在不带报告期过滤时返回的是多期混排数据，
 * 按 HOLDER_RANK 排序会把所有报告期的同一名次混在一起。
 *
 * @param code 统一格式股票代码
 * @param endDate 报告期（YYYY-MM-DD）；一般无需传，留空时自动探测最新报告期
 */
export async function fetchFreeHolders(
  code: string,
  endDate?: string
): Promise<FreeHolderItem[]> {
  const secucode = requireSecuCode(code);
  const targetEndDate = endDate || (await fetchLatestFreeHolderEndDate(secucode));
  if (!targetEndDate) {
    return [];
  }

  const rows = await fetchDatacenter<RawFreeHolder>({
    reportName: 'RPT_F10_EH_FREEHOLDERS',
    columns: FREE_HOLDER_COLUMNS,
    filter: `(SECUCODE="${secucode}")(END_DATE='${targetEndDate}')`,
    sortColumns: 'HOLDER_RANK',
    sortTypes: '1',
    pageSize: F10_MAX_PAGE_SIZE,
  });
  return rows.map(mapFreeHolder).filter((item) => Boolean(item.holderName));
}

/**
 * 获取机构持仓（按报告期倒序）
 * @param code 统一格式股票代码
 * @param orgType 机构类型，默认合计口径（见 `F10_ORG_TYPE_DEFAULT`）
 */
export async function fetchOrgHoldings(
  code: string,
  orgType: string = F10_ORG_TYPE_DEFAULT
): Promise<OrgHoldingItem[]> {
  const secucode = requireSecuCode(code);
  const rows = await fetchDatacenter<RawOrgHolding>({
    reportName: 'RPT_F10_MAIN_ORGHOLDDETAILS',
    columns: 'ALL',
    filter: `(SECUCODE="${secucode}")(ORG_TYPE="${orgType}")`,
    sortColumns: 'REPORT_DATE',
    sortTypes: '-1',
    pageSize: ORG_HOLDING_PAGE_SIZE,
  });
  return rows.map(mapOrgHolding).filter((item) => Boolean(item.reportDate));
}
