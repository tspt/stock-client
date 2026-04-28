/**
 * 回测工具函数
 * 用于在 Worker 环境中执行筛选逻辑
 */

import type { KLineData } from '@/types/stock';
import { analyzeSharpMovePatterns } from './sharpMovePatterns';
import { predictTrend } from '@/services/opportunity/ai';
import { OPPORTUNITY_DEFAULT_SHARP_MOVE } from '../config/opportunityAnalysisDefaults';

/**
 * 综合筛选入口（仅保留异动和 AI 预测）
 */
export function runBacktestScreening(klineData: KLineData[], index: number): boolean {
  if (index < 30) return false;

  const slice = klineData.slice(0, index + 1);

  // 1. 单日异动筛选 (Sharp Move)
  const sharpMove = analyzeSharpMovePatterns(
    slice,
    OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
    OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude
  );

  // 2. AI 趋势预测 (简化版：只看方向是否为看涨)
  let aiPass = false;
  try {
    const prediction = predictTrend(slice);
    aiPass = prediction.direction === 'up' && prediction.confidence > 0.5;
  } catch (e) {
    // AI 计算失败不影响其他筛选
  }

  // 判定逻辑：必须同时满足“异动”和“AI 看涨”才视为高质量机会
  const isSharpMoveHit = sharpMove.dropThenRiseLoose || sharpMove.dropThenFlatThenRise;

  return isSharpMoveHit && aiPass;
}
