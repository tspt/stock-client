/**
 * 市场概览服务 - 获取上证指数、深证成指等市场数据
 */

import { logger } from '@/utils/logger';

/**
 * 市场概览数据类型
 */
export interface MarketOverview {
  shanghaiIndex: {
    code: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
  };
  shenzhenIndex: {
    code: string;
    name: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    volume: number;
    amount: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
  };
  shanghaiRank: {
    riseCount: number;
    fallCount: number;
    flatCount: number;
    limitUpCount: number;
    limitDownCount: number;
    totalVolume: number;
    totalAmount: number;
  };
  shenzhenRank: {
    riseCount: number;
    fallCount: number;
    flatCount: number;
    limitUpCount: number;
    limitDownCount: number;
    totalVolume: number;
    totalAmount: number;
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
      amount: parseFloat(shanghaiData[57]) || 0,
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
      amount: parseFloat(shenzhenData[57]) || 0,
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
    logger.error('解析市场概览数据失败:', error);
    return null;
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
      logger.warn(`获取市场概览数据失败 (尝试 ${attempt}/${maxRetries}):`, lastError.message);

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error('获取市场概览数据失败');
}
