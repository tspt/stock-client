import { contextBridge, ipcRenderer } from 'electron';
console.log('[Preload] Preload 脚本已加载');
// 暴露受保护的方法给渲染进程
try {
    contextBridge.exposeInMainWorld('electronAPI', {
        // 平台信息
        platform: process.platform,
        // 显示系统托盘通知
        showTrayNotification: (options) => {
            return ipcRenderer.invoke('show-tray-notification', options);
        },
        // 显示桌面通知
        showDesktopNotification: (options) => {
            return ipcRenderer.invoke('show-desktop-notification', options);
        },
        // 监听导航到股票详情的消息
        onNavigateToStock: (callback) => {
            ipcRenderer.on('navigate-to-stock', (_event, code) => {
                callback(code);
            });
        },
        // 移除导航监听器
        removeNavigateToStockListener: () => {
            ipcRenderer.removeAllListeners('navigate-to-stock');
        },
    });
    console.log('[Preload] electronAPI 已成功暴露到 window');
}
catch (error) {
    console.error('[Preload] 暴露 electronAPI 失败:', error);
}
