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
  /** 当前选中的分组标签（列表页）；缺省时由加载逻辑推导 */
  selectedGroupId?: string;
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
  /** 总股数（股） */
  totalShares?: number;
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
 * 沿趋势线筛选分析结果（检索窗内连续 N 根：收盘≥昨收且收盘≥当日 MA5）
 */
export interface TrendLineAnalysis {
  /** 实际检索根数 M */
  lookback: number;
  /** 连续根数 N */
  consecutive: number;
  /** 是否命中 */
  isHit: boolean;
  /** 列表简要说明 */
  reasonText: string;
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
  /** 总股数（股） */
  totalShares?: number;
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
  /** 横盘分析结果 */
  consolidation?: ConsolidationAnalysis;
  /** 沿趋势线（收盘不跌 + 在 MA5 上）检索结果 */
  trendLine?: TrendLineAnalysis;
  /** 单日异动形态（最近 N 根、阈值 M，见 sharpMovePatterns 模块） */
  sharpMovePatterns?: SharpMovePatternAnalysis;
  /** AI辅助分析结果 */
  aiAnalysis?: AIAnalysisResult;
  /** 分析时间戳 */
  analyzedAt: number;
  /** 错误信息（如果获取失败） */
  error?: string;
}

/**
 * 横盘结构类型
 */
export type ConsolidationType = 'low_stable' | 'high_stable' | 'box';

/**
 * 单个横盘结构命中结果
 */
export interface ConsolidationMatch {
  /** 命中的结构类型 */
  type: ConsolidationType;
  /** 结构名称 */
  label: string;
  /** 命中说明 */
  reason: string;
  /** 结构强度，便于排序和复用 */
  strength: number;
}

/**
 * 横盘分析结果
 */
export interface ConsolidationAnalysis {
  /** 连续满足横盘的 K 线根数（N） */
  period: number;
  /** 从数据末尾向前检索的 K 线根数（M）；未使用滑动检索时与 period 相同或省略 */
  lookback?: number;
  /** 波动阈值（百分比） */
  threshold: number;
  /** 是否命中任一横盘结构 */
  isConsolidation: boolean;
  /** 命中的结构类型 */
  matchedTypes: ConsolidationType[];
  /** 命中的结构名称 */
  matchedTypeLabels: string[];
  /** 命中详情 */
  matches: ConsolidationMatch[];
  /** 列表展示用说明 */
  reasonText: string;
  /** 综合强度，取命中结构中的最高值 */
  strength: number;
  /** 最近N天的关键波动指标 */
  metrics: {
    /** 最近N天最低价离散度 */
    lowRangePercent: number;
    /** 最近N天最高价离散度 */
    highRangePercent: number;
    /** 最近N天收盘价是否存在差异 */
    closeChanged: boolean;
    /** 最近N天最高价是否存在差异 */
    highChanged: boolean;
    /** 最近N天最低价是否存在差异 */
    lowChanged: boolean;
  };
}

/**
 * 单日异动形态分析（S1/S2 单事件；P1/P2 宽松双段；P3/P4 中间为普通日）
 */
export interface SharpMovePatternAnalysis {
  windowBars: number;
  magnitudePercent: number;
  /** 横盘幅度阈值（%） */
  flatThresholdPercent: number;
  /** S1：窗口内存在急跌日 */
  onlyDrop: boolean;
  /** S2：窗口内存在急涨日 */
  onlyRise: boolean;
  /** P1：存在急跌后第一次急涨（中间无额外约束） */
  dropThenRiseLoose: boolean;
  /** P2：存在急涨后第一次急跌 */
  riseThenDropLoose: boolean;
  /** P3：急跌 → 中间均为普通日 → 急涨 */
  dropThenFlatThenRise: boolean;
  /** P4：急涨 → 中间均为普通日 → 急跌 */
  riseThenFlatThenDrop: boolean;
  /** 最近一次急跌日距最新一根 K 线的根数 */
  lastDropBarsAgo?: number;
  lastRiseBarsAgo?: number;
  lastDropIndex?: number;
  lastRiseIndex?: number;
  /** 命中形态的简短标签，便于列表展示 */
  labels: string[];
}

