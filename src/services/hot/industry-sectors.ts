/**
 * 行业板块服务 - 获取行业板块数据
 */

import type { IndustrySectorRankData, IndustrySectorBasicInfo } from '@/types/stock';
import { logger } from '@/utils/business/logger';
import { getStorage, setStorage } from '@/utils/storage/storage';
import { fetchWithCookieRetry } from '@/utils/network/fetchWithCookieRetry';

/**
 * 板块成分股分页大小常量
 * 经过测试，东方财富接口支持最大 100 条/页
 */
export const SECTOR_STOCKS_PAGE_SIZE = 100;

/**
 * 东方财富行业板块原始数据
 */
interface RawIndustrySectorResponse {
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
      f2: number; // 最新价
      f3: number; // 涨跌幅
      f12: string; // 代码
      f13: number; // 市场类型
      f14: string; // 名称
      f62: number; // 今日主力净流入-净额（元）
      f66: number; // 今日超大单净流入-净额（元）
      f69: number; // 今日超大单净流入-净占比（百分比）
      f72: number; // 今日大单净流入-净额（元）
      f75: number; // 今日大单净流入-净占比（百分比）
      f78: number; // 今日中单净流入-净额（元）
      f81: number; // 今日中单净流入-净占比（百分比）
      f84: number; // 今日小单净流入-净额（元）
      f87: number; // 今日小单净流入-净占比（百分比）
      f124: number; // 时间戳
      f184: number; // 今日主力净流入-净占比（百分比）
      f204: string; // 领涨股名称
      f205: string; // 领涨股代码
      f206: number; // 未知
    }>;
  };
}

/**
 * 解析行业板块数据
 */
function parseIndustrySectorData(rawData: RawIndustrySectorResponse): IndustrySectorRankData[] {
  try {
    if (!rawData.data || !rawData.data.diff) {
      return [];
    }

    return rawData.data.diff.map((item) => {
      return {
        code: item.f12,
        name: item.f14,
        price: item.f2,
        changePercent: item.f3 || 0,
        // 主力净流入（元转万元）
        mainNetInflow: item.f62 / 10000,
        mainNetInflowRatio: item.f184, // 主力净流入净占比来自f184
        // 超大单净流入（元转万元）
        superLargeNetInflow: item.f66 / 10000,
        superLargeNetInflowRatio: item.f69,
        // 大单净流入（元转万元）
        largeNetInflow: item.f72 / 10000,
        largeNetInflowRatio: item.f75,
        // 中单净流入（元转万元）
        mediumNetInflow: item.f78 / 10000,
        mediumNetInflowRatio: item.f81,
        // 小单净流入（元转万元）
        smallNetInflow: item.f84 / 10000,
        smallNetInflowRatio: item.f87,
        // 领涨股
        leadingStock: item.f204,
        leadingStockCode: item.f205,
      };
    });
  } catch (error) {
    logger.error('解析行业板块数据失败:', error);
    return [];
  }
}

/**
 * 获取单个行业详细数据（资金流向）
 * @param sectorCode 行业板块代码（如 BK1020）
 */
export async function getSingleIndustrySector(
  sectorCode: string
): Promise<IndustrySectorRankData | null> {
  try {
    // 使用 push2.eastmoney.com 的 ulist.np/get 接口
    const baseUrl = '/api/eastmoney/ulist.np/get';
    const params = new URLSearchParams({
      fltt: '2',
      secids: `90.${sectorCode}`, // 90.板块代码 表示行业板块
      fields: 'f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f124,f6,f12,f14',
      ut: 'b2884a393a59ad64002292a3e90d46a5',
    });

    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 直接解析JSON响应（不是JSONP）
    const data = await response.json();

    if (data.rc !== 0 || !data.data || !data.data.diff || data.data.diff.length === 0) {
      throw new Error('获取行业详细数据失败');
    }

    const item = data.data.diff[0];

    // 转换为标准格式
    return {
      code: item.f12 || sectorCode,
      name: item.f14 || '未知行业',
      changePercent: 0, // 该接口没有f3字段
      // 主力净流入（元转万元）
      mainNetInflow: item.f62 / 10000,
      mainNetInflowRatio: item.f184,
      // 超大单净流入（元转万元）
      superLargeNetInflow: item.f66 / 10000,
      superLargeNetInflowRatio: item.f69,
      // 大单净流入（元转万元）
      largeNetInflow: item.f72 / 10000,
      largeNetInflowRatio: item.f75,
      // 中单净流入（元转万元）
      mediumNetInflow: item.f78 / 10000,
      mediumNetInflowRatio: item.f81,
      // 小单净流入（元转万元）
      smallNetInflow: item.f84 / 10000,
      smallNetInflowRatio: item.f87,
    };
  } catch (error) {
    logger.error('[getSingleIndustrySector] 获取行业详细数据失败:', error);
    throw error;
  }
}

