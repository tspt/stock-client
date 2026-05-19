# ML 买点识别模型 - 版本管理说明

## 📁 文件列表

### 当前可用版本

| 文件名                  | 版本         | 特征数              | 说明                        | 状态    |
| ----------------------- | ------------ | ------------------- | --------------------------- | ------- |
| `mlBuypointModel.ts`    | v4.0         | 8 个（简化版）      | v4.0 版本（有 bug，待修复） | ⚠️ 备用 |
| `mlBuypointModel_v5.ts` | v5.0-rf-full | **28 个（完整版）** | v5.0 完整版，**默认使用**   | ✅ 推荐 |

---

## 🔧 版本切换方法

### 方法 1：修改导入路径（推荐）

在需要使用模型的组件中，修改导入语句：

```typescript
// 使用v4.0版本（8个特征，有bug）
import { predictBuyPoint, setIndustryModels } from '@/utils/analysis/mlBuypointModel';

// 使用v5.0版本（28个特征，推荐，默认）
import { predictBuyPoint, setIndustryModels } from '@/utils/analysis/mlBuypointModel_v5';
```

### 方法 2：重命名文件

如果需要全局切换，可以重命名文件：

```bash
# 备份当前版本
mv mlBuypointModel.ts mlBuypointModel_v5_current_backup.ts

# 启用新版本
mv mlBuypointModel_v5_full.ts mlBuypointModel.ts
```

---

## 📊 版本对比

### v5.0-rf（当前生产版本）

**特点：**

- ✅ 8 个基础特征
- ✅ 69 个行业独立模型
- ✅ 随机森林算法
- ⚠️ **存在 bug**：引用了不存在的 MODEL_TREE_V4 常量
- ⚡ 计算速度快
- 💾 内存占用小

**适用场景：**

- ❌ **不推荐使用**（有编译错误）
- 需要修复后才能使用

**特征列表：**

1. distFromHigh - 距 60 日高点距离
2. change5d - 5 日价格变化
3. change10d - 10 日价格变化
4. volumeRatio - 量比
5. ma5Deviation - MA5 偏离度
6. ma20Deviation - MA20 偏离度
7. bbWidth - 布林带宽度
8. atrPercent - ATR 百分比

---

### v5.0-rf-full（完整版本）

**特点：**

- ✅ **28 个完整特征**（与训练脚本一致）
- ✅ 69 个行业独立模型
- ✅ 随机森林算法
- ✅ 包含 RSI、MACD 等高级指标
- 📈 预测精度可能更高
- ⏱️ 计算速度较慢
- 💾 内存占用较大

**适用场景：**

- 需要更高预测精度的场景
- 离线分析或回测
- 特征工程研究

**特征分类：**

#### A. 价格动量特征（8 个）

- return_1d, return_3d, return_5d, return_10d
- ma5_deviation, ma20_deviation, ma60_deviation
- price_position

#### B. 波动性特征（7 个）

- volatility_5d, volatility_10d
- atr_normalized, bb_width
- daily_amplitude, max_amplitude_5d, price_range_ratio

#### C. 成交量特征（6 个）

- volume_ratio, vol_change_5d, vol_trend
- price_volume_corr, up_vol_ratio, money_flow_proxy

#### D. 技术形态特征（7 个）

- body_size, upper_shadow, lower_shadow
- consecutive_up, consecutive_down
- rsi_14, macd_histogram

---

## ⚠️ 注意事项

### 1. 特征数量必须匹配

**重要：** 使用的特征数量必须与训练模型时的特征数量一致！

- 如果使用 `mlBuypointModel.ts`（8 个特征），必须加载使用 8 个特征训练的模型
- 如果使用 `mlBuypointModel_v5_full.ts`（28 个特征），必须加载使用 28 个特征训练的模型

**当前训练系统使用的是 28 个特征**，因此：

- ✅ 应该使用 `mlBuypointModel_v5_full.ts`
- ❌ `mlBuypointModel.ts` 的特征数量不匹配，预测结果可能不准确

### 2. 建议操作

由于当前训练系统生成的是**28 个特征的模型**，建议：

1. **等待训练完成后**，测试 `mlBuypointModel_v5_full.ts` 的预测效果
2. 如果效果良好，将其重命名为 `mlBuypointModel.ts` 作为生产版本
3. 保留旧版本作为备份

### 3. 模型文件格式

所有版本的模型文件格式相同：

```json
{
  "industryName": "汽车零部件",
  "version": "v5.0-rf",
  "trees": [...],  // 决策树数组
  "featureNames": [...],
  "hyperparameters": {...},
  "performance": {...}
}
```

---

## 🔄 版本迭代记录

### v5.0-rf (2026-05-19)

- 初始版本
- 8 个基础特征
- 69 个行业独立模型
- 随机森林算法

### v5.0-rf-full (2026-05-19)

- 完整特征版本
- 28 个技术特征
- 与训练脚本完全匹配
- 包含 RSI、MACD 等高级指标

---

## 📝 开发建议

### 新功能开发流程

1. **创建新版本文件**

   ```bash
   cp mlBuypointModel_v5_full.ts mlBuypointModel_v6.ts
   ```

2. **在新文件中修改代码**

   - 添加新特征
   - 优化预测逻辑
   - 调整模型参数

3. **测试新版本**

   - 在开发环境中测试
   - 验证预测准确性
   - 检查性能影响

4. **部署新版本**

   - 修改导入路径
   - 或在应用中动态切换

5. **保留历史版本**
   - 不要删除旧版本
   - 便于回滚和对比

---

## 🎯 下一步计划

1. ✅ 完成当前 69 个行业的模型训练
2. 🔄 测试 `mlBuypointModel_v5_full.ts` 的预测效果
3. 📊 对比 8 特征 vs 28 特征的预测准确率
4. 🔧 根据测试结果选择最优版本
5. 📦 更新生产环境配置

---

## 📞 联系方式

如有问题，请查看：

- [README.md](../../回测优化/模型训练/README.md) - 训练系统文档
- [model-index.json](../../../public/models/industry/model-index.json) - 模型索引文件
