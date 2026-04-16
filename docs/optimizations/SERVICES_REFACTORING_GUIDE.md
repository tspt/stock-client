# Services 按路由重构完整指南

## 📋 目录

- [概述](#概述)
- [重构原则](#重构原则)
- [阶段 1: 文件移动](#阶段1-文件移动)
- [阶段 2: 创建索引文件](#阶段2-创建索引文件)
- [阶段 3: 更新引用路径](#阶段3-更新引用路径)
- [阶段 4: 验证与清理](#阶段4-验证与清理)
- [回退方案](#回退方案)

---

## 概述

### 目标

将 `src/services/` 下的服务文件按页面/功能模块重新组织，提升代码可维护性和可读性。

### 当前结构

```
src/services/
├── stockApi.ts
├── fundamentalApi.ts
├── tencentFinanceApi.ts
├── opportunityService.ts
├── overviewService.ts
├── aiAnalysisService.ts
├── notificationService.ts
├── notificationNavigation.ts
└── cacheManager.ts
```

### 目标结构

```
src/services/
├── hot/                    # 热门行情页面
│   ├── market.ts          # 市场概览
│   ├── sectors.ts         # 板块排行
│   └── index.ts
├── stocks/                 # 股票列表+详情
│   ├── api.ts
│   └── index.ts
├── alerts/                 # 提醒管理
│   ├── notification.ts
│   ├── navigation.ts
│   └── index.ts
├── overview/               # 数据概况
│   ├── analyzer.ts
│   └── index.ts
├── opportunity/            # 机会分析
│   ├── analyzer.ts
│   ├── ai.ts
│   └── index.ts
├── fundamental/            # 基本面分析
│   ├── api.ts
│   └── index.ts
├── core/                   # 核心基础设施
│   ├── cache.ts
│   └── index.ts
└── index.ts                # 统一导出（向后兼容）
```

---

## 重构原则

1. **零破坏性变更** - 通过统一导出保持向后兼容
2. **渐进式执行** - 逐个模块完成，每步验证
3. **保留原文件** - 直到所有引用更新完成再删除
4. **及时测试** - 每完成一个模块就运行 TypeScript 检查

---

## 阶段 1: 文件移动

### 1.1 hot/ 模块

```powershell
# 已创建 hot/market.ts
# 需要创建 hot/sectors.ts (从 tencentFinanceApi.ts 提取板块部分)
```

**操作步骤：**

1. ✅ `hot/market.ts` 已创建
2. ⏳ 创建 `hot/sectors.ts` - 从 `tencentFinanceApi.ts` 复制板块排行相关代码
3. ⏳ 创建 `hot/index.ts`

### 1.2 stocks/ 模块

```powershell
cd src/services
Copy-Item stockApi.ts stocks/api.ts
```

### 1.3 alerts/ 模块

```powershell
Copy-Item notificationService.ts alerts/notification.ts
Copy-Item notificationNavigation.ts alerts/navigation.ts
```

### 1.4 overview/ 模块

```powershell
Copy-Item overviewService.ts overview/analyzer.ts
```

### 1.5 opportunity/ 模块

```powershell
Copy-Item opportunityService.ts opportunity/analyzer.ts
Copy-Item aiAnalysisService.ts opportunity/ai.ts
```

### 1.6 fundamental/ 模块

```powershell
Copy-Item fundamentalApi.ts fundamental/api.ts
```

### 1.7 core/ 模块

```powershell
# 已完成
Copy-Item cacheManager.ts core/cache.ts
```

---

## 阶段 2: 创建索引文件

### 2.1 hot/index.ts

```typescript
/**
 * 热门行情服务模块
 */

export { getMarketOverview } from './market';
export type { MarketOverview } from './market';

export { getRisingSectors, getFallingSectors, getSectorRanks } from './sectors';
export type { SectorRankData } from '@/types/stock';
```

### 2.2 stocks/index.ts

```typescript
/**
 * 股票服务模块
 */

export {
  getAllStocks,
  getStockQuotes,
  getStockDetail,
  getKLineData,
  searchStockLocal,
} from './api';

export type { StockInfo, StockQuote, StockDetail, KLineData } from '@/types/stock';
```

### 2.3 alerts/index.ts

```typescript
/**
 * 提醒管理服务模块
 */

export { sendAlertNotification } from './notification';
export { initNotificationNavigation } from './navigation';
```

### 2.4 overview/index.ts

```typescript
/**
 * 数据概况服务模块
 */

export { analyzeAllStocks } from './analyzer';
export type { StockOverviewData, OverviewAnalysisResult } from '@/types/stock';
```

### 2.5 opportunity/index.ts

```typescript
/**
 * 机会分析服务模块
 */

export { analyzeAllStocksOpportunity } from './analyzer';
export { performAIAnalysis, predictTrend, findSimilarPatterns } from './ai';
export type {
  StockOpportunityData,
  AIAnalysisResult,
  TrendPrediction,
  SimilarPatternMatch,
} from '@/types/stock';
```

### 2.6 fundamental/index.ts

```typescript
/**
 * 基本面分析服务模块
 */

export { getFundamentalAnalysis } from './api';
export type {
  FundamentalAnalysis,
  FinancialStatement,
  ValuationAnalysis,
  IndustryComparison,
  ResearchReportSummary,
} from '@/types/stock';
```

### 2.7 core/index.ts

```typescript
/**
 * 核心服务模块
 */

export { cacheManager, apiCache } from './cache';
export type { CacheConfig } from './cache';
```

### 2.8 根目录 index.ts (向后兼容)

```typescript
/**
 * Services 统一导出
 * 提供向后兼容的接口，逐步迁移到新路径
 */

// Hot 模块
export { getMarketOverview, getRisingSectors, getFallingSectors, getSectorRanks } from './hot';
export type { MarketOverview } from './hot';

// Stocks 模块
export {
  getAllStocks,
  getStockQuotes,
  getStockDetail,
  getKLineData,
  searchStockLocal,
} from './stocks';

// Alerts 模块
export { sendAlertNotification } from './alerts';
export { initNotificationNavigation } from './alerts';

// Overview 模块
export { analyzeAllStocks } from './overview';

// Opportunity 模块
export { analyzeAllStocksOpportunity } from './opportunity';
export { performAIAnalysis, predictTrend, findSimilarPatterns } from './opportunity';

// Fundamental 模块
export { getFundamentalAnalysis } from './fundamental';

// Core 模块
export { cacheManager, apiCache } from './core';
export type { CacheConfig } from './core';
```

---

## 阶段 3: 更新引用路径

### 3.1 需要更新的文件清单

#### Stores (5 个)

- [ ] `src/stores/hotStore.ts`
- [ ] `src/stores/stockStore.ts`
- [ ] `src/stores/alertStore.ts`
- [ ] `src/stores/overviewStore.ts`
- [ ] `src/stores/opportunityStore.ts`

#### Hooks (5 个)

- [ ] `src/hooks/useStockList.ts`
- [ ] `src/hooks/useStockDetail.ts`
- [ ] `src/hooks/useKLineData.ts`
- [ ] `src/hooks/useAllStocks.ts`
- [ ] `src/hooks/useFundamentalAnalysis.ts`

#### Pages (1 个)

- [ ] `src/pages/HotPage/components/MarketSentimentCard.tsx`

#### 其他 (3 个)

- [ ] `src/App.tsx`
- [ ] `src/utils/apiCache.ts` (已更新)
- [ ] `src/services/opportunity/analyzer.ts` (内部引用)

### 3.2 更新示例

#### 示例 1: hotStore.ts

**修改前：**

```typescript
import { getMarketOverview, getSectorRanks } from '@/services/tencentFinanceApi';
import type { MarketOverview } from '@/services/tencentFinanceApi';
```

**修改后：**

```typescript
import { getMarketOverview, getSectorRanks } from '@/services/hot';
import type { MarketOverview } from '@/services/hot';
```

#### 示例 2: useStockList.ts

**修改前：**

```typescript
import { getStockQuotes } from '@/services/stockApi';
```

**修改后：**

```typescript
import { getStockQuotes } from '@/services/stocks';
```

#### 示例 3: App.tsx

**修改前：**

```typescript
import { initNotificationNavigation } from '@/services/notificationNavigation';
```

**修改后：**

```typescript
import { initNotificationNavigation } from '@/services/alerts';
```

### 3.3 批量替换命令

```powershell
# 在 VSCode 中使用全局搜索替换

# 1. tencentFinanceApi -> hot
查找: from '@/services/tencentFinanceApi'
替换: from '@/services/hot'

# 2. stockApi -> stocks
查找: from '@/services/stockApi'
替换: from '@/services/stocks'

# 3. fundamentalApi -> fundamental
查找: from '@/services/fundamentalApi'
替换: from '@/services/fundamental'

# 4. overviewService -> overview
查找: from '@/services/overviewService'
替换: from '@/services/overview'

# 5. opportunityService -> opportunity
查找: from '@/services/opportunityService'
替换: from '@/services/opportunity'

# 6. aiAnalysisService -> opportunity/ai
查找: from '@/services/aiAnalysisService'
替换: from '@/services/opportunity/ai'

# 7. notificationService -> alerts
查找: from '@/services/notificationService'
替换: from '@/services/alerts'

# 8. notificationNavigation -> alerts
查找: from '@/services/notificationNavigation'
替换: from '@/services/alerts'

# 9. cacheManager -> core
查找: from '@/services/cacheManager'
替换: from '@/services/core'
```

---

## 阶段 4: 验证与清理

### 4.1 TypeScript 编译检查

```powershell
npx tsc --noEmit
```

**期望结果：** 无错误

### 4.2 开发服务器测试

```powershell
npm run dev
```

**检查项：**

- [ ] 项目正常启动
- [ ] 无运行时错误
- [ ] 各页面功能正常

### 4.3 功能测试清单

- [ ] 热门行情页面 - 市场概览、板块排行显示正常
- [ ] 股票列表页面 - 股票列表加载正常
- [ ] 股票详情页面 - K 线图、详情数据显示正常
- [ ] 提醒管理页面 - 通知功能正常
- [ ] 数据概况页面 - 分析功能正常
- [ ] 机会分析页面 - AI 分析功能正常

### 4.4 删除旧文件

确认所有测试通过后，删除以下文件：

```powershell
cd src/services

# 删除已迁移的文件
Remove-Item stockApi.ts
Remove-Item fundamentalApi.ts
Remove-Item tencentFinanceApi.ts
Remove-Item opportunityService.ts
Remove-Item overviewService.ts
Remove-Item aiAnalysisService.ts
Remove-Item notificationService.ts
Remove-Item notificationNavigation.ts
Remove-Item cacheManager.ts

# 删除临时脚本
Remove-Item refactor.ps1
```

---

## 回退方案

如果重构过程中出现问题，可以快速回退：

### Git 回退

```powershell
# 查看所有变更
git status

# 回退所有未提交的变更
git checkout .

# 或删除新创建的目录
Remove-Item -Recurse -Force src/services/hot
Remove-Item -Recurse -Force src/services/stocks
Remove-Item -Recurse -Force src/services/alerts
Remove-Item -Recurse -Force src/services/overview
Remove-Item -Recurse -Force src/services/opportunity
Remove-Item -Recurse -Force src/services/fundamental
Remove-Item -Recurse -Force src/services/core
```

### 分步回退

如果某个模块出现问题：

1. 恢复该模块的 import 路径
2. 保留其他已完成的模块
3. 单独调试问题模块

---

## 常见问题

### Q1: 导入路径找不到模块？

**A:** 检查 `index.ts` 是否正确导出，确保路径正确。

### Q2: TypeScript 报错类型不匹配？

**A:** 检查类型导出是否在 `index.ts` 中，使用 `export type` 导出类型。

### Q3: 循环依赖问题？

**A:** 避免模块间相互引用，必要时提取公共类型到 `@/types`。

### Q4: 如何验证重构成功？

**A:**

1. `npx tsc --noEmit` 无错误
2. `npm run dev` 正常运行
3. 所有页面功能测试通过

---

## 执行检查清单

### 阶段 1: 文件移动

- [ ] hot/market.ts 创建
- [ ] hot/sectors.ts 创建
- [ ] stocks/api.ts 复制
- [ ] alerts/notification.ts 复制
- [ ] alerts/navigation.ts 复制
- [ ] overview/analyzer.ts 复制
- [ ] opportunity/analyzer.ts 复制
- [ ] opportunity/ai.ts 复制
- [ ] fundamental/api.ts 复制
- [ ] core/cache.ts 复制

### 阶段 2: 索引文件

- [ ] hot/index.ts 创建
- [ ] stocks/index.ts 创建
- [ ] alerts/index.ts 创建
- [ ] overview/index.ts 创建
- [ ] opportunity/index.ts 创建
- [ ] fundamental/index.ts 创建
- [ ] core/index.ts 创建
- [ ] services/index.ts 创建

### 阶段 3: 更新引用

- [ ] hotStore.ts 更新
- [ ] stockStore.ts 更新
- [ ] alertStore.ts 更新
- [ ] overviewStore.ts 更新
- [ ] opportunityStore.ts 更新
- [ ] useStockList.ts 更新
- [ ] useStockDetail.ts 更新
- [ ] useKLineData.ts 更新
- [ ] useAllStocks.ts 更新
- [ ] useFundamentalAnalysis.ts 更新
- [ ] MarketSentimentCard.tsx 更新
- [ ] App.tsx 更新
- [ ] opportunity/analyzer.ts 内部引用更新

### 阶段 4: 验证

- [ ] TypeScript 编译通过
- [ ] 开发服务器启动
- [ ] 热门行情页面测试
- [ ] 股票列表页面测试
- [ ] 股票详情页面测试
- [ ] 提醒管理页面测试
- [ ] 数据概况页面测试
- [ ] 机会分析页面测试
- [ ] 删除旧文件

---

## 总结

完成以上所有步骤后，你将拥有：

- ✅ 清晰的模块化结构
- ✅ 易于维护的代码组织
- ✅ 符合直觉的文件命名
- ✅ 完整的向后兼容性
- ✅ 零破坏性变更

**预计耗时：** 30-60 分钟  
**风险等级：** 低（有完整回退方案）

---

_最后更新: 2026-04-16_