/**
 * 趋势预测结果
 */
export interface TrendPrediction {
  /** 预测方向：up(上涨), down(下跌), sideways(横盘) */
  direction: 'up' | 'down' | 'sideways';
  /** 置信度 (0-1) */
  confidence: number;
  /** 预测目标价 */
  targetPrice?: number;
  /** 预测周期（天） */
  period: number;
  /** 支撑位 */
  supportLevel?: number;
  /** 阻力位 */
  resistanceLevel?: number;
  /** 预测依据 */
  reasoning: string[];
  /** 达成共识的信号数量（总信号中与预测方向一致的个数） */
  signalCount: number;
  /** 信号总数 */
  totalSignals: number;
  /** 风险收益比（收益空间/亏损空间，越高越好） */
  riskRewardRatio?: number;
}

/**
 * 相似形态匹配结果
 */
export interface SimilarPatternMatch {
  /** 匹配的股票代码 */
  code: string;
  /** 匹配的股票名称 */
  name: string;
  /** 相似度 (0-1) */
  similarity: number;
  /** 历史表现 */
  historicalPerformance?: {
    /** 后续N天涨跌幅 */
    changePercent: number;
    /** 观察周期（天） */
    period: number;
  };
  /** 匹配的时间段 */
  matchPeriod: {
    start: number;
    end: number;
  };
}

/**
 * 智能选股推荐评分
 */
export interface SmartRecommendationScore {
  /** 综合评分 (0-100) */
  totalScore: number;
  /** 技术面评分 */
  technicalScore: number;
  /** 形态评分 */
  patternScore: number;
  /** 趋势评分 */
  trendScore: number;
  /** 风险评分 */
  riskScore: number;
  /** 推荐理由 */
  reasons: string[];
  /** 风险提示 */
  warnings: string[];
}

/**
 * AI辅助分析结果
 */
export interface AIAnalysisResult {
  /** 趋势预测 */
  trendPrediction?: TrendPrediction;
  /** 相似形态匹配列表 */
  similarPatterns?: SimilarPatternMatch[];
  /** 智能推荐评分 */
  recommendation?: SmartRecommendationScore;
  /** 分析时间戳 */
  analyzedAt: number;
  /** 多信号达成共识（4+信号一致时为true，预测更可靠） */
  signalConfluence?: boolean;
  /** 相似形态历史胜率（0-1，匹配到盈利形态的比例） */
  patternWinRate?: number;
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
  /** K线数据缓存（序列化后的数组格式：Array<[code, klineData]>） */
  klineDataCache?: Array<[string, KLineData[]]>;
}

/**
 * 列配置项
 * @deprecated 请使用 @/types/common 中的 ColumnConfig 替代
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

/**
 * 领涨/领跌股票信息
 */
export interface LeadingStock {
  /** 股票代码 */
  code: string;
  /** 股票名称 */
  name: string;
  /** 涨跌额 */
  change: number;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 最新价 */
  currentPrice: number;
}

/**
 * 板块排行数据
 */
export interface SectorRankData {
  /** 板块代码 */
  code: string;
  /** 板块名称 */
  name: string;
  /** 涨跌幅（百分比） */
  changePercent: number;
  /** 涨跌额 */
  change: number;
  /** 领涨/领跌股信息 */
  leadingStock: LeadingStock;
  /** 换手率（百分比） */
  turnoverRate?: number;
  /** 量比 */
  volumeRatio?: number;
  /** 流通市值（亿） */
  circulatingMarketCap?: number;
  /** 总市值（亿） */
  marketCap?: number;
  /** 成交量（万手） */
  volume?: number;
  /** 成交额（万） */
  amount?: number;
  /** 5日涨跌幅（百分比） */
  changePercent5d?: number;
  /** 20日涨跌幅（百分比） */
  changePercent20d?: number;
  /** 60日涨跌幅（百分比） */
  changePercent60d?: number;
  /** 52周涨跌幅（百分比） */
  changePercent52w?: number;
  /** 年初至今涨跌幅（百分比） */
  changePercentYTD?: number;
}
