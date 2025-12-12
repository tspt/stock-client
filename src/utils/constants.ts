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

/** 提醒时间周期选项 */
export const ALERT_TIME_PERIODS = [
  { label: '当天', value: 'day' as const },
  { label: '本周', value: 'week' as const },
  { label: '本月', value: 'month' as const },
  { label: '永久', value: 'permanent' as const },
] as const;

