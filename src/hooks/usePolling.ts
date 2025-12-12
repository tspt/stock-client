/**
 * 轮询Hook
 *
 * 注意：在 React.StrictMode 下，组件会挂载两次，导致 effect 执行两次。
 * 本实现使用去抖机制来防止立即调用被重复执行。
 */

import { useEffect, useRef } from 'react';
import { POLLING_INTERVAL } from '@/utils/constants';

interface UsePollingOptions {
  /** 轮询间隔（毫秒），默认10秒 */
  interval?: number;
  /** 是否立即执行一次 */
  immediate?: boolean;
  /** 是否启用轮询 */
  enabled?: boolean;
}

// 全局的去抖锁，用于防止在 React.StrictMode 下重复执行立即调用
// 记录所有立即调用的最后执行时间（所有 usePolling 实例共享）
// 注意：如果页面中有多个 usePolling 实例，它们会共享这个去抖锁
let lastImmediateCallTime = 0;
const DEBOUNCE_DELAY = 50; // 50ms 去抖延迟，防止 React.StrictMode 下的重复执行

/**
 * 轮询Hook
 * @param callback 轮询回调函数
 * @param options 配置选项
 */
export function usePolling(callback: () => void | Promise<void>, options: UsePollingOptions = {}) {
  const { interval = POLLING_INTERVAL, immediate = true, enabled = true } = options;

  const callbackRef = useRef(callback);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const immediateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 立即执行一次（使用全局去抖机制避免在 React.StrictMode 下重复执行）
    // 在 React.StrictMode 下，effect 会执行两次，但通过去抖机制，只有最后一次会真正执行
    if (immediate) {
      const now = Date.now();
      const timeSinceLastCall = now - lastImmediateCallTime;

      // 如果距离上次调用时间小于去抖延迟，则延迟执行
      const delay = timeSinceLastCall < DEBOUNCE_DELAY ? DEBOUNCE_DELAY - timeSinceLastCall : 0;

      immediateTimerRef.current = setTimeout(() => {
        const currentTime = Date.now();
        // 再次检查，确保在延迟期间没有其他调用（防止 React.StrictMode 下的重复执行）
        if (currentTime - lastImmediateCallTime >= DEBOUNCE_DELAY) {
          lastImmediateCallTime = currentTime;
          callbackRef.current();
        }
      }, delay);
    }

    // 设置定时器
    timerRef.current = setInterval(() => {
      callbackRef.current();
    }, interval);

    // 清理函数
    return () => {
      // 清除立即执行的定时器
      if (immediateTimerRef.current) {
        clearTimeout(immediateTimerRef.current);
        immediateTimerRef.current = null;
      }
      // 清除轮询定时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [interval, immediate, enabled]);
}
