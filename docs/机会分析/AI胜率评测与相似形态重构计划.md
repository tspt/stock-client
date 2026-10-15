# 机会分析 AI 胜率评测与相似形态重构计划

**文档版本**: v1.0
**创建日期**: 2026-10-12
**范围**: 仅针对「AI 辅助分析」（`src/services/opportunity/ai-v5.0.ts` 及其调用链），不改动横盘、趋势线、单日异动、技术指标、K 线形态、趋势形态、买点场景等其他筛选逻辑。
**目标**: 让「胜率」变得可测量，并据此提高胜率；修掉相似形态的前视/伪胜率缺陷。

---

## 回测结论（2026-10-12 实测，已落地）

数据来源：`docs/回测优化/股票数据`（3,050 只主板非ST）+ 页面回评（3,052 只），
d1~d6 全口径 × 3 个时间窗口交叉验证。

### 各维度的逐截面 RankIC

| 维度 | 无头复算（60 截面） | 页面回评（20 截面） | 一致性 |
|---|---|---|---|
| 技术面 | +0.0239 | +0.0313 | ✅ 两份均为正 |
| 形态 | −0.0147 | −0.0208 | ✅ 两份均为负 |
| 趋势 | −0.0190 | +0.0025 | ❌ 符号不稳 |
| 风险 | +0.0116 | +0.0428 | ❌ 幅度不稳 |
| 置信度 | −0.0021（3 窗口翻转） | −0.0014 | ❌ 不可用 |

**经济含义**：技术面高 = 均线多头 + 放量，动量有效；形态/趋势高 = 急涨后整理 /
沿趋势线上行，短期反而回落。原先三个维度同向加权会互相抵消。

### 已落地的改动：形态与趋势反号

`ai-v5.0.ts` 新增 `SCORE_DIMENSION_INVERT`，在 `calculateRecommendationScore` 与
`v4RecomputeTotal` **两处**加权求和时按方向取贡献（反号维度取 `100 − 分`）。

> ⚠️ 必须改两处：v4/v5 结构校正末尾会用 `v4RecomputeTotal` 重算 totalScore，
> 漏改它会把综合评分覆盖回旧口径。

**分项分数本身仍按原口径计算与展示**（它们衡量「形态/趋势质量」），
只是对综合评分的贡献方向取反。

### 权重搜索 + 留出验证

候选权重在 3 个时间窗口上的综合评分 IC（d5）：

| 候选 | W0 | W1 | W2 | 全样本 |
|---|---|---|---|---|
| 现状 0.30/0.25/0.25/0.20 | 0.0220 | 0.0116 | 0.0069 | 0.0135 |
| **形态/趋势反号** | **0.0399** | **0.0214** | **0.0196** | **0.0270** |
| 技术面70/风险30 | 0.0381 | 0.0212 | 0.0195 | 0.0262 |
| 去掉形态+趋势 | 0.0396 | 0.0205 | 0.0153 | 0.0252 |
| 等权 0.25×4 | 0.0191 | 0.0078 | 0.0068 | 0.0112 |

留出验证：只用 W0+W1 选权重（反号第一），在完全留出的 **W2 上仍以 0.0196 vs 0.0069 领先约 3 倍**
→ 不是过拟合。

### 连锁问题处理结果（2026-10-12）

| # | 问题 | 处理 |
|---|---|---|
| 1 | 默认筛选与反号冲突（`patternScoreMin` / `trendScoreMin` = 50 筛原始分） | ✅ 已改为 `undefined`（不限） |
| 2 | 弹窗语义（「形态 80 分却拉低综合分」易误解） | ✅ `AIAnalysisModal` 已加说明 Alert |
| 3 | `confidenceMin: 50` 无回测依据（IC 跨窗口翻转） | ✅ 已改为 `undefined`（不限） |

改动位置：`src/utils/config/opportunityAnalysisDefaults.ts` 的
`OPPORTUNITY_DEFAULT_AI_ANALYSIS`（单一数据源，`INITIAL_FILTER_STATE` 与
`opportunityFilterPrefs.ts` 的兜底默认值均从它派生，自动生效）。

### ⚠️ 仍待决

