/**
 * 东方财富热门板块服务 - 获取领涨/领跌板块数据
 */

import type { EastMoneySectorData } from '@/types/stock';
import { logger } from '@/utils/logger';

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

    const data: RawEastMoneySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取东方财富领涨板块数据失败');
    }

    return parseEastMoneySectorData(data);
  } catch (error) {
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

    const data: RawEastMoneySectorResponse = JSON.parse(jsonMatch[1]);

    if (data.rc !== 0) {
      throw new Error('获取东方财富领跌板块数据失败');
    }

    return parseEastMoneySectorData(data);
  } catch (error) {
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
