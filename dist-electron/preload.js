import { contextBridge } from 'electron';
// 暴露受保护的方法给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 可以在这里添加需要暴露给渲染进程的API
    platform: process.platform,
});
