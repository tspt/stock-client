/**
 * 东方财富热门板块服务 - 获取领涨/领跌板块数据
 */

import type { EastMoneySectorData } from '@/types/stock';
import { logger } from '@/utils/logger';
import { EASTMONEY_COOKIE } from '@/config/apiConfig';

/**
 * 东方财富热门板块原始数据
 */
interface RawEastMoneySectorResponse {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  data: {
    total: number;
    diff: Array<{
      f1: number; // 序号
      f2: number; // 指数值
      f3: number; // 涨跌幅
      f4: number; // 涨跌额
      f8: number; // 成交量
      f12: string; // 代码
      f13: number; // 市场类型
      f14: string; // 名称
      f20: number; // 总市值
      f104: number; // 上涨家数
      f105: number; // 下跌家数
      f128: string; // 领涨股票名称
      f136: number; // 换手率
      f140: string; // 领涨股票代码
      f141: number; // 领涨股票涨跌幅（0或1表示状态，需要转换为百分比）
      f152: number; // 未知
      f207: string; // 领跌股票名称
      f208: string; // 领跌股票代码
      f209: number; // 领跌股票涨跌幅
      f222: number; // 未知
    }>;
  };
}

// API 缓存
let risingSectorsCache: EastMoneySectorData[] | null = null;
let fallingSectorsCache: EastMoneySectorData[] | null = null;
let lastSectorsFetchTime: number = 0;
const SECTORS_CACHE_DURATION = 8000; // 8秒缓存

/**
 * 解析东方财富热门板块数据
 */
function parseEastMoneySectorData(rawData: RawEastMoneySectorResponse): EastMoneySectorData[] {
  try {
    if (!rawData.data || !rawData.data.diff) {
      return [];
    }

    return rawData.data.diff.map((item) => {
      // f3 和 f136 需要除以100转换为百分比
      // f141 是领涨股票的状态码（0或1），领涨股票的实际涨跌幅需要从其他地方获取
      // 根据文档示例，暂时使用 f3 作为领涨股票的参考涨跌幅
      const changePercent = (item.f3 || 0) / 100;
      const turnoverRate = (item.f136 || 0) / 100;

      return {
        code: item.f12,
        name: item.f14,
        changePercent: changePercent,
        turnoverRate: turnoverRate,
        riseCount: item.f104 || 0,
        fallCount: item.f105 || 0,
        leadingStockName: item.f128 || '-',
        leadingStockCode: item.f140 || '',
        leadingStockChangePercent: item.f141 ? 10 : 0, // 暂时使用，实际需要根据API调整
      };
    });
  } catch (error) {
    logger.error('解析东方财富热门板块数据失败:', error);
    return [];
  }
}

/**
 * 获取东方财富领涨板块
 * @param count 获取数量
 */
export async function getEastMoneyRisingSectors(
  count: number = 20
): Promise<EastMoneySectorData[]> {
  const now = Date.now();

  // 检查缓存是否有效
  if (risingSectorsCache && now - lastSectorsFetchTime < SECTORS_CACHE_DURATION) {
    logger.debug('使用缓存的领涨板块数据');
    return risingSectorsCache;
  }

  try {
    const baseUrl = '/api/eastmoney/clist/get';
    const params = new URLSearchParams({
      np: '1',
      fltt: '1',
      invt: '2',
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fs: 'm:90 t:3 f:!50', // 概念板块，过滤f:!50
      fields:
        'f12,f13,f14,f1,f2,f4,f3,f152,f20,f8,f104,f105,f128,f140,f141,f207,f208,f209,f136,f222',
      fid: 'f3', // 按涨跌幅排序
      pn: '1',
      pz: count.toString(),
      po: '1', // 降序
      dect: '1',
      ut: 'fa5fd1943c7b386f172d6893dbfba10b',
      wbp2u: '|0|0|0|web',
      _: Date.now().toString(),
    });

    const url = `${baseUrl}?${params.toString()}`;

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(url, {
      headers: {
        Cookie: EASTMONEY_COOKIE,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawEastMoneySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取东方财富领涨板块数据失败');
    }

    const result = parseEastMoneySectorData(data);

    // 更新缓存
    if (result.length > 0) {
      risingSectorsCache = result;
      lastSectorsFetchTime = now;
    }

    return result;
  } catch (error) {
    // 如果请求失败但有缓存，返回缓存数据
    if (risingSectorsCache) {
      logger.warn('获取领涨板块数据失败，使用缓存数据:', error);
      return risingSectorsCache;
    }
    logger.error('获取东方财富领涨板块数据失败:', error);
    throw error;
  }
}

/**
 * 获取东方财富领跌板块
 * @param count 获取数量
 */
export async function getEastMoneyFallingSectors(
  count: number = 20
): Promise<EastMoneySectorData[]> {
  const now = Date.now();

  // 检查缓存是否有效
  if (fallingSectorsCache && now - lastSectorsFetchTime < SECTORS_CACHE_DURATION) {
    logger.debug('使用缓存的领跌板块数据');
    return fallingSectorsCache;
  }

  try {
    const baseUrl = '/api/eastmoney/clist/get';
    const params = new URLSearchParams({
      np: '1',
      fltt: '1',
      invt: '2',
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fs: 'm:90 t:3 f:!50', // 概念板块，过滤f:!50
      fields:
        'f12,f13,f14,f1,f2,f4,f3,f152,f20,f8,f104,f105,f128,f140,f141,f207,f208,f209,f136,f222',
      fid: 'f3', // 按涨跌幅排序
      pn: '1',
      pz: count.toString(),
      po: '0', // 升序（领跌）
      dect: '1',
      ut: 'fa5fd1943c7b386f172d6893dbfba10b',
      wbp2u: '|0|0|0|web',
      _: Date.now().toString(),
    });

    const url = `${baseUrl}?${params.toString()}`;

    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(url, {
      headers: {
        Cookie: EASTMONEY_COOKIE,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawEastMoneySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取东方财富领跌板块数据失败');
    }

    const result = parseEastMoneySectorData(data);

    // 更新缓存
    if (result.length > 0) {
      fallingSectorsCache = result;
      lastSectorsFetchTime = now;
    }

    return result;
  } catch (error) {
    // 如果请求失败但有缓存，返回缓存数据
    if (fallingSectorsCache) {
      logger.warn('获取领跌板块数据失败，使用缓存数据:', error);
      return fallingSectorsCache;
    }
    logger.error('获取东方财富领跌板块数据失败:', error);
    throw error;
  }
}

/**
 * 同时获取东方财富领涨和领跌概念数据
 */
export async function getEastMoneySectorRanks(count: number = 20): Promise<{
  rising: EastMoneySectorData[];
  falling: EastMoneySectorData[];
}> {
  try {
    const [rising, falling] = await Promise.all([
      getEastMoneyRisingSectors(count),
      getEastMoneyFallingSectors(count),
    ]);

    return { rising, falling };
  } catch (error) {
    logger.error('获取东方财富板块排行数据失败:', error);
    throw error;
  }
}
