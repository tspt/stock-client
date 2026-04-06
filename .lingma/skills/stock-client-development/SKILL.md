---
name: stock-client-development
description: 破忒头工具桌面应用开发指南，包含项目架构、技术栈、核心功能和开发规范。用于开发和维护基于Electron+React的股票管理分析应用。
---

# 破忒头工具开发指南

## 项目概述

这是一个基于 Electron + React + TypeScript 开发的股票管理分析桌面应用，提供自选股管理、K 线图展示、技术指标分析、机会筛选等功能。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件库**: Ant Design 5
- **图表库**: ECharts
- **桌面框架**: Electron
- **状态管理**: Zustand
- **数据源**: 新浪财经/腾讯财经 API

## 项目结构

```
stock-client/
├── electron/                # Electron主进程与预加载
│   ├── main.ts              # 主进程入口
│   ├── preload.ts           # 预加载脚本
│   └── tsconfig.json
├── src/
│   ├── components/          # UI组件
│   │   ├── KLineChart/      # K线图(ECharts)
│   │   ├── OpportunityTable/# 机会分析结果表
│   │   ├── OverviewTable/   # 数据概况表格
│   │   ├── StockList/       # 自选股列表
│   │   └── ...
│   ├── pages/               # 页面组件
│   │   ├── ListPage/        # 股票列表页
│   │   ├── DetailPage/      # 股票详情页
│   │   ├── OpportunityPage/ # 机会分析页
│   │   ├── OverviewPage/    # 数据概况页
│   │   └── AlertPage/       # 提醒管理页
│   ├── services/            # API服务
│   │   ├── stockApi.ts      # 股票API接口
│   │   ├── opportunityService.ts # 机会分析服务
│   │   └── overviewService.ts    # 数据概况服务
│   ├── hooks/               # 自定义Hooks
│   │   ├── usePolling.ts    # 轮询Hook
│   │   ├── useStockList.ts  # 股票列表Hook
│   │   └── useOpportunityFilterEngine.ts # 机会筛选引擎
│   ├── stores/              # 状态管理(Zustand)
│   │   ├── stockStore.ts    # 股票状态
│   │   ├── opportunityStore.ts # 机会分析状态
│   │   └── overviewStore.ts # 数据概况状态
│   ├── utils/               # 工具函数
│   │   ├── indicators.ts    # 技术指标计算
│   │   ├── consolidationAnalysis.ts # 横盘分析
│   │   ├── trendLineAnalysis.ts     # 趋势线分析
│   │   ├── sharpMovePatterns.ts     # 单日异动形态
│   │   └── concurrencyManager.ts    # 并发管理器
│   ├── workers/             # Web Worker
│   │   └── opportunityFilterWorker.ts # 机会筛选Worker
│   └── types/               # 类型定义
│       ├── stock.ts         # 股票相关类型
│       └── common.ts        # 通用类型
└── docs/                    # 专题文档
```

## 核心功能模块

### 1. 股票管理

- 自选股增删改查
- 分组管理(最多 10 个分组)
- 实时行情轮询(10 秒间隔)
- 股票代码搜索

### 2. K 线图展示

- 支持日/周/月/年周期切换
- 技术指标显示(MA, MACD, KDJ, RSI)
- ECharts 图表渲染

### 3. 机会分析

- 横盘结构识别(低位稳定/高位稳定/箱体)
- 趋势线分析(沿 MA5 上升趋势)
- 单日异动形态(S1/S2/P1-P4)
- Web Worker 异步计算
- 筛选条件防抖(300ms)

### 4. 数据概况

- 批量股票数据分析
- 并发控制(默认 5 个并发)
- IndexedDB 缓存历史数据
- 多维度指标统计

### 5. 价格提醒

- 价格/涨跌幅提醒
- 系统托盘/桌面通知
- 时间周期设置(当天/本周/本月/永久)

## 关键技术实现

### 并发控制

使用`ConcurrencyManager`类管理 API 请求并发：

```typescript
// 机会分析并发配置
OPPORTUNITY_CONCURRENT_LIMIT = 8; // 每批并发数
OPPORTUNITY_BATCH_DELAY = 500; // 批次间延迟(ms)

// 数据概况并发配置
OVERVIEW_CONCURRENT_LIMIT = 5;
OVERVIEW_BATCH_DELAY = 100;
```