- `aiTrendUp: true`（默认只留「AI 趋势=看涨」）同样缺乏依据：回测显示看涨/看跌的胜率差
  在 3 个窗口上方向不稳（窗口0/1 看跌>看涨，窗口2 反过来）。但放开它会显著扩大每日筛选
  结果集，属使用习惯变更，待使用者确认。
- 「多窗口回测」尚未做成页面功能，目前稳健性验证仍依赖一次性脚本。

---

## 实施进度

| Phase | 状态 | 说明 |
|---|---|---|
| Phase 1 前复权日线数据源 | ❌ **已实现后回滚**（2026-10-12） | 实测影响面远小于预估，改用 Phase 2 内的「缺口过滤」，见下方说明 |
| Phase 2 AI 胜率可测量 | ✅ 代码完成（2026-10-12） | 含除权跳空过滤；`tsc` + `vite build` 通过，运行期验收需启动应用 |
| Phase 3 相似形态重做 | ⬜ 未开始 | 依赖 Phase 2 跑出 baseline |

### ⚠️ 实测数据（修正本文档原先的过度估计）

本文档初版声称「不复权导致胜率系统性算错、约 5% 样本收益被污染、指标约 10~15% 受影响」。
对 `docs/回测优化/股票数据`（3,050 只 × 1,512,456 个「股票×交易日」）实测后，真实影响面是：

| 影响面 | 初版估计 | **实测** |
|---|---|---|
| 指标被污染的样本（跳空后 30 根内） | ~10~15% | **0.37%** |
| 前向收益跨到除权日的样本（6 日窗口） | ~5% | **约 0.12%** |

证据：242 只（7.9%）股票出现「单日跌幅超过所属板跌停限制」的情况——A 股单日跌幅有硬上限，
超过它不可能是交易造成的。最极端为 **比亚迪 2025-07-29 −66.9%（337 → 111.42，即 10 送 20）**。

**结论**：数据确实是不复权；但影响量级只有约 0.4%，不足以支撑一整套独立数据管线。
故选择方案 B —— 沿用现有不复权数据，把受跳空污染的样本整条剔除。

### Phase 1 回滚说明

已删除（曾短暂实现）：

- `src/utils/storage/backtestKlineDB.ts`、`src/services/opportunity/backtestKlineService.ts`
- `src/utils/analysis/klineHealth.ts`、`src/hooks/useBacktestKlinePrep.ts`
- `src/components/common/BacktestDataPrepCard/`
- `src/services/stocks/api.ts` 中的 `fetchKLineFresh` 与 `getKLineData` 的两个隔离开关
- `src/utils/config/constants.ts` 中的 `BACKTEST_KLINE_*` 常量

**保留不动**：`OPPORTUNITY_DB_VERSION = 10`。IndexedDB 无法用更低版本号打开已升级的库，
回退会直接打开失败；已存在的空 `backtestKlineCache` 表不再使用，残留无害。

### Phase 2 落地清单

| 文件 | 说明 |
|---|---|
| `src/utils/config/aiBacktestOptions.ts` | 新增：回测评测口径的全部常量（采样规模、预热根数、分桶边界、达标阈值） |
| `src/utils/analysis/aiBacktest.ts` | 新增纯函数核心：日期索引、截面采样、可回测字段构造、除权跳空识别、单条样本、分桶聚合、Spearman RankIC |
| `src/workers/aiBacktestWorkerTypes.ts` | 新增：消息协议（set-data / run / cancel → progress / result，含剔除统计） |
| `src/workers/aiBacktestWorker.ts` | 新增：Worker 内复用线上 `ai-v5.0.performAIAnalysis` 重算，含跳空预计算、yield 与取消 |
| `src/hooks/useAiBacktestEngine.ts` | 新增：读 `stockHistory` → 裁剪股票池 → 送 Worker → 聚合结果 |
| `src/components/common/AiBacktestRunnerCard/` | 新增：基础筛选（市场/名称）+ 采样参数 + 运行/取消 + 进度 |
| `src/components/common/AiBacktestReport/` | 新增：总体指标（胜率/均收益/达标率/IC）+ 方向/置信度/分项评分/综合评分分桶表 + 结论边界说明 |
| `src/pages/AiBacktestPage/AiBacktestPage.tsx` | 接入上述两卡片 |

