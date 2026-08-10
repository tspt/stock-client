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

  /** 批量导出K线数据到 docs/回测优化/股票数据 */
  batchExportKlineData: (
    stocksData: Array<{
      code: string;
      name: string;
      klineData: any[];
      latestQuote?: any;
      updatedAt?: number;
      industry?: { code: string; name: string } | null;
    }>
  ) => Promise<{
    success: boolean;
    results?: Array<{ code: string; name: string; success: boolean; error?: string }>;
    summary?: { total: number; success: number; fail: number };
    error?: string;
  }>;

  /** 导出回测结果到 docs/回测优化/最新买点 或 历史买点 */
  exportBacktestSignalsFile: (payload: {
    kind: 'latest' | 'history';
    format: 'json' | 'xlsx';
    fileBaseName: string;
    content: string | number[];
  }) => Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }>;

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
