# API 403 问题解决方案

## 问题描述

在 Electron 应用中调用新浪财经/腾讯财经 API 时遇到 403 Forbidden 错误，原因是服务器检查了 Referer 头，而 Electron 应用使用的是本地地址（localhost）。

## 解决方案

### 方案 1：Electron 请求拦截（已实现，推荐）✅

**优点：**

- 无需额外服务器
- 实现简单
- 性能好，无额外网络开销
- 适合生产环境

**实现方式：**
在 Electron 主进程中使用 `session.webRequest` API 拦截请求并修改请求头。

**代码位置：** `electron/main.ts` 中的 `setupRequestInterceptor()` 函数

**原理：**

- 拦截所有对目标 API 的请求
- 自动添加正确的 Referer、Origin 和 User-Agent 头
- 透明处理，前端代码无需修改

---

### 方案 2：本地 Node.js 代理服务器

**优点：**

- 完全控制请求和响应
- 可以添加缓存、日志等功能
- 可以处理复杂的请求转换

**缺点：**

- 需要额外的服务器进程
- 增加系统复杂度
- 需要管理服务器生命周期

**实现步骤：**

1. 创建代理服务器文件 `server/proxy.js`：

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());

// 代理新浪财经API
app.use(
  '/api/sina',
  createProxyMiddleware({
    target: 'https://hq.sinajs.cn',
    changeOrigin: true,
    pathRewrite: {
      '^/api/sina': '',
    },
    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader('Referer', 'https://finance.sina.com.cn');
      proxyReq.setHeader('Origin', 'https://finance.sina.com.cn');
    },
  })
);

// 代理腾讯财经API
app.use(
  '/api/tencent',
  createProxyMiddleware({
    target: 'https://qt.gtimg.cn',
    changeOrigin: true,
    pathRewrite: {
      '^/api/tencent': '',
    },
    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader('Referer', 'https://finance.qq.com');
      proxyReq.setHeader('Origin', 'https://finance.qq.com');
    },
  })
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
```

2. 修改前端 API 调用，使用代理地址：

```typescript
const API_BASE = {
  SINA: 'http://localhost:3000/api/sina',
  TENCENT: 'http://localhost:3000/api/tencent',
};
```

3. 在 Electron 主进程中启动代理服务器：

```typescript
import { spawn } from 'child_process';
import { join } from 'path';

// 启动代理服务器
const proxyServer = spawn('node', [join(__dirname, '../server/proxy.js')]);

app.on('before-quit', () => {
  proxyServer.kill();
});
```

---

### 方案 3：禁用 WebSecurity（仅开发环境）

**优点：**

- 实现最简单
- 无需修改代码

**缺点：**

- **不安全，仅用于开发环境**
- 会禁用所有安全策略
- 不适合生产环境

**实现方式：**
在创建 BrowserWindow 时设置 `webSecurity: false`：

```typescript
mainWindow = new BrowserWindow({
  webPreferences: {
    webSecurity: false, // ⚠️ 仅开发环境使用
    // ... 其他配置
  },
});
```

---

### 方案 4：使用 Electron Session API 设置默认请求头

**优点：**

- 可以设置全局默认请求头
- 不需要拦截每个请求

**缺点：**

- 可能不够灵活
- 某些服务器可能检查其他信息

**实现方式：**

```typescript
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.includes('sinajs.cn') || details.url.includes('gtimg.cn')) {
      details.requestHeaders['Referer'] = 'https://finance.sina.com.cn';
      details.requestHeaders['Origin'] = 'https://finance.sina.com.cn';
    }
    callback({ requestHeaders: details.requestHeaders });
  });
});
```

---

## 推荐方案

**当前已实现：方案 1（Electron 请求拦截）**

这是最佳方案，因为：

1. ✅ 无需额外服务器
2. ✅ 性能好
3. ✅ 安全可靠
4. ✅ 适合生产环境
5. ✅ 代码简洁

如果方案 1 无法解决问题，可以尝试：

- **开发环境**：使用方案 3（禁用 webSecurity）
- **需要更多控制**：使用方案 2（代理服务器）

---

## 测试验证

修改后，重新编译并运行：

```bash
npm run build:electron
npm run electron:dev
```

在开发者工具中检查网络请求，确认：

1. Referer 头已正确设置
2. 请求返回 200 状态码
3. 数据正常返回
