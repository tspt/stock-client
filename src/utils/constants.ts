/**
 * 应用常量
 */

/** 轮询间隔（毫秒） */
export const POLLING_INTERVAL = 10000; // 10秒

/** LocalStorage键名 */
export const STORAGE_KEYS = {
  /** 自选股列表 */
  WATCH_LIST: 'stock_watch_list',
  /** 主题设置 */
  THEME: 'stock_theme',
  /** 价格提醒列表 */
  PRICE_ALERTS: 'stock_price_alerts',
  /** 排序类型 */
  SORT_TYPE: 'stock_sort_type',
} as const;

/** MA周期配置 */
export const MA_PERIODS = [5, 10, 20, 30, 60, 120, 240, 360] as const;

/** MACD默认参数 */
export const MACD_PARAMS = {
  fast: 12,
  slow: 26,
  signal: 9,
} as const;

/** KDJ默认参数 */
export const KDJ_PARAMS = {
  n: 9,
  m1: 3,
  m2: 3,
} as const;

/** RSI周期配置 */
export const RSI_PERIODS = [6, 12, 24] as const;

/** 分组相关常量 */
/** 最大分组数量 */
export const MAX_GROUP_COUNT = 10;

/** 分组名称最大长度 */
export const MAX_GROUP_NAME_LENGTH = 10;

/** 默认分组ID */
export const DEFAULT_GROUP_ID = 'default';

/** 默认分组名称 */
export const DEFAULT_GROUP_NAME = '默认分组';

/** 默认分组颜色 */
export const DEFAULT_GROUP_COLOR = '#1890ff';

/** 预设颜色列表 */
export const PRESET_COLORS = [
  '#1890ff', // 蓝色
  '#52c41a', // 绿色
  '#ff4d4f', // 红色
  '#faad14', // 橙色
  '#722ed1', // 紫色
  '#13c2c2', // 青色
  '#eb2f96', // 粉色
  '#fa8c16', // 橙红色
  '#2f54eb', // 深蓝色
  '#a0d911', // 浅绿色
] as const;

/** 内置分组：自选（不在分组管理中展示） */
export const BUILTIN_GROUP_SELF_ID = '__self__';
export const BUILTIN_GROUP_SELF_NAME = '自选';
export const BUILTIN_GROUP_SELF_COLOR = '#1890ff';

/** 提醒时间周期选项 */
export const ALERT_TIME_PERIODS = [
  { label: '当天', value: 'day' as const },
  { label: '本周', value: 'week' as const },
  { label: '本月', value: 'month' as const },
  { label: '永久', value: 'permanent' as const },
] as const;

/** 数据概况相关常量 */
/** IndexedDB 数据库名 */
export const OVERVIEW_DB_NAME = 'StockOverviewDB';
/** IndexedDB 版本 */
export const OVERVIEW_DB_VERSION = 1;
/** 对象存储名称 */
export const OVERVIEW_STORE_NAME = 'overviewData';
/** 历史存储名称 */
export const OVERVIEW_HISTORY_STORE_NAME = 'overviewHistory';
/** 默认并发数 */
export const OVERVIEW_CONCURRENT_LIMIT = 5;
/** 批次间延迟（毫秒） */
export const OVERVIEW_BATCH_DELAY = 100;
/** 默认列配置 */
export const OVERVIEW_DEFAULT_COLUMNS = [
  { key: 'name', title: '股票名称', visible: true, width: 88 },
  { key: 'price', title: '当前价', visible: true, width: 88 },
  { key: 'change', title: '当日涨跌额', visible: false, width: 110 },
  { key: 'changePercent', title: '当日涨跌幅', visible: true, width: 110 },
  { key: 'turnoverRate', title: '换手率', visible: true, width: 88 },
  { key: 'volume', title: '成交量(亿)', visible: false, width: 100 },
  { key: 'amount', title: '成交额(亿)', visible: true, width: 100 },
  { key: 'marketCap', title: '总市值', visible: true, width: 100 },
  { key: 'circulatingMarketCap', title: '流通市值', visible: true, width: 100 },
  { key: 'peRatio', title: '市盈率(PE)', visible: true, width: 100 },
  { key: 'kdjK', title: 'KDJ-K', visible: false, width: 88 },
  { key: 'kdjD', title: 'KDJ-D', visible: false, width: 88 },
  { key: 'kdjJ', title: 'KDJ-J', visible: true, width: 88 },
  { key: 'avgPrice', title: '区间平均价', visible: false, width: 110 },
  { key: 'highPrice', title: '区间最高价', visible: false, width: 110 },
  { key: 'lowPrice', title: '区间最低价', visible: true, width: 110 },
  { key: 'opportunityChangePercent', title: '区间最大值回撤比', visible: true, width: 150 },
  { key: 'ma5', title: 'MA-5涨跌幅', visible: true },
  { key: 'ma10', title: 'MA-10涨跌幅', visible: true },
  { key: 'ma20', title: 'MA-20涨跌幅', visible: true },
  { key: 'ma30', title: 'MA-30涨跌幅', visible: true },
  { key: 'ma60', title: 'MA-60涨跌幅', visible: true },
  { key: 'ma120', title: 'MA-120涨跌幅', visible: true, width: 130 },
  { key: 'ma240', title: 'MA-240涨跌幅', visible: false, width: 130 },
  { key: 'ma360', title: 'MA-360涨跌幅', visible: false, width: 130 },
] as const;