实现中偏离计划之处（均为降低风险，已在代码注释写明）：

1. **打分直接调用线上 `performAIAnalysis`**（不传股票池），而不是只用 `predictTrend`。
   这样回测评的是**真实线上管线**（含 v4/v5 结构校正），无需复制任何逻辑；
   相似形态因依赖全池比对而不参与评分，正好是 Phase 3 的重做对象。
2. **PE / 换手率自然缺席**，无需改 `ai-v5.0`：构造的可回测对象不填这两个字段，
   评分函数里的对应分支自然跳过。
3. **日期索引改为每只股票建一次**。计划未提性能细节；若不这样做，
   2 万个 (股票 × 截面) 组合会退化成千万次 `new Date` 格式化，是主要卡顿源。
4. **数据源改为复用 `stockHistory`（不复权），并新增除权跳空过滤**
   （替代原 Phase 1 的独立前复权数据源，理由见上文「实测数据」）：
   - `detectExDividendGaps`：按板别涨跌停限制识别除权跳空（创业板/科创板 20%、北交所 30%、主板 10%、ST 5%，+1% 缓冲）；
   - `isGapContaminated`：打分窗口（截面日往前 30 根）或前向收益窗口（截面日之后 horizon 根）内有跳空，整条剔除；
   - 剔除量按原因统计并回传，在报告头部展示，不让剔除静默发生。

验证状态：`tsc --noEmit` 与 `vite build` 均通过；Worker 产物独立生成
（`dist/assets/aiBacktestWorker-*.js`）。
运行期验收（需启动应用）：见 Phase 2「验收标准」四条。

---

## 0. 现状盘点（已核实）

### 0.1 数据资产

| 数据 | 位置 | 可用于历史回测？ |
|---|---|---|
| 全量日线 K 线 | `stockHistory.dailyLines` | ✅ 唯一 point-in-time 数据源，**但是不复权** |
| 当前行情快照 | `stockHistory.latestQuote` | ❌ 仅"当下"，历史不可得 |
| 财务指标 | `stockFinance` | ❌ **仅最新一期**，无历史快照 |
| 最近一次分析结果 | `opportunity` 主记录 | ✅ 仅"今天"这一帧 |
| 买点场景回测基建 | `utils/analysis/buypointScenario.ts` | ✅ `calculateFutureReturns`(d1~d6)、`scanHistoricalBuyPoints`、oddsScore/SABC |
| 回测页与归因统计 | `pages/BacktestPage/BacktestPage.tsx` | ✅ `passRate` / `avgMaxReturn` / 按规则归因 |
| 机会记录前向追踪 | `utils/analysis/opportunityRecordTracking.ts` | ✅ 已在线，真实名单 d1-d6 追踪 |

### 0.2 关键发现（决定计划写法）

1. **回测基建已存在，但从未评估过 AI 分析**。`BacktestPage` 统计的全是「买点场景」规则系统；`ai-v5.0` 产出的 `direction / confidence / totalScore` 一次都没被回测过。
   → P0-1 是「接线」而非「从零建」。

2. **`predictTrend` 是纯函数**（只吃 K 线），天然可回测、无前视。

3. **推荐评分里有两个因子历史上不存在**，`calculateRecommendationScore` 依赖 `peRatio` / `turnoverRate`（`ai-v5.0.ts:1081-1100`），它们只来自当前快照。回测时用今天的 PE 套历史信号即未来函数。

4. **相似形态的 `patternWinRate` 是伪胜率**。`calculateHistoricalPerformance`（`ai-v5.0.ts:862-881`）取的是「最近 `observationPeriod` 天」的涨跌幅，而相似度用的是「最近 20 根」（`ai-v5.0.ts:737-791`）——**同一段时间**，不是「形态之后 N 天的收益」。它表达的是"和我长得像的股票最近是否也在涨"，对未来无预测力。

