/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron API 类型声明
interface ElectronAPI {
  platform: string;
  showTrayNotification: (options: { title: string; body: string; code?: string }) => Promise<void>;
  showDesktopNotification: (options: { title: string; body: string; code?: string }) => Promise<void>;
  onNavigateToStock: (callback: (code: string) => void) => void;
  removeNavigateToStockListener: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}