# 东方财富 Cookie 动态管理方案

> **创建时间**: 2026-04-21  
> **最后更新**: 2026-04-21  
> **状态**: 待实施

---

## 📋 问题背景

### 当前状况

在访问东方财富 API 时发现：

1. **Cookie 每次访问都会变化** - 包含动态生成的会话标识和时间戳
2. **Cookie 会过期失效** - 硬编码的 Cookie 无法长期使用
3. **反爬机制严格** - 缺少有效 Cookie 会被拒绝访问或返回空数据

### Cookie 变化规律分析

通过分析多个 Cookie 样本（见 `cookie.txt`），发现以下规律：

#### 固定不变的字段

```
qgqp_b_id=fd824dd913c583c0de94b276eb9b41b8  (从第2次访问后固定)
nid18=0d86f08b814c455b1d6ebd09256a5ade      (始终不变)
fullscreengg=1                               (始终为1)
fullscreengg2=1                              (始终为1)
st_asi=delete                                (始终为delete)
```

#### 时间相关字段（每次更新）

```
nid18_create_time=1776785747893     // 时间戳，每次访问更新
gviem_create_time=1776785747894     // 与 nid18_create_time 相同或相差1ms
st_sp=2026-04-21%2023%3A35%3A46    // URL编码的访问时间
st_psi=20260421233546798-...        // 包含时间信息的长字符串
```

#### 随机生成字段（每次不同）

```
st_nvi=TnWN91Owg3cX5WszqJeo-f8e2   // 随机字符串
gviem=VcbSKTlarodHzNMYoAptO452f    // 随机字符串
st_si=12295033606911               // 随机数字ID
st_pvi=13325294659680              // 随机数字ID
st_sn=11                           // 会话编号，在范围内变化
```

### 为什么需要动态管理？

1. **防重放攻击** - 服务器通过时间戳和随机 ID 防止请求重用
2. **用户追踪** - 多个唯一标识符用于追踪用户行为
3. **安全验证** - 动态参数增加自动化脚本难度
4. **负载均衡** - 不同 session 可能路由到不同服务器

---

## 🔍 当前项目实现分析

### Cookie 配置位置

#### 1. 环境变量文件 (`.env`)

```env
VITE_EASTMONEY_COOKIE=  # 当前为空
```

#### 2. API 配置文件 (`src/config/apiConfig.ts`)

```typescript
export const EASTMONEY_COOKIE =
  import.meta.env.VITE_EASTMONEY_COOKIE ||
  'qgqp_b_id=bbc0617e3cb2dc57a01a180bf42c5699; st_nvi=ag3tM1_X60y-i0DWTE3xN8d49; ...';
```

**问题**: Cookie 硬编码在代码中，失效后需要手动修改代码

#### 3. Vite 代理配置 (`vite.config.ts`)

```typescript
'/api/eastmoney': {
  target: 'https://push2.eastmoney.com',
  headers: {
    Cookie: env.VITE_EASTMONEY_COOKIE || '',  // 从环境变量读取
  },
}
```

#### 4. Electron 代理 (`electron/localApiProxy.ts`)

```typescript
headers: {
  Cookie: req.headers.cookie || '',  // 透传客户端 Cookie
}
```

### 使用场景

Cookie 被用于以下 API 请求：

- 概念板块数据 (`src/services/hot/eastmoney-sectors.ts`)
- 指数数据 (`src/services/hot/indices.ts`)
- 行业板块数据 (`src/services/hot/concept-sectors.ts`)
- 财务数据 (`src/services/fundamental/api.ts`)

所有请求都通过以下方式携带 Cookie：

```typescript
const response = await fetch(url, {
  headers: {
    Cookie: EASTMONEY_COOKIE,
  },
});
```

---

## 💡 解决方案设计

### 方案对比

