/**
 * 通用 JSONP 请求工具
 *
 * 通过动态注入 <script> 标签请求返回 `callbackName(json)` 形式的接口，
 * 天然绕开浏览器跨域限制，适用于无法直连 fetch 的第三方行情/财报接口。
 */

let jsonpSeq = 0;

export interface JsonpOptions {
  /** 回调参数名，默认 callback */
  callbackParam?: string;
  /** 超时时间（毫秒），默认 15000 */
  timeout?: number;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * 发起一次 JSONP 请求，解析并返回回调函数收到的数据对象。
 */
export function loadJsonp<T>(url: string, options: JsonpOptions = {}): Promise<T> {
  const { callbackParam = 'callback', timeout = 15000, signal } = options;

  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('请求已取消', 'AbortError'));
      return;
    }

    const callbackName = `__stockJsonp_${Date.now()}_${jsonpSeq++}`;
    const globalStore = window as unknown as Record<string, unknown>;

    let script: HTMLScriptElement | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (script?.parentNode) {
        script.parentNode.removeChild(script);
      }
      script = null;
      signal?.removeEventListener('abort', onAbort);
      try {
        delete globalStore[callbackName];
      } catch {
        globalStore[callbackName] = undefined;
      }
    };

    const finish = (ok: boolean, value?: T, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) {
        resolve(value as T);
      } else {
        reject(error ?? new Error('JSONP 请求失败'));
      }
    };

    const onAbort = () => finish(false, undefined, new DOMException('请求已取消', 'AbortError'));

    timer = setTimeout(
      () => finish(false, undefined, new Error(`JSONP 请求超时(${timeout}ms)`)),
      timeout
    );

    globalStore[callbackName] = (data: T) => finish(true, data);

    let target: URL;
    try {
      target = new URL(url, window.location.origin);
    } catch {
      finish(false, undefined, new Error(`JSONP 地址解析失败: ${url}`));
      return;
    }
    target.searchParams.set(callbackParam, callbackName);

    signal?.addEventListener('abort', onAbort, { once: true });

    script = document.createElement('script');
    script.src = target.toString();
    script.async = true;
    script.onerror = () =>
      finish(false, undefined, new Error('JSONP 脚本加载失败(网络/拦截/CSP)'));
    (document.head || document.body).appendChild(script);
  });
}
