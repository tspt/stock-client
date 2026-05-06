# 买点验证模块

## 📁 目录说明

本目录包含手动买点覆盖率验证和分析相关的所有文件。

### 核心文件

#### 验证脚本

- `../validation_scripts/verify-buypoint-coverage.cjs` - 验证手动买点与模型信号的覆盖情况
- `../validation_scripts/analyze-missed-buypoints.cjs` - 分析未覆盖买点的 K 线特征

#### 数据报告

- `BUYPOINT_COVERAGE_REPORT.json` - 覆盖率详细报告（28 只股票的完整数据）
- `MISSED_BUYPOINTS_ANALYSIS.json` - 未覆盖买点的 K 线特征分析（18 个日期的技术指标）

#### 分析文档

- `BUYPOINT_COVERAGE_ANALYSIS.md` - 覆盖率验证报告（总体统计、分布、问题分析）
- `MISSED_BUYPOINTS_FEATURE_ANALYSIS.md` - 未覆盖买点特征分析（K 线形态、成交量、均线等）

## 📊 当前状态

**验证时间**: 2026-05-06  
**整体覆盖率**: 76.92% (60/78)  
**未覆盖买点数**: 18 个  
**需要优化的股票**: 12 只

### 严重问题股票（0%覆盖率）

1. **中衡设计 (SH603017)**: 0/3
2. **快克智能 (SH603203)**: 0/3

## 🔄 使用流程

### 1. 运行验证脚本

```bash
cd docs/回测优化/validation_scripts
node verify-buypoint-coverage.cjs
```

生成：

- `BUYPOINT_COVERAGE_REPORT.json`
- 控制台输出覆盖率统计

### 2. 运行分析脚本

```bash
cd docs/回测优化/validation_scripts
node analyze-missed-buypoints.cjs
```

生成：

- `MISSED_BUYPOINTS_ANALYSIS.json`
- 控制台输出特征统计

### 3. 查看分析报告

- 阅读 `BUYPOINT_COVERAGE_ANALYSIS.md` 了解整体情况
- 阅读 `MISSED_BUYPOINTS_FEATURE_ANALYSIS.md` 了解详细特征

## 📈 关键发现

### 未覆盖买点的共同特征

- 66.7%是阳线，平均涨幅+0.67%
- 72.2%在 5 日均线上方
- 成交量大多不突出（55.6%正常）
- RSI 主要在中性区（83.3%）

### 典型漏报案例

**中衡设计 2025-11-24**:

- ✅ +3.28%，放量 1.37 倍
- ✅ 站上所有均线
- ✅ RSI=52.99（健康区间）
- ❌ 但模型未识别！

## 🎯 下一步优化方向

### 优先级 1: 调整参数

- 降低成交量要求
- 放宽均线条件
- 扩展 RSI 触发区间

### 优先级 2: 新增规则

- 突破规则（中衡设计案例）
- 左侧交易规则（快克智能案例）
- 小阳线累积规则

### 优先级 3: 组合策略

- 多指标投票机制
- 市场状态自适应

## 📝 相关文件

- **主目录**: `docs/回测优化/`
- **验证脚本**: `validation_scripts/`
- **股票数据**: `stock_data/`
- **导出文件**: `历史回测数据/backtest_export_*.json`
- **模型文件**: `ml_model/v3.0_ml_buypoint_model_enhanced.cjs`

---

**最后更新**: 2026-05-06  
**维护者**: AI Assistant
