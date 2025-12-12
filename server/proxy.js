/**
 * 本地代理服务器
 * 用于解决API的403和CORS问题
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const PROXY_PORT = 3000;

// 代理配置
const PROXY_CONFIG = {
  '/api/sina': {
    target: 'https://hq.sinajs.cn',
    referer: 'https://finance.sina.com.cn',
    origin: 'https://finance.sina.com.cn',
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

// 创建代理服务器
const server = http.createServer((req, res) => {
  // 处理CORS预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  // 查找匹配的代理配置
  let proxyConfig = null;
  let proxyPath = '';

  for (const [path, config] of Object.entries(PROXY_CONFIG)) {
    if (req.url.startsWith(path)) {
      proxyConfig = config;
      // 对于K线API，保留完整路径
      // if (path === '/api/kline') {
      //   proxyPath = req.url.replace('/api/kline', '/ifzqgtimg/appstock/app/newfqkline/get');
      // } else {
      proxyPath = req.url.replace(path, '');
      // }
      break;
    }
  }

  if (!proxyConfig) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Proxy path not found');
    return;
  }

  // 构建目标URL
  // 处理查询参数
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const pathWithoutQuery = proxyPath.split('?')[0];
  const targetPath = pathWithoutQuery || '/';
  const targetUrl = proxyConfig.target + targetPath + (queryString ? '?' + queryString : '');

  const url = new URL(targetUrl);

  // 准备请求选项
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      Referer: proxyConfig.referer,
      Origin: proxyConfig.origin,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Host: url.hostname,
    },
  };

  // 删除可能冲突的请求头
  delete options.headers['host'];
  delete options.headers['connection'];

  // console.log(`[代理] ${req.method} ${req.url} -> ${options.hostname}${options.path}`);

  // 选择HTTP或HTTPS模块
  const httpModule = url.protocol === 'https:' ? https : http;

  // 发送代理请求
  const proxyReq = httpModule.request(options, (proxyRes) => {
    // 设置CORS响应头
    const headers = {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[代理] 请求错误:`, err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy request failed');
  });

  // 转发请求体
  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
  console.log(`[代理服务器] 启动成功，监听端口 ${PROXY_PORT}`);
  console.log(`[代理服务器] 新浪API代理: http://localhost:${PROXY_PORT}/api/sina`);
  console.log(`[代理服务器] 腾讯API代理: http://localhost:${PROXY_PORT}/api/tencent`);
});

// 处理服务器错误
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[代理服务器] 端口 ${PROXY_PORT} 已被占用，尝试使用其他端口...`);
  } else {
    console.error(`[代理服务器] 错误:`, err);
  }
});