/**
 * 获取行业板块数据
 * @param sortType 排序类型: f3-涨跌幅, f62-主力净流入等
 * @param sortOrder 排序方向: 1-降序, 0-升序
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getIndustrySectors(
  sortType: string = 'f3',
  sortOrder: number = 1, // 1: 降序, 0: 升序
  pageSize: number = 50,
  pageNum: number = 1
): Promise<{ data: IndustrySectorRankData[]; total: number }> {
  try {
    // 构建API URL - 使用 m:90 s:4 表示行业板块
    const baseUrl = '/api/eastmoney/clist/get';
    const params = new URLSearchParams({
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fid: sortType,
      po: sortOrder.toString(),
      pz: pageSize.toString(),
      pn: pageNum.toString(),
      np: '1',
      fltt: '2',
      invt: '2',
      ut: '8dec03ba335b81bf4ebdf7b29ec27d15',
      fs: 'm:90+s:4', // m:90 s:4 表示行业板块
      fields: 'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124,f1,f13',
    });

    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetchWithCookieRetry(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawIndustrySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取行业板块数据失败');
    }

    return {
      data: parseIndustrySectorData(data),
      total: data.data.total,
    };
  } catch (error) {
    logger.error('获取行业板块数据失败:', error);
    throw error;
  }
}

/**
 * 所有行业分类缓存键（每日过期）
 * @deprecated 已迁移到 unified-sectors.ts 和 constants.ts，保留此注释仅为向后兼容
 */
// const ALL_INDUSTRY_SECTORS_CACHE_KEY = 'unified_industry_basic_v1'; // 使用统一缓存键
// const ALL_INDUSTRY_SECTORS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24小时

interface AllIndustrySectorsCache {
  savedAt: number;
  sectors: IndustrySectorBasicInfo[];
}

/**
 * 读取所有行业分类缓存
 * @deprecated 建议使用 getUnifiedIndustryBasic() from unified-sectors.ts
 */
function readAllIndustrySectorsCache(): IndustrySectorBasicInfo[] | null {
  // 逻辑已迁移至 unified-sectors.ts 中的 getUnifiedIndustryBasic
  return null;
}

/** 并发时复用同一次拉取，避免缓存失效瞬间多次打满接口 */
let allIndustrySectorsFetchPromise: Promise<IndustrySectorBasicInfo[]> | null = null;

/**
 * 获取所有行业分类（带缓存，每日只拉取一次）
 * @deprecated 建议使用 getUnifiedIndustryBasic() from unified-sectors.ts
 */
