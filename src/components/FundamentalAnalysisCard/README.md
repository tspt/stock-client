# 基本面分析功能

## 功能概述

基本面分析功能提供了股票的四个核心维度的分析：

1. **财务报表** - 展示营收、利润、现金流等关键财务指标
2. **估值分析** - PE/PB/PS 等估值指标及历史分位数
3. **行业对比** - 与同行业公司的估值对比和排名
4. **机构研报** - 最新机构研究报告摘要

## 技术实现

### 数据类型定义

在 `src/types/stock.ts` 中定义了以下类型：

- `FinancialStatement` - 财务报表数据
- `ValuationAnalysis` - 估值分析数据
- `IndustryComparison` - 行业对比数据
- `ResearchReportSummary` - 机构研报摘要
- `FundamentalAnalysis` - 基本面分析综合数据

### API 服务

`src/services/fundamentalApi.ts` 提供以下 API：

- `getFundamentalAnalysis(code)` - 获取完整的基本面分析数据
- `getFinancialStatements()` - 获取财务报表数据（东方财富 API）
- `getValuationAnalysis()` - 获取估值分析数据
- `getIndustryComparison()` - 获取行业对比数据
- `getResearchReports()` - 获取机构研报摘要

### React 组件

`src/components/FundamentalAnalysisCard/` 包含：

- `FundamentalAnalysisCard.tsx` - 主卡片组件
- `FinancialStatementsTab.tsx` - 财务报表 Tab
- `ValuationAnalysisTab.tsx` - 估值分析 Tab
- `IndustryComparisonTab.tsx` - 行业对比 Tab
- `ResearchReportsTab.tsx` - 机构研报 Tab

### Hook

`src/hooks/useFundamentalAnalysis.ts` - 基本面分析数据 Hook

## 使用方法

在详情页中已经集成：

```tsx
import { FundamentalAnalysisCard } from '@/components/FundamentalAnalysisCard';

<FundamentalAnalysisCard code={selectedStock} />;
```

## 数据来源

- **财务数据**: 东方财富财经数据中心
- **估值数据**: 东方财富估值分析 API
- **行业数据**: 东方财富行业分类 API
- **研报数据**: 东方财富研报中心

## 缓存策略

- 基本面分析数据缓存 5 分钟
- 使用 `apiCache` 统一管理缓存

## 注意事项

1. 部分 API 可能需要配置代理才能访问（已在 `electron/localApiProxy.ts` 中配置）
2. 估值分位数功能目前返回模拟数据，需要接入历史数据进行计算
3. 行业对比的排名功能目前返回模拟数据，需要查询行业内所有公司数据进行计算

## 后续优化建议

1. 实现真实的估值历史分位数计算
2. 实现真实的行业排名计算
3. 添加财务数据可视化图表（趋势图等）
4. 支持更多财务指标（如资产负债率、流动比率等）
5. 添加自定义财务指标筛选功能
