/**
 * 筹码分布（成本分布）计算
 *
 * 算法逐行移植自东方财富行情页 `#chart-cyq` 的前端实现（`CYQCalculator`），
 * 与 AKShare `stock_cyq_em` 所用副本一致，保证数值口径与官网相同。
 *
 * 核心思路：
 * 1. 把价格区间等分为 `factor` 个分箱（默认 150，与官网一致）；
 * 2. 从窗口内最早一根 K 线开始逐根迭代：
 *    - 衰减：所有已有筹码乘以 (1 - 换手率)，代表旧筹码被换手消化；
 *    - 叠加：当日成交以 (开+收+高+低)/4 为峰值、在 [最低, 最高] 上按三角形分布加入；
 *      一字板（高==低）按矩形处理（面积为三角形 2 倍）；
 * 3. 迭代到目标那根后，统计获利比例、平均成本与 70%/90% 成本区间。
 */

import type { ChipDistribution, ChipKlineBar, ChipPercentRange } from '@/types/chipDistribution';

/** 价格分箱数量。官网固定 150，改动会与官网数值不一致 */
export const CHIP_PRICE_BIN_COUNT = 150;

/** 浮点清理，等价于东财前端的 `value.toPrecision(12) / 1` */
function clean(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toPrecision(12));
}

export interface ChipCalculatorOptions {
  /** 价格分箱数量，默认 150（与东财官网一致） */
  factor?: number;
  /**
   * 回溯窗口（K 线根数）。
   * 不传或 <= 0 表示使用传入数据的全部（AKShare 副本即为此行为；
   * 东财官网默认 120 根，本项目的调用方按需传入）。
   */
  range?: number;
}

/**
 * 计算筹码分布
 *
 * @param bars 按时间升序排列、且带换手率的 K 线
 * @param index 目标 K 线下标，默认最后一根
 * @param options 分箱数量与回溯窗口
 */
export function calculateChipDistribution(
  bars: ChipKlineBar[],
  index?: number,
  options: ChipCalculatorOptions = {}
): ChipDistribution | null {
  if (!Array.isArray(bars) || bars.length === 0) {
    return null;
  }

  const factor = Math.max(2, Math.floor(options.factor ?? CHIP_PRICE_BIN_COUNT));
  const targetIndex = index === undefined ? bars.length - 1 : Math.floor(index);
  if (targetIndex < 0 || targetIndex >= bars.length) {
    return null;
  }

  const range = options.range && options.range > 0 ? Math.floor(options.range) : 0;
  const start = range > 0 ? Math.max(0, targetIndex - range + 1) : 0;
  const windowBars = bars.slice(start, targetIndex + 1);
  if (windowBars.length === 0) {
    return null;
  }

  // 窗口内的价格上下限（沿用东财的哨兵写法：0 视为「尚未取值」）
  let maxPrice = 0;
  let minPrice = 0;
  for (const bar of windowBars) {
    maxPrice = maxPrice === 0 ? bar.high : Math.max(maxPrice, bar.high);
    minPrice = minPrice === 0 ? bar.low : Math.min(minPrice, bar.low);
  }
  if (!Number.isFinite(maxPrice) || !Number.isFinite(minPrice) || maxPrice <= 0) {
    return null;
  }

  // 分箱精度不小于 0.01（东财产品逻辑）
  const span = Math.max(0, maxPrice - minPrice);
  const accuracy = Math.max(0.01, span / (factor - 1));

  const chipAmounts = new Array<number>(factor).fill(0);

  for (const bar of windowBars) {
    const avg = (bar.open + bar.close + bar.high + bar.low) / 4;
    const turnoverRate = Math.min(1, Math.max(0, (bar.turnoverRate || 0) / 100));

    // 1) 衰减：历史筹码按换手率流失
    if (turnoverRate > 0) {
      for (let n = 0; n < factor; n++) {
        chipAmounts[n] *= 1 - turnoverRate;
      }
    }

    const high = bar.high;
    const low = bar.low;

    // 2) 叠加当日成交形成的筹码
    if (high === low) {
      // 一字板：画矩形，面积是三角形的 2 倍
      const g = Math.floor((avg - minPrice) / accuracy);
      if (g >= 0 && g < factor) {
        chipAmounts[g] += ((factor - 1) * turnoverRate) / 2;
      }
      continue;
    }

    // 三角形峰值处的密度因子
    const peak = 2 / (high - low);
    const lowIndex = Math.ceil((low - minPrice) / accuracy);
    const highIndex = Math.floor((high - minPrice) / accuracy);

    for (let j = lowIndex; j <= highIndex; j++) {
      if (j < 0 || j >= factor) {
        continue;
      }
      const currentPrice = minPrice + accuracy * j;
      if (currentPrice <= avg) {
        // 上半三角
        chipAmounts[j] +=
          Math.abs(avg - low) < 1e-8
            ? peak * turnoverRate
            : ((currentPrice - low) / (avg - low)) * peak * turnoverRate;
      } else {
        // 下半三角
        chipAmounts[j] +=
          Math.abs(high - avg) < 1e-8
            ? peak * turnoverRate
            : ((high - currentPrice) / (high - avg)) * peak * turnoverRate;
      }
    }
  }

  let totalChips = 0;
  for (let i = 0; i < factor; i++) {
    totalChips += clean(chipAmounts[i]);
  }

  const priceAt = (i: number): number => minPrice + accuracy * i;

  /** 累加筹码达到 chip 时对应的价位 */
  const costByChip = (chip: number): number => {
    let sum = 0;
    for (let i = 0; i < factor; i++) {
      const value = clean(chipAmounts[i]);
      if (sum + value > chip) {
        return priceAt(i);
      }
      sum += value;
    }
    return 0;
  };

  const currentPrice = bars[targetIndex].close;

  let below = 0;
  for (let i = 0; i < factor; i++) {
    if (currentPrice >= priceAt(i)) {
      below += clean(chipAmounts[i]);
    }
  }

  const percentRange = (percent: number): ChipPercentRange => {
    const ps = [(1 - percent) / 2, (1 + percent) / 2];
    const low = costByChip(totalChips * ps[0]);
    const high = costByChip(totalChips * ps[1]);
    return {
      low: Number(low.toFixed(2)),
      high: Number(high.toFixed(2)),
      concentration: low + high === 0 ? 0 : (high - low) / (high + low),
    };
  };

  return {
    prices: Array.from({ length: factor }, (_, i) => Number(priceAt(i).toFixed(2))),
    amounts: chipAmounts.map(clean),
    totalChips,
    close: currentPrice,
    benefitRatio: totalChips === 0 ? 0 : below / totalChips,
    avgCost: Number(costByChip(totalChips * 0.5).toFixed(2)),
    range70: percentRange(0.7),
    range90: percentRange(0.9),
    barCount: windowBars.length,
  };
}

/** 在已完成的分箱价位中，找到与给定价格最接近的下标（用于图表标注） */
export function findNearestPriceIndex(prices: number[], price: number): number {
  if (prices.length === 0) {
    return -1;
  }
  let bestIndex = 0;
  let bestDistance = Math.abs(prices[0] - price);
  for (let i = 1; i < prices.length; i++) {
    const distance = Math.abs(prices[i] - price);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}
