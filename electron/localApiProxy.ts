/**
 * 主进程内嵌 HTTP 代理（与 server/proxy.js 行为一致，不依赖子进程 / ELECTRON_RUN_AS_NODE）
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import http, { type Server } from 'http';
import https from 'https';
import { URL } from 'url';
import zlib from 'zlib';
import iconv from 'iconv-lite';
import { PassThrough } from 'stream';
import { net, session, BrowserWindow } from 'electron';
import CookiePoolManager from '../src/utils/storage/cookiePoolManager.js';
import {
  STOCK_CLIENT_COOKIE_POOL_HEADER,
  STOCK_CLIENT_UA_HEADER,
} from '../src/utils/config/constants.js';
import { deriveEastmoneyRefererOrigin, isEastmoneyJsonpUrl } from './eastMoneyPush2Context.js';

/** 专用于代理请求的独立 session，避免与 defaultSession 上的 onBeforeSendHeaders 拦截器冲突 */
let proxySession: Electron.Session | null = null;

/**
 * 初始化代理 session（必须在 app.whenReady() 之后调用）
 */
export function initProxySession(): void {
  if (!proxySession) {
    proxySession = session.fromPartition('persist:proxy-session', { cache: false });
  }
}

function getEastmoneyPoolCookie(req: http.IncomingMessage): string {
  const k = STOCK_CLIENT_COOKIE_POOL_HEADER.toLowerCase();
  const fromHeader = req.headers[k];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;
  if (Array.isArray(fromHeader) && fromHeader[0]) return fromHeader[0];
  const raw = req.headers.cookie;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return '';
}

function getEastmoneyClientUaFromHeader(req: http.IncomingMessage): string {
  const k = STOCK_CLIENT_UA_HEADER.toLowerCase();
  const from = req.headers[k];
  if (typeof from === 'string' && from.length > 0) return from;
  if (Array.isArray(from) && from[0]) return from[0];
  return '';
}

