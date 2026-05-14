/**
 * 筛选条件兼容性检查工具
 * 用于检测用户设置的筛选条件是否存在逻辑冲突
 */

import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';

/**
 * 检查筛选条件的兼容性，返回警告信息列表
 * @param filters 筛选条件快照
 * @returns 警告信息数组，空数组表示无冲突
 */
export function checkFilterCompatibility(filters: OpportunityFilterSnapshot): string[] {
  const warnings: string[] = [];

  // 1. MACD金叉与死叉同时勾选（虽然技术上可能，但罕见）
  if (filters.macdGoldenCross && filters.macdDeathCross) {
    warnings.push('💡 同时勾选MACD金叉和死叉：将匹配任一条件（OR关系）');
  }

  // 2. RSI超买超卖提示
  if (filters.rsiRange.max !== undefined && filters.rsiRange.max < 30) {
    warnings.push('💡 RSI上限<30（超卖区），将筛选超卖股票');
  }
  if (filters.rsiRange.min !== undefined && filters.rsiRange.min > 70) {
    warnings.push('💡 RSI下限>70（超买区），将筛选超买股票');
  }

  return warnings;
}

/**
 * 获取筛选条件的复杂度评分（用于性能提示）
 * @param filters 筛选条件快照
 * @returns 复杂度评分（0-100）
 */
export function getFilterComplexityScore(filters: OpportunityFilterSnapshot): number {
  let score = 0;

  // 基础筛选（价格、市值等）不计分

  // 技术指标筛选
  if (filters.rsiRange.min !== undefined || filters.rsiRange.max !== undefined) score += 5;
  if (filters.macdGoldenCross || filters.macdDeathCross || filters.macdDivergence) score += 10;
  if (filters.bollingerUpper || filters.bollingerMiddle || filters.bollingerLower) score += 8;

  // 横盘分析（需要滑动窗口）
  if (filters.consolidationFilterEnabled) score += 15;

  // 趋势线分析
  if (filters.trendLineFilterEnabled) score += 12;

  // 单日异动分析
  if (filters.sharpMoveFilterEnabled) score += 10;

  // AI分析（最复杂）
  if (filters.aiAnalysisEnabled) {
    score += 20;
  }

  return Math.min(100, score);
}

/**
 * 根据复杂度评分生成性能提示
 * @param score 复杂度评分
 * @returns 提示信息
 */
export function getPerformanceHint(score: number): string {
  if (score < 20) {
    return '✅ 筛选条件简单，预计速度快';
  } else if (score < 50) {
    return '💡 筛选条件中等，可能需要几秒';
  } else if (score < 80) {
    return '⚠️ 筛选条件复杂，可能需要较长时间';
  } else {
    return '🔴 筛选条件非常复杂，建议减少筛选项以提升速度';
  }
}
