# 项目编码约束

> 本文件为**强制约束**，AI 助手与人工开发均须遵守。新增或修改代码前请先阅读。

## 1. 页面文件不得内联常量与公用方法

`src/pages/**/XxxPage.tsx` **只允许**包含：

- 状态声明（`useState` / store 订阅）
- 副作用与派生值编排（`useEffect` / `useMemo` / `useCallback`）
- 事件处理函数的编排（组装参数、调 message、跳转）
- JSX 结构

以下内容**禁止**直接写在页面文件里，必须抽离：

| 内容类型 | 放置位置 | 参考实现 |
|---|---|---|
| 下拉选项、默认值、标签、阈值等常量 | `src/utils/config/` | `opportunityPageOptions.ts`、`opportunityAnalysisDefaults.ts` |
| 纯函数工具（过滤 / 格式化 / 匹配 / 合并 / 排序） | `src/utils/` 对应子目录 | `analysis/stockFiltering.ts`、`format/textMatch.ts`、`sort/tableSort.ts` |
| 数据结构构造器（把散落的 state 组装为对象） | `src/utils/config/` | `opportunityFilterFormState.ts` |
| 可复用的展示单元 | `src/components/common/<Name>/` | `ProgressCard/` |
| 网络请求、持久化编排 | `src/services/`、`src/utils/storage/` | `storage/opportunityIndexedDB.ts` |
| 可复用的有状态逻辑 | `src/hooks/` | `useOpportunityFilterEngine.ts` |

### 判断标准（满足任一即须抽离）

1. 该常量或逻辑**可能被第二个文件使用**；
2. 同一份内容在**两个及以上地方重复出现**（必须收敛为单一数据源 / 单一实现）；
3. 抽离后页面文件能减少约 50 行以上，或可读性显著提升。

### 例外（允许就地保留）

- 仅与当前页面强耦合、不可能被复用的**不超过 5 行**的琐碎派生逻辑；
- 纯 JSX 局部变量（如 `const resetFilterButtonNode = useMemo(...)`）。

## 2. 命名与风格

- 模块级常量使用 `UPPER_SNAKE_CASE`，集中放在 `src/utils/config/`；
- 工具函数一律具名导出（`export function xxx`），并在文件头注释写明用途与边界；
- 新增通用组件放在 `src/components/common/<Name>/`，自带 `<Name>.module.css`，不依赖具体页面的 CSS Module；
- 抽离出的模块要**避免循环依赖**：`utils` 不反向依赖 `pages`；`config` 只依赖 `types` 与更底层 `utils`。

## 3. 标准范例

`OpportunityPage` 的重构是标准范例，拆分结果如下：

| 原先内联在页面中的内容 | 抽离后位置 |
|---|---|
| 周期 / 市场 / 名称类型 / 横盘类型选项、AI 版本元数据 | `src/utils/config/opportunityPageOptions.ts` |
| `INITIAL_FILTER_STATE`、`INITIAL_OPPORTUNITY_QUERY` | `src/utils/config/opportunityAnalysisDefaults.ts` |
| 筛选偏好与筛选快照的构造（原 3 处重复组装） | `src/utils/config/opportunityFilterFormState.ts` |
| 股票池市场 / 名称 / 行业 / 概念过滤 | `src/utils/analysis/stockFiltering.ts` |
| 股票名称/代码关键词模糊匹配 | `src/utils/format/textMatch.ts` |
| 财务指标按 code 合并进列表 | `src/utils/analysis/stockFinanceMerge.ts` |
| 重复 3 次的「进度条 + 文案」卡片 | `src/components/common/ProgressCard/` |

页面文件从 2840 行降至约 2150 行，主要保留状态、副作用与 JSX。

## 4. 自查清单（提交前）

- [ ] `XxxPage.tsx` 中是否新增了模块级 `const XXX_OPTIONS / XXX_DEFAULTS / XXX_LABELS`？→ 应移到 `src/utils/config/`
- [ ] 是否在页面里写了 `array.filter / map` 之类的业务处理函数？→ 应移到 `src/utils/`
- [ ] 是否复制粘贴了第二份相同的常量或构造逻辑？→ 应抽为单一数据源
- [ ] 新增的 JSX 片段是否在别处也出现过？→ 应抽为 `components/common/` 组件
