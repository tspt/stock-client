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
  /** 所属分组ID列表（支持多标签） */
  groupIds?: string[];
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

/**
 * 股票分组
 */
export interface Group {
  /** 分组ID（唯一标识） */
  id: string;
  /** 分组名称（最多10个字符） */
  name: string;
  /** 分组颜色（hex颜色值） */
  color: string;
  /** 排序序号 */
  order: number;
}

/**
 * 自选股统一存储数据结构
 */
export interface StockWatchListData {
  /** 分组列表 */
  groups: Group[];
  /** 自选股列表 */
  watchList: StockInfo[];
}

/**
 * 价格提醒类型
 */
export type AlertType = 'price' | 'percent';

/**
 * 提醒触发条件
 */
export type AlertCondition = 'above' | 'below';

/**
 * 提醒时间周期
 */
export type AlertTimePeriod = 'day' | 'week' | 'month' | 'permanent';

/**
 * 通知方式配置
 */
export interface NotificationConfig {
  /** 系统托盘通知 */
  tray: boolean;
  /** 桌面通知 */
  desktop: boolean;
}

/**
 * 价格提醒规则
 */
export interface PriceAlert {
  /** 提醒ID（唯一标识） */
  id: string;
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 提醒类型 */
  type: AlertType;
  /** 触发条件 */
  condition: AlertCondition;
  /** 目标值（价格或百分比） */
  targetValue: number;
  /** 基准价格（设置时的开盘价/prevClose） */
  basePrice: number;
  /** 时间周期 */
  timePeriod: AlertTimePeriod;
  /** 通知方式配置 */
  notifications: NotificationConfig;
  /** 是否已触发 */
  triggered: boolean;
  /** 上次触发时的价格 */
  lastTriggerPrice?: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 股票数据概况 - 单只股票的分析数据
 */
export interface StockOverviewData {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 当前价 */
  price: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 总市值（元） */
  marketCap?: number;
  /** 流通市值（元） */
  circulatingMarketCap?: number;
  /** 市盈率(PE) */
  peRatio?: number;
  /** 换手率（百分比） */
  turnoverRate?: number;
  /** KDJ K值 */
  kdjK?: number;
  /** KDJ D值 */
  kdjD?: number;
  /** KDJ J值 */
  kdjJ?: number;
  /** 区间平均价 */
  avgPrice?: number;
  /** 区间最高价 */
  highPrice?: number;
  /** 区间最低价 */
  lowPrice?: number;
  /** 区间最大值回撤比（百分比） */
  opportunityChangePercent?: number;
  /** MA-5涨跌幅（百分比） */
  ma5?: number;
  /** MA-10涨跌幅（百分比） */
  ma10?: number;
  /** MA-20涨跌幅（百分比） */
  ma20?: number;
  /** MA-30涨跌幅（百分比） */
  ma30?: number;
  /** MA-60涨跌幅（百分比） */
  ma60?: number;
  /** MA-120涨跌幅（百分比） */
  ma120?: number;
  /** MA-240涨跌幅（百分比） */
  ma240?: number;
  /** MA-360涨跌幅（百分比） */
  ma360?: number;
  /** 分析时间戳 */
  analyzedAt: number;
  /** 错误信息（如果获取失败） */
  error?: string;
}

/**
 * 数据概况分析结果
 */
export interface OverviewAnalysisResult {
  /** 数据列表 */
  data: StockOverviewData[];
  /** 分析时间戳 */
  timestamp: number;
  /** K线周期 */
  period: KLinePeriod;
  /** 总数量 */
  total: number;
  /** 成功数量 */
  success: number;
  /** 失败数量 */
  failed: number;
}

/**
 * 机会分析 - 单只股票的分析数据
 */
export interface StockOpportunityData {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 当前价 */
  price: number;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /**
   * 涨跌幅（机会分析口径，百分比）：(当前价-最高价)/最高价*100
   * 允许为负
   */
  opportunityChangePercent?: number;
  /** 平均价（区间内平均收盘价） */
  avgPrice?: number;
  /** 最高价（区间K线 + 当日行情） */
  highPrice?: number;
  /** 最低价（区间K线 + 当日行情） */
  lowPrice?: number;
  /** 成交量（亿，保持与数据概况页一致的转换逻辑） */
  volume: number;
  /** 成交额（亿，保持与数据概况页一致的转换逻辑） */
  amount: number;
  /** 总市值（元） */
  marketCap?: number;
  /** 流通市值（元） */
  circulatingMarketCap?: number;
  /** 市盈率(PE) */
  peRatio?: number;
  /** 换手率（百分比） */
  turnoverRate?: number;
  /** KDJ K值 */
  kdjK?: number;
  /** KDJ D值 */
  kdjD?: number;
  /** KDJ J值 */
  kdjJ?: number;
  /** MA-5 */
  ma5?: number;
  /** MA-10 */
  ma10?: number;
  /** MA-20 */
  ma20?: number;
  /** MA-30 */
  ma30?: number;
  /** MA-60 */
  ma60?: number;
  /** MA-120 */
  ma120?: number;
  /** MA-240 */
  ma240?: number;
  /** MA-360 */
  ma360?: number;
  /** 分析时间戳 */
  analyzedAt: number;
  /** 错误信息（如果获取失败） */
  error?: string;
}

/**
 * 机会分析结果
 */
export interface OpportunityAnalysisResult {
  /** 数据列表 */
  data: StockOpportunityData[];
  /** 分析时间戳 */
  timestamp: number;
  /** K线周期 */
  period: KLinePeriod;
  /** K线条数 */
  count: number;
  /** 分组ID（__all__/__self__/自定义分组） */
  groupId: string;
  /** 总数量 */
  total: number;
  /** 成功数量 */
  success: number;
  /** 失败数量 */
  failed: number;
}

/**
 * 列配置项
 */
export interface OverviewColumnConfig {
  /** 列key */
  key: string;
  /** 显示名称 */
  title: string;
  /** 是否可见 */
  visible: boolean;
  /** 顺序 */
  order: number;
  /** 宽度（可选） */
  width?: number;
}

/**
 * 排序配置
 */
export interface OverviewSortConfig {
  /** 排序列key */
  key: string | null;
  /** 排序方向 */
  direction: 'asc' | 'desc' | null;
}