/** 机会分析相关常量 */
/** IndexedDB 数据库名 */
export const OPPORTUNITY_DB_NAME = 'StockOpportunityDB';
/** IndexedDB 版本 */
export const OPPORTUNITY_DB_VERSION = 1;
/** 对象存储名称 */
export const OPPORTUNITY_STORE_NAME = 'opportunityData';
/** 历史存储名称 */
export const OPPORTUNITY_HISTORY_STORE_NAME = 'opportunityHistory';
/** 默认并发数（每批5只股票） */
export const OPPORTUNITY_CONCURRENT_LIMIT = 5;
/** 批次间延迟（毫秒） */
export const OPPORTUNITY_BATCH_DELAY = 1000;
/** 行情批次间延迟（毫秒） */
export const QUOTES_BATCH_DELAY = 200;
/** 行情并发数 */
export const QUOTES_CONCURRENT_LIMIT = 5;
/** 行情批次大小 */
export const QUOTES_BATCH_SIZE = 100;
/** 默认列配置 */
export const OPPORTUNITY_DEFAULT_COLUMNS = [
  { key: 'name', title: '股票名称', visible: true, width: 88 },
  { key: 'price', title: '当前价', visible: true, width: 88 },
  { key: 'change', title: '当日涨跌额', visible: false, width: 110 },
  { key: 'changePercent', title: '当日涨跌幅', visible: true, width: 110 },
  { key: 'turnoverRate', title: '换手率', visible: true, width: 88 },
  { key: 'volume', title: '成交量(亿)', visible: false, width: 100 },
  { key: 'amount', title: '成交额(亿)', visible: true, width: 100 },
  { key: 'marketCap', title: '总市值', visible: true, width: 100 },
  { key: 'circulatingMarketCap', title: '流通市值', visible: true, width: 100 },
  { key: 'peRatio', title: '市盈率(PE)', visible: true, width: 100 },
  { key: 'kdjK', title: 'KDJ-K', visible: false, width: 88 },
  { key: 'kdjD', title: 'KDJ-D', visible: false, width: 88 },
  { key: 'kdjJ', title: 'KDJ-J', visible: true, width: 88 },
  { key: 'avgPrice', title: '区间平均价', visible: false, width: 110 },
  { key: 'highPrice', title: '区间最高价', visible: false, width: 110 },
  { key: 'lowPrice', title: '区间最低价', visible: true, width: 110 },
  { key: 'opportunityChangePercent', title: '区间最大值回撤比', visible: true, width: 150 },
  { key: 'ma5', title: 'MA-5涨跌幅', visible: true },
  { key: 'ma10', title: 'MA-10涨跌幅', visible: true },
  { key: 'ma20', title: 'MA-20涨跌幅', visible: true },
  { key: 'ma30', title: 'MA-30涨跌幅', visible: true },
  { key: 'ma60', title: 'MA-60涨跌幅', visible: true },
  { key: 'ma120', title: 'MA-120涨跌幅', visible: true, width: 130 },
  { key: 'ma240', title: 'MA-240涨跌幅', visible: false, width: 130 },
  { key: 'ma360', title: 'MA-360涨跌幅', visible: false, width: 130 },
] as const;
