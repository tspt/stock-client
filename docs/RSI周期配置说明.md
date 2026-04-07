# RSI 周期配置功能说明

## 修改概述

为机会分析中的 RSI 范围筛选项添加了可配置的 RSI 周期选择功能,默认使用 6 日 RSI(与同花顺等主流软件保持一致)。

**最新修改**: 移除了 MACD 和布林带筛选功能,将 RSI 筛选项移动到"数据筛选"标签页。

## 修改内容

### 1. 类型定义更新

**文件**: `src/types/opportunityFilter.ts`

- 在 `OpportunityFilterSnapshot` 接口中添加 `rsiPeriod: number` 字段

**文件**: `src/utils/opportunityFilterPrefs.ts`

- 在 `OpportunityFilterPrefs` 接口中添加 `rsiPeriod: number` 字段
- 在 `OpportunityFilterPrefsApplyActions` 接口中添加 `setRsiPeriod` action
- 在解析函数中添加 `rsiPeriod` 的解析逻辑,默认值为 6
- 在默认值函数 `getDefaultFilterPrefsFields()` 中设置 `rsiPeriod: 6`
- 在应用函数 `applyOpportunityFilterPrefsToState()` 中添加 `setRsiPeriod` 调用

### 2. 页面组件更新

**文件**: `src/pages/OpportunityPage/OpportunityPage.tsx`

- 在 `INITIAL_FILTER_STATE` 中添加 `rsiPeriod: 6`
- 添加状态变量 `const [rsiPeriod, setRsiPeriod] = useState<number>(INITIAL_FILTER_STATE.rsiPeriod)`
- 在 `filterSnapshot` useMemo 中添加 `rsiPeriod`
- 在保存偏好设置时包含 `rsiPeriod`
- 在加载偏好设置时传递 `setRsiPeriod` action
- 向 `OpportunityFiltersPanel` 组件传递 `rsiPeriod` 和 `setRsiPeriod` props

### 3. 筛选面板 UI 更新

**文件**: `src/pages/OpportunityPage/OpportunityFiltersPanel.tsx`

- 导入 `Select` 组件
- 在接口定义中添加 `rsiPeriod` 和 `setRsiPeriod` props
- 在组件参数解构中添加 `rsiPeriod` 和 `setRsiPeriod`
- 在"数据筛选"标签页的 KDJ-J 之后添加 RSI 筛选项:
  - RSI 范围(最小值~最大值)
  - RSI 周期选择器,提供以下选项:
    - 6 日 (默认)
    - 12 日
    - 24 日
- 从"技术指标与形态"标签页移除 MACD 和布林带筛选

### 4. Worker 筛选逻辑更新

**文件**: `src/workers/opportunityFilterWorker.ts`

- 修改 RSI 筛选逻辑,使用配置的周期而不是硬编码的 14
- 代码变更:

  ```typescript
  // 修改前
  const rsi = calculateRSI(klineData, 14);

  // 修改后
  const rsiPeriod = filters.rsiPeriod || 6;
  const rsi = calculateRSI(klineData, rsiPeriod);
  ```

## 功能特性

1. **默认值**: 6 日 RSI,与同花顺短周期一致
2. **可选周期**: 提供 6 日、12 日、24 日三个常用周期
3. **持久化**: RSI 周期配置会保存到用户偏好设置中,下次打开时自动恢复
4. **向后兼容**: 对于旧版本保存的配置,如果没有 `rsiPeriod` 字段,会自动使用默认值 6
5. **筛选位置**: RSI 筛选项位于"数据筛选"标签页,KDJ-J 之后
6. **简化技术指标**: 移除了 MACD 和布林带筛选,只保留 RSI、K 线形态和趋势形态

## 使用说明

用户在机会分析页面可以:

1. 打开筛选面板
2. 在“数据筛选”标签页中找到 RSI 筛选区域(KDJ-J 之后)
3. 设置 RSI 范围(最小值~最大值)
4. 选择 RSI 周期(6 日/12 日/24 日)
5. 点击“开始分析”按钮应用筛选条件

系统会使用用户选择的 RSI 周期计算最新的 RSI 值,并根据设置的 range 进行筛选。

## 技术细节

- RSI 计算使用 `src/utils/technicalIndicators.ts` 中的 `calculateRSI` 函数
- 该函数使用 Wilder 平滑算法,是标准的 RSI 计算方法
- 筛选时使用的是最新一个交易日的 RSI 值
- RSI 值范围为 0-100
