/**
 * 热门行情数据类型定义
 */

/**
 * 热门板块数据
 */
export interface HotSector {
  /** 板块代码 */
  code: string;
  /** 板块名称 */
  name: string;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 领涨股票 */
  leaderStock?: {
    code: string;
    name: string;
    changePercent: number;
  };
  /** 板块内股票数量 */
  stockCount: number;
  /** 资金净流入（元） */
  netInflow?: number;
  /** 成交量（手） */
  volume?: number;
  /** 成交额（元） */
  amount?: number;
}

/**
 * 热门股票数据
 */
export interface HotStock {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 当前价格 */
  price: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 涨跌额 */
  change: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 换手率（百分比） */
  turnoverRate?: number;
  /** 总市值（元） */
  marketCap?: number;
  /** 所属板块 */
  sector?: string;
  /** 涨停状态 */
  isLimitUp?: boolean;
  /** 跌停状态 */
  isLimitDown?: boolean;
}

/**
 * 热门概念数据
 */
export interface HotConcept {
  /** 概念代码 */
  code: string;
  /** 概念名称 */
  name: string;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 概念内股票数量 */
  stockCount: number;
  /** 领涨股票 */
  leaderStock?: {
    code: string;
    name: string;
    changePercent: number;
  };
  /** 热度指数 */
  heatIndex?: number;
}

/**
 * 资金流向数据
 */
export interface FundFlow {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 主力资金净流入（元） */
  mainNetInflow: number;
  /** 超大单净流入（元） */
  superLargeNetInflow?: number;
  /** 大单净流入（元） */
  largeNetInflow?: number;
  /** 中单净流入（元） */
  mediumNetInflow?: number;
  /** 小单净流入（元） */
  smallNetInflow?: number;
  /** 当前价格 */
  price: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
}

/**
 * 市场情绪数据
 */
export interface MarketSentiment {
  /** 涨停家数 */
  limitUpCount: number;
  /** 跌停家数 */
  limitDownCount: number;
  /** 上涨家数 */
  riseCount: number;
  /** 下跌家数 */
  fallCount: number;
  /** 平盘家数 */
  flatCount: number;
  /** 总成交量（亿） */
  totalVolume: number;
  /** 总成交额（亿） */
  totalAmount: number;
  /** 更新时间 */
  updateTime: number;
}

/**
 * 热门分类类型
 */
export type HotCategory =
  | 'sectors' // 热门板块
  | 'stocks' // 热门股票
  | 'concepts' // 热门概念
  | 'funds'; // 资金动向

/**
 * 热门股票排序类型
 */
export type HotStockSortType =
  | 'changePercent' // 按涨跌幅
  | 'volume' // 按成交量
  | 'amount' // 按成交额
  | 'turnoverRate'; // 按换手率