export async function getAllIndustrySectors(): Promise<IndustrySectorBasicInfo[]> {
  const cached = readAllIndustrySectorsCache();
  if (cached) {
    return cached;
  }

  if (allIndustrySectorsFetchPromise) {
    return allIndustrySectorsFetchPromise;
  }

  allIndustrySectorsFetchPromise = (async (): Promise<IndustrySectorBasicInfo[]> => {
    try {
      // 使用东方财富API获取所有行业板块
      const baseUrl = '/api/eastmoney-data/bkzj/getbkzj';
      const params = new URLSearchParams({
        key: 'f62',
        code: 'm:90+s:4', // m:90 s:4 表示行业板块 (URLSearchParams会自动编码)
      });

      const url = `${baseUrl}?${params.toString()}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 直接解析JSON响应（不是JSONP）
      const data = await response.json();

      // rc=0 表示成功
      if (data.rc !== 0) {
        throw new Error('获取行业分类数据失败');
      }

      // 数据在 data.diff 数组中
      if (!data.data || !data.data.diff || !Array.isArray(data.data.diff)) {
        throw new Error('获取行业分类数据失败');
      }

      // 转换为基本行业信息
      const sectors: IndustrySectorBasicInfo[] = data.data.diff.map((item: any) => ({
        code: item.f12,
        name: item.f14,
        mainNetInflow: item.f62, // 主力净流入（元）
      }));

      // 保存到缓存（逻辑已迁移至 unified-sectors.ts）
      // if (sectors.length > 0) {
      //   setStorage(ALL_INDUSTRY_SECTORS_CACHE_KEY, {
      //     savedAt: Date.now(),
      //     sectors,
      //   });
      // }

      return sectors;
    } catch (error) {
      logger.error('[getAllIndustrySectors] 获取行业分类失败:', error);
      return [];
    } finally {
      allIndustrySectorsFetchPromise = null;
    }
  })();

  return allIndustrySectorsFetchPromise;
}

/**
 * 获取领涨行业板块
 */
export async function getRisingIndustrySectors(
  count: number = 20
): Promise<IndustrySectorRankData[]> {
  const result = await getIndustrySectors('f3', 1, count, 1); // 按涨跌幅降序（po=1）
  return result.data;
}

/**
 * 获取领跌行业板块
 */
export async function getFallingIndustrySectors(
  count: number = 20
): Promise<IndustrySectorRankData[]> {
  const result = await getIndustrySectors('f3', 0, count, 1); // 按涨跌幅升序（po=0）
  return result.data;
}

/**
 * 同时获取领涨和领跌行业板块
 */
export async function getIndustrySectorRanks(count: number = 20): Promise<{
  rising: IndustrySectorRankData[];
  falling: IndustrySectorRankData[];
}> {
  try {
    const [rising, falling] = await Promise.all([
      getRisingIndustrySectors(count),
      getFallingIndustrySectors(count),
    ]);

    return { rising, falling };
  } catch (error) {
    logger.error('获取行业板块排行数据失败:', error);
    throw error;
  }
}

/**
 * 获取行业板块成分股数据
 * @param sectorCode 行业板块代码 (如 BK1020)
 * @param sortType 排序类型: f3-涨跌幅, f62-主力净流入等
 * @param sortOrder 排序方向: 1-降序, 0-升序
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getIndustrySectorStocks(
  sectorCode: string,
  sortType: string = 'f3',
  sortOrder: number = 1,
  pageSize: number = 50,
  pageNum: number = 1
): Promise<{ data: IndustrySectorRankData[]; total: number }> {
  try {
    // 构建API URL - 使用 b:板块代码 表示获取该板块的成分股
    const baseUrl = '/api/eastmoney/clist/get';
    const params = new URLSearchParams({
      cb: `jQuery${Date.now()}_${Math.random().toString().slice(2, 11)}`,
      fid: sortType,
      po: sortOrder.toString(),
      pz: pageSize.toString(),
      pn: pageNum.toString(),
      np: '1',
      fltt: '2',
      invt: '2',
      ut: '8dec03ba335b81bf4ebdf7b29ec27d15',
      fs: `b:${sectorCode}`, // b:板块代码 表示获取该板块的成分股
      fields: 'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124,f1,f13',
    });

    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetchWithCookieRetry(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawIndustrySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取行业板块成分股数据失败');
    }

    return {
      data: parseIndustrySectorData(data),
      total: data.data.total,
    };
  } catch (error) {
    logger.error('获取行业板块成分股数据失败:', error);
    throw error;
  }
}
