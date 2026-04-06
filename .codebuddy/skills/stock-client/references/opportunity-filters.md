# 机会筛选配置说明

本文档详细说明机会分析页面中的各种筛选条件配置。

## 筛选配置结构

位于 `src/types/opportunityFilter.ts` 的 `OpportunityFilterSnapshot`:

```typescript
interface OpportunityFilterSnapshot {
  // 基础数据筛选
  priceRange: NumberRange;              // 价格范围
  marketCapRange: NumberRange;          // 市值范围
  turnoverRateRange: NumberRange;       // 换手率范围
  peRatioRange: NumberRange;            // 市盈率范围
  kdjJRange: NumberRange;               // KDJ-J值范围

  // 涨跌停统计筛选
  recentLimitUpCount?: number;          // 最近涨停次数
  recentLimitDownCount?: number;        // 最近跌停次数
  limitUpPeriod: number;                // 涨停统计周期
  limitDownPeriod: number;              // 跌停统计周期

  // 横盘筛选
  consolidationTypes: ConsolidationType[];  // 横盘类型
  consolidationLookback: number;         // 横盘回溯K线条数
  consolidationConsecutive: number;       // 横盘连续满足数
  consolidationThreshold: number;         // 横盘波动阈值(%)
  consolidationRequireAboveMa10: boolean; // 是否要求在MA10上方
  consolidationFilterEnabled: boolean;   // 是否启用横盘筛选

  // 趋势线筛选
  trendLineLookback: number;             // 趋势线检索窗口
  trendLineConsecutive: number;          // 趋势线连续条件
  trendLineFilterEnabled: boolean;       // 是否启用趋势线筛选

  // 单日异动筛选
  sharpMoveWindowBars: number;           // 异动回溯窗口
  sharpMoveMagnitude: number;            // 异动幅度阈值(%)
  sharpMoveOnlyDrop: boolean;            // 仅急跌
  sharpMoveOnlyRise: boolean;            // 仅急涨
  sharpMoveDropThenRiseLoose: boolean;   // 跌后涨
  sharpMoveRiseThenDropLoose: boolean;   // 涨后跌
  sharpMoveDropFlatRise: boolean;        // 跌-平-涨
  sharpMoveRiseFlatDrop: boolean;        // 涨-平-跌

  // 技术指标筛选
  rsiRange: NumberRange;                 // RSI范围
  macdGoldenCross: boolean;              // MACD金叉
  macdDeathCross: boolean;               // MACD死叉
  macdDivergence: boolean;               // MACD背离
  bollingerUpper: boolean;                // 布林带上轨
  bollingerMiddle: boolean;               // 布林带中轨
  bollingerLower: boolean;                // 布林带下轨

  // K线形态筛选
  candlestickHammer: boolean;             // 锤头线
  candlestickShootingStar: boolean;       // 射击之星
  candlestickDoji: boolean;               // 十字星
  candlestickEngulfing: boolean;          // 吞没形态
  candlestickMorningStar: boolean;        // 早晨之星
  candlestickEveningStar: boolean;        // 黄昏之星

  // 趋势形态筛选
  trendUptrend: boolean;                  // 上升趋势
  trendDowntrend: boolean;                // 下降趋势
  trendSideways: boolean;                 // 横盘趋势
  trendBreakout: boolean;                  // 突破形态
  trendBreakdown: boolean;                 // 跌破形态
}
```

## 筛选逻辑

### 筛选执行顺序

1. **轻量级筛选 (主线程)**:
   - 价格/市值/换手率/市盈率
   - KDJ-J值

2. **重量级筛选 (Web Worker)**:
   - 涨跌停统计
   - 横盘分析
   - 趋势线分析
   - 单日异动分析
   - 技术指标 (RSI/MACD/布林带)
   - K线形态
   - 趋势形态

### 筛选组合逻辑

- **AND 关系**: 基础筛选 + 涨跌停筛选 + 横盘筛选 + 趋势线筛选 + 异动筛选 + 技术指标筛选
- **OR 关系**: 同类型多选时满足任一即通过 (如多个横盘类型、多个K线形态)

### 筛选偏好的存取

位于 `src/utils/opportunityFilterPrefs.ts`:
- `saveOpportunityFilterPrefs(prefs)`: 保存筛选偏好到 IndexedDB
- `loadOpportunityFilterPrefs()`: 从 IndexedDB 加载筛选偏好
- 键名: `OPPORTUNITY_FILTER_PREFS_KEY`

## 添加新筛选条件

### 步骤 1: 类型定义
在 `src/types/opportunityFilter.ts` 添加新字段

### 步骤 2: 计算函数
在相应的工具文件中实现计算逻辑:
- 技术指标: `src/utils/technicalIndicators.ts`
- K线形态: `src/utils/candlestickPatterns.ts`
- 趋势分析: `src/utils/trendPatterns.ts`

### 步骤 3: Worker筛选逻辑
在 `src/workers/opportunityFilterWorker.ts` 中添加筛选判断

### 步骤 4: UI控件
在 `src/pages/OpportunityPage/OpportunityFiltersPanel.tsx` 添加控件

### 步骤 5: 偏好存取
在 `src/utils/opportunityFilterPrefs.ts` 添加新字段处理

### 步骤 6: 文档更新
更新 `docs/机会分析新增筛选项实现说明.md`

## 默认筛选值

位于 `src/utils/opportunityAnalysisDefaults.ts`，提供合理的默认配置。

## 筛选性能优化

1. **防抖处理**: 筛选条件变更 300ms 防抖
2. **缓存策略**: K线数据缓存，与 `MAX_OPPORTUNITY_KLINE_CACHE_ENTRIES` (400条) 对齐
3. **增量更新**: 支持 K线数据的增量同步 (`set-data-patch`)
4. **取消机制**: 支持取消进行中的筛选任务 (`cancel` 消息)
5. **分批处理**: 每处理 40 条让出一次主线程
