# Services 按路由重构执行计划

## 📋 重构步骤

### 阶段 1: 文件移动和重组

#### 1. hot/ (热门行情)

- `tencentFinanceApi.ts` → 拆分为:
  - `hot/market.ts` (市场概览功能)
  - `hot/sectors.ts` (板块排行功能)
  - `hot/index.ts` (统一导出)

#### 2. stocks/ (股票列表+详情)

- `stockApi.ts` → `stocks/api.ts`
- `stocks/index.ts` (统一导出)

#### 3. alerts/ (提醒管理)

- `notificationService.ts` → `alerts/notification.ts`
- `notificationNavigation.ts` → `alerts/navigation.ts`
- `alerts/index.ts` (统一导出)

#### 4. overview/ (数据概况)

- `overviewService.ts` → `overview/analyzer.ts`
- `overview/index.ts` (统一导出)

#### 5. opportunity/ (机会分析)

- `opportunityService.ts` → `opportunity/analyzer.ts`
- `aiAnalysisService.ts` → `opportunity/ai.ts`
- `opportunity/index.ts` (统一导出)

#### 6. fundamental/ (基本面分析)

- `fundamentalApi.ts` → `fundamental/api.ts`
- `fundamental/index.ts` (统一导出)

#### 7. core/ (核心基础设施)

- `cacheManager.ts` → `core/cache.ts`
- `core/index.ts` (统一导出)

### 阶段 2: 更新所有 import 路径

需要更新的文件（预计 15-20 个）:

- src/stores/hotStore.ts
- src/stores/stockStore.ts
- src/stores/alertStore.ts
- src/stores/overviewStore.ts
- src/stores/opportunityStore.ts
- src/hooks/useStockList.ts
- src/hooks/useStockDetail.ts
- src/hooks/useKLineData.ts
- src/hooks/useAllStocks.ts
- src/hooks/useFundamentalAnalysis.ts
- src/pages/HotPage/components/MarketSentimentCard.tsx
- src/App.tsx
- src/services/opportunityService.ts (内部引用)
- src/utils/apiCache.ts

### 阶段 3: 创建统一的根导出

- `src/services/index.ts` - 提供向后兼容的统一导出

### 阶段 4: 验证和测试

- TypeScript 编译检查
- 功能测试
- 删除旧文件

---

## ⚠️ 注意事项

1. **保持向后兼容** - 通过 index.ts 重新导出
2. **逐个模块处理** - 避免一次性改动过大
3. **及时验证** - 每完成一个模块就检查编译
4. **保留原文件** - 直到所有引用更新完成

---

## 🎯 预期成果

- ✅ 清晰的页面边界
- ✅ 易于维护的代码结构
- ✅ 符合直觉的文件组织
- ✅ 零破坏性变更
