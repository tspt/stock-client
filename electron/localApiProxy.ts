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
  '/api/eastmoney': {
    target: 'https://push2.eastmoney.com',
    referer: 'https://data.eastmoney.com',
    origin: 'https://data.eastmoney.com',
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
        Cookie:
          req.headers.cookie ||
          'qgqp_b_id=51d6d555c5e243b0256ceb1ac9c36628; st_nvi=TnWN91Owg3cX5WszqJeo-f8e2; nid18=0d86f08b814c455b1d6ebd09256a5ade; nid18_create_time=1775911116025; gviem=VcbSKTlarodHzNMYoAptO452f; gviem_create_time=1775911116025; fullscreengg=1; fullscreengg2=1; st_si=84713527048044; st_pvi=13325294659680; st_sp=2025-03-30%2015%3A14%3A18; st_inirUrl=https%3A%2F%2Femcreative.eastmoney.com%2F; st_sn=10; st_psi=20260417210401477-113200301353-6617435904; st_asi=delete',
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
