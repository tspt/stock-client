/**
 * 股票数据API服务
 * 使用新浪财经和腾讯财经API
 */

import axios from 'axios';
import type { StockInfo, StockQuote, KLineData, StockDetail } from '@/types/stock';
import { getPureCode, getMarketFromCode } from '@/utils/format/format';
import { getStorage, setStorage } from '@/utils/storage/storage';
import { apiCache } from '@/utils/storage/apiCache';
import { API_BASE, useLocalProxy } from '@/config/environment';
import { safeApiCall, handleApiError } from '../core/errors';
import {
  MAX_SEARCH_RESULTS,
  VOLUME_AMOUNT_UNIT_CONVERSION,
  API_TIMEOUT,
  DEFAULT_CACHE_TTL,
  CACHE_KEYS,
  CACHE_TTL,
} from '@/utils/config/constants';
import { logger } from '@/utils/business/logger';

/** 并发时复用同一次拉取，避免缓存失效瞬间多次打满接口 */
let biyingHsltListFetchPromise: Promise<StockInfo[]> | null = null;

/**
 * 获取所有股票列表
 * 从 biyingapi 获取全量股票数据；优先使用 localStorage 缓存（默认约 1 个月过期）
 */
export async function getAllStocks(): Promise<StockInfo[]> {
  const cached = readBiyingHsltListCache();
  if (cached) {
    return cached;
  }

  if (biyingHsltListFetchPromise) {
    return biyingHsltListFetchPromise;
  }

  biyingHsltListFetchPromise = (async (): Promise<StockInfo[]> => {
    try {
      const response = await axios.get('https://api.biyingapi.com/hslt/list/biyinglicence');
      const data = response.data;

      if (Array.isArray(data)) {
        const stocks: StockInfo[] = data.map((item: { dm: string; mc: string; jys: string }) => {
          const [code, marketSuffix] = item.dm.split('.');
          const market = marketSuffix === 'SH' ? 'SH' : 'SZ';
          const normalizedCode = `${market}${code}`;

          return {
            code: normalizedCode,
            name: item.mc.trim(),
            market: market as 'SH' | 'SZ',
          };
        });

        if (stocks.length > 0) {
          setStorage(CACHE_KEYS.BIYING_STOCK_LIST, {
            savedAt: Date.now(),
            stocks,
          });
        }

        return stocks;
      }

      return [];
    } catch (error) {
      const apiError = handleApiError(error, 'getAllStocks');
      logger.error('[getAllStocks] 获取股票列表失败:', apiError);
      return [];
    } finally {
      biyingHsltListFetchPromise = null;
    }
  })();

  return biyingHsltListFetchPromise;
}

/** biyingapi 全量股票列表本地缓存读取逻辑 */
interface BiyingHsltListCache {
  savedAt: number;
  stocks: StockInfo[];
}

function readBiyingHsltListCache(): StockInfo[] | null {
  const raw = getStorage<BiyingHsltListCache | null>(CACHE_KEYS.BIYING_STOCK_LIST, null);
  if (
    raw &&
    typeof raw.savedAt === 'number' &&
    Array.isArray(raw.stocks) &&
    raw.stocks.length > 0 &&
    Date.now() - raw.savedAt < CACHE_TTL.STOCK_LIST
  ) {
    return raw.stocks;
  }
  return null;
}

/**
 * 强制刷新股票列表（清除缓存后重新获取）
 */
export async function refreshStockList(): Promise<StockInfo[]> {
  logger.info('[getAllStocks] 强制刷新股票列表');
  // 清除缓存
  setStorage(CACHE_KEYS.BIYING_STOCK_LIST, null);
  // 重置并发控制Promise
  biyingHsltListFetchPromise = null;
  // 重新获取
  return await getAllStocks();
}

/**
 * 本地搜索股票
 * @param keyword 搜索关键词
 * @param allStocks 所有股票列表
 */
export function searchStockLocal(keyword: string, allStocks: StockInfo[]): StockInfo[] {
  if (!keyword.trim()) {
    return [];
  }

  const lowerKeyword = keyword.toLowerCase().trim();

  return allStocks
    .filter((stock) => {
      // 搜索股票代码（去掉市场前缀）
      const pureCode = stock.code.replace(/^(SH|SZ)/, '');
      // 搜索股票名称
      const name = stock.name.toLowerCase();

      return (
        pureCode.includes(lowerKeyword) ||
        name.includes(lowerKeyword) ||
        stock.code.toLowerCase().includes(lowerKeyword)
      );
    })
    .slice(0, MAX_SEARCH_RESULTS); // 限制返回最大数量
}

