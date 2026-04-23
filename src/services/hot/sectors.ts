/**
 * 板块排行服务 - 获取领涨/领跌板块数据
 */

import type { SectorRankData } from '@/types/stock';
import { logger } from '@/utils/business/logger';

/**
 * 腾讯财经板块排行原始数据
 */
interface RawSectorRankResponse {
  code: number;
  msg: string;
  data: {
    rank_list: Array<{
      code: string;
      name: string;
      zdf: string;
      zd: string;
      lzg: {
        code: string;
        name: string;
        zd: string;
        zdf: string;
        zxj: string;
      };
      hsl?: string;
      lb?: string;
      ltsz?: string;
      zsz?: string;
      volume?: string;
      turnover?: string;
      zdf_d5?: string;
      zdf_d20?: string;
      zdf_d60?: string;
      zdf_w52?: string;
      zdf_y?: string;
    }>;
    offset: number;
    total: number;
  };
}

/**
 * 解析板块排行数据
 */
function parseSectorRankData(rawData: RawSectorRankResponse): SectorRankData[] {
  try {
    if (!rawData.data || !rawData.data.rank_list) {
      return [];
    }

    return rawData.data.rank_list.map((item) => ({
      code: item.code,
      name: item.name,
      changePercent: parseFloat(item.zdf) || 0,
      change: parseFloat(item.zd) || 0,
      leadingStock: {
        code: item.lzg.code,
        name: item.lzg.name,
        change: parseFloat(item.lzg.zd) || 0,
        changePercent: parseFloat(item.lzg.zdf) || 0,
        currentPrice: parseFloat(item.lzg.zxj) || 0,
      },
      turnoverRate: item.hsl ? parseFloat(item.hsl) : undefined,
      volumeRatio: item.lb ? parseFloat(item.lb) : undefined,
      circulatingMarketCap: item.ltsz ? parseFloat(item.ltsz) : undefined,
      marketCap: item.zsz ? parseFloat(item.zsz) : undefined,
      volume: item.volume ? parseFloat(item.volume) : undefined,
      amount: item.turnover ? parseFloat(item.turnover) : undefined,
      changePercent5d: item.zdf_d5 ? parseFloat(item.zdf_d5) : undefined,
      changePercent20d: item.zdf_d20 ? parseFloat(item.zdf_d20) : undefined,
      changePercent60d: item.zdf_d60 ? parseFloat(item.zdf_d60) : undefined,
      changePercent52w: item.zdf_w52 ? parseFloat(item.zdf_w52) : undefined,
      changePercentYTD: item.zdf_y ? parseFloat(item.zdf_y) : undefined,
    }));
  } catch (error) {
    logger.error('解析板块排行数据失败:', error);
    return [];
  }
}

/**
 * 获取领涨板块数据
 */
export async function getRisingSectors(count: number = 20): Promise<SectorRankData[]> {
  try {
    const proxyUrl = `/api/tencent/rank/pt/getRank?board_type=hy2&sort_type=priceRatio&direct=down&offset=0&count=${count}`;

    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RawSectorRankResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(data.msg || '获取领涨板块数据失败');
    }

    return parseSectorRankData(data);
  } catch (error) {
    logger.error('获取领涨板块数据失败:', error);
    throw error;
  }
}

/**
 * 获取领跌板块数据
 */
export async function getFallingSectors(count: number = 20): Promise<SectorRankData[]> {
  try {
    const proxyUrl = `/api/tencent/rank/pt/getRank?board_type=hy2&sort_type=priceRatio&direct=up&offset=0&count=${count}`;

    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: RawSectorRankResponse = await response.json();

    if (data.code !== 0) {
      throw new Error(data.msg || '获取领跌板块数据失败');
    }

    return parseSectorRankData(data);
  } catch (error) {
    logger.error('获取领跌板块数据失败:', error);
    throw error;
  }
}

/**
 * 同时获取领涨和领跌板块数据
 */
export async function getSectorRanks(count: number = 20): Promise<{
  rising: SectorRankData[];
  falling: SectorRankData[];
}> {
  try {
    const [rising, falling] = await Promise.all([
      getRisingSectors(count),
      getFallingSectors(count),
    ]);

    return { rising, falling };
  } catch (error) {
    logger.error('获取板块排行数据失败:', error);
    throw error;
  }
}
