# 技术指标详解

本文档详细说明项目中实现的各种技术指标的计算方法和应用场景。

## RSI (相对强弱指数)

**文件位置**: `src/utils/technicalIndicators.ts`

### 计算公式
```
1. 计算价格变化序列 (相比前一日的变化)
2. 分别计算上涨日和下跌日的平均幅度
3. RS = 平均上涨幅度 / 平均下跌幅度
4. RSI = 100 - (100 / (1 + RS))
```

### 使用方法
```typescript
import { calculateRSI } from '@/utils/technicalIndicators';

const rsi = calculateRSI(klineData, 14); // 默认14周期
const latestRSI = rsi[klineData.length - 1];
```

### 解读
- RSI < 30: 超卖区域，可能存在反弹机会
- 30 ≤ RSI ≤ 70: 中性区域
- RSI > 70: 超买区域，可能存在回调风险

### 数据要求
至少需要 15 根 K 线

---

## MACD (平滑异同移动平均线)

**文件位置**: `src/utils/technicalIndicators.ts`

### 计算公式
```
1. EMA(12) = 12日指数移动平均
2. EMA(26) = 26日指数移动平均
3. DIF = EMA(12) - EMA(26)
4. DEA = DIF的9日EMA
5. MACD柱 = (DIF - DEA) × 2
```

### 使用方法
```typescript
import { calculateMACD, isMACDGoldenCross, isMACDDeathCross, hasMACDDivergence } from '@/utils/technicalIndicators';

const macd = calculateMACD(klineData);
const latestIndex = klineData.length - 1;

// 检测金叉
const isGoldenCross = isMACDGoldenCross(macd.dif, macd.dea, latestIndex);

// 检测死叉
const isDeathCross = isMACDDeathCross(macd.dif, macd.dea, latestIndex);

// 检测背离
const hasDivergence = hasMACDDivergence(klineData, macd.dif, 20);
```

### 交叉信号
- **金叉**: DIF 从下向上穿越 DEA，看涨信号
- **死叉**: DIF 从上向下穿越 DEA，看跌信号
- **顶背离**: 价格创新高但 DIF 未创新高，可能转跌
- **底背离**: 价格创新低但 DIF 未创新低，可能反弹

### 数据要求
至少需要 35 根 K 线

---

## KDJ 随机指标

**参数配置** (src/utils/constants.ts):
```typescript
KDJ_PARAMS = {
  n: 9,   // RSV平滑周期
  m1: 3,  // K值平滑因子
  m2: 3,  // D值平滑因子
}
```

### 计算公式
```
RSV = (收盘价 - N日最低价) / (N日最高价 - N日最低价) × 100
K = (m1-1)/m1 × 前一日K值 + 1/m1 × RSV
D = (m2-1)/m2 × 前一日D值 + 1/m2 × K
J = 3 × K - 2 × D
```

### 解读
- KDJ > 80: 超买区域
- KDJ < 20: 超卖区域
- J 值可超过 100 或低于 0

---

## 布林带 (Bollinger Bands)

**文件位置**: `src/utils/technicalIndicators.ts`

### 计算公式
```
中轨 (Middle Band) = 20日简单移动平均 (SMA20)
标准差 = 20日收盘价的标准差
上轨 (Upper Band) = 中轨 + 2 × 标准差
下轨 (Lower Band) = 中轨 - 2 × 标准差
```

### 使用方法
```typescript
import { calculateBollingerBands, isNearUpperBand, isNearMiddleBand, isNearLowerBand } from '@/utils/technicalIndicators';

const bb = calculateBollingerBands(klineData, 20, 2);
const latest = klineData.length - 1;
const close = klineData[latest].close;

const nearUpper = isNearUpperBand(close, bb.upper[latest], bb.middle[latest], bb.lower[latest]);
const nearLower = isNearLowerBand(close, bb.upper[latest], bb.middle[latest], bb.lower[latest]);
```

### 数据要求
至少需要 20 根 K 线

---

## MA 移动平均线

**周期配置** (src/utils/constants.ts):
```typescript
MA_PERIODS = [5, 10, 20, 30, 60, 120, 240, 360]
```

### 计算公式
```
MA(N) = (第1日收盘价 + 第2日收盘价 + ... + 第N日收盘价) / N
```

### 使用场景
- MA5 / MA10: 短期趋势
- MA20: 中期趋势
- MA60 / MA120: 长期趋势
- MA5 > MA10 > MA20: 多头排列，看涨
- MA5 < MA10 < MA20: 空头排列，看跌

---

## 横盘分析

**文件位置**: `src/utils/consolidationAnalysis.ts`

### 横盘结构类型
- `low_stable`: 低位横盘 (价格在低位窄幅波动)
- `high_stable`: 高位横盘 (价格在高位窄幅波动)
- `box`: 箱体震荡 (价格在固定区间内波动)

### 分析参数
- `lookback`: 回溯K线条数
- `consecutive`: 连续满足条件数
- `threshold`: 波动阈值 (百分比)
- `requireClosesAboveMa10`: 是否要求收盘价在MA10上方

---

## 单日异动分析

**文件位置**: `src/utils/sharpMovePatterns.ts`

### 异动形态类型
- `onlyDrop`: 存在急跌日
- `onlyRise`: 存在急涨日
- `dropThenRiseLoose`: 急跌后第一次急涨
- `riseThenDropLoose`: 急涨后第一次急跌
- `dropThenFlatThenRise`: 急跌 → 中间普通日 → 急涨
- `riseThenFlatThenDrop`: 急涨 → 中间普通日 → 急跌

### 参数配置
- `windowBars`: 回溯窗口大小
- `magnitudePercent`: 涨跌阈值百分比

---

## 趋势线分析

**文件位置**: `src/utils/trendLineAnalysis.ts`

### 分析逻辑
检索最近 N 根 K 线中，是否存在连续 M 根满足：
1. 收盘价 ≥ 前一日收盘价
2. 收盘价 ≥ 当日 MA5

### 参数
- `lookback`: 检索窗口大小
- `consecutive`: 连续满足条件数
