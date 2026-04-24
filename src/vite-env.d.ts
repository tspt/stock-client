/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron API 类型声明（与 src/types/electron.d.ts 保持同步）
interface ElectronAPI {
  platform: string;
  showTrayNotification: (options: { title: string; body: string; code?: string }) => Promise<void>;
  showDesktopNotification: (options: { title: string; body: string; code?: string }) => Promise<void>;
  onNavigateToStock: (callback: (code: string) => void) => void;
  removeNavigateToStockListener: () => void;
  fetchEastMoneyCookies: (count: number) => Promise<unknown>;
  cancelFetchEastMoneyCookies: () => Promise<unknown>;
  testCookie: (cookieValue: string) => Promise<unknown>;
  onCookieFetchProgress: (callback: (progress: unknown) => void) => () => void;
  syncEastMoneySessionCookies: (raw: string) => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};