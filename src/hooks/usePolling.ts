/**
 * 轮询Hook
 *
 * 注意：在 React.StrictMode 下，组件会挂载两次，导致 effect 执行两次。
 * 本实现使用去抖机制来防止立即调用被重复执行。
 */

import { useEffect, useRef, useState } from 'react';
import { POLLING_INTERVAL } from '@/utils/config/constants';

interface UsePollingOptions {
  /** 轮询间隔（毫秒），默认10秒 */
  interval?: number;
  /** 是否立即执行一次 */
  immediate?: boolean;
  /** 是否启用轮询 */
  enabled?: boolean;
  /**
   * 页面不可见时暂停轮询（document.hidden，如最小化、切到其他应用）
   * 默认 true，与主窗口内切换 Tab 无关（此时仍为可见文档）
   */
  pauseWhenHidden?: boolean;
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
  const {
    interval = POLLING_INTERVAL,
    immediate = true,
    enabled = true,
    pauseWhenHidden = true,
  } = options;

  const [pageVisible, setPageVisible] = useState(
    () => typeof document !== 'undefined' && !document.hidden
  );

  useEffect(() => {
    if (!pauseWhenHidden) return;
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseWhenHidden]);

  const effectiveEnabled = enabled && (!pauseWhenHidden || pageVisible);

  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const immediateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!effectiveEnabled) {
      return;
    }

    // 立即执行一次（使用全局去抖机制避免在 React.StrictMode 下重复执行）
    if (immediate) {
      const now = Date.now();
      const timeSinceLastCall = now - lastImmediateCallTime;

      const delay = timeSinceLastCall < DEBOUNCE_DELAY ? DEBOUNCE_DELAY - timeSinceLastCall : 0;

      immediateTimerRef.current = setTimeout(() => {
        const currentTime = Date.now();
        if (currentTime - lastImmediateCallTime >= DEBOUNCE_DELAY) {
          lastImmediateCallTime = currentTime;
          callbackRef.current();
        }
      }, delay);
    }

    timerRef.current = setInterval(() => {
      callbackRef.current();
    }, interval);

    return () => {
      if (immediateTimerRef.current) {
        clearTimeout(immediateTimerRef.current);
        immediateTimerRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [interval, immediate, effectiveEnabled]);
}