5. **`signalConfluence` / `patternWinRate` / `riskRewardRatio` 是死输出**。只在 `types/stock.ts:669-673` 定义、在算法里计算，`passesAIFilter`（`opportunityFilterWorker.ts:159-293`）只消费 `trendPrediction` 与 `recommendation` 分数，UI 也不展示。v3.0 文档宣称的三项筛选在当前 v5 路径上未生效。

6. **`getKLineData` 有两个会让"前复权日线"静默失效的陷阱**（Phase 1 曾据此设计隔离入口，该方案已回滚，此处仅留档）：
   - IndexedDB 读取分支**忽略 `adjust`**（`api.ts:457-471`）；
   - `period === 'day'` 时**无条件写入 `stockHistory`**，不复管 `adjust`（`api.ts:648-650`）。
   若将来重新考虑「日线前复权化」（线上口径迁移），这两点仍是必须先解决的问题。

### 0.3 非目标

- 不引入真实机器学习模型（P1 再议，见 §5）。
- 不删除 `ai-v2.0 ~ ai-v7.0` 副本与 `AIService.ts`（P2 清理，见 §5）。
- 不改变机会分析现有的「日线 + 不复权」线上口径。

---

## Phase 1：前复权日线数据源（P0-A）—— ❌ 已回滚

> **本阶段已实现后又撤回**，取代方案是 Phase 2 内的「除权跳空过滤」。
> 撤回理由：实测影响面仅约 0.4%（见「实测数据」），不值得新增一套独立数据管线。
> 以下内容保留作为决策留档。

**原设想**：回测的 forward return 与指标都必须基于前复权。不复权数据在除权除息日留下跳空，污染 MA/MACD/布林/涨跌幅。
（**该表述已被实测修正**：影响存在，但量级约 0.4%，不构成「系统性算错」。）
项目自身已在周线上改前复权（`WEEKLY_KLINE_ADJUST = 'qfq'`，`constants.ts:308`），日线是遗漏。

**核心约束**：不能复用 `getKLineData` 拉前复权日线。原因：

- `getKLineData` 在 `period === 'day'` 时会先读 `stockHistory`（不复权），且**该分支不看 `adjust`**。只要本地缓存条数足够，就会把不复权数据当复权数据返回。
- 拿到数据后 `period === 'day'` 会**把复权数据写回 `stockHistory.dailyLines`**，污染线上机会分析与导出。

→ 必须提供独立的网络入口 + 独立存储。

### 交付物

| 类型 | 文件 | 说明 |
|---|---|---|
| 修改 | `src/services/stocks/api.ts` | 拆出纯网络层 `fetchKLineFromApi(code, period, count, adjust)`，不含缓存与持久化；`getKLineData` 改为调用它（行为不变） |
| 新增 | `src/utils/storage/backtestKlineDB.ts` | 新 IndexedDB store，模式照抄 `weeklyKlineDB.ts`（同表 `__meta__` 元数据记录 + 结构版本 + adjust 校验 + `requestedCount`） |
| 新增 | `src/services/opportunity/backtestKlineService.ts` | 批量拉取前复权日线 + 持久化 + 进度/取消/失败清单，模式照抄 `weeklyKlineService.ts` |
| 修改 | `src/utils/config/constants.ts` | 新增 `BACKTEST_KLINE_STORE_NAME`、`BACKTEST_KLINE_ADJUST='qfq'`、`BACKTEST_KLINE_DEFAULT_COUNT`、`BACKTEST_KLINE_SCHEMA_VERSION`、`BACKTEST_KLINE_BATCH_DELAY`；`OPPORTUNITY_DB_VERSION` 9 → 10 |
| 修改 | `src/utils/storage/opportunityIndexedDB.ts` | `onupgradeneeded` 增加新 store 创建 |

### 实现要点

1. `fetchKLineFromApi` 与 `getKLineData` 的差异仅在「不读缓存、不写 IndexedDB」；解析逻辑完全复用，避免第二份解析代码。
2. `backtestKlineService` 复用 `OPPORTUNITY_CONCURRENT_LIMIT` / 批次延迟控频，接口是腾讯 `newfqkline`，`count` 取 500（约 2 年，够 d1~d6 与 120 根预热）。
3. 独立存储，**不碰 `stockHistory`**，也不需要清库迁移，可随时整体删除回滚。
4. 写入前做体检统计（见验收），失败股票进 `failures` 清单，不阻断整体。

