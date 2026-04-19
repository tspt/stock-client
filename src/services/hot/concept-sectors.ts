/**
 * 概念板块服务 - 获取概念板块数据
 */

import type {
  ConceptSectorRankData,
  ConceptSectorStockData,
  ConceptSectorBasicInfo,
} from '@/types/stock';
import { logger } from '@/utils/logger';
import { getStorage, setStorage } from '@/utils/storage';

/**
 * 东方财富概念板块原始数据
 */
interface RawConceptSectorResponse {
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
 * 解析概念板块数据
 */
function parseConceptSectorData(rawData: RawConceptSectorResponse): ConceptSectorRankData[] {
  try {
    if (!rawData.data || !rawData.data.diff) {
      return [];
    }

    return rawData.data.diff.map((item) => {
      return {
        code: item.f12,
        name: item.f14,
        changePercent: item.f3 || 0,
        turnoverRate: undefined,
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
    logger.error('解析概念板块数据失败:', error);
    return [];
  }
}

/**
 * 获取概念板块数据
 * @param sortType 排序类型: f3-涨跌幅, f62-换手率, f66-成交额, f204-总市值
 * @param sortOrder 排序方向: 1-降序, 0-升序
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getConceptSectors(
  sortType: string = 'f3',
  sortOrder: number = 1, // 1: 降序, 0: 升序
  pageSize: number = 50,
  pageNum: number = 1
): Promise<{ data: ConceptSectorRankData[]; total: number }> {
  try {
    // 构建API URL
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
      fs: 'm:90 t:3', // m:90 t:3 表示概念板块
      fields: 'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124,f1,f13',
    });

    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Cookie:
          'qgqp_b_id=51d6d555c5e243b0256ceb1ac9c36628; st_nvi=TnWN91Owg3cX5WszqJeo-f8e2; nid18=0d86f08b814c455b1d6ebd09256a5ade; nid18_create_time=1775911116025; gviem=VcbSKTlarodHzNMYoAptO452f; gviem_create_time=1775911116025; fullscreengg=1; fullscreengg2=1; st_si=84713527048044; st_pvi=13325294659680; st_sp=2025-03-30%2015%3A14%3A18; st_inirUrl=https%3A%2F%2Femcreative.eastmoney.com%2F; st_sn=10; st_psi=20260417210401477-113200301353-6617435904; st_asi=delete',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawConceptSectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取概念板块数据失败');
    }

    return {
      data: parseConceptSectorData(data),
      total: data.data.total,
    };
  } catch (error) {
    logger.error('获取概念板块数据失败:', error);
    throw error;
  }
}

/**
 * 概念板块下股票原始数据
 */
interface RawConceptSectorStocksResponse {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  data: {
    total: number;
    diff: Array<{
      f12: string; // 代码
      f14: string; // 名称
      f2: number; // 最新价
      f3: number; // 涨跌幅
      f62: number; // 今日主力净流入-净额（元）
      f184: number; // 今日主力净流入-净占比（百分比）
      f66: number; // 今日超大单净流入-净额（元）
      f69: number; // 今日超大单净流入-净占比（百分比）
      f72: number; // 今日大单净流入-净额（元）
      f75: number; // 今日大单净流入-净占比（百分比）
      f78: number; // 今日中单净流入-净额（元）
      f81: number; // 今日中单净流入-净占比（百分比）
      f84: number; // 今日小单净流入-净额（元）
      f87: number; // 今日小单净流入-净占比（百分比）
      f204: string; // 领涨股名称
      f205: string; // 领涨股代码
      f124: number; // 时间戳
      f1: number; // 序号
      f13: number; // 市场类型
    }>;
  };
}

function parseConceptSectorStocksData(
  rawData: RawConceptSectorStocksResponse
): ConceptSectorStockData[] {
  try {
    if (!rawData.data || !rawData.data.diff) {
      return [];
    }

    return rawData.data.diff.map((item) => ({
      code: item.f12,
      name: item.f14,
      price: item.f2 || 0,
      changePercent: item.f3 || 0,
      mainNetInflow: (item.f62 || 0) / 10000,
      mainNetInflowRatio: item.f184 || 0,
      superLargeNetInflow: (item.f66 || 0) / 10000,
      superLargeNetInflowRatio: item.f69 || 0,
      largeNetInflow: (item.f72 || 0) / 10000,
      largeNetInflowRatio: item.f75 || 0,
      mediumNetInflow: (item.f78 || 0) / 10000,
      mediumNetInflowRatio: item.f81 || 0,
      smallNetInflow: (item.f84 || 0) / 10000,
      smallNetInflowRatio: item.f87 || 0,
    }));
  } catch (error) {
    logger.error('解析概念板块股票数据失败:', error);
    return [];
  }
}

/**
 * 获取概念板块下的股票列表
 * @param sectorCode 概念板块代码（如：BK1136）
 * @param sortType 排序类型
 * @param sortOrder 排序方向
 * @param pageSize 每页数量
 * @param pageNum 页码
 */
export async function getConceptSectorStocks(
  sectorCode: string,
  sortType: string = 'f3',
  sortOrder: number = 1,
  pageSize: number = 20,
  pageNum: number = 1
): Promise<{ data: ConceptSectorStockData[]; total: number }> {
  try {
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
      fs: `b:${sectorCode}`, // b:BK1136
      fields: 'f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124,f1,f13',
    });

    const url = `${baseUrl}?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        Cookie:
          'qgqp_b_id=51d6d555c5e243b0256ceb1ac9c36628; st_nvi=TnWN91Owg3cX5WszqJeo-f8e2; nid18=0d86f08b814c455b1d6ebd09256a5ade; nid18_create_time=1775911116025; gviem=VcbSKTlarodHzNMYoAptO452f; gviem_create_time=1775911116025; fullscreengg=1; fullscreengg2=1; st_si=84713527048044; st_pvi=13325294659680; st_sp=2025-03-30%2015%3A14%3A18; st_inirUrl=https%3A%2F%2Femcreative.eastmoney.com%2F; st_sn=10; st_psi=20260417210401477-113200301353-6617435904; st_asi=delete',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // 解析JSONP响应
    const jsonMatch = text.match(/\((.*)\)/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('无法解析JSONP响应');
    }

    const data: RawConceptSectorStocksResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取概念板块股票数据失败');
    }

    return {
      data: parseConceptSectorStocksData(data),
      total: data.data.total,
    };
  } catch (error) {
    logger.error('获取概念板块股票数据失败:', error);
    throw error;
  }
}

/**
 * 获取领涨概念板块
 */
export async function getRisingConceptSectors(
  count: number = 20
): Promise<ConceptSectorRankData[]> {
  const result = await getConceptSectors('f3', 1, count, 1); // 按涨跌幅降序（po=1）
  return result.data;
}

/**
 * 获取领跌概念板块
 */
export async function getFallingConceptSectors(
  count: number = 20
): Promise<ConceptSectorRankData[]> {
  const result = await getConceptSectors('f3', 0, count, 1); // 按涨跌幅升序（po=0）
  return result.data;
}

/**
 * 同时获取领涨和领跌概念板块
 */
export async function getConceptSectorRanks(count: number = 20): Promise<{
  rising: ConceptSectorRankData[];
  falling: ConceptSectorRankData[];
}> {
  try {
    const [rising, falling] = await Promise.all([
      getRisingConceptSectors(count),
      getFallingConceptSectors(count),
    ]);

    return { rising, falling };
  } catch (error) {
    logger.error('获取概念板块排行数据失败:', error);
    throw error;
  }
}

/**
 * 获取单个概念板块详细数据（资金流向）
 * @param sectorCode 概念板块代码（如 BK1136）
 */
export async function getSingleConceptSector(
  sectorCode: string
): Promise<ConceptSectorRankData | null> {
  try {
    // 使用 push2.eastmoney.com 的 ulist.np/get 接口
    const baseUrl = '/api/eastmoney/ulist.np/get';
    const params = new URLSearchParams({
      fltt: '2',
      secids: `90.${sectorCode}`, // 90.板块代码 表示概念板块
      fields: 'f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f124,f3,f12,f14',
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
      throw new Error('获取概念详细数据失败');
    }

    const item = data.data.diff[0];

    // 转换为标准格式
    return {
      code: item.f12 || sectorCode,
      name: item.f14 || '未知概念',
      changePercent: item.f3 || 0,
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
    logger.error('[getSingleConceptSector] 获取概念详细数据失败:', error);
    throw error;
  }
}

/**
 * 所有概念分类缓存键（每日过期）
 */
const ALL_CONCEPT_SECTORS_CACHE_KEY = 'all_concept_sectors_v1';
const ALL_CONCEPT_SECTORS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24小时

interface AllConceptSectorsCache {
  savedAt: number;
  sectors: ConceptSectorBasicInfo[];
}

/**
 * 读取所有概念分类缓存
 */
function readAllConceptSectorsCache(): ConceptSectorBasicInfo[] | null {
  const raw = getStorage<AllConceptSectorsCache | null>(ALL_CONCEPT_SECTORS_CACHE_KEY, null);
  if (
    raw &&
    typeof raw.savedAt === 'number' &&
    Array.isArray(raw.sectors) &&
    raw.sectors.length > 0 &&
    Date.now() - raw.savedAt < ALL_CONCEPT_SECTORS_CACHE_TTL_MS
  ) {
    return raw.sectors;
  }
  return null;
}

/** 并发时复用同一次拉取，避免缓存失效瞬间多次打满接口 */
let allConceptSectorsFetchPromise: Promise<ConceptSectorBasicInfo[]> | null = null;

/**
 * 获取所有概念分类（带缓存，每日只拉取一次）
 */
export async function getAllConceptSectors(): Promise<ConceptSectorBasicInfo[]> {
  const cached = readAllConceptSectorsCache();
  if (cached) {
    return cached;
  }

  if (allConceptSectorsFetchPromise) {
    return allConceptSectorsFetchPromise;
  }

  allConceptSectorsFetchPromise = (async (): Promise<ConceptSectorBasicInfo[]> => {
    try {
      // 使用东方财富API获取所有概念板块
      const baseUrl = '/api/eastmoney-data/bkzj/getbkzj';
      const params = new URLSearchParams({
        key: 'f62',
        code: 'm:90+t:3', // m:90 t:3 表示概念板块 (URLSearchParams会自动编码)
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
        throw new Error('获取概念分类数据失败');
      }

      // 数据在 data.diff 数组中
      if (!data.data || !data.data.diff || !Array.isArray(data.data.diff)) {
        throw new Error('获取概念分类数据失败');
      }

      // 转换为基本概念信息
      const sectors: ConceptSectorBasicInfo[] = data.data.diff.map((item: any) => ({
        code: item.f12,
        name: item.f14,
        mainNetInflow: item.f62, // 主力净流入（元）
      }));

      // 保存到缓存
      if (sectors.length > 0) {
        setStorage(ALL_CONCEPT_SECTORS_CACHE_KEY, {
          savedAt: Date.now(),
          sectors,
        });
      }

      return sectors;
    } catch (error) {
      logger.error('[getAllConceptSectors] 获取概念分类失败:', error);
      return [];
    } finally {
      allConceptSectorsFetchPromise = null;
    }
  })();

  return allConceptSectorsFetchPromise;
}