// 请求缓存 Map，用于防止相同参数的重复请求
// key: 排序后的股票代码字符串（逗号分隔），value: 正在进行的 Promise
const quotesRequestCache = new Map<string, Promise<StockQuote[]>>();

/**
 * 获取股票实时行情（批量查询）
 * @param codes 股票代码数组（统一格式：SH600000, SZ000001）
 */
export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) {
    return [];
  }

  // 生成缓存 key：排序后的代码数组（确保相同代码列表的请求被去重）
  const sortedCodes = [...codes].sort();
  const cacheKey = `quotes:${sortedCodes.join(',')}`;

  // 尝试从缓存获取（30秒 TTL，适合实时行情）
  const cached = apiCache.get<StockQuote[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // 如果相同的请求正在进行，返回同一个 Promise
  if (quotesRequestCache.has(cacheKey)) {
    return quotesRequestCache.get(cacheKey)!;
  }

  // 创建新的请求 Promise
  // 使用排序后的代码列表，确保相同代码列表的请求使用相同的顺序
  const requestPromise = (async (): Promise<StockQuote[]> => {
    try {
      // 转换为新浪财经格式（sh600000,sz000001）
      const sinaCodes = sortedCodes.map((code) => {
        const pureCode = getPureCode(code);
        const market = getMarketFromCode(code);
        return market === 'SH' ? `sh${pureCode}` : `sz${pureCode}`;
      });

      const codeStr = sinaCodes.join(',');
      const response = await axios.get(`${API_BASE.SINA}/list=${codeStr}`, {
        // Referer头由Electron主进程统一处理，这里不需要设置
      });

      const quotes: StockQuote[] = [];
      const data = response.data;

      if (typeof data === 'string') {
        const lines = data.split('\n');
        lines.forEach((line: string, index: number) => {
          if (line.trim() && index < sortedCodes.length) {
            const match = line.match(/var hq_str_\w+="([^"]+)"/);
            if (match) {
              const fields = match[1].split(',');
              if (fields.length >= 32) {
                const code = sortedCodes[index];
                const price = parseFloat(fields[3]) || 0;
                const prevClose = parseFloat(fields[2]) || 0;
                const change = price - prevClose;
                const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

                quotes.push({
                  code,
                  name: fields[0],
                  price,
                  change,
                  changePercent,
                  open: parseFloat(fields[1]) || 0,
                  prevClose,
                  high: parseFloat(fields[4]) || 0,
                  low: parseFloat(fields[5]) || 0,
                  volume: parseInt(fields[8]) || 0,
                  amount: parseFloat(fields[9]) || 0,
                  timestamp: Date.now(),
                });
              }
            }
          }
        });
      }

      // 将结果存入缓存（30秒 TTL）
      if (quotes.length > 0) {
        apiCache.set(cacheKey, quotes, 30 * 1000);
      }

      return quotes;
    } catch (error) {
      const apiError = handleApiError(error, 'getStockQuotes');
      logger.error('[getStockQuotes] 获取行情数据失败:', apiError);
      return [];
    } finally {
      // 请求完成后清除缓存
      quotesRequestCache.delete(cacheKey);
    }
  })();

  // 将 Promise 存入缓存
  quotesRequestCache.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * 获取股票详情数据（基本面信息）
 * 使用腾讯财经接口获取市值、PE、PB、换手率等数据
 * @param code 股票代码（统一格式：SH600000, SZ000001）
 */
