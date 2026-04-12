/**
 * 腾讯财经API服务 - 获取领涨/领跌板块数据
 */

import type { HotSector } from '@/types/hot';

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
 * 解析腾讯财经的市场概览数据
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
    // 原始数据: "1~上证指数~000001~3986.22~3966.17~3985.46~546415541~0~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~0.00~0~~20260410161416~20.05~0.51~4011.02~3979.81~3986.22/546415541/955664107214~546415541~95566411~1.14~17.29~~4011.02~3979.81~0.79~614938.50~655713.76~0.00~-1~-1~1.01~0~3995.06~~~~~~95566410.7214~0.0000~0~ ~ZS~0.44~1.71~~~~4197.23~3211.35~2.50~-3.46~-2.44~4804145719788~~-4.45~13.56~4804145719788~~~23.66~0.01~~CNY~0~~0.00~0~"
    // 逐字段解析(索引从0开始):
    // 0=1, 1=名称, 2=代码, 3=当前价(3986.22), 4=昨收, 5=今开, 6=成交量(股)
    // 7-29=预留字段(多数为0或空)
    // 30=日期时间, 31=涨跌额(20.05), 32=涨跌幅%(0.51)
    // 33=最高(4011.02), 34=最低(3979.81)
    // 57=成交额(95566410.7214万元) => 9557亿
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
 * 从腾讯财经API获取领涨或领跌板块数据
 * @param orderType 排序类型: 0=领涨, 1=领跌
 * @param limit 返回数量限制，默认10
 */
export async function getTencentSectorRank(
  orderType: 0 | 1 = 0,
  limit: number = 10
): Promise<HotSector[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 构建请求参数
      const params = new URLSearchParams({
        l: limit.toString(),
        p: '1',
        t: '01/averatio',
        ordertype: '',
        o: orderType.toString(),
      });

      // 使用本地代理避免跨域问题
      // 注意：代理会自动去掉 /api/tencent-sector-rank 前缀
      const proxyUrl = `/api/tencent-sector-rank/ifzqgtimg/appstock/app/mktHs/rank?${params.toString()}`;

      console.log(`[getTencentSectorRank] 请求URL: ${proxyUrl}`);
      console.log(`[getTencentSectorRank] 请求类型: ${orderType === 0 ? '领涨' : '领跌'}`);
      console.log(
        `[getTencentSectorRank] 完整URL(含域名): https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank?${params.toString()}`
      );

      // 发起请求
      const response = await fetch(proxyUrl);
      console.log(`[getTencentSectorRank] 响应状态: ${response.status}`);
      console.log(`[getTencentSectorRank] 响应头:`, response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[getTencentSectorRank] 错误响应内容:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[getTencentSectorRank] 完整返回数据:`, JSON.stringify(data, null, 2));

      if (data.code !== 0) {
        console.error(`[getTencentSectorRank] 接口返回错误:`, data);
        throw new Error(data.msg || '获取板块数据失败');
      }

      // 检查data.data是否存在
      if (!data.data || !Array.isArray(data.data)) {
        console.error('[getTencentSectorRank] 数据格式错误，data.data:', data.data);
        console.error('[getTencentSectorRank] 完整data对象:', data);
        throw new Error('数据格式错误：缺少data.data数组');
      }

      console.log(`[getTencentSectorRank] 解析到 ${data.data.length} 条板块数据`);
      if (data.data.length > 0) {
        console.log('[getTencentSectorRank] 第一条数据的所有字段:', Object.keys(data.data[0]));
        console.log('[getTencentSectorRank] 第一条数据完整内容:', data.data[0]);
      }

      // 转换数据格式以匹配我们的HotSector接口
      return data.data.map((item: any) => {
        return {
          code: item.bd_code || '',
          name: item.bd_name || '',
          changePercent: parseFloat(item.bd_zdf) || 0,
          leaderStock: item.nzg_code
            ? {
                code: item.nzg_code,
                name: item.nzg_name || '',
                changePercent: parseFloat(item.nzg_zdf) || 0,
              }
            : undefined,
          stockCount: 0, // API未提供此字段
          netInflow: 0, // API未提供此字段
          volume: 0, // API未提供此字段
          amount: 0, // API未提供此字段
        };
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[getTencentSectorRank] 获取板块数据失败 (尝试 ${attempt}/${maxRetries}):`,
        lastError.message
      );
      console.error(`[getTencentSectorRank] 错误堆栈:`, error);

      // 如果不是最后一次尝试，等待一段时间后重试
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error('获取板块数据失败');
}

/**
 * 获取领涨板块
 * @param limit 返回数量限制，默认10
 */
export async function getLeadingSectors(limit: number = 10): Promise<HotSector[]> {
  return getTencentSectorRank(0, limit);
}

/**
 * 获取领跌板块
 * @param limit 返回数量限制，默认10
 */
export async function getLaggingSectors(limit: number = 10): Promise<HotSector[]> {
  return getTencentSectorRank(1, limit);
}
