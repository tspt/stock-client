# 机会分析 - AI筛选优化计划

**文档版本**: v1.0  
**创建日期**: 2026-04-22  
**作者**: AI Coding Assistant (RIPER-5 Protocol)  
**优先级确认**: 2(准确性/胜率最高) > 3(完全可解释) > 4(性能优先) > 5(长期可维护/可扩展)  
**适用范围**: **仅针对AI筛选部分**（不修改横盘、趋势线、单日异动、技术指标、K线形态、趋势形态等其他筛选逻辑）

---

## 1. 当前逻辑分析（RESEARCH阶段总结）

### 1.1 核心流程
- **数据来源**: `startAnalysis` → `analyzer.ts` → `performAIAnalysis` (位于 `src/services/opportunity/ai.ts`)
- **筛选路径**: `OpportunityPage` → `filterSnapshot` (包含所有AI字段) → `useOpportunityFilterEngine` (轻量过滤 + 300ms防抖) → `opportunityFilterWorker.ts` (`passesAIFilter` + `aiAnalysisFilterActive`)
- **Worker执行顺序** (AI部分在最后):
  1. 规则快速检查 (趋势方向OR、置信度/评分范围、相似形态等)
  2. 专业版增强 (时间衰减、加权评分、一致性校验、信号共识、历史胜率)
  3. 生成详细skip reason并记录到 `skipped` 数组
- **可解释性**: 每个skip都有具体中文reason（如“趋势不匹配：期望[上涨]，实际为横盘”、“置信度过低：42.3% < 50%”、“信号冲突：看涨趋势与高风险评分不一致”）
- **缓存机制**: `aiCacheMap` (5分钟TTL)、klineCache patch优化、Worker yield每40条

### 1.2 当前实现特点
- **规则驱动专家系统**: 多信号加权投票 (MA、RSI6/12、MACD、布林带、量价、趋势形态)
- **相似形态**: 特征提取 (价格/量变化序列、波动率、线性回归斜率) + 加权余弦相似度
- **支撑阻力**: 简单取最近20根K线极值
- **默认配置**: `aiAnalysisEnabled: true`, `aiTrendUp: true`, `aiTrendScoreRange.min: 50`, `aiRiskScoreRange.max: 50`
- **诊断支持**: `FilterDiagnosticsPanel` 显示按频率排序的skip原因
- **局限性**: 固定人工权重、简单规则、批次限制影响相似形态、缺少真实历史胜率闭环验证

**当前代码文件映射**:
- 类型: `src/types/opportunityFilter.ts` + `src/types/stock.ts`
- 核心逻辑: `src/services/opportunity/ai.ts`、`src/workers/opportunityFilterWorker.ts`
- 引擎: `src/hooks/useOpportunityFilterEngine.ts`
- UI: `src/pages/OpportunityPage/OpportunityPage.tsx`、`OpportunityFiltersPanel.tsx`
- 服务: `src/services/opportunity/AIService.ts`、`featureEngine` 相关

---

## 2. 推荐方案：混合规则 + 统计模型（方案2增强版）

**为什么选择此方案**:
- 准确性/胜率：引入统计模型 (LightGBM/XGBoost) 学习历史模式，显著优于纯规则。
- 完全可解释：规则reason + SHAP值/特征重要性 → 自然语言解释。
- 性能优先：Worker并行、特征缓存、增量计算。
- 长期可维护：模块化设计、配置驱动、回测闭环、易扩展到LLM或深度模型。

**核心改进思路**:
- **分层筛选**：规则快速过滤 (现有) → 模型概率打分 → SHAP解释 → 复合分数决策。
- **特征工程**：提取30+维量化特征，作为模型输入和解释依据。
- **模型**：离线训练LightGBM，导出ONNX格式，在Worker中推理（或JS决策树近似）。
- **解释**：SHAP值转自然语言（如“RSI金叉特征贡献最高(+0.28)，显著提升看涨概率”）。
- **闭环**：新增回测模块，定期计算策略胜率并展示。

---

## 3. 详细实施蓝图

