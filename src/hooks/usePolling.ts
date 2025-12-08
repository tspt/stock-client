/**
 * 轮询Hook
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

/**
 * 轮询Hook
 * @param callback 轮询回调函数
 * @param options 配置选项
 */
export function usePolling(
  callback: () => void | Promise<void>,
  options: UsePollingOptions = {}
) {
  const {
    interval = POLLING_INTERVAL,
    immediate = true,
    enabled = true,
  } = options;

  const callbackRef = useRef(callback);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 立即执行一次
    if (immediate) {
      callbackRef.current();
    }

    // 设置定时器
    timerRef.current = setInterval(() => {
      callbackRef.current();
    }, interval);

    // 清理函数
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [interval, immediate, enabled]);
}

