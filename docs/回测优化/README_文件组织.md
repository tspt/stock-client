# 回测优化模块 - 文件组织说明

## 📁 目录结构

```
回测优化/
├── ml_model/                    # 机器学习模型文件夹
│   ├── README.md               # 模型使用说明
│   ├── ml_buypoint_model.cjs   # 决策树训练程序
│   ├── buypoint_model.json     # 训练好的模型
│   ├── analyze_buypoint_features.cjs      # 特征分析
│   ├── clustering_analysis.cjs            # 聚类分析
│   ├── time_series_analysis.cjs           # 时间序列分析
│   ├── non_buypoint_comparison.cjs        # 非买点对比
│   └── rule_combination_optimization.cjs  # 规则优化
│
├── stock_data/                  # 股票K线数据文件夹
│   ├── 中衡设计.txt (SH603017)
│   ├── 起帆股份.txt (SH605222)
│   ├── 永杉锂业.txt (SH603399)
│   ├── 山东玻纤.txt (SH605006)
│   ├── 宏昌电子.txt (SH603002)
│   ├── 三孚股份.txt (SH603938)
│   └── 艾华集团.txt (备用)
│
├── validation_scripts/          # 验证脚本文件夹
│   ├── check_*_dates.cjs       # 日期验证脚本(6个)
│   ├── verify_*_full.cjs       # 完整验证脚本(5个)
│   ├── verify_indicators.cjs   # 技术指标验证
│   └── verify_zhongheng_signals.cjs # 中衡设计信号验证
│
├── README_文件组织.md           # 本文件:目录结构说明
└── 回测买入信号优化方案.md      # 原始设计方案
```

---

## 📂 文件分类说明

### 1. 机器学习模型 (`ml_model/`)

**用途**: 基于决策树的买点识别模型及相关分析工具

**核心文件**:

- `ml_buypoint_model.cjs` - 主程序,训练决策树模型
- `buypoint_model.json` - 保存的训练模型

**分析工具**:

- 5 个方向的分析脚本,用于深入理解买点特征

**使用方法**:

```bash
cd ml_model
node ml_buypoint_model.cjs  # 训练模型
```

详见: `ml_model/README.md`

---

### 2. 股票数据文件 (`stock_data/`)

**用途**: 存储 6 只股票的 K 线数据,用于验证和分析

**文件列表**:

- 中衡设计.txt (SH603017) - 3 个买点
- 起帆股份.txt (SH605222) - 3 个买点
- 永杉锂业.txt (SH603399) - 2 个买点
- 山东玻纤.txt (SH605006) - 2 个买点
- 宏昌电子.txt (SH603002) - 2 个买点
- 三孚股份.txt (SH603938) - 2 个买点
- 艾华集团.txt - 备用数据

**数据格式**: JSON 格式,包含 dailyLines 数组

---

### 3. 验证脚本 (`validation_scripts/`)

#### 日期检查脚本 (`check_*_dates.cjs`)

**用途**: 验证目标日期是否存在于 K 线数据中,并显示次日表现

**示例**:

```bash
node check_zhongheng_dates.cjs
```

**输出**:

```
✅ 日期1 (2026-04-17)
   收盘价: 12.92
   次日表现: +9.98%
```

#### 完整验证脚本 (`verify_*_full.cjs`)

**用途**: 对每个买点计算 5 个技术指标(RSI、MACD、布林带、MA20、成交量),评估信号激活情况

**示例**:

```bash
node verify_zhongheng_full.cjs
```

**输出**: 详细的技术指标分析和信号评估

#### 其他验证脚本

- `verify_indicators.cjs` - 通用技术指标验证
- `verify_zhongheng_signals.cjs` - 中衡设计简化版验证

---

### 4. 设计文档

- `回测买入信号优化方案.md` - 原始优化方案设计文档

---

## 🔄 工作流程

### 阶段 1: 数据收集与验证 ✅ (已完成)

1. 收集 6 只股票的 K 线数据 → `stock_data/*.txt`
2. 验证买点日期有效性 → `validation_scripts/check_*_dates.cjs`
3. 验证技术指标方案 → `validation_scripts/verify_*_full.cjs`
4. **结论**: 传统 5 指标方案完全失效

### 阶段 2: 深入分析 ✅ (已完成)

1. 特征全面分析 → `ml_model/analyze_buypoint_features.cjs`
2. 聚类分析 → `ml_model/clustering_analysis.cjs`
3. 时间序列分析 → `ml_model/time_series_analysis.cjs`
4. 非买点对比 → `ml_model/non_buypoint_comparison.cjs`
5. 规则优化 → `ml_model/rule_combination_optimization.cjs`

### 阶段 3: 机器学习建模 ✅ (已完成)

1. 训练决策树模型 → `ml_model/ml_buypoint_model.cjs`
2. 保存模型 → `ml_model/buypoint_model.json`
3. **当前性能**: 准确率 94.8%, 精确率 100%, 召回率 36.4%

### 阶段 4: 样本积累 🔄 (进行中)

- 当前样本: 14 个买点
- 目标样本: 50-100 个买点
- **操作**: 发现新买点时,添加到配置并重新训练

### 阶段 5: 系统集成 ⏳ (待执行)

- 时机: 样本量达到 50-100 个后
- 任务: 将模型集成到项目回测系统中
- 功能: 自动化识别潜在买点

---

## 💡 使用建议

### 日常使用

1. **发现新买点**: 记录股票代码和日期
2. **获取 K 线数据**: 导出为 `{股票名称}.txt` 格式,放入 `stock_data/`
3. **验证日期**: `node validation_scripts/check_xxx_dates.cjs`
4. **更新配置**: 编辑 `ml_model/ml_buypoint_model.cjs` 中的 `stockFiles`
5. **重新训练**: `cd ml_model && node ml_buypoint_model.cjs`

### 定期维护

- 每增加 10 个新样本,重新训练一次模型
- 检查模型性能指标的变化
- 备份旧版本模型文件

---

## 📊 关键统计数据

| 项目         | 数值         |
| ------------ | ------------ |
| 股票数量     | 6 只         |
| 买点总数     | 14 个        |
| 平均次日涨幅 | +6.76%       |
| 正收益比例   | 100% (14/14) |
| 模型准确率   | 94.8%        |
| 模型精确率   | 100.0%       |

---

## 📝 注意事项

1. **不要删除** `stock_data/*.txt` 文件,它们是训练数据的基础
2. **定期备份** `ml_model/buypoint_model.json`,避免意外覆盖
3. **保持注释**,在添加新股票时注明买点日期和次日涨幅
4. **谨慎使用**,当前样本量小,模型可能存在过拟合

---

**最后更新**: 2026-04-30  
**维护者**: AI Assistant  
**版本**: v1.0