### 数据存储

- **LocalStorage**: 用户配置、主题偏好等轻量数据
- **IndexedDB**: 历史分析数据、K 线缓存等大量数据
- **内存缓存**: 机会分析 K 线数据(Map 结构，上限 400 条)

### 性能优化

- 页面级懒加载(`lazy` + `Suspense`)
- 机会分析筛选在主线程做轻量过滤，重计算在 Web Worker
- K 线数据增量更新
- API 响应缓存

### 技术指标计算

```typescript
// MA移动平均线
MA_PERIODS = [5, 10, 20, 30, 60, 120, 240, 360];

// MACD参数
MACD_PARAMS = { fast: 12, slow: 26, signal: 9 };

// KDJ参数
KDJ_PARAMS = { n: 9, m1: 3, m2: 3 };

// RSI周期
RSI_PERIODS = [6, 12, 24];
```

## 开发规范

### 代码风格

- 使用 TypeScript 严格模式
- 组件采用函数式+Hooks
- CSS Modules 样式隔离
- 遵循 React 最佳实践

### 命名约定

- 组件: PascalCase (e.g., `StockList.tsx`)
- 工具函数: camelCase (e.g., `formatVolume`)
- 常量: UPPER_SNAKE_CASE (e.g., `POLLING_INTERVAL`)
- 类型接口: PascalCase (e.g., `StockInfo`)

### 文件组织

- 每个组件目录包含`.tsx`和`.module.css`
- 相关工具函数放在`utils/`目录
- 类型定义统一在`types/`目录
- 服务层接口在`services/`目录

### 错误处理

- API 调用必须包含 try-catch
- 失败时提供降级方案
- 记录警告日志但不阻塞主流程

## 常用开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run electron:dev

# 仅启动Vite开发服务器
npm run dev

# 构建前端
npm run build

# 构建Electron主进程
npm run build:electron

# 打包Windows应用
npm run electron:build:win
```

## 注意事项

1. **图标文件**: 打包时需要提供`build/icon.ico`
2. **跨域处理**: Electron 环境已配置 Referer 头解决跨域
3. **API 限制**: 第三方 API 可能有访问频率限制
4. **数据单位**: volume/amount 从"元"转为"亿"需除以 100000000
5. **缓存管理**: 机会分析 K 线缓存超过 400 条时删除最旧条目

## 扩展开发

### 添加新的技术指标

1. 在`utils/indicators.ts`中实现计算逻辑
2. 在`types/stock.ts`中添加类型定义
3. 在相关页面组件中集成显示

### 新增分析维度

1. 创建分析工具函数(如`utils/xxxAnalysis.ts`)
2. 在`opportunityService.ts`或`overviewService.ts`中调用
3. 更新类型定义和列配置
4. 在对应页面添加展示

### 修改并发策略

调整`utils/constants.ts`中的并发参数:

- `OPPORTUNITY_CONCURRENT_LIMIT`
- `OPPORTUNITY_BATCH_DELAY`
- `OVERVIEW_CONCURRENT_LIMIT`
- `OVERVIEW_BATCH_DELAY`

## 调试技巧

1. **查看网络请求**: Chrome DevTools Network 面板
2. **检查状态**: React DevTools 查看 Zustand store
3. **Worker 调试**: Chrome DevTools Sources 面板找到 Worker
4. **性能分析**: Performance 面板监控渲染和计算耗时
5. **IndexedDB**: Application 面板查看缓存数据

## 常见问题

### Q: 机会分析速度慢?

A: 检查并发配置，适当增加`OPPORTUNITY_CONCURRENT_LIMIT`或减少`OPPORTUNITY_BATCH_DELAY`

### Q: K 线图不更新?

A: 检查`useKLineData` hook 的轮询逻辑，确认`KLINE_POLLING_INTERVAL_MS`配置

### Q: 数据导出失败?

A: 检查`xlsx`库是否正确引入，确认数据格式符合 Excel 要求

### Q: 主题切换无效?

A: 检查`themeStore`状态是否正确持久化到 LocalStorage

## 参考文档

- [横盘分析参数说明](docs/横盘分析参数说明.md)
- [趋势线分析说明](docs/趋势线分析说明.md)
- [机会分析缓存与筛选](docs/机会分析缓存与筛选.md)
- [API 代理说明](docs/api-proxy-solutions.md)
