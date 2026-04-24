/**
 * 统一日志工具
 * 生产环境自动禁用调试日志，保留错误日志
 */
import { isDev } from '../../config/environment.js';
export const logger = {
    /** 调试日志 - 仅开发环境输出 */
    debug: (...args) => {
        if (isDev) {
            console.debug('[DEBUG]', ...args);
        }
    },
    /** 信息日志 - 所有环境输出 */
    info: (...args) => {
        console.info('[INFO]', ...args);
    },
    /** 警告日志 - 所有环境输出 */
    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },
    /** 错误日志 - 所有环境输出 */
    error: (...args) => {
        console.error('[ERROR]', ...args);
    },
    /** 性能日志 - 仅开发环境输出 */
    perf: (label, fn) => {
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
