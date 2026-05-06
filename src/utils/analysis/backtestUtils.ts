/**
 * 回测工具函数
 * 用于在 Worker 环境中执行筛选逻辑
 *
 * 使用 ML 买点识别模型 v3.0 进行信号生成
 */

import type { KLineData } from '@/types/stock';
import { predictBuyPoint } from './mlBuypointModel';

/**
 * 综合筛选入口（使用 ML 模型）
 */
export function runBacktestScreening(klineData: KLineData[], index: number): boolean {
  if (index < 20) return false;

  // 使用 ML 模型预测是否为买点
  return predictBuyPoint(klineData, index);
}
