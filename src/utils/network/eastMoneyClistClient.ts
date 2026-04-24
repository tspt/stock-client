/**
 * Electron 下东财 clist 使用渲染进程 JSONP 直连 push2，Cookie 经 IPC 写入与窗口同 session（Chromium 发请求，不经 Node 主进程 https）。
 * 失败时回退到 fetchWithCookieRetry → 本地 3000 代理。非 Electron 仅走回退路径。
 */
import CookiePoolManager from '../storage/cookiePoolManager';
import { logger } from '../business/logger';
import { fetchWithCookieRetry } from './fetchWithCookieRetry';

/**
 * 与主进程 `augmentPush2EastMoneyUrl` 一致，query 中补 wbp2u=|0|0|0|web
 */
export function buildPush2ClistUrlFromParams(params: URLSearchParams): string {
  const p = new URLSearchParams(params.toString());
  if (!p.has('wbp2u')) {
    p.set('wbp2u', '|0|0|0|web');
  }
  return `https://push2.eastmoney.com/api/qt/clist/get?${p.toString()}`;
}

function ensureWbp2uInParams(params: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(params.toString());
  if (!p.has('wbp2u')) {
    p.set('wbp2u', '|0|0|0|web');
  }
  return p;
}

function parseClistText(text: string): unknown {
  const m = text.match(/\(([\s\S]*)\)\s*;?\s*$/m) || text.match(/\((.*)\)/);
  if (!m || !m[1]) {
    throw new Error('无法解析JSONP响应');
  }
  return JSON.parse(m[1].trim());
}

/**
 * 动态 script 拉 JSONP，cb 为 URL 中 cb= 的函数名
 */
function loadJsonp<T>(url: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('用户取消了请求', 'AbortError'));
      return;
    }
    const u = new URL(url, window.location.origin);
    const cbName = u.searchParams.get('cb');
    if (!cbName) {
      reject(new Error('JSONP 缺少 cb 参数'));
      return;
    }
    let settled = false;
    const script = document.createElement('script');
    const fin = (ok: boolean, v?: T, err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch {
        /* 忽略 */
      }
      try {
        delete (window as unknown as Record<string, unknown>)[cbName];
      } catch {
        (window as unknown as Record<string, unknown>)[cbName] = undefined;
      }
      clearTimeout(tid);
      if (ok && v !== undefined) {
        resolve(v);
      } else {
        reject(err || new Error('JSONP 失败'));
      }
    };
    const tid = setTimeout(() => {
      fin(false, undefined, new Error('JSONP 请求超时(60s)'));
    }, 60000);
    (window as unknown as Record<string, (d: T) => void>)[cbName] = (data: T) => {
      fin(true, data);
    };
    const onAb = () => {
      if (!settled) {
        fin(false, undefined, new DOMException('用户取消了请求', 'AbortError'));
      }
    };
    signal?.addEventListener('abort', onAb, { once: true });
    script.onerror = () => {
      fin(false, undefined, new Error('JSONP 脚本加载失败(网络/拦截/CSP)'));
    };
    script.src = u.toString();
    script.async = true;
    (document.head || document.body).appendChild(script);
  });
}

/**
 * 拉取 clist 并解析为 JSON 对象；Electron 下优先 JSONP+session，失败则经本地代理。
 */
export async function getEastMoneyClistJsonpData(
  params: URLSearchParams,
  maxRetries = 3,
  signal?: AbortSignal
): Promise<unknown> {
  const paramsCloned = ensureWbp2uInParams(params);
  const canElectron = Boolean(
    typeof window !== 'undefined' &&
      window.electronAPI &&
      typeof window.electronAPI.syncEastMoneySessionCookies === 'function'
  );
  const cookiePool = CookiePoolManager.getInstance();

  const tryWithProxy = async (): Promise<unknown> => {
    const rel = `/api/eastmoney/clist/get?${paramsCloned.toString()}`;
    const r = await fetchWithCookieRetry(rel, { method: 'GET' }, maxRetries, signal);
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    }
    return parseClistText(await r.text());
  };

  if (!canElectron) {
    return tryWithProxy();
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('用户取消了请求', 'AbortError');
    }
    const cookie = cookiePool.getNextCookie();
    if (!cookie) {
      throw new Error('没有可用的Cookie，请在Cookie管理页面添加');
    }
    try {
      await window.electronAPI!.syncEastMoneySessionCookies!(cookie);
      const fullUrl = buildPush2ClistUrlFromParams(paramsCloned);
      const data = await loadJsonp<unknown>(fullUrl, signal);
      await cookiePool.reportSuccess(cookie);
      return data;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }
      await cookiePool.reportFailure(cookie);
      logger.warn(`[EastMoneyClist] JSONP+session 第${attempt + 1}次失败:`, e);
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      } else {
        logger.warn('[EastMoneyClist] 回退 本地代理 /api/eastmoney');
        return tryWithProxy();
      }
    }
  }
  return tryWithProxy();
}
