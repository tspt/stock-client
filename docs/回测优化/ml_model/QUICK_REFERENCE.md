# 买点模型 - 快速参考指南

## 🎯 一句话总结

**当前使用 v3.0 版本，召回率 100%，F1 分数 0.99，可放心使用！**

---

## ⚡ 快速开始

### 训练模型（最常用）

```bash
cd docs/回测优化/ml_model
node v3.0_ml_buypoint_model_enhanced.cjs
```

### 查看结果

- **模型文件**: `v3.0_buypoint_model_current.json`
- **性能指标**: 召回率 100%, F1 分数 0.99, 精确率 98.7%

---

## 📊 版本对比速查

| 版本     | 样本数    | 召回率     | F1 分数     | 推荐场景          |
| -------- | --------- | ---------- | ----------- | ----------------- |
| v1.0     | 14 个     | 35.3%      | 51.06       | ❌ 不推荐，仅参考 |
| v2.0     | 46-78 个  | 73.7-91.2% | 82.35-95.38 | ⚠️ 中等样本量     |
| **v3.0** | **75 个** | **100%**   | **0.99**    | ✅ **当前推荐**   |

---

## 🔧 添加新样本（3 步完成）

### 步骤 1: 准备数据

将 K 线数据保存为 `{股票名称}.txt`，放入 `../stock_data/` 目录

### 步骤 2: 标记买点

在文件末尾添加：

```
日期买点：2026-04-10, 2026-01-15, 2025-08-12
```

### 步骤 3: 更新配置并运行

编辑 `v3.0_ml_buypoint_model_enhanced.cjs` 的 `stockFiles` 数组，然后：

```bash
node v3.0_ml_buypoint_model_enhanced.cjs
```

---

## 📁 文件说明

### 核心脚本

- `v3.0_ml_buypoint_model_enhanced.cjs` ⭐ - **当前使用**
- `v2.0_ml_buypoint_model_optimized.cjs` - 参数优化版
- `v1.0_ml_buypoint_model_original.cjs` - 原始版本

### 模型文件

- `v3.0_buypoint_model_current.json` ⭐ - **当前模型**
- `v2.0_buypoint_model_78samples_backup.json` - 备份模型

### 分析工具（独立使用）

- `analyze_buypoint_features.cjs` - 特征分析
- `clustering_analysis.cjs` - 聚类分析
- `time_series_analysis.cjs` - 时间序列分析
- `non_buypoint_comparison.cjs` - 对比分析
- `rule_combination_optimization.cjs` - 规则优化

### 文档

- `README.md` - 详细说明
- `VERSION_HISTORY.md` - 版本历史
- `QUICK_REFERENCE.md` - 本文件

---

## 💡 常见问题

### Q1: 应该使用哪个版本？

**A**: 始终使用 v3.0，除非有特殊需求。

### Q2: 如何知道模型效果好坏？

**A**: 关注三个指标：

- 召回率 > 90% ✅
- F1 分数 > 0.85 ✅
- 精确率 > 95% ✅

### Q3: 什么时候需要重新训练？

**A**:

- 每增加 15-20 个新样本
- 发现模型在新股票上表现不佳
- 定期（每月）检查一次

### Q4: 模型文件太大怎么办？

**A**: v3.0 模型约 11KB，完全可接受。如果超过 50KB，考虑剪枝或分层模型。

### Q5: 如何备份重要版本？

**A**:

```bash
cp v3.0_buypoint_model_current.json v3.0_backup_20260501.json
```

---

## 📞 需要帮助？

1. 查看 `VERSION_HISTORY.md` 了解详细演进过程
2. 查看 `README.md` 了解完整使用说明
3. 运行分析工具深入了解数据特征

---

**最后更新**: 2026-05-01  
**维护者**: AI Assistant