### 3.1 新增/修改模块
1. **特征工程** (`src/services/opportunity/featureEngine.ts` - 新建)
   - 提取标准化特征向量（RSI、MACD斜率、布林位置、量价相关性、波动率、趋势斜率、历史形态统计等）。
   - 所有特征都有业务注释和计算公式。

2. **模型预测** (`src/services/opportunity/modelPredictor.ts` - 新建)
   - 加载ONNX模型，输入features输出概率(`modelScore`)。
   - 复合分数：`0.6 * modelScore + 0.4 * rulesConfidence`。

3. **解释生成** (`src/services/opportunity/explanationGenerator.ts` - 新建)
   - 将SHAP值或特征重要性转换为自然语言reason。
   - 支持Top3贡献特征展示。

4. **回测验证** (`src/services/opportunity/backtestValidator.ts` - 新建)
   - 历史数据回测，计算胜率、夏普比率、最大回撤。
   - 面板展示“当前AI策略历史胜率：68.4%（基于过去6个月）”。

5. **类型扩展**
   - `AIAnalysisResult`: 增加 `features`, `modelScore`, `shapValues`, `historicalWinRate`。
   - `OpportunityFilterSnapshot`: 增加 `aiModelThreshold`, `enableSHAPExplanation` 等。

### 3.2 Worker增强 (`opportunityFilterWorker.ts`)
- 在 `passesAIFilter` 中插入：
  - 特征提取（如果缺失）。
  - 模型预测。
  - 解释生成。
  - 合并reason（规则reason + 模型解释）。
- 保留原有所有规则作为fallback。
- 增强缓存（features hash + model version）。

### 3.3 UI与诊断增强
- `OpportunityFiltersPanel.tsx`: AI面板新增“模型阈值”滑块、`显示SHAP解释`开关。
- `FilterDiagnosticsPanel.tsx`: 支持显示模型得分、Top贡献特征、规则+模型混合reason。
- `AIAnalysisModal`: 展示特征重要性图表和详细解释。

### 3.4 性能与缓存优化
- Worker yield + 现有cancel机制。
- 分层缓存：特征缓存、模型预测缓存、完整AI结果缓存。
- 增量更新：仅重新计算筛选条件变化影响的股票。

---

## 4. 实施顺序与里程碑

**Phase 1 (基础 - 2天)**
- 类型扩展 + 特征工程模块
- 更新 `ai.ts` 集成特征提取

**Phase 2 (模型与解释 - 3天)**
- 模型预测器 + 简单加权模拟（先不引入真实ML）
- 解释生成器 + SHAP简化版
- Worker集成

**Phase 3 (UI与诊断 - 2天)**
- 筛选面板增强
- 诊断面板升级
- AIAnalysisModal改进

**Phase 4 (验证与优化 - 2天)**
- 回测模块
- 性能测试（1000只股票 < 800ms）
- A/B测试（新旧方案胜率对比）
- 文档更新 + 默认配置调优

**总计预计**: 9个工作日（可并行部分模块）

---

## 5. 风险控制与回滚

- 新增 `enableAdvancedAIModel: boolean` 开关，默认 `false`（使用原有纯规则逻辑）。
- 所有新函数都有详细JSDoc和边界case处理。
- 保留原有 `passesAIFilter` 完整逻辑作为fallback。
- 逐步上线：先在诊断面板并行显示“旧规则得分”与“新模型得分”。

---

## 6. 下一步行动

1. **明天沟通重点**：
   - 确认具体特征列表
   - 决定使用真实LightGBM还是先用加权公式模拟
   - 讨论SHAP解释的展示形式（文字/图表）
   - 确定回测数据窗口（过去3个月/6个月/1年）

2. **进入EXECUTE前需要**：
   - 您批准此PLAN（回复“计划批准，进入[MODE: EXECUTE]”或提出修改）
   - 提供测试股票代码或具体期望胜率目标（可选）

---

**文档用途**：作为明天继续沟通的参考 baseline。所有变更将严格遵循“不调整缩进、引号、格式”等规则，仅做逻辑相关修改。

**RIPER-5 状态**: 当前处于 PLAN 模式，已完成详细蓝图，等待您的批准进入 EXECUTE 模式编写生产代码。

---
*此文件由AI根据当前代码库自动整理生成，可随时更新。*
