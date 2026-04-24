/**
 * 东方财富指数数据服务
 */

import { logger } from '@/utils/business/logger';
import { fetchWithCookieRetry } from '@/utils/network/fetchWithCookieRetry';
import { getEastMoneyClistJsonpData } from '@/utils/network/eastMoneyClistClient';

/**
 * 指数数据接口
 */
export interface EastMoneyIndexData {
  code: string; // 指数代码
  name: string; // 指数名称
  currentPrice: number; // 当前价格
  change: number; // 涨跌额
  changePercent: number; // 涨跌幅
  volume: number; // 成交量
  amount: number; // 成交额
  open: number; // 开盘价
  high: number; // 最高价
  low: number; // 最低价
  preClose: number; // 昨收
  riseCount: number; // 上涨家数
  fallCount: number; // 下跌家数
  flatCount: number; // 平盘家数
}

/**
 * 东方财富指数原始数据接口
 */
interface RawEastMoneyIndexResponse {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  data: {
    total: number;
    diff: Array<{
      f1: number; // 市场代码
      f2: number; // 当前价格
      f3: number; // 涨跌幅
      f4: number; // 涨跌额
      f5: number; // 成交量
      f6: number; // 成交额
      f12: string; // 指数代码
      f13: number; // 市场标识
      f14: string; // 指数名称
      f15: number; // 最高价
      f16: number; // 最低价
      f17: number; // 开盘价
      f18: number; // 昨收
      f152: number;
    }>;
  };
}

/**
 * 东方财富指数涨跌家数原始数据接口
 */
interface RawEastMoneyIndexRankResponse {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  data: {
    total: number;
    diff: Array<{
      f104: number; // 上涨家数
      f105: number; // 下跌家数
      f106: number; // 平盘家数
    }>;
  };
}

// API 缓存 - 存储最近一次成功的响应
let indicesCache: EastMoneyIndexData[] | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 5000; // 5秒缓存

/**
 * 解析指数行情数据
 */
function parseIndexData(
  rawData: RawEastMoneyIndexResponse,
  rankData?: RawEastMoneyIndexRankResponse
): EastMoneyIndexData[] {
  try {
    if (!rawData.data || !rawData.data.diff) {
      return [];
    }

    return rawData.data.diff.map((item, index) => {
      // 获取对应的涨跌家数数据
      const rankItem = rankData?.data?.diff?.[index];

      return {
        code: item.f12,
        name: item.f14,
        currentPrice: item.f2 / 100, // 需要除以100
        change: item.f4 / 100, // 需要除以100
        changePercent: item.f3 / 100, // 需要除以100
        volume: item.f5 || 0,
        amount: item.f6 || 0,
        open: item.f17 / 100,
        high: item.f15 / 100,
        low: item.f16 / 100,
        preClose: item.f18 / 100,
        riseCount: rankItem?.f104 || 0,
        fallCount: rankItem?.f105 || 0,
        flatCount: rankItem?.f106 || 0,
      };
    });
  } catch (error) {
    logger.error('解析指数数据失败:', error);
    return [];
  }
}

/**
 * 获取东方财富指数数据
 * @param secids 指数代码列表,格式为 "市场.代码",如 "1.000001"
 */
export async function getEastMoneyIndices(
  secids: string[] = ['1.000001', '0.399001', '0.399006']
): Promise<EastMoneyIndexData[]> {
  const now = Date.now();

  // 检查缓存是否有效
  if (indicesCache && now - lastFetchTime < CACHE_DURATION) {
    logger.debug('使用缓存的指数数据');
    return indicesCache;
  }

  try {
    // 1. 指数行情（clist） 2. 涨跌家数（ulist 仍走本地代理）
    const indexParams = new URLSearchParams({
      np: '1',
      fltt: '1',
      invt: '2',
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fs: 'b:MK0010', // 指数板块
      fields: 'f12,f13,f14,f1,f2,f4,f3,f152,f5,f6,f18,f17,f15,f16',
      fid: '',
      pn: '1',
      pz: '50',
      po: '1',
      ut: 'fa5fd1943c7b386f172d6893dbfba10b',
      dect: '1',
      wbp2u: '|0|0|0|web',
      _: Date.now().toString(),
    });

    const rankBaseUrl = '/api/eastmoney/ulist/get';
    const rankParams = new URLSearchParams({
      fltt: '1',
      invt: '2',
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fields: 'f104,f105,f106',
      secids: secids.join(','),
      ut: 'fa5fd1943c7b386f172d6893dbfba10b',
      pn: '1',
      np: '1',
      dect: '1',
      pz: '20',
      wbp2u: '|0|0|0|web',
      _: Date.now().toString(),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const [indexDataRaw, rankResponse] = await Promise.all([
      getEastMoneyClistJsonpData(indexParams, 3, controller.signal),
      fetchWithCookieRetry(`${rankBaseUrl}?${rankParams.toString()}`, {
        signal: controller.signal,
      }),
    ]);

    clearTimeout(timeoutId);

    if (!rankResponse.ok) {
      throw new Error(`获取指数涨跌家数失败: ${rankResponse.status}`);
    }

    const indexData: RawEastMoneyIndexResponse = indexDataRaw as RawEastMoneyIndexResponse;
    const rankText = await rankResponse.text();
    const rankJsonMatch = rankText.match(/\((.*)\)/);

    if (indexData === null || indexData === undefined || typeof (indexData as { rc?: number }).rc !== 'number') {
      throw new Error('无法解析指数行情JSONP响应');
    }
    if (!rankJsonMatch || !rankJsonMatch[1]) {
      throw new Error('无法解析指数涨跌家数JSONP响应');
    }

    const rankData: RawEastMoneyIndexRankResponse = JSON.parse(rankJsonMatch[1]);

    if (indexData.rc !== 0) {
      throw new Error('获取指数行情数据失败');
    }
    if (rankData.rc !== 0) {
      throw new Error('获取指数涨跌家数失败');
    }

    // 过滤出需要的指数(上证指数、深证成指、创业板指)
    // 注意: API返回的secids顺序是 1.000001, 0.399001, 0.399006
    // 对应的涨跌家数数据顺序也是这个顺序
    // 所以我们需要按这个顺序来匹配
    const targetCodes = ['000001', '399001', '399006'];
    const filteredDiffs = indexData.data.diff.filter((item) => targetCodes.includes(item.f12));

    // 按照targetCodes的顺序排序
    filteredDiffs.sort((a, b) => targetCodes.indexOf(a.f12) - targetCodes.indexOf(b.f12));

    // 确保涨跌家数数据与指数数据一一对应
    // rankData.data.diff的顺序应该与secids参数顺序一致
    const filteredIndexData = {
      ...indexData,
      data: {
        ...indexData.data,
        diff: filteredDiffs,
      },
    };

    const result = parseIndexData(filteredIndexData, rankData);

    // 更新缓存
    if (result.length > 0) {
      indicesCache = result;
      lastFetchTime = now;
    }

    return result;
  } catch (error) {
    // 如果请求失败但有缓存，返回缓存数据
    if (indicesCache) {
      logger.warn('获取指数数据失败，使用缓存数据:', error);
      return indicesCache;
    }
    logger.error('获取东方财富指数数据失败:', error);
    throw error;
  }
}
