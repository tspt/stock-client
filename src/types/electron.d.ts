/**
 * Electron API 类型定义
 */

export interface NotificationOptions {
  title: string;
  body: string;
  code?: string;
}

export interface ElectronAPI {
  /** 显示系统托盘通知 */
  showTrayNotification: (options: NotificationOptions) => Promise<void>;

  /** 显示桌面通知 */
  showDesktopNotification: (options: NotificationOptions) => Promise<void>;

  /** 监听股票导航事件 */
  onNavigateToStock: (callback: (code: string) => void) => void;

  /** 移除股票导航监听 */
  removeNavigateToStockListener: () => void;

  /** 自动获取东方财富Cookie */
  fetchEastMoneyCookies: (
    count: number
  ) => Promise<{ success: boolean; cookies?: string[]; error?: string }>;

  /** 取消Cookie获取 */
  cancelFetchEastMoneyCookies: () => Promise<{ success: boolean; error?: string }>;

  /** 测试单个Cookie */
  testCookie: (
    cookieValue: string
  ) => Promise<{ success: boolean; isValid: boolean; error?: string }>;

  /** 监听Cookie获取进度 */
  onCookieFetchProgress: (
    callback: (progress: {
      current: number;
      total: number;
      batch: number;
      totalBatches: number;
      status: string;
      cookie?: string;
    }) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
