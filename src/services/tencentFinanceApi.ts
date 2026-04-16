/**
 * 腾讯财经API统一服务
 * 整合市场概览和板块排行数据获取功能
 */

import type { MarketOverview } from './tencentApi';
import type { SectorRankData } from '@/types/stock';

// 重新导出类型以保持向后兼容
export type { MarketOverview } from './tencentApi';

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
      zdf: string; // 涨跌幅
      zd: string; // 涨跌额
      lzg: {
        code: string;
        name: string;
        zd: string;
        zdf: string;
        zxj: string;
      };
      hsl?: string; // 换手率
      lb?: string; // 量比
      ltsz?: string; // 流通市值(亿)
      zsz?: string; // 总市值(亿)
      volume?: string; // 成交量
      turnover?: string; // 成交额
      zdf_d5?: string; // 5日涨跌幅
      zdf_d20?: string; // 20日涨跌幅
      zdf_d60?: string; // 60日涨跌幅
      zdf_w52?: string; // 52周涨跌幅
      zdf_y?: string; // 年初至今涨跌幅
    }>;
    offset: number;
    total: number;
  };
}

/**
 * 解析市场概览数据
 */
function parseMarketOverviewData(rawData: string): MarketOverview | null {
  try {
    // 提取各个变量
    const shanghaiMatch = rawData.match(/v_sh000001\s*=\s*"([^"]+)"/);
    const shenzhenMatch = rawData.match(/v_sz399001\s*=\s*"([^"]+)"/);
    const shanghaiRankMatch = rawData.match(/v_bkqtRank_A_sh\s*=\s*"([^"]+)"/);
    const shenzhenRankMatch = rawData.match(/v_bkqtRank_A_sz\s*=\s*"([^"]+)"/);

    if (!shanghaiMatch || !shenzhenMatch || !shanghaiRankMatch || !shenzhenRankMatch) {
      return null;
    }

    // 解析上证指数
    const shanghaiData = shanghaiMatch[1].split('~');
    const shanghaiIndex = {
      code: 'sh000001',
      name: shanghaiData[1] || '上证指数',
      currentPrice: parseFloat(shanghaiData[3]) || 0,
      change: parseFloat(shanghaiData[31]) || 0,
      changePercent: parseFloat(shanghaiData[32]) || 0,
      volume: parseInt(shanghaiData[6]) || 0,
      amount: parseFloat(shanghaiData[57]) || 0, // 单位：万元，需除以10000转亿元
      high: parseFloat(shanghaiData[33]) || 0,
      low: parseFloat(shanghaiData[34]) || 0,
      open: parseFloat(shanghaiData[5]) || 0,
      previousClose: parseFloat(shanghaiData[4]) || 0,
    };

    // 解析深证成指
    const shenzhenData = shenzhenMatch[1].split('~');
    const shenzhenIndex = {
      code: 'sz399001',
      name: shenzhenData[1] || '深证成指',
      currentPrice: parseFloat(shenzhenData[3]) || 0,
      change: parseFloat(shenzhenData[31]) || 0,
      changePercent: parseFloat(shenzhenData[32]) || 0,
      volume: parseInt(shenzhenData[6]) || 0,
      amount: parseFloat(shenzhenData[57]) || 0, // 单位：万元，需除以10000转亿元
      high: parseFloat(shenzhenData[33]) || 0,
      low: parseFloat(shenzhenData[34]) || 0,
      open: parseFloat(shenzhenData[5]) || 0,
      previousClose: parseFloat(shenzhenData[4]) || 0,
    };

    // 解析上海板块排行
    const shanghaiRankData = shanghaiRankMatch[1].split('~');
    const shanghaiRank = {
      riseCount: parseInt(shanghaiRankData[2]) || 0,
      fallCount: parseInt(shanghaiRankData[4]) || 0,
      flatCount: parseInt(shanghaiRankData[3]) || 0,
      limitUpCount: parseInt(shanghaiRankData[5]) || 0,
      limitDownCount: parseInt(shanghaiRankData[6]) || 0,
      totalVolume: parseInt(shanghaiRankData[9]) || 0,
      totalAmount: parseInt(shanghaiRankData[10]) || 0,
    };

    // 解析深圳板块排行
    const shenzhenRankData = shenzhenRankMatch[1].split('~');
    const shenzhenRank = {
      riseCount: parseInt(shenzhenRankData[2]) || 0,
      fallCount: parseInt(shenzhenRankData[4]) || 0,
      flatCount: parseInt(shenzhenRankData[3]) || 0,
      limitUpCount: parseInt(shenzhenRankData[5]) || 0,
      limitDownCount: parseInt(shenzhenRankData[6]) || 0,
      totalVolume: parseInt(shenzhenRankData[9]) || 0,
      totalAmount: parseInt(shenzhenRankData[10]) || 0,
    };

    return {
      shanghaiIndex,
      shenzhenIndex,
      shanghaiRank,
      shenzhenRank,
    };
  } catch (error) {
    console.error('解析市场概览数据失败:', error);
    return null;
  }
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
    console.error('解析板块排行数据失败:', error);
    return [];
  }
}

/**
 * 获取市场概览数据
 */
export async function getMarketOverview(): Promise<MarketOverview | null> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用代理避免跨域问题
      const proxyUrl =
        '/api/tencent/r=0.8802541064284888&q=bkqtRank_A_sh,bkqtRank_A_sz,sh000001,sz399001';

      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const data = parseMarketOverviewData(text);

      if (!data) {
        throw new Error('解析市场概览数据失败');
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`获取市场概览数据失败 (尝试 ${attempt}/${maxRetries}):`, lastError.message);

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error('获取市场概览数据失败');
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
    console.error('获取领涨板块数据失败:', error);
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
    console.error('获取领跌板块数据失败:', error);
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
    console.error('获取板块排行数据失败:', error);
    throw error;
  }
}
