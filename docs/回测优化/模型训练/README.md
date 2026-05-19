# 分行业随机森林模型训练系统

## 📋 概述

本系统为 69 个行业分别训练独立的随机森林买点识别模型，使用纯 JavaScript 实现，无需外部机器学习库。

### 核心特点

- **分行业建模**：每个行业独立训练，捕捉行业特性
- **随机森林算法**：多树投票机制，抗过拟合能力强
- **28 个技术特征**：涵盖价格动量、波动性、成交量、技术形态四大类
- **信号定义明确**：买入后 1/2/3/5 日至少两种收益为正即为好信号
- **并行训练**：支持多 Worker 线程并行训练，大幅提升速度
- **完整评估体系**：交叉验证、超参数调优、回测验证

---

## 🚀 快速开始

### 1. 运行训练

```bash
cd docs/回测优化/模型训练
node train_all_industries.cjs
```

### 2. 查看结果

训练完成后会生成：

- `public/models/industry/` - 69 个行业模型文件
- `docs/回测优化/模型训练/training_report.json` - 训练报告
- `docs/回测优化/模型训练/backtest_report.json` - 回测报告（需单独运行）

### 3. 运行回测验证

```bash
node backtest_validator.cjs
```

---

## 📁 项目结构

```
模型训练/
├── decision_tree.cjs              # 决策树算法实现
├── random_forest.cjs              # 随机森林算法实现
├── data_loader.cjs                # 数据加载和预处理
├── signal_labeler.cjs             # 信号点标注
├── feature_engineer.cjs           # 特征工程（28个特征）
├── cross_validator.cjs            # 交叉验证评估
├── hyperparameter_tuner.cjs       # 超参数调优
├── train_single_industry.cjs      # 单行业训练器
├── train_all_industries.cjs       # 并行训练主控脚本
├── backtest_validator.cjs         # 回测验证脚本
└── README.md                      # 本文档
```

---

## 🔧 核心模块说明

### 1. 决策树 (decision_tree.cjs)

**算法**：CART（分类回归树）  
**分裂标准**：基尼不纯度  
**关键参数**：

- `maxDepth`: 最大深度
- `minSamplesSplit`: 最小分割样本数
- `minSamplesLeaf`: 最小叶节点样本数
- `maxFeatures`: 每次分裂考虑的最大特征数

**使用方法**：

```javascript
const DecisionTree = require('./decision_tree.cjs');

const tree = new DecisionTree({
  maxDepth: 10,
  minSamplesSplit: 2,
  minSamplesLeaf: 1,
});

tree.fit(X, y); // X: 特征矩阵, y: 标签数组
const predictions = tree.predict(X_test);
```

### 2. 随机森林 (random_forest.cjs)

**算法**：Bagging + 特征子集选择  
**投票机制**：多数投票

**关键参数**：

- `nTrees`: 树的数量（默认 100）
- `maxDepth`: 树的最大深度
- `maxFeatures`: 特征子集比例（默认 sqrt(n_features)）
- `bootstrap`: 是否使用 Bootstrap 采样

**使用方法**：

```javascript
const RandomForest = require('./random_forest.cjs');

const rf = new RandomForest({
  nTrees: 100,
  maxDepth: 10,
  minSamplesLeaf: 10,
  maxFeatures: 0.7,
});

rf.fit(X, y);
const predictions = rf.predict(X_test);
```

### 3. 特征工程 (feature_engineer.cjs)

#### A. 价格动量特征（8 个）

1. `return_1d` - 1 日收益率
2. `return_3d` - 3 日累计收益率
3. `return_5d` - 5 日累计收益率
4. `return_10d` - 10 日累计收益率
5. `ma5_deviation` - 相对 5 日均线偏离度
6. `ma20_deviation` - 相对 20 日均线偏离度
7. `ma60_deviation` - 相对 60 日均线偏离度
8. `price_position` - 价格位置指标

#### B. 波动性特征（7 个）

9. `volatility_5d` - 5 日年化波动率
10. `volatility_10d` - 10 日年化波动率
11. `atr_normalized` - 归一化 ATR
12. `bb_width` - 布林带宽度
13. `daily_amplitude` - 当日振幅
14. `max_amplitude_5d` - 近 5 日最大振幅
15. `price_range_ratio` - 价格区间比率

#### C. 成交量特征（6 个）

16. `volume_ratio` - 量比
17. `vol_change_5d` - 成交量 5 日变化率
18. `vol_trend` - 成交量趋势斜率
19. `price_volume_corr` - 价量相关系数
20. `up_vol_ratio` - 上涨日成交量占比
21. `money_flow_proxy` - 资金流向代理

#### D. 技术形态特征（7 个）

22. `body_size` - K 线实体大小
23. `upper_shadow` - 上影线比例
24. `lower_shadow` - 下影线比例
25. `consecutive_up` - 连续上涨天数
26. `consecutive_down` - 连续下跌天数
27. `rsi_14` - RSI 指标(14 日)
28. `macd_histogram` - MACD 柱状图值

---

## 📊 信号定义

**好信号标准**：买入后持有 1 日、2 日、3 日、5 日，至少两种收益为正

```javascript
// 示例：判断是否为好信号
const returns = {
  day1: 0.02, // +2%
  day2: -0.01, // -1%
  day3: 0.03, // +3%
  day5: 0.01, // +1%
};

// 正收益天数：day1, day3, day5 → 3天
// 3 >= 2 → 是好信号 ✓
```

---

## ⚙️ 训练流程

### 步骤 1：数据加载

