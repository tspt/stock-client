---
name: stock-client
description: |
  This skill should be used when working with the stock-client Electron React TypeScript desktop application.
  It provides specialized knowledge about stock data structures, technical indicators (MA, MACD, KDJ, RSI, Bollinger Bands), 
  candlestick pattern recognition, opportunity filtering logic, and the project architecture.
  Trigger when: developing new features, adding technical indicators, creating opportunity filters, modifying stock analysis logic,
  or any task involving the stock-client codebase.
---

# Stock Client Skill

破忒头工具 (stock-client) 是一个基于 Electron + React + TypeScript 的股票管理桌面应用，提供自选股管理、K线图展示、技术指标分析、机会筛选等功能。

## 项目结构

```
src/
├── components/          # UI组件
│   ├── ColumnSettings/      # 列设置
│   ├── GroupManager/        # 分组管理
│   ├── GroupTabs/           # 分组标签
│   ├── KLineChart/          # K线图 (ECharts)
│   ├── OpportunityTable/     # 机会分析表格
│   ├── OverviewTable/       # 数据概况表格
│   ├── PriceAlert/          # 价格提醒
│   ├── SearchBar/           # 股票搜索
│   ├── StockList/           # 自选股列表
│   └── ThemeToggle/         # 主题切换
├── pages/
│   ├── ListPage/            # 自选股列表页
│   ├── DetailPage/          # K线详情页
│   ├── AlertPage/           # 提醒管理页
│   ├── OverviewPage/        # 数据概况页
│   └── OpportunityPage/     # 机会分析页
├── stores/               # Zustand状态管理
│   ├── stockStore.ts        # 股票状态
│   ├── alertStore.ts        # 提醒状态
│   ├── opportunityStore.ts  # 机会分析状态
│   └── themeStore.ts        # 主题状态
├── hooks/                # 自定义Hooks
├── services/             # API服务
│   ├── stockApi.ts          # 股票API
│   └── opportunityService.ts # 机会分析服务
├── utils/                # 工具函数
├── types/                # TypeScript类型定义
├── workers/              # Web Workers
│   └── opportunityFilterWorker.ts # 机会筛选Worker
└── App.tsx               # 根组件
```

## 核心数据类型

### 股票基础数据
- `StockInfo`: 股票基础信息 (code, name, market, groupIds)
- `StockQuote`: 实时行情 (price, change, changePercent, volume, amount)
- `StockDetail`: 基本面数据 (marketCap, peRatio, turnoverRate)
- `KLineData`: K线数据 (time, open, close, high, low, volume)

### 技术指标数据结构
- `TechnicalIndicator`: 包含 ma/macd/kdj/rsi
- `ConsolidationAnalysis`: 横盘分析结果
- `SharpMovePatternAnalysis`: 单日异动形态
- `TrendLineAnalysis`: 趋势线分析结果
- `StockOpportunityData`: 机会分析完整数据

## 技术指标计算工具

位于 `src/utils/technicalIndicators.ts`:

| 函数 | 功能 |
|------|------|
| `calculateRSI(klineData, period)` | 计算RSI指标 |
| `calculateMACD(klineData, fast, slow, signal)` | 计算MACD |
| `isMACDGoldenCross(dif, dea, index)` | 检测MACD金叉 |
| `isMACDDeathCross(dif, dea, index)` | 检测MACD死叉 |
| `hasMACDDivergence(klineData, dif, lookback)` | 检测MACD背离 |
| `calculateBollingerBands(klineData, period, stdDev)` | 计算布林带 |

## K线形态识别工具

位于 `src/utils/candlestickPatterns.ts`:

| 函数 | 形态 |
|------|------|
| `isHammer(kline)` | 锤头线 |
| `isShootingStar(kline)` | 射击之星 |
| `isDoji(kline, threshold)` | 十字星 |
| `isEngulfing(prev, curr)` | 吞没形态 |
| `isMorningStar(klines, index)` | 早晨之星 |
| `isEveningStar(klines, index)` | 黄昏之星 |
| `detectCandlestickPatternsInWindow(klineData, lookback)` | 回溯窗口内形态检测 |

## 机会筛选配置

位于 `src/types/opportunityFilter.ts` 的 `OpportunityFilterSnapshot`:
- 价格/市值/换手率/市盈率范围筛选
- KDJ的J值范围筛选
- 涨跌停统计筛选
- 横盘/趋势线/单日异动筛选
- RSI/MACD/布林带/K线形态/趋势形态筛选

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run electron:dev

# 仅Vite开发服务器
npm run dev

# 构建前端
npm run build

# 构建Electron
npm run build:electron

# 打包Windows安装包
npm run electron:build:win
```

## 开发指南

### 添加新的技术指标筛选
1. 在 `src/types/opportunityFilter.ts` 添加筛选字段
2. 在 `src/utils/technicalIndicators.ts` 实现计算函数
3. 在 `src/workers/opportunityFilterWorker.ts` 添加筛选逻辑
4. 在 `OpportunityFiltersPanel.tsx` 添加UI控件
5. 更新文档 `docs/机会分析新增筛选项实现说明.md`

### 修改K线周期
- 数据层: `KLinePeriod` 类型支持 1min/5min/15min/30min/60min/day/week/month/year
- 界面层: 详情页提供 day/week/month/year 切换按钮
- 修改轮询: 更新 `KLINE_POLLING_INTERVAL_MS` 常量

### Web Worker筛选流程
1. 主线程传递 `OpportunityFilterSnapshot` 和 `analysisData`
2. Worker 接收后执行筛选计算
3. 筛选条件变更有 300ms 防抖
4. 支持取消操作 (`cancel` 消息类型)

### IndexedDB 数据存储
- 机会分析数据: `OPPORTUNITY_DB_NAME` / `OPPORTUNITY_STORE_NAME`
- 数据概况数据: `OVERVIEW_DB_NAME` / `OVERVIEW_STORE_NAME`
- 缓存管理: `MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES` (400条)

## 参考文档

详细的技术指标计算说明和筛选逻辑参考:
- `references/technical-indicators.md` - 技术指标详解
- `references/opportunity-filters.md` - 机会筛选配置说明
