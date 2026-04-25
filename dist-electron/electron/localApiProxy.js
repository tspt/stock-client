/**
 * 主进程内嵌 HTTP 代理（与 server/proxy.js 行为一致，不依赖子进程 / ELECTRON_RUN_AS_NODE）
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { net, session } from 'electron';
import CookiePoolManager from '../src/utils/storage/cookiePoolManager.js';
import { STOCK_CLIENT_COOKIE_POOL_HEADER, STOCK_CLIENT_UA_HEADER, } from '../src/utils/config/constants.js';
import { deriveEastmoneyRefererOrigin, isEastmoneyJsonpUrl } from './eastMoneyPush2Context.js';
function getEastmoneyPoolCookie(req) {
    const k = STOCK_CLIENT_COOKIE_POOL_HEADER.toLowerCase();
    const fromHeader = req.headers[k];
    if (typeof fromHeader === 'string' && fromHeader.length > 0)
        return fromHeader;
    if (Array.isArray(fromHeader) && fromHeader[0])
        return fromHeader[0];
    const raw = req.headers.cookie;
    if (typeof raw === 'string' && raw.length > 0)
        return raw;
    return '';
}
function getEastmoneyClientUaFromHeader(req) {
    const k = STOCK_CLIENT_UA_HEADER.toLowerCase();
    const from = req.headers[k];
    if (typeof from === 'string' && from.length > 0)
        return from;
    if (Array.isArray(from) && from[0])
        return from[0];
    return '';
}
/** Node `https` 头转 Chromium `ClientRequest`；Connection 等由网络栈自管。 */
function eastmoneyHeadersForChromium(h) {
    const out = {};
    for (const [k, v] of Object.entries(h)) {
        if (v === undefined)
            continue;
        if (k.toLowerCase() === 'connection')
            continue;
        if (Array.isArray(v)) {
            out[k] = v.map((x) => String(x));
        }
        else {
            out[k] = String(v);
        }
    }
    return out;
}
// ⚠️ 在模块初始化时加载环境变量（在读取 process.env 之前）
const envPath = resolve(process.cwd(), '.env');
dotenv.config({ path: envPath, override: true });
// 从环境变量读取配置（在 dotenv.config() 之后）
const DEFAULT_UA = process.env.VITE_USER_AGENT;
/** 主站 RST 时轮询同证书族边缘主机（经 DNS 解析为 trafficmanager，IP 与主站可能不同） */
const EM_PUSH2_FAILOVER_HOSTS = [
    'push2.eastmoney.com',
    '82.push2.eastmoney.com',
    '7.push2.eastmoney.com',
];
/**
 * 东财 push2：对端常掐 Node `https` / 渲染区 JSONP 同报 ERR_EMPTY_RESPONSE（TLS/指纹/频控）。
 * 同机回退时 upstream 用 Electron `net.request`（Chromium 网络栈，与 JSONP/浏览器一致）替代 Node `https`。
 */
const PROXY_CONFIG = {
    '/api/sina': {
        target: 'https://hq.sinajs.cn',
        referer: process.env.VITE_SINA_REFERER,
        origin: process.env.VITE_SINA_ORIGIN,
    },
    '/api/tencent/rank': {
        target: 'https://proxy.finance.qq.com',
        referer: process.env.VITE_TENCENT_RANK_REFERER,
        origin: process.env.VITE_TENCENT_RANK_ORIGIN,
    },
    '/api/tencent': {
        target: 'https://qt.gtimg.cn',
        referer: process.env.VITE_TENCENT_REFERER,
        origin: process.env.VITE_TENCENT_ORIGIN,
    },
    '/api/kline': {
        target: 'https://proxy.finance.qq.com',
        referer: process.env.VITE_KLINE_REFERER,
        origin: process.env.VITE_KLINE_ORIGIN,
    },
    '/api/eastmoney': {
        target: 'https://push2.eastmoney.com',
        referer: process.env.VITE_EASTMONEY_REFERER,
        origin: process.env.VITE_EASTMONEY_ORIGIN,
    },
};
/**
 * push2 行情接口与页面一致需带 wbp2u=|0|0|0|web；缺省时服务端常直接断连，浏览器侧表现为
 * net::ERR_EMPTY_RESPONSE。main 中 test-cookie 的测试 URL 也含该参数。
 */
