/**
 * 热门行情API服务
 * TODO: 替换为真实的数据接口
 */

import type {
  HotSector,
  HotStock,
  HotConcept,
  FundFlow,
  MarketSentiment,
  HotCategory,
  HotStockSortType,
} from '@/types/hot';

/**
 * 模拟延迟函数
 */
const mockDelay = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 获取热门板块数据
 * @param sortBy 排序方式：'changePercent' | 'volume' | 'amount'
 */
export async function getHotSectors(
  sortBy: 'changePercent' | 'volume' | 'amount' = 'changePercent'
): Promise<HotSector[]> {
  await mockDelay();

  // TODO: 替换为真实API调用
  // const response = await axios.get('/api/hot/sectors', { params: { sortBy } });
  // return response.data;

  // 模拟数据
  const mockData: HotSector[] = [
    {
      code: 'BK0001',
      name: '半导体',
      changePercent: 3.25,
      leaderStock: { code: 'SH600000', name: '中芯国际', changePercent: 5.8 },
      stockCount: 45,
      netInflow: 1250000000,
      volume: 8500000,
      amount: 32000000000,
    },
    {
      code: 'BK0002',
      name: '新能源',
      changePercent: 2.87,
      leaderStock: { code: 'SZ300001', name: '宁德时代', changePercent: 4.2 },
      stockCount: 62,
      netInflow: 980000000,
      volume: 12000000,
      amount: 45000000000,
    },
    {
      code: 'BK0003',
      name: '人工智能',
      changePercent: 2.45,
      leaderStock: { code: 'SH600002', name: '科大讯飞', changePercent: 6.5 },
      stockCount: 38,
      netInflow: 750000000,
      volume: 6800000,
      amount: 28000000000,
    },
    {
      code: 'BK0004',
      name: '医药生物',
      changePercent: -1.23,
      leaderStock: { code: 'SZ000001', name: '恒瑞医药', changePercent: -2.1 },
      stockCount: 85,
      netInflow: -320000000,
      volume: 9500000,
      amount: 38000000000,
    },
    {
      code: 'BK0005',
      name: '消费电子',
      changePercent: 1.89,
      leaderStock: { code: 'SH600003', name: '立讯精密', changePercent: 3.5 },
      stockCount: 52,
      netInflow: 560000000,
      volume: 7200000,
      amount: 25000000000,
    },
  ];

  // 根据排序方式排序
  return mockData.sort((a, b) => {
    switch (sortBy) {
      case 'changePercent':
        return b.changePercent - a.changePercent;
      case 'volume':
        return (b.volume || 0) - (a.volume || 0);
      case 'amount':
        return (b.amount || 0) - (a.amount || 0);
      default:
        return 0;
    }
  });
}

/**
 * 获取热门股票数据
 * @param sortType 排序类型
 * @param limit 返回数量限制
 */
export async function getHotStocks(
  sortType: HotStockSortType = 'changePercent',
  limit: number = 50
): Promise<HotStock[]> {
  await mockDelay();

  // TODO: 替换为真实API调用
  // const response = await axios.get('/api/hot/stocks', { params: { sortType, limit } });
  // return response.data;

  // 模拟数据
  const mockData: HotStock[] = [
    {
      code: 'SH600000',
      name: '浦发银行',
      price: 8.56,
      changePercent: 9.98,
      change: 0.78,
      volume: 125000000,
      amount: 1050000000,
      turnoverRate: 3.25,
      marketCap: 250000000000,
      sector: '银行',
      isLimitUp: true,
    },
    {
      code: 'SZ000001',
      name: '平安银行',
      price: 12.34,
      changePercent: 8.56,
      change: 0.97,
      volume: 98000000,
      amount: 1200000000,
      turnoverRate: 2.85,
      marketCap: 238000000000,
      sector: '银行',
    },
    {
      code: 'SH600002',
      name: '中信证券',
      price: 22.45,
      changePercent: 7.23,
      change: 1.51,
      volume: 156000000,
      amount: 3500000000,
      turnoverRate: 4.12,
      marketCap: 320000000000,
      sector: '券商',
    },
    {
      code: 'SZ300001',
      name: '特锐德',
      price: 18.92,
      changePercent: -8.45,
      change: -1.74,
      volume: 85000000,
      amount: 1600000000,
      turnoverRate: 5.67,
      marketCap: 185000000000,
      sector: '新能源',
      isLimitDown: true,
    },
    {
      code: 'SH600003',
      name: '宝钢股份',
      price: 6.78,
      changePercent: 5.67,
      change: 0.36,
      volume: 210000000,
      amount: 1420000000,
      turnoverRate: 1.89,
      marketCap: 152000000000,
      sector: '钢铁',
    },
  ];

  // 根据排序类型排序
  return mockData
    .sort((a, b) => {
      switch (sortType) {
        case 'changePercent':
          return b.changePercent - a.changePercent;
        case 'volume':
          return b.volume - a.volume;
        case 'amount':
          return b.amount - a.amount;
        case 'turnoverRate':
          return (b.turnoverRate || 0) - (a.turnoverRate || 0);
        default:
          return 0;
      }
    })
    .slice(0, limit);
}

