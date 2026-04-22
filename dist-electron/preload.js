"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] Preload 脚本已加载');
// 暴露受保护的方法给渲染进程
try {
    electron_1.contextBridge.exposeInMainWorld('electronAPI', {
        // 平台信息
        platform: process.platform,
        // 显示系统托盘通知
        showTrayNotification: (options) => {
            return electron_1.ipcRenderer.invoke('show-tray-notification', options);
        },
        // 显示桌面通知
        showDesktopNotification: (options) => {
            return electron_1.ipcRenderer.invoke('show-desktop-notification', options);
        },
        // 监听导航到股票详情的消息
        onNavigateToStock: (callback) => {
            electron_1.ipcRenderer.on('navigate-to-stock', (_event, code) => {
                callback(code);
            });
        },
        // 移除导航监听器
        removeNavigateToStockListener: () => {
            electron_1.ipcRenderer.removeAllListeners('navigate-to-stock');
        },
        // 自动获取东方财富Cookie
        fetchEastMoneyCookies: (count) => {
            return electron_1.ipcRenderer.invoke('fetch-cookies', count);
        },
        // 取消Cookie获取
        cancelFetchEastMoneyCookies: () => {
            return electron_1.ipcRenderer.invoke('cancel-fetch-cookies');
        },
        // 测试单个Cookie
        testCookie: (cookieValue) => {
            return electron_1.ipcRenderer.invoke('test-cookie', cookieValue);
        },
        // 监听Cookie获取进度
        onCookieFetchProgress: (callback) => {
            const listener = (_event, progress) => callback(progress);
            electron_1.ipcRenderer.on('cookie-fetch-progress', listener);
            return () => {
                electron_1.ipcRenderer.removeListener('cookie-fetch-progress', listener);
            };
        },
    });
    console.log('[Preload] electronAPI 已成功暴露到 window');
}
catch (error) {
    console.error('[Preload] 暴露 electronAPI 失败:', error);
}