function augmentPush2EastMoneyUrl(href) {
    try {
        const u = new URL(href);
        if (!/\.eastmoney\.com$/i.test(u.hostname) || !u.pathname.includes('/api/qt/')) {
            return href;
        }
        if (!u.searchParams.has('wbp2u')) {
            u.searchParams.set('wbp2u', '|0|0|0|web');
        }
        return u.toString();
    }
    catch {
        return href;
    }
}
const DATA_EASTMONEY_ORIGIN = 'https://data.eastmoney.com';
export function startEmbeddedApiProxy(port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            console.log('[代理服务器] 收到请求:', req.method, req.url);
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
                }
                catch {
                    /* 保持 urlPath 不变 */
                }
            }
            console.log('[代理服务器] 请求路径:', urlPath);
            let proxyConfig = null;
            let prefix = '';
            for (const [p, cfg] of Object.entries(PROXY_CONFIG)) {
                if (urlPath.startsWith(p)) {
                    proxyConfig = cfg;
                    prefix = p;
                    console.log('[代理服务器] 匹配到前缀:', prefix);
                    break;
                }
            }
            if (!proxyConfig) {
                console.error('[代理调试] 未找到匹配的代理配置，URL:', urlPath);
                console.error('[代理服务器] 可用的前缀:', Object.keys(PROXY_CONFIG));
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
            const forwardUrl = prefix === '/api/eastmoney' ? augmentPush2EastMoneyUrl(targetUrl) : targetUrl;
            const eastmoneyCtx = prefix === '/api/eastmoney'
                ? deriveEastmoneyRefererOrigin(forwardUrl, proxyConfig.referer || `${DATA_EASTMONEY_ORIGIN}/`, proxyConfig.origin || DATA_EASTMONEY_ORIGIN)
                : null;
            // 调试日志：记录东方财富请求详情
            if (prefix === '/api/eastmoney' && eastmoneyCtx) {
                console.log('[代理调试] 东方财富请求:');
                console.log('  - 原始URL:', urlPath);
                console.log('  - 前缀:', prefix);
                console.log('  - 代理路径:', proxyPath);
                console.log('  - 重写后路径:', pathWithoutQuery);
                console.log('  - 目标URL(未补全):', targetUrl);
                console.log('  - 目标URL(补全wbp2u后):', forwardUrl);
                console.log('  - env 中 Referer/Origin:', proxyConfig.referer, '|', proxyConfig.origin);
                console.log('  - 实际发送 Referer/Origin(按 fs 推导):', eastmoneyCtx.referer, '|', eastmoneyCtx.origin);
                const poolLen = getEastmoneyPoolCookie(req).length;
                console.log('  - 模拟请求类型:', isEastmoneyJsonpUrl(forwardUrl) ? 'JSONP(cb) / script' : 'Fetch/XHR');
                console.log('  - 池Cookie(经X头或Cookie):', poolLen > 0 ? '是' : '否', '长度:', poolLen);
            }
            const u = new URL(forwardUrl);
            // 确定使用的 User-Agent（优先渲染进程经 X-Stock-Client-User-Agent 与 Cookie 同源身份）
            let finalUA = DEFAULT_UA; // 默认使用环境变量中的 UA
            if (prefix === '/api/eastmoney') {
                const fromRenderer = getEastmoneyClientUaFromHeader(req);
                if (fromRenderer) {
                    finalUA = fromRenderer;
                    console.log('[代理调试]   - 使用渲染进程UA(X-Stock-Client-User-Agent):', finalUA.substring(0, 60) + '...');
                }
                else {
                    const requestCookie = getEastmoneyPoolCookie(req);
                    if (requestCookie) {
                        const cookiePool = CookiePoolManager.getInstance();
                        const allCookies = cookiePool.getAllCookies();
                        const matchedCookie = allCookies.find((c) => c.value === requestCookie);
                        if (matchedCookie && matchedCookie.userAgent) {
                            finalUA = matchedCookie.userAgent;
                            console.log('[代理调试]   - 使用Cookie池绑定的UA:', finalUA.substring(0, 60) + '...');
                        }
                        else {
                            console.log('[代理调试]   - 无X头亦无池内UA绑定，使用默认UA:', finalUA.substring(0, 60) + '...');
                        }
                    }
                    else {
                        console.log('[代理调试]   - 使用默认UA:', finalUA.substring(0, 60) + '...');
                    }
                }
            }
            // 东方财富：不得转发 Vite/浏览器 的整包 req.headers，其中 connection/content-length 等
            // hop-by-hop 或与本机/上游不一致的头会让对端在 TLS 上直接 RST（ECONNRESET / socket hang up）
            const headers = prefix === '/api/eastmoney' && eastmoneyCtx
                ? (() => {
                    const jsonp = isEastmoneyJsonpUrl(forwardUrl);
                    const poolCookie = getEastmoneyPoolCookie(req);
                    const h = {
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
                    const h = { ...req.headers };
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
            const sendUpstream = (attempt) => {
                const uReq = new URL(forwardUrl);
                if (prefix === '/api/eastmoney' && uReq.protocol === 'https:') {
                    const idx = Math.min(attempt, EM_PUSH2_FAILOVER_HOSTS.length - 1);
                    uReq.hostname = EM_PUSH2_FAILOVER_HOSTS[idx];
                    if (attempt > 0) {
                        console.warn(`[embedded-proxy] 东财 切换上游主机: ${uReq.hostname} (第${attempt}次重试，Chromium net.request)`);
                    }
                    const chHead = eastmoneyHeadersForChromium(headers);
                    const creq = net.request({
                        method: (req.method || 'GET'),
                        url: uReq.toString(),
                        session: session.defaultSession,
                        headers: chHead,
                    });
                    creq.on('response', (proxyRes) => {
                        if (prefix === '/api/eastmoney') {
                            if (attempt > 0) {
                                console.log('[代理调试] 东方财富响应 (Chromium net):', proxyRes.statusCode, proxyRes.statusMessage, `(重试第${attempt}次成功)`);
                            }
                            else {
                                console.log('[代理调试] 东方财富响应 (Chromium net):', proxyRes.statusCode, proxyRes.statusMessage);
                            }
                        }
                        // 过滤掉可能导致解码问题的头部
                        // Chromium net.request 已自动解压内容，但响应头仍保留 Content-Encoding
                        // 需要移除这些头，让 Node.js HTTP 服务器重新计算
                        const filteredHeaders = {};
                        for (const [key, value] of Object.entries(proxyRes.headers)) {
                            const lowerKey = key.toLowerCase();
                            // 跳过会导致解码问题的头部
                            if (lowerKey === 'content-encoding' ||
                                lowerKey === 'content-length' ||
                                lowerKey === 'transfer-encoding') {
                                continue;
                            }
                            if (value !== undefined) {
                                filteredHeaders[key] = value;
                            }
                        }
                        const outHeaders = {
                            ...filteredHeaders,
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': '*',
                        };
                        res.writeHead(proxyRes.statusCode || 500, outHeaders);
                        proxyRes.pipe(res);
                    });
                    creq.on('error', (err) => {
                        const msg = err.message || '';
                        const retryable = attempt < 2 &&
                            (err.code === 'ECONNRESET' ||
                                err.code === 'EPIPE' ||
                                err.code === 'ETIMEDOUT' ||
                                /socket hang up|aborted|net::/i.test(msg));
                        if (retryable) {
                            const delay = 2500 * (attempt + 1);
                            const nextHost = EM_PUSH2_FAILOVER_HOSTS[Math.min(attempt + 1, EM_PUSH2_FAILOVER_HOSTS.length - 1)];
                            console.warn(`[embedded-proxy] 东财上游(Chromium) ${err.code || msg}，${delay}ms 后重试 (第${attempt + 1}次) → 下一主机: ${nextHost}`);
                            setTimeout(() => sendUpstream(attempt + 1), delay);
                            return;
                        }
                        console.error('[embedded-proxy] request error (Chromium net):', err);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Proxy request failed');
                        }
                    });
                    if (req.method === 'GET' || req.method === 'HEAD') {
                        creq.end();
                    }
                    else {
                        req.pipe(creq);
                    }
                    return;
                }
                const uReq2 = new URL(forwardUrl);
                const requestOpt = {
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
                    // 过滤掉可能导致解码问题的头部
                    const filteredHeaders = {};
                    for (const [key, value] of Object.entries(proxyRes.headers)) {
                        const lowerKey = key.toLowerCase();
                        // 跳过会导致解码问题的头部
                        if (lowerKey === 'content-encoding' ||
                            lowerKey === 'content-length' ||
                            lowerKey === 'transfer-encoding') {
                            continue;
                        }
                        if (value !== undefined) {
                            filteredHeaders[key] = value;
                        }
                    }
                    const outHeaders = {
                        ...filteredHeaders,
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                    };
                    res.writeHead(proxyRes.statusCode || 500, outHeaders);
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', (err) => {
                    const msg = err.message || '';
                    const retryable = attempt < 2 &&
                        (err.code === 'ECONNRESET' ||
                            err.code === 'EPIPE' ||
                            err.code === 'ETIMEDOUT' ||
                            /socket hang up/i.test(msg));
                    if (retryable) {
                        const delay = 2500 * (attempt + 1);
                        console.warn(`[embedded-proxy] 上游 ${err.code || msg}，${delay}ms 后重试 (第${attempt + 1}次)`);
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
                }
                else {
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
export function stopEmbeddedApiProxy(server) {
    if (server) {
        server.close();
    }
}