### 验收标准

- [ ] 取任意一只已知除权日的股票，前复权日线无跳空缺口；同一条 `getKLineData(code,'day',N)`（不复权）与 `fetchKLineFromApi(code,'day',N,'qfq')` 在非除权区间收盘价一致、除权区间不同。
- [ ] 拉取前复权日线后，`stockHistory.dailyLines` 内容**逐字节不变**。
- [ ] 「数据体检」可输出：股票数、日期覆盖范围（首/末交易日）、每只 K 线根数的分位（p10/p50/p90）、`< 120` 根的股票数、失败清单。
- [ ] 取消后能干净中止，不残留半写事务。

---

## Phase 2：AI 胜率可测量（P0-1）

**目标**：给出 v5.0 各分桶的**真实** forward 胜率 baseline，让后续每一次调参都有反馈信号。

### 评测口径

| 项 | 定义 |
|---|---|
| 股票池 | `stockHistory` 全量日线，经**基础筛选（市场 / 名称）**过滤后再按上限裁剪；筛选语义与默认值复用机会分析（`filterRecordsByMarketAndName` + `OPPORTUNITY_DEFAULT_BASIC_FILTERS`），默认「沪深主板 · 非ST」 |
| 信号日 T | 每个截面采样日，股票当日存在 K 线（非停牌） |
| 入场价 | T 日收盘价（与 `opportunityRecordTracking` 口径一致，不含滑点） |
| 标签 | `d1 ~ d6` 前向收益，直接复用 `calculateFutureReturns` / `ReturnSnapshot` |
| 达标 | 复用 `getTrackingStatus` 的 `hitCount` / `maxReturn` 判定，与线上追踪同口径 |
| 胜率 | `dN > 0` 的比例；同时给「达标率」（`hitCount ≥ 1`） |
| 基准 | 同截面全池等权 `dN` 均值 → 算超额，避免把大盘 beta 当 alpha（数据为不复权日线，已剔除除权跳空样本） |
| 统计 | 分桶给出 样本数 / 胜率 / 均收益 / 达标率 / IC(RankIC) |
| 样本筛选 | 剔除「打分窗口（T 往前 30 根）或前向收益窗口（T 之后 horizon 根）内有除权跳空」的样本；剔除量按原因统计并在报告头部展示 |

### 可回测 / 不可回测因子（重要）

| 因子 | 可否无前视重算 | 处理 |
|---|---|---|
| `predictTrend` 全部输出 | ✅ 纯函数 | 全量回测 |
| `kdjJ` / `ma5` / `ma10` / `ma20` | ✅ 由 K 线算 | 全量回测 |
| `sharpMovePatterns` / `consolidation` / `trendLine` | ✅ 由 K 线算 | 全量回测 |
| `changePercent` | ✅ 由 K 线算 | 全量回测 |
| `name`（ST 判定） | ⚠️ 名称会变 | 回测但标注为低风险近似 |
| `peRatio` / `turnoverRate` | ❌ 仅当前快照 | **剔除**，不得用当前值冒充历史值 |

→ 回测产出的推荐评分必须与线上评分**分开命名**（如 `backtestTechScore`），不得回写 `aiAnalysis.recommendation`，避免脏数据回流线上。