| 方案                        | 优点                           | 缺点                               | 复杂度   | 推荐度     |
| --------------------------- | ------------------------------ | ---------------------------------- | -------- | ---------- |
| **方案 A: 浏览器自动获取**  | 完全自动化，Cookie 永不过期    | 需要隐藏 BrowserWindow，首次加载慢 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **方案 B: 手动更新 Cookie** | 实现简单，可控性强             | 需用户定期手动操作，体验差         | ⭐       | ⭐⭐       |
| **方案 C: Cookie 池轮换**   | 兼顾自动化和可靠性，有降级方案 | 实现较复杂                         | ⭐⭐⭐   | ⭐⭐⭐⭐⭐ |

---

## 🎯 推荐实施方案：Cookie 池管理 + 健康检查

### 核心功能设计

#### 1. Cookie 池管理器 (`src/utils/cookiePool.ts`)

```typescript
interface CookieEntry {
  id: string; // Cookie唯一标识
  value: string; // Cookie字符串
  createdAt: number; // 创建时间
  lastUsedAt: number; // 最后使用时间
  successCount: number; // 成功请求次数
  failureCount: number; // 失败请求次数
  isActive: boolean; // 是否激活
  healthScore: number; // 健康评分 (0-100)
}

class CookiePoolManager {
  private cookies: CookieEntry[] = [];
  private currentIndex: number = 0;

  // 添加Cookie
  addCookie(cookieString: string): void;

  // 获取下一个可用Cookie
  getNextCookie(): string | null;

  // 标记Cookie使用结果
  reportSuccess(cookieId: string): void;
  reportFailure(cookieId: string): void;

  // 移除失效Cookie
  removeCookie(cookieId: string): void;

  // 获取健康状态
  getHealthStatus(): {
    total: number;
    active: number;
    avgHealthScore: number;
  };

  // 持久化到localStorage
  saveToStorage(): void;
  loadFromStorage(): void;
}
```

#### 2. Cookie 健康检查器

```typescript
class CookieHealthChecker {
  // 测试Cookie有效性
  async testCookie(cookie: string): Promise<boolean> {
    try {
      const response = await fetch('/api/eastmoney/test', {
        headers: { Cookie: cookie },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // 定期检查所有Cookie
  async checkAllCookies(): Promise<void> {
    for (const cookie of this.cookiePool.getAll()) {
      const isValid = await this.testCookie(cookie.value);
      if (!isValid) {
        this.cookiePool.deactivate(cookie.id);
      }
    }
  }
}
```

#### 3. 自动切换中间件

```typescript
// 增强fetch函数，自动重试和切换Cookie
async function fetchWithCookieRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const maxRetries = 3;

  for (let i = 0; i < maxRetries; i++) {
    const cookie = cookiePool.getNextCookie();

    if (!cookie) {
      throw new Error('没有可用的Cookie');
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Cookie: cookie,
        },
      });

      if (response.ok) {
        cookiePool.reportSuccess(getCurrentCookieId());
        return response;
      }

      // 请求失败，标记Cookie并尝试下一个
      cookiePool.reportFailure(getCurrentCookieId());
    } catch (error) {
      cookiePool.reportFailure(getCurrentCookieId());

      if (i === maxRetries - 1) {
        throw error;
      }
    }
  }

  throw new Error('所有Cookie都已失效');
}
```

#### 4. UI 管理界面 (`src/components/CookieManager/`)

功能包括：

- 显示当前 Cookie 池状态
- 添加新 Cookie（文本框粘贴）
- 删除失效 Cookie
- 一键测试所有 Cookie
- 查看使用统计
- 设置提醒（Cookie 数量低于阈值时通知）

---

### 实施步骤

#### Phase 1: 基础架构（优先级：高）

1. **创建 Cookie 池管理器**

   - [ ] 实现 `CookiePoolManager` 类
   - [ ] 实现 localStorage 持久化
   - [ ] 添加基本的 CRUD 操作

2. **集成到现有代码**

   - [ ] 修改 `apiConfig.ts` 从 Cookie 池获取
   - [ ] 更新所有使用 `EASTMONEY_COOKIE` 的地方
   - [ ] 保持向后兼容（如果池为空，使用环境变量）

3. **初始 Cookie 导入**
   - [ ] 提供工具解析 `cookie.txt` 格式
   - [ ] 批量导入 6 个 Cookie 到池中

