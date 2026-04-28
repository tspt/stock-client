/**
 * 龙虎榜数据类型定义
 */

export interface BillboardStockData {
  SECUCODE: string; // 证券代码（含市场后缀）
  SECURITY_CODE: string; // 股票代码
  LATEST_TDATE: string; // 最新上榜日期
  SECURITY_NAME_ABBR: string; // 股票名称
  IPCT1M: number; // 近一月涨跌幅
  IPCT3M: number; // 近三月涨跌幅
  IPCT6M: number; // 近六月涨跌幅
  IPCT1Y: number; // 近一年涨跌幅
  CHANGE_RATE: number; // 涨跌幅
  CLOSE_PRICE: number; // 收盘价
  PERIOD: string; // 统计周期描述
  BILLBOARD_DEAL_AMT: number; // 龙虎榜成交额
  BILLBOARD_NET_BUY: number; // 龙虎榜净买入
  ORG_TIMES: number; // 机构上榜次数
  ORG_DEAL_AMT: number; // 机构成交额
  ORG_NET_BUY: number; // 机构净买入
  BILLBOARD_TIMES: number; // 上榜次数
  BILLBOARD_BUY_AMT: number; // 龙虎榜买入额
  BILLBOARD_SELL_AMT: number; // 龙虎榜卖出额
  ORG_BUY_AMT: number; // 机构买入额
  ORG_SELL_AMT: number; // 机构卖出额
  ORG_BUY_TIMES: number; // 机构买入次数
  ORG_SELL_TIMES: number; // 机构卖出次数
  STATISTICS_CYCLE: string; // 统计周期代码
  SECURITY_TYPE_CODE: string; // 证券类型代码
}

export interface BillboardResponse {
  version: string;
  result: {
    pages: number; // 总页数
    data: BillboardStockData[]; // 数据列表
    count: number; // 总记录数
  };
}

export type StatisticsCycle = '01' | '02' | '03' | '04';

export interface StatisticsCycleOption {
  value: StatisticsCycle;
  label: string;
}

export const STATISTICS_CYCLE_OPTIONS: StatisticsCycleOption[] = [
  { value: '01', label: '近一个月' },
  { value: '02', label: '近三个月' },
  { value: '03', label: '近六个月' },
  { value: '04', label: '近一年' },
];