### 交付物

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/utils/config/aiBacktestOptions.ts` | 常量：采样步长、 horizons、最小预热根数、分桶边界、默认截面数 |
| 新增 | `src/utils/analysis/aiBacktest.ts` | **纯函数核心**：截面截断 → 重算 AI 输出 → 算 forward return → 分桶聚合 |
| 新增 | `src/workers/aiBacktestWorker.ts` | 重算放 Worker（预测函数是 O(n)，全量 5000×50 截面 = 25 万次调用，主线程会卡死） |
| 新增 | `src/hooks/useAiBacktestEngine.ts` | 有状态编排：Worker 调度、进度、取消、结果落 store |
| 新增 | `src/pages/AiBacktestPage/AiBacktestPage.tsx` | 展示：分桶胜率表、IC、与基准对比；只放状态/编排/JSX |

### 实现要点

1. **先小后大**：默认 universe 取 1000 只、截面取 20 个（每 5 个交易日 1 个），跑通后再放开到全量。避免一上来把 UI 卡死。
2. 截面截断不用 `truncateKLinesToAsOfDate` 逐条过滤（会退化成千万次 `new Date`），改为**每只股票预建「日期 → 下标」索引**（`buildKlineDateIndex`），截面日取不到下标即视为停牌/未上市并跳过 —— 语义等价且 O(1)。
3. 预热：要求该股截至 T 至少有 `MIN_WARMUP_BARS`（120）根，否则该截面跳过，避免指标未稳定。
4. 生存者偏差：universe 取 `stockHistory` 现存股票（已含退市剔除），**在报告里显式标注该局限**，不假装无偏。
5. 分桶维度覆盖：`direction`、`confidence`、**四个分项评分（技术面/形态/趋势/风险）**、综合评分。
   - 评分类一律用**等频五分桶**（`quantileEdges`）：固定边界实测会产出退化桶
     （「70~80」仅 44 条、「≥80」0 条），无法判断单调性。
   - 分项除分桶外还单独给出**逐截面 RankIC**：总评分 IC 只能说明「整体有没有信息」，
     分项 IC 才能定位信息来自哪个维度，决定该强化哪部分逻辑。
6. Worker 内 yield + 取消；每只股票的日期索引与除权跳空都在 set-data 时只算一次。

### 验收标准

- [ ] 能对 v5.0 输出一份 baseline 报告：各 `confidence` / `totalScore` 分桶的 d1~d6 胜率、均收益、达标率、样本数，以及与全池等权基准的超额。
- [ ] 报告明确标注：生存者偏差局限、`peRatio`/`turnoverRate` 已剔除、不含滑点与交易成本。
- [ ] 结论必须是可判定的：要么「分桶单调、高分桶显著跑赢」→ 有优化空间；要么「无区分度」→ 证明当前人工权重无效，需走 P1 模型化。
- [ ] 单次全量评测在可接受时间内完成（建议 < 60s），且有进度与取消。

---

## Phase 3：相似形态重做（P0-2）

**目标**：把「同期截面 Top5」换成「历史类比」，让 `patternWinRate` 从伪胜率变成有样本量支撑的真实统计量。

### 现状缺陷

- 相似度基于「最近 20 根」，历史表现基于「最近 `observationPeriod` 根」——同一段时间，非未来收益（`ai-v5.0.ts:862-881`）。
- 只在**当前股票池这一帧截面**里找 Top5，样本常为 0~5 个。
- 余弦相似度用在围绕 0 的涨跌幅序列上，对均值不敏感、对幅值不归一化（`ai-v5.0.ts:835-857`）。

### 新算法

1. **历史类比**：对每只股票，在其**自身历史序列**上滑窗（步长 1，窗长 W=20），检索与「当前窗」最相似的 K 个历史窗；取每个历史窗**其后 N 天**的真实收益作为样本。
2. **相似度**：涨跌幅序列先 z-score 标准化，再算 Pearson 相关；对窗口做 DTW 或等长截断（要求等长，K 线序列天然等长）。
3. **统计量**：`analogWinRate`（样本中 `retN > 0` 比例）、`analogAvgReturn`、`analogP25/P75`、`analogSampleCount`；样本数 < `MIN_ANALOG_SAMPLES`（建议 30）时返回 `undefined` 而非给一个不可信的百分比。
4. **可选增强**：跨股票全局历史形态库 + KDTree/暴力检索，提升样本量；复杂度需控制（这是原实现 O(N²) 卡死的原因，务必保留 Worker + 提前终止）。

### 交付物

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `src/utils/analysis/similarPattern.ts` | 单一实现：特征提取、z-score + Pearson 相似度、历史类比检索、统计量 |
| 修改 | `src/services/opportunity/ai-v5.0.ts` | `findSimilarPatterns` / `calculateHistoricalPerformance` 改为委托 `similarPattern.ts`；`performAIAnalysis` 签名不变 |
| 修改 | `src/types/stock.ts` | `SimilarPatternMatch` 增加 `analogSampleCount` 等字段；`patternWinRate` 语义注释改为「历史类比后续 N 天胜率」 |
| 修改 | `src/components/AIAnalysisModal/AIAnalysisModal.tsx` | 展示样本数与分位数，样本不足时显式提示「样本不足，仅供参考」 |

### 验收标准

- [ ] 对同一只股票，两次运行结果一致（确定性）。
- [ ] `patternWinRate` 只由「历史窗之后 N 天」的收益计算，代码审查可证明无同期限数据参与。
- [ ] 样本数 < 30 时不产出百分比。
- [ ] 单只股票计算耗时可控（建议 < 5ms），批量不卡主线程。
- [ ] 单元测试覆盖：z-score 相似度在「形状相同幅度不同」时高分类、「形状相反」时低分类。

---

## 4. 与 `AGENTS.md` 的约束对齐

- 页面文件 `AiBacktestPage.tsx` 只保留状态、编排、JSX；常量进 `utils/config/aiBacktestOptions.ts`，纯函数进 `utils/analysis/`，Worker 编排进 `hooks/useAiBacktestEngine.ts`，数据源进 `services/opportunity/`。
- 不复制粘贴第二份解析/相似度实现：`fetchKLineFromApi` 与 `getKLineData` 共用解析；`similarPattern.ts` 是相似度唯一实现。
- `utils` 不反向依赖 `pages`；`config` 只依赖 `types` 与更底层 `utils`。
- 新增组件自带 `*.module.css`，不依赖页面 CSS Module。

## 5. 后续路线（不在本次范围）

| 阶段 | 内容 | 前置 |
|---|---|---|
| P1-a | 用 Phase 2 的 baseline 验证「分桶是否有区分度」；若无，走模型化（LightGBM + ONNX + SHAP，`docs/机会分析/AI筛选优化计划.md` 已规划未落地） | Phase 2 |
| P1-b | 置信度概率校准（Platt/Isotonic），让 70% 真对应约 70% 胜率 | Phase 2 |
| P1-c | 交易规则层：ATR 止损、风险收益比止盈、市场/板块择时、涨跌停与流动性过滤 | Phase 2 |
| P2 | 工程收敛：删除 `ai-v2.0~v7.0` 副本与 `AIService.ts` 死代码，AI 版本合并为「单一实现 + 配置开关」；把死输出 `signalConfluence`/`patternWinRate`/`riskRewardRatio` 接入 `passesAIFilter` 或删除 | Phase 2/3 |
| P2 | 样本外验证：用 `opportunityRecordTracking` 的真实名单对比新旧评分 passRate | 全量 |

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| ~~前复权拉取打爆接口~~ | 已随 Phase 1 回滚失效（不再额外拉取） |
| ~~误污染 `stockHistory`~~ | 已随 Phase 1 回滚失效（不再写复权数据） |
| 缺口过滤误剔合法大跌 | 判据只认「超过板别跌停限制」的跌幅，正常交易不可能触发；误剔新股首日/复牌等样本无害 |
| 缺口过滤漏剔小比例送转 | 已知残留：约 9% 级别的送转与现金分红不会被识别，但其对指标/收益的扰动可忽略（实测总量级 0.4%） |
| 回测评出「无区分度」，挫败感 | 这本身就是有价值的结论（证明人工权重无效），直接作为 P1 模型化的依据 |
| 生存者偏差导致胜率虚高 | 报告中显式标注；退市样本需外部名单，本次不做 |
| 计算量过大卡死 UI | 重算全部放 Worker；先小 universe 后全量；「全量」选项在 UI 上有卡顿提示 |

## 7. 建议执行顺序

```
Phase 2（AI 胜率 baseline，先小后大；含除权跳空过滤）
   ↓
判定：分桶有区分度？ ──否──→ 转 P1 模型化
   ↓是
Phase 3（相似形态重做）
   ↓
P1/P2（校准、风控、工程收敛）
```

~~原顺序中的 Phase 1（前复权数据源 + 数据体检）已回滚，不再作为前置。~~
