/**
 * API 错误处理
 */

export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends ApiError {
  constructor(message: string = '网络连接失败') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ApiError {
  constructor(message: string = '请求超时') {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string = '数据验证失败') {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * 统一错误处理函数
 * @param error 原始错误对象
 * @param context 错误上下文信息
 * @returns 标准化的ApiError对象
 */
export function handleApiError(error: unknown, context?: string): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    // 检查是否是网络相关错误（更全面的检测）
    const isNetworkError =
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('fetch') ||
      error.message.toLowerCase().includes('connection') ||
      error.message.toLowerCase().includes('net::err');

    if (isNetworkError) {
      return new NetworkError(`${context ? `[${context}] ` : ''}${error.message}`);
    }

    // 检查是否是超时错误
    if (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('ETIMEOUT')
    ) {
      return new TimeoutError(`${context ? `[${context}] ` : ''}${error.message}`);
    }

    return new ApiError(`${context ? `[${context}] ` : ''}${error.message}`, 'UNKNOWN_ERROR');
  }

  return new ApiError(`${context ? `[${context}] ` : ''}未知错误`, 'UNKNOWN_ERROR');
}

/**
 * 安全的API调用包装器
 * @param fn 要执行的异步函数
 * @param context 错误上下文
 * @returns 包含结果或错误的对象
 */
export async function safeApiCall<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    const apiError = handleApiError(error, context);
    return { data: null, error: apiError };
  }
}