- 读取`股票数据/`目录下所有 JSON 文件
- 按行业分组（从`industry`字段提取）
- 验证数据质量（最少 500 天 K 线）

### 步骤 2：信号标注

- 遍历每个交易日的 K 线数据
- 计算未来 1/2/3/5 日收益
- 根据标准标注正负样本

### 步骤 3：特征提取

- 计算 28 个技术特征
- 处理缺失值和边界情况

### 步骤 4：超参数调优

- 网格搜索最优配置
- 3 折时间序列交叉验证
- 基于 F1 分数选择最佳参数

### 步骤 5：模型训练

- 使用最佳配置训练最终模型
- 80%训练集，20%测试集

### 步骤 6：评估与保存

- 计算测试集性能指标
- 保存模型到`public/models/industry/`

---

## 📈 模型评估指标

### 主要指标

- **准确率 (Accuracy)**：正确预测的比例
- **精确率 (Precision)**：预测为买点的样本中真正好的信号占比
- **召回率 (Recall)**：所有好信号中被正确识别的比例
- **F1 分数**：精确率和召回率的调和平均
- **AUC-ROC**：模型整体区分能力

### 业务指标（回测）

- **胜率**：预测买点后实际获利的比例
- **平均收益**：成功交易的平均回报
- **最大回撤**：最坏情况下的亏损幅度

---

## 🔍 超参数搜索空间

系统预定义了 9 种配置组合：

| 配置 ID          | nTrees | maxDepth | minSamplesLeaf | maxFeatures |
| ---------------- | ------ | -------- | -------------- | ----------- |
| Config_Shallow_1 | 50     | 5        | 10             | 0.5         |
| Config_Shallow_2 | 100    | 5        | 10             | 0.5         |
| Config_Medium_1  | 100    | 8        | 10             | 0.7         |
| Config_Medium_2  | 150    | 8        | 10             | 0.7         |
| Config_Medium_3  | 100    | 10       | 15             | 0.7         |
| Config_Deep_1    | 150    | 12       | 15             | 1.0         |
| Config_Deep_2    | 200    | 12       | 20             | 1.0         |
| Config_Deep_3    | 150    | 15       | 20             | 0.7         |

可根据需要调整`hyperparameter_tuner.cjs`中的配置。

---

## 💻 并行训练配置

### Worker 线程数量

默认使用 CPU 核心数（最多 8 个）：

```javascript
const maxWorkers = Math.min(os.cpus().length, 8);
```

### 内存管理

建议设置 Node.js 内存限制：

```bash
node --max-old-space-size=4096 train_all_industries.cjs
```

### 批次处理

系统会自动分批处理行业，每批最多`maxWorkers`个行业并行训练。

---

## 📝 输出文件格式

### 模型文件 (`{行业名}_model.json`)

```json
{
  "industryName": "半导体",
  "version": "v1.0-rf",
  "trainingDate": "2026-05-19T10:30:00Z",
  "algorithm": "RandomForest",
  "hyperparameters": {
    "nTrees": 100,
    "maxDepth": 10,
    "minSamplesLeaf": 10,
    "maxFeatures": 0.7
  },
  "trees": [...],
  "featureNames": ["return_1d", "return_3d", ...],
  "performance": {
    "accuracy": 0.88,
    "precision": 0.85,
    "recall": 0.65,
    "f1": 0.74,
    "auc": 0.82
  },
  "trainingSamples": {
    "total": 5000,
    "positive": 800,
    "negative": 4200
  }
}
```

### 训练报告 (`training_report.json`)

包含所有行业的训练结果、性能指标、超参数配置等。

### 回测报告 (`backtest_report.json`)

包含各行业模型的回测表现、胜率、收益率等。

---

## ❓ 常见问题

### Q1: 训练速度慢怎么办？

**A**:

- 增加并行 Worker 数量（修改`train_all_industries.cjs`中的`maxWorkers`）
- 使用快速搜索模式（设置`useQuickSearch: true`）
- 减少树的數量或最大深度

### Q2: 某些行业训练失败？

**A**:

- 检查该行业是否有足够的股票数据（至少几只股票）
- 确认 K 线数据长度 ≥500 天
- 查看错误日志定位具体问题

### Q3: 模型性能不理想？

**A**:

- 检查信号标注是否正确
- 尝试调整超参数搜索空间
- 增加训练样本数量
- 考虑特征工程优化

### Q4: 如何添加新特征？

**A**:

1. 在`feature_engineer.cjs`中添加特征计算逻辑
2. 更新`FEATURE_NAMES`数组
3. 确保特征计算函数返回正确的维度
4. 重新训练模型

### Q5: 模型文件大小？

**A**:

- 无限制，但通常每个模型在 1-10MB 之间
- 取决于树的数量和深度
- 可通过减少`nTrees`或`maxDepth`减小文件

---

## 🎯 性能优化建议

### 训练阶段

1. **并行化**：充分利用多核 CPU
2. **缓存中间结果**：避免重复计算特征
3. **早停机制**：如果某配置明显不佳，提前终止

### 推理阶段

1. **模型缓存**：前端加载后缓存在内存中
2. **批量预测**：一次性预测多个位置
3. **特征复用**：相邻时间点的特征可部分复用

---

## 📚 参考资料

- Breiman, L. (2001). Random Forests. Machine Learning.
- CART 算法原理
- 技术指标计算方法（MA, RSI, MACD, ATR, Bollinger Bands 等）

---

## 📞 技术支持

如有问题，请查看：

- 训练日志输出
- `training_report.json`中的详细错误信息
- 代码注释和文档

---

**最后更新**: 2026-05-19  
**版本**: v1.0