/** Node `https` 头转 Chromium `ClientRequest`；Connection 等由网络栈自管。 */
function eastmoneyHeadersForChromium(
  h: http.OutgoingHttpHeaders
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    if (k.toLowerCase() === 'connection') continue;
    if (Array.isArray(v)) {
      out[k] = v.map((x) => String(x));
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

// ⚠️ 在模块初始化时加载环境变量（在读取 process.env 之前）
const envPath = resolve(process.cwd(), '.env');
dotenv.config({ path: envPath, override: true });

// 从环境变量读取配置（在 dotenv.config() 之后）
const DEFAULT_UA = process.env.VITE_USER_AGENT!;

/** 主站 RST 时轮询同证书族边缘主机（经 DNS 解析为 trafficmanager，IP 与主站可能不同） */
const EM_PUSH2_FAILOVER_HOSTS: readonly string[] = [
  'push2.eastmoney.com',
  '82.push2.eastmoney.com',
  '7.push2.eastmoney.com',
];

/**
 * 东财 push2：对端常掐 Node `https` / 渲染区 JSONP 同报 ERR_EMPTY_RESPONSE（TLS/指纹/频控）。
 * 同机回退时 upstream 用 Electron `net.request`（Chromium 网络栈，与 JSONP/浏览器一致）替代 Node `https`。
 */
const PROXY_CONFIG: Record<string, { target: string; referer: string; origin: string }> = {
  '/api/sina': {
    target: 'https://hq.sinajs.cn',
    referer: process.env.VITE_SINA_REFERER!,
    origin: process.env.VITE_SINA_ORIGIN!,
  },
  '/api/tencent/rank': {
    target: 'https://proxy.finance.qq.com',
    referer: process.env.VITE_TENCENT_RANK_REFERER!,
    origin: process.env.VITE_TENCENT_RANK_ORIGIN!,
  },
  '/api/tencent': {
    target: 'https://qt.gtimg.cn',
    referer: process.env.VITE_TENCENT_REFERER!,
    origin: process.env.VITE_TENCENT_ORIGIN!,
  },
  '/api/kline': {
    target: 'https://proxy.finance.qq.com',
    referer: process.env.VITE_KLINE_REFERER!,
    origin: process.env.VITE_KLINE_ORIGIN!,
  },
  '/api/eastmoney': {
    target: 'https://push2.eastmoney.com',
    referer: process.env.VITE_EASTMONEY_REFERER!,
    origin: process.env.VITE_EASTMONEY_ORIGIN!,
  },
};

/**
 * push2 行情接口与页面一致需带 wbp2u=|0|0|0|web；缺省时服务端常直接断连，浏览器侧表现为
 * net::ERR_EMPTY_RESPONSE。main 中 test-cookie 的测试 URL 也含该参数。
 */
function augmentPush2EastMoneyUrl(href: string): string {
  try {
    const u = new URL(href);
    if (!/\.eastmoney\.com$/i.test(u.hostname) || !u.pathname.includes('/api/qt/')) {
      return href;
    }
    if (!u.searchParams.has('wbp2u')) {
      u.searchParams.set('wbp2u', '|0|0|0|web');
    }
    return u.toString();
  } catch {
    return href;
  }
}

const DATA_EASTMONEY_ORIGIN = 'https://data.eastmoney.com';

export function startEmbeddedApiProxy(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        });
        res.end();
        return;
      }

      let urlPath = req.url || '/';
      // Vite 转发到本机时可能为绝对 URL，需归一成 pathname+search 才能匹配 PROXY_CONFIG 前缀
      if (urlPath.startsWith('http://') || urlPath.startsWith('https://')) {
        try {
          const p = new URL(urlPath);
          urlPath = p.pathname + (p.search || '');
        } catch {
          /* 保持 urlPath 不变 */
        }
      }
      let proxyConfig: (typeof PROXY_CONFIG)['/api/sina'] | null = null;
      let prefix = '';

      for (const [p, cfg] of Object.entries(PROXY_CONFIG)) {
        if (urlPath.startsWith(p)) {
          proxyConfig = cfg;
          prefix = p;
          break;
        }
      }

      if (!proxyConfig) {
        console.error('[代理服务器] 未找到匹配的代理配置，URL:', urlPath);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Proxy path not found');
        return;
      }

      const proxyPath = urlPath.replace(prefix, '');
      let queryString = urlPath.includes('?') ? urlPath.split('?')[1] : '';
      let pathWithoutQuery = proxyPath.split('?')[0];

      // 特殊处理 /api/tencent/rank 路径，需要转换为 /cgi/cgi-bin/rank
      if (prefix === '/api/tencent/rank') {
        pathWithoutQuery = '/cgi/cgi-bin/rank' + pathWithoutQuery;
      }

      // 特殊处理 /api/eastmoney 路径，需要转换为 /api/qt
      if (prefix === '/api/eastmoney') {
        pathWithoutQuery = '/api/qt' + pathWithoutQuery;
      }

      const targetPath = pathWithoutQuery || '/';
      const targetUrl = proxyConfig.target + targetPath + (queryString ? '?' + queryString : '');
      const forwardUrl =
        prefix === '/api/eastmoney' ? augmentPush2EastMoneyUrl(targetUrl) : targetUrl;

      const eastmoneyCtx =
        prefix === '/api/eastmoney'
          ? deriveEastmoneyRefererOrigin(
              forwardUrl,
              proxyConfig.referer || `${DATA_EASTMONEY_ORIGIN}/`,
              proxyConfig.origin || DATA_EASTMONEY_ORIGIN
            )
          : null;

      const u = new URL(forwardUrl);

      // 确定使用的 User-Agent（优先渲染进程经 X-Stock-Client-User-Agent 与 Cookie 同源身份）
      let finalUA = DEFAULT_UA; // 默认使用环境变量中的 UA

      if (prefix === '/api/eastmoney') {
        const fromRenderer = getEastmoneyClientUaFromHeader(req);
        if (fromRenderer) {
          finalUA = fromRenderer;
        } else {
          const requestCookie = getEastmoneyPoolCookie(req);
          if (requestCookie) {
            const cookiePool = CookiePoolManager.getInstance();
            const allCookies = cookiePool.getAllCookies();
            const matchedCookie = allCookies.find((c) => c.value === requestCookie);

            if (matchedCookie && matchedCookie.userAgent) {
              finalUA = matchedCookie.userAgent;
            }
          }
        }
      }

      // 东方财富：不得转发 Vite/浏览器 的整包 req.headers，其中 connection/content-length 等
      // hop-by-hop 或与本机/上游不一致的头会让对端在 TLS 上直接 RST（ECONNRESET / socket hang up）
      const headers: http.OutgoingHttpHeaders =
        prefix === '/api/eastmoney' && eastmoneyCtx
          ? (() => {
              const jsonp = isEastmoneyJsonpUrl(forwardUrl);
              const poolCookie = getEastmoneyPoolCookie(req);
              const h: http.OutgoingHttpHeaders = {
                Accept: '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'close',
                Referer: eastmoneyCtx.referer,
                'User-Agent': finalUA,
                ...(poolCookie ? { Cookie: poolCookie } : {}),
              };
              if (!jsonp) {
                h.Origin = eastmoneyCtx.origin;
                h['X-Requested-With'] = 'XMLHttpRequest';
              }
              // JSONP 与 <script> 拉取通常不带 Origin
              return h;
            })()
          : (() => {
              const h: http.OutgoingHttpHeaders = { ...req.headers };
              h.Referer = proxyConfig.referer;
              h.Origin = proxyConfig.origin;
              h['User-Agent'] = finalUA;
              h.Host = u.hostname;
              h.Cookie = req.headers.cookie || '';
              delete h.host;
              delete h.connection;
              return h;
            })();

      const httpModule = u.protocol === 'https:' ? https : http;

      const sendUpstream = (attempt: number): void => {
        const uReq = new URL(forwardUrl);

        // 东财请求直接使用 Node https 模块，避免 Chromium net.request 的 ERR_BLOCKED_BY_CLIENT 问题
        // 注：之前使用 net.request 是为了利用 Chromium 的 Cookie 管理，但会与 onBeforeSendHeaders 拦截器冲突
        const useDirectHttps = prefix === '/api/eastmoney';

        if (useDirectHttps && uReq.protocol === 'https:') {
          // 切换主机逻辑（仅在重试时）
          if (attempt > 0) {
            const idx = Math.min(attempt, EM_PUSH2_FAILOVER_HOSTS.length - 1);
            uReq.hostname = EM_PUSH2_FAILOVER_HOSTS[idx] as string;
            console.warn(
              `[embedded-proxy] 东财 切换上游主机: ${uReq.hostname} (第${attempt}次重试，Node https)`
            );
          }

          // 调试日志：输出请求信息
          const poolCookie = getEastmoneyPoolCookie(req);
          console.log('[代理调试] 东财请求 (Node https):', {
            url: uReq.toString().substring(0, 150) + '...',
            hasCookie: !!poolCookie,
            cookiePrefix: poolCookie ? poolCookie.substring(0, 50) : 'none',
            referer: headers.Referer,
          });

          // 准备请求头（移除 Connection 等 hop-by-hop 头，添加完整的浏览器请求头）
          const nodeHeaders: https.RequestOptions['headers'] = {
            Accept: '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            Connection: 'keep-alive',
            Host: uReq.hostname,
            Referer: eastmoneyCtx?.referer || 'https://quote.eastmoney.com/',
            'Sec-Fetch-Dest': 'script',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
            'User-Agent': finalUA,
            ...(poolCookie ? { Cookie: poolCookie } : {}),
          };

          // 对于非JSONP请求，添加Origin和X-Requested-With
          const isJsonp = isEastmoneyJsonpUrl(forwardUrl);
          if (!isJsonp) {
            nodeHeaders['Origin'] = eastmoneyCtx?.origin || 'https://quote.eastmoney.com';
            nodeHeaders['X-Requested-With'] = 'XMLHttpRequest';
          }

          const requestOpt: https.RequestOptions = {
            hostname: uReq.hostname,
            port: uReq.port ? Number.parseInt(String(uReq.port), 10) : 443,
            path: uReq.pathname + (uReq.search || ''),
            method: req.method,
            headers: nodeHeaders,
          };

          const proxyReq = https.request(requestOpt, (proxyRes) => {
            if (prefix === '/api/eastmoney') {
              if (attempt > 0) {
                console.log(
                  '[代理调试] 东方财富响应 (Node https):',
                  proxyRes.statusCode,
                  proxyRes.statusMessage,
                  `(重试第${attempt}次成功)`
                );
              } else {
                console.log(
                  '[代理调试] 东方财富响应 (Node https):',
                  proxyRes.statusCode,
                  proxyRes.statusMessage
                );
              }
            }

            // 检查是否需要解压缩
            const contentEncoding = proxyRes.headers['content-encoding'];

            // 创建响应流处理管道
            let responseStream: NodeJS.ReadableStream = proxyRes;

            if (contentEncoding === 'gzip') {
              responseStream = proxyRes.pipe(zlib.createGunzip());
            } else if (contentEncoding === 'deflate') {
              responseStream = proxyRes.pipe(zlib.createInflate());
            } else if (contentEncoding === 'br') {
              responseStream = proxyRes.pipe(zlib.createBrotliDecompress());
            }

            // 新浪API需要GBK转UTF-8编码转换
            const isSinaApi = prefix === '/api/sina';
            const contentType = String(proxyRes.headers['content-type'] || '');
            const isTextResponse =
              contentType.includes('text') || contentType.includes('javascript');

            if (isSinaApi && isTextResponse) {
              // 收集所有数据块
              const chunks: Buffer[] = [];
              responseStream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
              });

              responseStream.on('end', () => {
                try {
                  // 将GBK编码的Buffer转换为UTF-8字符串
                  const gbkBuffer = Buffer.concat(chunks);
                  const utf8String = iconv.decode(gbkBuffer, 'gbk');
                  const utf8Buffer = Buffer.from(utf8String, 'utf-8');

                  // 过滤掉可能导致解码问题的头部
                  const filteredHeaders: Record<string, string | string[]> = {};
                  for (const [key, value] of Object.entries(proxyRes.headers)) {
                    const lowerKey = key.toLowerCase();
                    if (
                      lowerKey === 'content-encoding' ||
                      lowerKey === 'content-length' ||
                      lowerKey === 'transfer-encoding'
                    ) {
                      continue;
                    }
                    if (value !== undefined) {
                      filteredHeaders[key] = value;
                    }
                  }

                  const outHeaders: http.OutgoingHttpHeaders = {
                    ...filteredHeaders,
                    'Content-Type':
                      contentType.replace(/charset=[^;]*/i, 'charset=utf-8') ||
                      'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                  };
                  res.writeHead(proxyRes.statusCode || 500, outHeaders);
                  res.end(utf8Buffer);
                } catch (error) {
                  console.error('[embedded-proxy] 新浪API编码转换失败:', error);
                  if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Encoding conversion failed');
                  }
                }
              });

              responseStream.on('error', (err) => {
                console.error('[embedded-proxy] 新浪API流读取错误:', err);
                if (!res.headersSent) {
                  res.writeHead(500, { 'Content-Type': 'text/plain' });
                  res.end('Stream read error');
                }
              });

              return; // 提前返回，不执行后续的pipe逻辑
            }

            // 过滤掉可能导致解码问题的头部
            const filteredHeaders: Record<string, string | string[]> = {};
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              const lowerKey = key.toLowerCase();
              // 移除压缩相关头部，因为我们已经手动解压了
              if (
                lowerKey === 'content-encoding' ||
                lowerKey === 'content-length' ||
                lowerKey === 'transfer-encoding'
              ) {
                continue;
              }
              if (value !== undefined) {
                filteredHeaders[key] = value;
              }
            }

            const outHeaders: http.OutgoingHttpHeaders = {
              ...filteredHeaders,
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': '*',
            };
            res.writeHead(proxyRes.statusCode || 500, outHeaders);
            responseStream.pipe(res);
          });

          proxyReq.on('error', (err: NodeJS.ErrnoException) => {
            const msg = err.message || '';
            const isConnReset =
              err.code === 'ECONNRESET' ||
              err.code === 'EPIPE' ||
              err.code === 'ETIMEDOUT' ||
              /socket hang up/i.test(msg);

            // ECONNRESET 通常意味着 Cookie 失效或被限速，通知渲染进程标记失效
            if (isConnReset && poolCookie) {
              console.warn('[代理调试] 检测到连接重置，通知渲染进程标记 Cookie 失效');
              // 通过 IPC 通知渲染进程标记 Cookie 失效
              const mainWindow = BrowserWindow.getAllWindows()[0];
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('cookie-pool:mark-failed', poolCookie);
              }
            }

            // 不再在代理层重试，让渲染进程的 fetchWithCookieRetry 处理重试和Cookie切换
            console.error('[embedded-proxy] request error (Node https):', err.code || msg);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain' }); // 502 Bad Gateway 更准确
              res.end('EastMoney request failed');
            }
          });

          if (req.method === 'GET' || req.method === 'HEAD') {
            proxyReq.end();
          } else {
            req.pipe(proxyReq);
          }
          return;
        }

        // 其他请求使用原有逻辑（非东财请求）
        const uReq2 = new URL(forwardUrl);
        const requestOpt: https.RequestOptions = {
          hostname: uReq2.hostname,
          port: uReq2.port
            ? Number.parseInt(String(uReq2.port), 10)
            : uReq2.protocol === 'https:'
            ? 443
            : 80,
          path: uReq2.pathname + (uReq2.search || ''),
          method: req.method,
          headers,
        };
        const proxyReq = httpModule.request(requestOpt, (proxyRes) => {
          // 检查是否需要解压缩
          const contentEncoding = proxyRes.headers['content-encoding'];

          // 创建响应流处理管道
          let responseStream: NodeJS.ReadableStream = proxyRes;

          if (contentEncoding === 'gzip') {
            responseStream = proxyRes.pipe(zlib.createGunzip());
          } else if (contentEncoding === 'deflate') {
            responseStream = proxyRes.pipe(zlib.createInflate());
          } else if (contentEncoding === 'br') {
            responseStream = proxyRes.pipe(zlib.createBrotliDecompress());
          }

          // 新浪API需要GBK转UTF-8编码转换
          const isSinaApi = prefix === '/api/sina';
          const contentType = String(proxyRes.headers['content-type'] || '');
          const isTextResponse = contentType.includes('text') || contentType.includes('javascript');

          if (isSinaApi && isTextResponse) {
            // 收集所有数据块
            const chunks: Buffer[] = [];
            responseStream.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
            });

            responseStream.on('end', () => {
              try {
                // 将GBK编码的Buffer转换为UTF-8字符串
                const gbkBuffer = Buffer.concat(chunks);
                const utf8String = iconv.decode(gbkBuffer, 'gbk');
                const utf8Buffer = Buffer.from(utf8String, 'utf-8');

                // 过滤掉可能导致解码问题的头部
                const filteredHeaders: Record<string, string | string[]> = {};
                for (const [key, value] of Object.entries(proxyRes.headers)) {
                  const lowerKey = key.toLowerCase();
                  if (
                    lowerKey === 'content-encoding' ||
                    lowerKey === 'content-length' ||
                    lowerKey === 'transfer-encoding'
                  ) {
                    continue;
                  }
                  if (value !== undefined) {
                    filteredHeaders[key] = value;
                  }
                }

                const outHeaders: http.OutgoingHttpHeaders = {
                  ...filteredHeaders,
                  'Content-Type':
                    contentType.replace(/charset=[^;]*/i, 'charset=utf-8') ||
                    'text/plain; charset=utf-8',
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                  'Access-Control-Allow-Headers': '*',
                };
                res.writeHead(proxyRes.statusCode || 500, outHeaders);
                res.end(utf8Buffer);
              } catch (error) {
                console.error('[embedded-proxy] 新浪API编码转换失败:', error);
                if (!res.headersSent) {
                  res.writeHead(500, { 'Content-Type': 'text/plain' });
                  res.end('Encoding conversion failed');
                }
              }
            });

            responseStream.on('error', (err) => {
              console.error('[embedded-proxy] 新浪API流读取错误:', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Stream read error');
              }
            });

            return; // 提前返回，不执行后续的pipe逻辑
          }

          // 非新浪API或二进制响应，直接转发
          // 过滤掉可能导致解码问题的头部
          const filteredHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            const lowerKey = key.toLowerCase();
            // 跳过会导致解码问题的头部
            if (
              lowerKey === 'content-encoding' ||
              lowerKey === 'content-length' ||
              lowerKey === 'transfer-encoding'
            ) {
              continue;
            }
            if (value !== undefined) {
              filteredHeaders[key] = value;
            }
          }

          const outHeaders: http.OutgoingHttpHeaders = {
            ...filteredHeaders,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          };
          res.writeHead(proxyRes.statusCode || 500, outHeaders);
          responseStream.pipe(res);
        });

        proxyReq.on('error', (err: NodeJS.ErrnoException) => {
          const msg = err.message || '';
          const retryable =
            attempt < 2 &&
            (err.code === 'ECONNRESET' ||
              err.code === 'EPIPE' ||
              err.code === 'ETIMEDOUT' ||
              /socket hang up/i.test(msg));
          if (retryable) {
            const delay = 2500 * (attempt + 1);
            console.warn(
              `[embedded-proxy] 上游 ${err.code || msg}，${delay}ms 后重试 (第${attempt + 1}次)`
            );
            setTimeout(() => sendUpstream(attempt + 1), delay);
            return;
          }
          console.error('[embedded-proxy] request error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy request failed');
          }
        });

        if (req.method === 'GET' || req.method === 'HEAD') {
          proxyReq.end();
        } else {
          req.pipe(proxyReq);
        }
      };

      sendUpstream(0);
    });

    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

export function stopEmbeddedApiProxy(server: Server | null): void {
  if (server) {
    server.close();
  }
}