export async function getStockDetail(code: string): Promise<StockDetail | null> {
  if (!code) {
    return null;
  }

  try {
    const pureCode = getPureCode(code);
    const market = getMarketFromCode(code);
    const tencentCode = market === 'SH' ? `sh${pureCode}` : `sz${pureCode}`;

    // 直接使用腾讯财经接口获取详情数据（list=接口不包含这些数据）
    const tencentUrl = `${API_BASE.TENCENT}/q=${tencentCode}`;

    const tencentResponse = await axios.get(tencentUrl, {
      timeout: API_TIMEOUT,
    });

    let detail: StockDetail = {
      code,
      timestamp: Date.now(),
    };

    if (typeof tencentResponse.data === 'string') {
      const tencentMatch = tencentResponse.data.match(/v_\w+="([^"]+)"/);
      if (tencentMatch) {
        const tencentFields = tencentMatch[1].split('~');

        const extractTencentField = (index: number): number | undefined => {
          if (index >= tencentFields.length || index < 0) return undefined;
          const value = tencentFields[index]?.trim();
          if (!value || value === '' || value === '-' || value === '0') return undefined;
          const num = parseFloat(value);
          return isNaN(num) || !isFinite(num) ? undefined : num;
        };

        // 腾讯接口字段索引（根据实际API返回数据确认）
        detail.turnoverRate = extractTencentField(38); // 索引38: 换手率
        detail.peRatio = extractTencentField(39); // 索引39: 市盈(TTM)
        detail.volumeRatio = extractTencentField(49); // 索引49: 量比
        detail.tradeAmount = extractTencentField(37); // 索引37：交易额
        detail.circulatingMarketCap = extractTencentField(44); // 索引44: 流通市值
        detail.marketCap = extractTencentField(45); // 索引45: 总市值

        // 解析买卖盘数据
        // 索引9-18: 买1-买5（价格、数量交替：9=买1价, 10=买1量, 11=买2价, 12=买2量, ...）
        // 索引19-28: 卖1-卖5（价格、数量交替：19=卖1价, 20=卖1量, 21=卖2价, 22=卖2量, ...）
        const buyOrders: Array<{ price: number; volume: number }> = [];
        const sellOrders: Array<{ price: number; volume: number }> = [];

        // 解析买盘（索引9-18，共10个字段，5个价格+5个数量）
        for (let i = 0; i < 5; i++) {
          const priceIndex = 9 + i * 2; // 9, 11, 13, 15, 17
          const volumeIndex = 10 + i * 2; // 10, 12, 14, 16, 18
          const price = extractTencentField(priceIndex);
          const volume = extractTencentField(volumeIndex);
          if (price !== undefined && volume !== undefined) {
            buyOrders.push({ price, volume });
          }
        }

        // 解析卖盘（索引19-28，共10个字段，5个价格+5个数量）
        for (let i = 0; i < 5; i++) {
          const priceIndex = 19 + i * 2; // 19, 21, 23, 25, 27
          const volumeIndex = 20 + i * 2; // 20, 22, 24, 26, 28
          const price = extractTencentField(priceIndex);
          const volume = extractTencentField(volumeIndex);
          if (price !== undefined && volume !== undefined) {
            sellOrders.push({ price, volume });
          }
        }

        if (buyOrders.length > 0) {
          detail.buyOrders = buyOrders;
        }
        if (sellOrders.length > 0) {
          detail.sellOrders = sellOrders;
        }
      } else {
      }
    } else {
    }

    return detail;
  } catch (error: any) {
    const apiError = handleApiError(error, `getStockDetail:${code}`);
    logger.error(`[getStockDetail:${code}] 获取详情失败:`, apiError);
    return null;
  }
}

/**
 * 获取K线数据
 * @param code 股票代码（统一格式：SH600000, SZ000001）
 * @param period K线周期
 * @param count 数据条数
 */
