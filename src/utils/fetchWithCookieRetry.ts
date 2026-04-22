/**
 * 带Cookie重试的fetch封装
 * 自动从Cookie池获取Cookie，失败时自动切换
 */

import CookiePoolManager from './cookiePoolManager';
import { logger } from './logger';

/**
 * 带Cookie重试的fetch函数
 * @param url 请求URL
 * @param options 请求选项
 * @param maxRetries 最大重试次数，默认3次
 * @returns Response对象
 */
export async function fetchWithCookieRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<Response> {
  const cookiePool = CookiePoolManager.getInstance();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 从Cookie池获取下一个可用Cookie
    const cookie = cookiePool.getNextCookie();

    if (!cookie) {
      const error = new Error('没有可用的Cookie，请在Cookie管理页面添加');
      logger.error('[FetchWithRetry]', error.message);
      throw error;
    }

    try {
      logger.debug(`[FetchWithRetry] 尝试请求 (第${attempt + 1}/${maxRetries}次)`);

      // 发起请求，携带Cookie
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Cookie: cookie,
        },
      });

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
        // 短暂延迟后重试
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      // 网络错误或异常
      logger.error('[FetchWithRetry] 请求异常:', error);
      await cookiePool.reportFailure(cookie);
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果不是最后一次尝试，继续重试
      if (attempt < maxRetries - 1) {
        logger.debug('[FetchWithRetry] 切换到下一个Cookie重试...');
        await new Promise((resolve) => setTimeout(resolve, 500));
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
export async function getWithCookieRetry(url: string, maxRetries = 3): Promise<Response> {
  return fetchWithCookieRetry(url, { method: 'GET' }, maxRetries);
}

/**
 * 简化的POST请求封装
 */
export async function postWithCookieRetry(
  url: string,
  body?: any,
  maxRetries = 3
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
    maxRetries
  );
}