/**
 * 获取热门概念数据
 * @param limit 返回数量限制
 */
export async function getHotConcepts(limit: number = 30): Promise<HotConcept[]> {
  await mockDelay();

  // TODO: 替换为真实API调用
  // const response = await axios.get('/api/hot/concepts', { params: { limit } });
  // return response.data;

  // 模拟数据
  const mockData: HotConcept[] = [
    {
      code: 'GN0001',
      name: 'AI大模型',
      changePercent: 4.56,
      stockCount: 28,
      leaderStock: { code: 'SH600002', name: '科大讯飞', changePercent: 6.5 },
      heatIndex: 95,
    },
    {
      code: 'GN0002',
      name: '新能源汽车',
      changePercent: 3.21,
      stockCount: 45,
      leaderStock: { code: 'SZ300001', name: '宁德时代', changePercent: 4.2 },
      heatIndex: 88,
    },
    {
      code: 'GN0003',
      name: '芯片国产化',
      changePercent: 2.98,
      stockCount: 35,
      leaderStock: { code: 'SH600000', name: '中芯国际', changePercent: 5.8 },
      heatIndex: 82,
    },
    {
      code: 'GN0004',
      name: '元宇宙',
      changePercent: -2.34,
      stockCount: 22,
      leaderStock: { code: 'SH600004', name: '歌尔股份', changePercent: -3.2 },
      heatIndex: 65,
    },
    {
      code: 'GN0005',
      name: '光伏储能',
      changePercent: 1.87,
      stockCount: 38,
      leaderStock: { code: 'SZ000002', name: '隆基绿能', changePercent: 2.5 },
      heatIndex: 78,
    },
  ];

  return mockData.sort((a, b) => b.changePercent - a.changePercent).slice(0, limit);
}

/**
 * 获取资金流向数据
 * @param sortType 排序方式：'mainNetInflow' | 'superLarge' | 'large'
 * @param limit 返回数量限制
 */
export async function getFundFlows(
  sortType: 'mainNetInflow' | 'superLarge' | 'large' = 'mainNetInflow',
  limit: number = 50
): Promise<FundFlow[]> {
  await mockDelay();

  // TODO: 替换为真实API调用
  // const response = await axios.get('/api/hot/fund-flows', { params: { sortType, limit } });
  // return response.data;

  // 模拟数据
  const mockData: FundFlow[] = [
    {
      code: 'SH600000',
      name: '贵州茅台',
      mainNetInflow: 850000000,
      superLargeNetInflow: 520000000,
      largeNetInflow: 330000000,
      mediumNetInflow: -120000000,
      smallNetInflow: -85000000,
      price: 1685.0,
      changePercent: 2.34,
    },
    {
      code: 'SZ000001',
      name: '宁德时代',
      mainNetInflow: 720000000,
      superLargeNetInflow: 450000000,
      largeNetInflow: 270000000,
      mediumNetInflow: -95000000,
      smallNetInflow: -62000000,
      price: 198.5,
      changePercent: 3.12,
    },
    {
      code: 'SH600002',
      name: '比亚迪',
      mainNetInflow: 650000000,
      superLargeNetInflow: 380000000,
      largeNetInflow: 270000000,
      mediumNetInflow: -78000000,
      smallNetInflow: -45000000,
      price: 245.8,
      changePercent: 1.89,
    },
    {
      code: 'SZ300001',
      name: '东方财富',
      mainNetInflow: -580000000,
      superLargeNetInflow: -320000000,
      largeNetInflow: -260000000,
      mediumNetInflow: 125000000,
      smallNetInflow: 98000000,
      price: 15.67,
      changePercent: -2.45,
    },
    {
      code: 'SH600003',
      name: '招商银行',
      mainNetInflow: 480000000,
      superLargeNetInflow: 290000000,
      largeNetInflow: 190000000,
      mediumNetInflow: -65000000,
      smallNetInflow: -42000000,
      price: 35.2,
      changePercent: 1.23,
    },
  ];

  return mockData.sort((a, b) => b.mainNetInflow - a.mainNetInflow).slice(0, limit);
}

/**
 * 获取市场情绪数据
 */
export async function getMarketSentiment(): Promise<MarketSentiment> {
  await mockDelay(300);

  // TODO: 替换为真实API调用
  // const response = await axios.get('/api/hot/sentiment');
  // return response.data;

  // 模拟数据
  return {
    limitUpCount: 58,
    limitDownCount: 12,
    riseCount: 2856,
    fallCount: 1985,
    flatCount: 245,
    totalVolume: 8560,
    totalAmount: 9850,
    updateTime: Date.now(),
  };
}