#### Phase 2: 健康检查（优先级：中）

4. **实现健康检查机制**

   - [ ] 创建 `CookieHealthChecker` 类
   - [ ] 实现定时检查（每小时）
   - [ ] 实现请求失败时的即时检查

5. **自动切换逻辑**
   - [ ] 实现 `fetchWithCookieRetry` 包装函数
   - [ ] 替换现有的 fetch 调用
   - [ ] 添加重试日志

#### Phase 3: 用户界面（优先级：低）

6. **开发管理界面**

   - [ ] 创建 `CookieManager` 组件
   - [ ] 添加到设置页面
   - [ ] 实现可视化统计

7. **通知系统**
   - [ ] Cookie 失效时桌面通知
   - [ ] 定期提醒更新 Cookie

#### Phase 4: 高级功能（可选）

8. **自动化获取脚本**
   - [ ] 创建 Puppeteer 脚本
   - [ ] 集成到 Electron 主进程
   - [ ] 提供"一键刷新 Cookie"按钮

---

## 📁 文件结构规划

```
src/
├── utils/
│   ├── cookiePool.ts              # Cookie池管理器（新增）
│   ├── cookieHealthChecker.ts     # 健康检查器（新增）
│   └── fetchWithRetry.ts          # 带重试的fetch封装（新增）
├── components/
│   └── CookieManager/             # Cookie管理UI（新增）
│       ├── CookieManager.tsx
│       ├── CookieManager.module.css
│       └── index.ts
├── config/
│   └── apiConfig.ts               # 修改：从Cookie池获取
└── services/
    ├── hot/
    │   ├── eastmoney-sectors.ts   # 修改：使用新的fetch封装
    │   ├── indices.ts             # 修改：使用新的fetch封装
    │   └── concept-sectors.ts     # 修改：使用新的fetch封装
    └── fundamental/
        └── api.ts                 # 修改：使用新的fetch封装

docs/
└── Cookie管理/
    ├── 01-Cookie动态管理方案.md   # 本文档
    ├── 02-使用指南.md             # 用户使用说明（待创建）
    └── 03-技术实现细节.md         # 开发者文档（待创建）
```

---

## 🔧 技术要点

### 1. Cookie 存储安全

```typescript
// 使用 localStorage 加密存储（可选）
import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'eastmoney_cookie_pool';
const ENCRYPTION_KEY = import.meta.env.VITE_COOKIE_ENCRYPTION_KEY;

function encryptCookies(cookies: CookieEntry[]): string {
  return CryptoJS.AES.encrypt(JSON.stringify(cookies), ENCRYPTION_KEY).toString();
}

function decryptCookies(encrypted: string): CookieEntry[] {
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}
```

### 2. 健康评分算法

```typescript
function calculateHealthScore(cookie: CookieEntry): number {
  const now = Date.now();
  const ageInHours = (now - cookie.createdAt) / (1000 * 60 * 60);

  // 基础分100
  let score = 100;

  // 根据成功率调整
  const totalRequests = cookie.successCount + cookie.failureCount;
  if (totalRequests > 0) {
    const successRate = cookie.successCount / totalRequests;
    score *= successRate;
  }

  // 根据年龄衰减（超过24小时每小时减1分）
  if (ageInHours > 24) {
    score -= ageInHours - 24;
  }

  // 最低0分，最高100分
  return Math.max(0, Math.min(100, score));
}
```

### 3. 智能选择策略

```typescript
getNextCookie(): string | null {
  // 过滤出活跃的Cookie
  const activeCookies = this.cookies.filter(c => c.isActive);

  if (activeCookies.length === 0) {
    return null;
  }

  // 按健康评分排序，优先使用高分Cookie
  activeCookies.sort((a, b) => b.healthScore - a.healthScore);

  // 加权随机选择（避免总是用同一个）
  const topCookies = activeCookies.slice(0, 3); // 取前3个
  const selected = topCookies[Math.floor(Math.random() * topCookies.length)];

  selected.lastUsedAt = Date.now();
  return selected.value;
}
```

---

## 📊 监控和日志

### 关键指标

