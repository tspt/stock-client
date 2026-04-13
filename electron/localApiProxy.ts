/**
 * 主进程内嵌 HTTP 代理（与 server/proxy.js 行为一致，不依赖子进程 / ELECTRON_RUN_AS_NODE）
 */
import http, { type Server } from 'http';
import https from 'https';
import { URL } from 'url';

const PROXY_CONFIG: Record<string, { target: string; referer: string; origin: string }> = {
  '/api/sina': {
    target: 'https://hq.sinajs.cn',
    referer: 'https://finance.sina.com.cn',
    origin: 'https://finance.sina.com.cn',
  },
  '/api/tencent/rank': {
    target: 'https://proxy.finance.qq.com',
    referer: 'https://finance.qq.com',
    origin: 'https://finance.qq.com',
  },
  '/api/tencent': {
    target: 'https://qt.gtimg.cn',
    referer: 'https://finance.qq.com',
    origin: 'https://finance.qq.com',
  },
  '/api/kline': {
    target: 'https://proxy.finance.qq.com',
    referer: 'https://proxy.finance.qq.com',
    origin: 'https://proxy.finance.qq.com',
  },
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

      const urlPath = req.url || '/';
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

      const targetPath = pathWithoutQuery || '/';
      const targetUrl = proxyConfig.target + targetPath + (queryString ? '?' + queryString : '');

      const u = new URL(targetUrl);
      const headers: http.OutgoingHttpHeaders = {
        ...req.headers,
        Referer: proxyConfig.referer,
        Origin: proxyConfig.origin,
        'User-Agent': UA,
        Host: u.hostname,
      };
      delete headers.host;
      delete headers.connection;

      const opt: https.RequestOptions = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: req.method,
        headers,
      };

      const httpModule = u.protocol === 'https:' ? https : http;
      const proxyReq = httpModule.request(opt, (proxyRes) => {
        const outHeaders: http.OutgoingHttpHeaders = {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        };
        res.writeHead(proxyRes.statusCode || 500, outHeaders);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('[embedded-proxy] request error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Proxy request failed');
      });

      req.pipe(proxyReq);
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
