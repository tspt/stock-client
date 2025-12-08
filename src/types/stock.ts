/**
 * 股票基础信息
 */
export interface StockInfo {
  /** 股票代码（统一格式：SH600000, SZ000001） */
  code: string;
  /** 股票名称 */
  name: string;
  /** 市场标识（SH: 上海, SZ: 深圳） */
  market: 'SH' | 'SZ';
}

/**
 * 股票实时行情数据
 */
export interface StockQuote {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 当前价格 */
  price: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 今日开盘价 */
  open: number;
  /** 昨日收盘价 */
  prevClose: number;
  /** 今日最高价 */
  high: number;
  /** 今日最低价 */
  low: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 更新时间戳 */
  timestamp: number;
}

/**
 * 买卖盘数据项
 */
export interface OrderBookItem {
  /** 价格 */
  price: number;
  /** 数量（手） */
  volume: number;
}

/**
 * 股票详情数据（基本面信息）
 */
export interface StockDetail {
  /** 股票代码 */
  code: string;
  /** 总市值（元） */
  marketCap?: number;
  /** 流通市值（元） */
  circulatingMarketCap?: number;
  /** 市盈率（TTM） */
  peRatio?: number;
  /** 换手率（百分比） */
  turnoverRate?: number;
  /** 量比 */
  volumeRatio?: number;
  /** 交易额（万元） */
  tradeAmount?: number;
  /** 买盘（买1-买5） */
  buyOrders?: OrderBookItem[];
  /** 卖盘（卖1-卖5） */
  sellOrders?: OrderBookItem[];
  /** 更新时间戳 */
  timestamp: number;
}

/**
 * K线数据类型
 */
export type KLinePeriod =
  | '1min'
  | '5min'
  | '15min'
  | '30min'
  | '60min'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

/**
 * K线数据点
 */
export interface KLineData {
  /** 时间戳 */
  time: number;
  /** 开盘价 */
  open: number;
  /** 收盘价 */
  close: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
  /** 成交量 */
  volume: number;
}

/**
 * 技术指标数据
 */
export interface TechnicalIndicator {
  /** MA移动平均线 */
  ma?: {
    ma5: number[];
    ma10: number[];
    ma20: number[];
    ma30: number[];
    ma60: number[];
    ma120: number[];
    ma240: number[];
    ma360: number[];
  };
  /** MACD指标 */
  macd?: {
    dif: number[];
    dea: number[];
    macd: number[];
  };
  /** KDJ指标 */
  kdj?: {
    k: number[];
    d: number[];
    j: number[];
  };
  /** RSI指标 */
  rsi?: {
    rsi6: number[];
    rsi12: number[];
    rsi24: number[];
  };
}

/**
 * 排序方式
 */
export type SortType = 'default' | 'rise' | 'fall';
