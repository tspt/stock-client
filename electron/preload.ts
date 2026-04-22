import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Preload 脚本已加载');

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

    // 监听Cookie获取进度
    onCookieFetchProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('cookie-fetch-progress', listener);
      return () => {
        ipcRenderer.removeListener('cookie-fetch-progress', listener);
      };
    },
  });
  console.log('[Preload] electronAPI 已成功暴露到 window');
} catch (error) {
  console.error('[Preload] 暴露 electronAPI 失败:', error);
}
