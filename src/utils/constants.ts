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