export async function getKLineData(
  code: string,
  period: string,
  count: number = 300
): Promise<KLineData[]> {
  // 生成缓存 key
  const cacheKey = `kline:${code}:${period}:${count}`;

  // 尝试从缓存获取（根据周期设置不同的 TTL）
  const cached = apiCache.get<KLineData[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const pureCode = getPureCode(code);
    const market = getMarketFromCode(code);

    // 根据周期映射到API参数（腾讯财经API的type参数）
    const periodMap: Record<string, string> = {
      '1min': 'm1', // 1分钟
      '5min': 'm5', // 5分钟
      '15min': 'm15', // 15分钟
      '30min': 'm30', // 30分钟
      '60min': 'm60', // 60分钟
      day: 'day', // 日K
      week: 'week', // 周K
      month: 'month', // 月K
      year: 'year', // 年K
    };

    const apiType = periodMap[period] || 'day';
    // 转换为腾讯财经格式：sh600000 或 sz000001
    const marketCode = market === 'SH' ? `sh${pureCode}` : `sz${pureCode}`;

    // 构建API URL（Electron/开发走本地 proxy；纯浏览器直连）
    const apiPath = '/ifzqgtimg/appstock/app/newfqkline/get';
    const baseUrl = useLocalProxy
      ? `${API_BASE.KLINE}${apiPath}`
      : `https://proxy.finance.qq.com${apiPath}`;

    const param = `${marketCode},${apiType},,,${count},`;
    const url = `${baseUrl}?_var=kline_${apiType}&param=${encodeURIComponent(
      param
    )}&r=${Math.random()}`;

    const response = await axios.get(url, {
      // 代理服务器会处理Referer头
    });

    // 解析K线数据
    // 腾讯财经API返回格式：kline_day={"code":0,"msg":"","data":{"sz000001":{"day":[[...], ...]}}}
    let data = response.data;
    const klineData: KLineData[] = [];

    // 如果是字符串，提取JSON数据
    if (typeof data === 'string') {
      // 匹配 kline_xxx = {...} 格式（可能没有var关键字）
      const varName = `kline_${apiType}`;
      // 匹配格式：kline_day={...} 或 var kline_day = {...};
      const regex = new RegExp(`${varName}\\s*=\\s*({[\\s\\S]+?})(?:;|$)`, 'm');
      const match = data.match(regex);

      if (match && match[1]) {
        try {
          data = JSON.parse(match[1]);
        } catch (e) {
          return [];
        }
      } else {
        return [];
      }
    }

    // 解析JSON数据
    // 数据格式：{ code: 0, msg: "", data: { "sz000001": { "day": [[...], ...] } } }
    if (data && typeof data === 'object') {
      // 检查返回码
      if (data.code !== 0) {
        return [];
      }

      // 从 data[股票代码][周期] 路径获取K线数组
      const responseData = data.data;
      if (!responseData || typeof responseData !== 'object') {
        return [];
      }

      // 获取股票代码（可能是 sz000001 或 sh600000）
      const stockCodeKey = Object.keys(responseData).find(
        (key) => key.toLowerCase().startsWith('sz') || key.toLowerCase().startsWith('sh')
      );

      if (!stockCodeKey) {
        return [];
      }

      const stockData = responseData[stockCodeKey];
      if (!stockData || typeof stockData !== 'object') {
        return [];
      }

      // 获取对应周期的K线数据
      const klines = stockData[apiType];
      if (!Array.isArray(klines)) {
        return [];
      }

      // 解析K线数组
      // 格式：[日期, 开盘, 收盘, 最高, 最低, 成交量, {}, 涨跌幅, 成交额, ...]
      for (const item of klines) {
        if (!Array.isArray(item) || item.length < 6) {
          continue;
        }

        const dateStr = String(item[0]).trim(); // 日期：格式 "2025-11-25"
        const open = parseFloat(item[1]); // 开盘价
        const close = parseFloat(item[2]); // 收盘价
        const high = parseFloat(item[3]); // 最高价
        const low = parseFloat(item[4]); // 最低价
        const volume = parseFloat(item[5]); // 成交量（可能是浮点数）

        // 验证数据有效性
        if (!isNaN(open) && !isNaN(close) && !isNaN(high) && !isNaN(low) && dateStr) {
          // 解析日期：支持 "2025-11-25" 或 "YYYY-MM-DD" 格式
          let timestamp: number | null = null;
          if (dateStr.includes('-')) {
            // 处理 "YYYY-MM-DD" 格式
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              const day = parseInt(parts[2]);
              if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                timestamp = new Date(year, month, day).getTime();
              }
            }
          } else if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
            // YYYYMMDD格式
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = parseInt(dateStr.substring(6, 8));
            if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
              timestamp = new Date(year, month, day).getTime();
            }
          }

          // 如果日期解析失败，跳过这条数据
          if (timestamp === null || isNaN(timestamp)) {
            continue;
          }

          klineData.push({
            time: timestamp,
            open,
            close,
            high,
            low,
            volume: Math.floor(volume), // 成交量转为整数
          });
        }
      }
    }

    // 按时间排序（从旧到新）
    klineData.sort((a, b) => a.time - b.time);

    // 如果解析到数据，存入缓存并返回
    if (klineData.length > 0) {
      // 根据周期设置不同的 TTL：分时数据 1 分钟，日K及以上 5 分钟
      const ttlMap: Record<string, number> = {
        '1min': 60 * 1000,
        '5min': 2 * 60 * 1000,
        '15min': 3 * 60 * 1000,
        '30min': 3 * 60 * 1000,
        '60min': 5 * 60 * 1000,
        day: 5 * 60 * 1000,
        week: 10 * 60 * 1000,
        month: 10 * 60 * 1000,
        year: 10 * 60 * 1000,
      };
      const ttl = ttlMap[period] || DEFAULT_CACHE_TTL;
      apiCache.set(cacheKey, klineData, ttl);
      return klineData;
    } else {
      return [];
    }
  } catch (error) {
    const apiError = handleApiError(error, `getKLineData:${code}:${period}`);
    logger.error(`[getKLineData:${code}:${period}] 获取K线数据失败:`, apiError);
    return [];
  }
}
