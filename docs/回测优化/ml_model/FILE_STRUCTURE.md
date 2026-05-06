# ml_model 文件夹结构说明

## 📂 目录树

```
ml_model/
│
├── 📄 文档文件
│   ├── README.md                    # 主文档 - 详细说明和使用指南
│   ├── VERSION_HISTORY.md           # 版本历史 - 完整的演进记录
│   ├── QUICK_REFERENCE.md           # 快速参考 - 常用操作速查
│   └── FILE_STRUCTURE.md            # 本文件 - 文件夹结构说明
│
├── 🔧 核心脚本（按版本）
│   ├── v1.0_ml_buypoint_model_original.cjs          # v1.0 原始版本（21KB）
│   ├── v1.0_ml_buypoint_model_original_backup.cjs   # v1.0 备份
│   ├── v2.0_ml_buypoint_model_optimized.cjs         # v2.0 参数优化版（28KB）
│   ├── v2.0_ml_buypoint_model_optimized_backup.cjs  # v2.0 备份
│   └── v3.0_ml_buypoint_model_enhanced.cjs          # v3.0 增强版 ⭐（25KB）
│
├── 🤖 模型文件
│   ├── v3.0_buypoint_model_current.json             # 当前最优模型 ⭐（11KB）
│   └── v2.0_buypoint_model_78samples_backup.json    # v2.0 备份模型（0.6KB）
│
└── 🔬 分析工具（独立使用，不按版本管理）
    ├── analyze_buypoint_features.cjs       # 买点特征全面分析（16KB）
    ├── clustering_analysis.cjs             # 聚类分析（12KB）
    ├── time_series_analysis.cjs            # 时间序列模式分析（9KB）
    ├── non_buypoint_comparison.cjs         # 非买点对比分析（11KB）
    └── rule_combination_optimization.cjs   # 规则组合优化（11KB）
```

---

## 🎯 文件分类说明

### 1️⃣ 核心脚本（版本化）

**命名规则**: `v{版本号}_{功能描述}.cjs`

| 文件                     | 版本 | 状态        | 说明                          |
| ------------------------ | ---- | ----------- | ----------------------------- |
| `v1.0_..._original.cjs`  | v1.0 | 📦 归档     | 14 样本，召回率 35.3%         |
| `v2.0_..._optimized.cjs` | v2.0 | 📦 归档     | 46-78 样本，召回率 73.7-91.2% |
| `v3.0_..._enhanced.cjs`  | v3.0 | ✅ **当前** | 75 样本，召回率 100%          |

**使用建议**:

- 日常使用 v3.0
- 仅在需要对比时访问 v1.0/v2.0

---

### 2️⃣ 模型文件（版本化）

**命名规则**: `v{版本号}_buypoint_model_{描述}.json`

| 文件                                        | 版本 | 大小  | 说明              |
| ------------------------------------------- | ---- | ----- | ----------------- |
| `v3.0_buypoint_model_current.json`          | v3.0 | 11KB  | ⭐ 当前使用的模型 |
| `v2.0_buypoint_model_78samples_backup.json` | v2.0 | 0.6KB | 78 样本时期的备份 |

**注意**:

- `current` 表示当前正在使用的版本
- 新版本会覆盖 current 文件
- 重要版本请手动备份

---

### 3️⃣ 分析工具（不版本化）

这些是独立的分析脚本，用于深入理解数据特征，不随模型版本变化。

| 文件                                | 功能         | 使用场景           |
| ----------------------------------- | ------------ | ------------------ |
| `analyze_buypoint_features.cjs`     | 买点特征分析 | 了解买点的共同特征 |
| `clustering_analysis.cjs`           | 聚类分析     | 发现买点类型       |
| `time_series_analysis.cjs`          | 时间序列分析 | 分析买点后走势     |
| `non_buypoint_comparison.cjs`       | 对比分析     | 区分买点与非买点   |
| `rule_combination_optimization.cjs` | 规则优化     | 探索规则组合效果   |

**使用频率**: 低（仅在深入研究时使用）

---

### 4️⃣ 文档文件

| 文件                 | 用途     | 推荐阅读顺序 |
| -------------------- | -------- | ------------ |
| `QUICK_REFERENCE.md` | 快速开始 | 1️⃣ 首先阅读  |
| `README.md`          | 完整说明 | 2️⃣ 详细了解  |
| `VERSION_HISTORY.md` | 版本演进 | 3️⃣ 深入了解  |
| `FILE_STRUCTURE.md`  | 本文件   | 4️⃣ 参考查阅  |

---

## 📊 文件大小统计

| 类别     | 文件数    | 总大小     | 占比     |
| -------- | --------- | ---------- | -------- |
| 核心脚本 | 5 个      | ~125KB     | 65%      |
| 模型文件 | 2 个      | ~12KB      | 6%       |
| 分析工具 | 5 个      | ~60KB      | 31%      |
| 文档文件 | 4 个      | ~16KB      | 8%       |
| **总计** | **16 个** | **~213KB** | **100%** |

---

## 🔄 版本演进流程

```
v1.0 (原始)
  ↓ 添加参数搜索
v2.0 (优化)
  ↓ 增加深度和配置
v3.0 (增强) ⭐ 当前版本
  ↓ 未来可能
v4.0 (分层模型?) - 如果样本量>150且性能下降
```

---

## 💡 最佳实践

### 日常操作流程

1. **添加新样本** → 编辑 `v3.0_ml_buypoint_model_enhanced.cjs`
2. **重新训练** → `node v3.0_ml_buypoint_model_enhanced.cjs`
3. **验证结果** → 查看输出的性能指标
4. **备份重要版本** → 复制 `v3.0_buypoint_model_current.json`

### 定期维护

- **每月检查**: 运行一次训练，确认模型性能稳定
- **样本积累**: 每 15-20 个新样本重新训练
- **版本备份**: 重大更新前手动备份

### 清理建议

当 v4.0 发布后，可以考虑：

- 删除 v1.0 相关文件（保留 v2.0 作为参考）
- 压缩归档旧版本到 `archive/` 文件夹

---

## 📞 沟通指南

与 AI 助手沟通时，可以这样引用：

- **"使用 v3.0 模型"** - 明确指定版本
- **"查看 VERSION_HISTORY"** - 了解演进过程
- **"运行 v3.0 脚本"** - 执行训练
- **"对比 v2.0 和 v3.0"** - 性能对比

---

**最后更新**: 2026-05-01  
**维护者**: AI Assistant
