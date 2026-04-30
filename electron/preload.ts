import { contextBridge, ipcRenderer } from 'electron';

// 暴露受保护的方法给渲染进程
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // 平台信息
    platform: process.platform,

    // 显示系统托盘通知
    showTrayNotification: (options: { title: string; body: string; code?: string }) => {
      return ipcRenderer.invoke('show-tray-notification', options);
    },

    // 显示桌面通知
    showDesktopNotification: (options: { title: string; body: string; code?: string }) => {
      return ipcRenderer.invoke('show-desktop-notification', options);
    },

    // 监听导航到股票详情的消息
    onNavigateToStock: (callback: (code: string) => void) => {
      ipcRenderer.on('navigate-to-stock', (_event, code: string) => {
        callback(code);
      });
    },

    // 移除导航监听器
    removeNavigateToStockListener: () => {
      ipcRenderer.removeAllListeners('navigate-to-stock');
    },

    // 自动获取东方财富Cookie
    fetchEastMoneyCookies: (count: number) => {
      return ipcRenderer.invoke('fetch-cookies', count);
    },

    // 取消Cookie获取
    cancelFetchEastMoneyCookies: () => {
      return ipcRenderer.invoke('cancel-fetch-cookies');
    },

    // 测试单个Cookie
    testCookie: (cookieValue: string) => {
      return ipcRenderer.invoke('test-cookie', cookieValue);
    },

    /** 将池 Cookie 写入主窗口 session，供渲染进程对 push2 发 JSONP 时使用 */
    syncEastMoneySessionCookies: (raw: string) => {
      return ipcRenderer.invoke('sync-eastmoney-session-cookies', raw);
    },

    // 保存股票K线数据到本地文件
    saveStockData: (data: {
      code: string;
      name: string;
      klineData: any[];
      latestQuote?: any;
      updatedAt?: number;
      dates: string[];
    }) => {
      return ipcRenderer.invoke('save-stock-data', data);
    },

    // 监听Cookie获取进度
    onCookieFetchProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('cookie-fetch-progress', listener);
      return () => {
        ipcRenderer.removeListener('cookie-fetch-progress', listener);
      };
    },

    // IPC Renderer（用于接收主进程事件）
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
        ipcRenderer.on(channel, listener);
      },
      removeListener: (channel: string, listener: (...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, listener);
      },
    },
  });
} catch (error) {
  console.error('[Preload] 暴露 electronAPI 失败:', error);
}
