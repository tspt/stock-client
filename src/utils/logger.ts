/**
 * 统一日志工具
 * 生产环境自动禁用调试日志，保留错误日志
 */

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';

export const logger = {
  /** 调试日志 - 仅开发环境输出 */
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug('[DEBUG]', ...args);
    }
  },

  /** 信息日志 - 所有环境输出 */
  info: (...args: any[]) => {
    console.info('[INFO]', ...args);
  },

  /** 警告日志 - 所有环境输出 */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },

  /** 错误日志 - 所有环境输出 */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },

  /** 性能日志 - 仅开发环境输出 */
  perf: (label: string, fn: () => void) => {
    if (!isDev) {
      fn();
      return;
    }

    const start = performance.now();
    fn();
    const end = performance.now();
    console.log(`[PERF] ${label}: ${(end - start).toFixed(2)}ms`);
  },
};