```typescript
interface CookieMetrics {
  totalRequests: number; // 总请求数
  successfulRequests: number; // 成功请求数
  failedRequests: number; // 失败请求数
  cookieSwitches: number; // Cookie切换次数
  averageResponseTime: number; // 平均响应时间
  currentActiveCookies: number; // 当前活跃Cookie数
}
```

### 日志记录

```typescript
// 使用现有的 logger
logger.info('[CookiePool] 切换到新Cookie', {
  cookieId: selected.id,
  healthScore: selected.healthScore,
  reason: 'previous_failed',
});

logger.warn('[CookiePool] Cookie失效', {
  cookieId: failed.id,
  failureCount: failed.failureCount,
  lastError: errorMessage,
});
```

---

## ⚠️ 注意事项

### 1. Cookie 获取方式

**手动获取步骤**：

1. 打开浏览器访问 https://data.eastmoney.com
2. 按 F12 打开开发者工具
3. 切换到 Network 标签
4. 刷新页面
5. 找到任意 eastmoney.com 的请求
6. 复制 Request Headers 中的 Cookie 值
7. 粘贴到应用的 Cookie 管理界面

### 2. Cookie 有效期

- **短期 Cookie**: 几小时到几天
- **长期 Cookie**: 可能持续数周
- **建议**: 保持至少 3-5 个有效 Cookie 轮换

### 3. 频率限制

即使使用多个 Cookie，也需要注意：

- 单个 IP 的请求频率限制
- 避免短时间内大量请求
- 实现请求间隔控制

```typescript
// 简单的速率限制
class RateLimiter {
  private requests: number[] = [];
  private maxRequestsPerMinute: number = 60;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < 60000);

    if (this.requests.length >= this.maxRequestsPerMinute) {
      const waitTime = 60000 - (now - this.requests[0]);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.requests.push(now);
  }
}
```

### 4. 错误处理

```typescript
try {
  const data = await fetchEastMoneyData();
} catch (error) {
  if (error.message.includes('没有可用的Cookie')) {
    // 提示用户添加新Cookie
    showNotification('Cookie已全部失效，请添加新的Cookie');
    openCookieManager();
  } else if (error.message.includes('HTTP 403')) {
    // 可能是IP被封，需要等待
    showNotification('请求被拒绝，请稍后重试');
  }
}
```

---

## 🚀 下一步行动

### 立即可做

1. **整理现有 Cookie**

   - 从 `cookie.txt` 中提取 6 个 Cookie
   - 验证哪些仍然有效
   - 准备导入到 Cookie 池

2. **开始实施 Phase 1**
   - 创建 `cookiePool.ts`
   - 实现基础的增删改查
   - 集成到现有代码

### 明天继续

1. 确认实施方案（方案 C：Cookie 池管理）
2. 开始编写代码
3. 测试 Cookie 轮换功能
4. 验证 API 请求是否正常

### 长期优化

1. 添加自动化 Cookie 获取（Puppeteer）
2. 实现更智能的健康检查
3. 添加性能监控面板
4. 优化 Cookie 选择算法

---

## 📝 参考资料

### 相关文档

- [东方财富 API 文档](./东方财富.md)
- [API 代理配置](../api-proxy-solutions.md)
- [常见陷阱：Cookie 配置](../常见问题/)

### 记忆要点

- ✅ 东方财富 API 必须携带有效 Cookie
- ✅ data.eastmoney.com 需要独立代理配置
- ✅ Cookie 包含动态时间戳和随机 ID
- ✅ 不能硬编码 Cookie，需要动态管理

---

## 💬 沟通记录

**2026-04-21**:

- 分析了 Cookie 变化规律
- 确定了 Cookie 池管理方案
- 设计了完整的实施计划
- 创建了本文档供后续参考

**待确认事项**:

- [ ] 确认采用方案 C（Cookie 池管理）
- [ ] 确认是否需要自动化获取脚本
- [ ] 确认 Cookie 更新频率要求
- [ ] 确认是否需要加密存储

---

**文档版本**: v1.0  
**作者**: AI Assistant  
**审核状态**: 待用户确认
