/**
 * 回测工具函数
 * 用于在 Worker 环境中执行筛选逻辑
 *
 * 使用 ML 买点识别模型 v5.0 进行信号生成（28个特征，分行业模型）
 */

import type { KLineData } from '@/types/stock';
import { predictBuyPoint } from './mlBuypointModel_v5';

/**
 * 综合筛选入口（使用 ML 模型）
 */
export function runBacktestScreening(
  klineData: KLineData[],
  index: number,
  industryName?: string
): boolean {
  if (index < 60) return false; // v5.0模型需要至少60天数据

  // 使用 ML 模型预测是否为买点（传入行业信息）
  return predictBuyPoint(klineData, index, industryName);
}
