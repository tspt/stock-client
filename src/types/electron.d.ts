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
  ) => Promise<{ success: boolean; cookies?: string[]; userAgents?: string[]; error?: string }>;

  /** 取消Cookie获取 */
  cancelFetchEastMoneyCookies: () => Promise<{ success: boolean; error?: string }>;

  /** 测试单个Cookie */
  testCookie: (
    cookieValue: string
  ) => Promise<{ success: boolean; isValid: boolean; error?: string }>;

  /** 将东财池 Cookie 写入与页面同 session，供 JSONP 直连 push2 */
  syncEastMoneySessionCookies: (raw: string) => Promise<{ ok: boolean }>;

  /** 保存股票K线数据到本地文件 */
  saveStockData: (data: {
    code: string;
    name: string;
    klineData: any[];
    latestQuote?: any;
    updatedAt?: number;
    dates: string[];
    exportContent?: string; // 新增：用于批量导出的内容
    exportFilename?: string; // 新增：用于批量导出的文件名
  }) => Promise<{ success: boolean; filePath?: string; error?: string }>;

  /** 扫描股票数据目录获取股票列表 */
  scanStockDataDirectory: () => Promise<{
    success: boolean;
    stocks?: Array<{ code: string; name: string }>;
    error?: string;
  }>;

  /** 获取股票数据文件路径 */
  getStockDataPath: (filename: string) => string | undefined;

  /** 读取股票TXT文件中的日期买点 */
  readStockBuyPoints: (filePath: string) => Promise<string[]>;

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

  /** IPC Renderer（用于接收主进程事件） */
  ipcRenderer?: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    removeListener: (channel: string, listener: (...args: any[]) => void) => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
