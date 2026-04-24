/**
 * 带Cookie重试的fetch封装
 * 自动从Cookie池获取Cookie，失败时自动切换
 */

import CookiePoolManager from '../storage/cookiePoolManager';
import { logger } from '../business/logger';
import {
  STOCK_CLIENT_COOKIE_POOL_HEADER,
  STOCK_CLIENT_UA_HEADER,
} from '../config/constants';

/**
 * 带Cookie重试的fetch函数
 * @param url 请求URL
 * @param options 请求选项
 * @param maxRetries 最大重试次数，默认3次
 * @param signal AbortSignal 用于取消请求
 * @returns Response对象
 */
export async function fetchWithCookieRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  signal?: AbortSignal
): Promise<Response> {
  const cookiePool = CookiePoolManager.getInstance();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new DOMException('用户取消了请求', 'AbortError');
    }

    // 从Cookie池获取下一个可用Cookie
    const cookie = cookiePool.getNextCookie();

    if (!cookie) {
      const error = new Error('没有可用的Cookie，请在Cookie管理页面添加');
      logger.error('[FetchWithRetry]', error.message);
      throw error;
    }

    try {
      logger.debug(`[FetchWithRetry] 尝试请求 (第${attempt + 1}/${maxRetries}次)`);
      logger.debug(`[FetchWithRetry] URL: ${url}`);
      logger.debug(`[FetchWithRetry] Cookie前8位: ${cookie.substring(0, 8)}...`);

      // 浏览器禁止在 fetch 里设 Cookie 头（会被静默丢弃），改用自定义头传给本地代理
      const response = await fetch(url, {
        ...options,
        signal, // 传递 signal 以支持取消
        headers: {
          ...options.headers,
          [STOCK_CLIENT_COOKIE_POOL_HEADER]: cookie,
          ...(typeof navigator !== 'undefined' && navigator.userAgent
            ? { [STOCK_CLIENT_UA_HEADER]: navigator.userAgent }
            : {}),
        },
      });

      logger.debug(`[FetchWithRetry] 响应状态: ${response.status} ${response.statusText}`);

      // 如果请求成功
      if (response.ok) {
        // 报告成功
        await cookiePool.reportSuccess(cookie);
        logger.debug('[FetchWithRetry] 请求成功');
        return response;
      }

      // 请求失败（HTTP错误状态码）
      logger.warn(`[FetchWithRetry] HTTP错误: ${response.status} ${response.statusText}`);
      await cookiePool.reportFailure(cookie);
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      // 如果不是最后一次尝试，继续重试
      if (attempt < maxRetries - 1) {
        logger.debug('[FetchWithRetry] 切换到下一个Cookie重试...');
        // 递增延迟：第1次失败等1秒，第2次失败等2秒
        const delay = (attempt + 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error: any) {
      // 如果是取消错误，直接抛出
      if (error.name === 'AbortError') {
        throw error;
      }

      // 网络错误或异常
      logger.error('[FetchWithRetry] 请求异常:', error);
      await cookiePool.reportFailure(cookie);
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果不是最后一次尝试，继续重试
      if (attempt < maxRetries - 1) {
        logger.debug('[FetchWithRetry] 切换到下一个Cookie重试...');
        // 递增延迟：第1次失败等1秒，第2次失败等2秒
        const delay = (attempt + 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 所有重试都失败了
  const finalError = new Error(
    `请求失败，已重试${maxRetries}次: ${lastError?.message || '未知错误'}`
  );
  logger.error('[FetchWithRetry]', finalError.message);
  throw finalError;
}

/**
 * 简化的GET请求封装
 */
export async function getWithCookieRetry(
  url: string,
  maxRetries = 3,
  signal?: AbortSignal
): Promise<Response> {
  return fetchWithCookieRetry(url, { method: 'GET' }, maxRetries, signal);
}

/**
 * 简化的POST请求封装
 */
export async function postWithCookieRetry(
  url: string,
  body?: any,
  maxRetries = 3,
  signal?: AbortSignal
): Promise<Response> {
  return fetchWithCookieRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    maxRetries,
    signal
  );
}
