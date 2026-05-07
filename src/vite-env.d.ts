/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron API 类型引用（完整定义在 src/types/electron.d.ts）
/// <reference path="./types/electron.d.ts" />

export {};
