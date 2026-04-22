/**
 * 统一环境配置
 * 集中管理环境变量、API基础URL等配置
 */

// 环境检测
// 在Vite环境中使用 import.meta.env，在Node/Electron环境中使用 process.env
export const isDev =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV
    ? (import.meta as any).env.DEV
    : process.env.NODE_ENV === 'development';

export const isElectronShell =
  typeof window !== 'undefined' &&
  (window as Window & { electronAPI?: unknown }).electronAPI != null;

// 是否使用本地代理（开发环境或Electron环境）
export const useLocalProxy = isElectronShell || isDev;

/**
 * API基础URL配置
 * 根据环境自动切换本地代理或直连
 */
export const API_BASE = {
  // 新浪财经
  SINA: useLocalProxy ? 'http://127.0.0.1:3000/api/sina' : 'https://hq.sinajs.cn',

  // 腾讯财经
  TENCENT: useLocalProxy ? 'http://127.0.0.1:3000/api/tencent' : 'https://qt.gtimg.cn',

  // K线数据（腾讯财经代理）
  KLINE: useLocalProxy ? 'http://127.0.0.1:3000/api/kline' : 'https://proxy.finance.qq.com',

  // 东方财富财经数据中心
  EASTMONEY: useLocalProxy
    ? 'http://127.0.0.1:3000/api/eastmoney'
    : 'https://datacenter-web.eastmoney.com',

  // 同花顺iFinD
  THS: useLocalProxy ? 'http://127.0.0.1:3000/api/ths' : 'https://basic.10jqka.com.cn',
};
