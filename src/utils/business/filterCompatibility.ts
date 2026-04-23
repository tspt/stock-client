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

  // 1. 横盘与上升趋势/下降趋势可能存在冲突
  if (filters.consolidationFilterEnabled) {
    if (filters.trendUptrend) {
      warnings.push('⚠️ 横盘筛选与上升趋势可能存在冲突：横盘通常无明显趋势');
    }
    if (filters.trendDowntrend) {
      warnings.push('⚠️ 横盘筛选与下降趋势可能存在冲突：横盘通常无明显趋势');
    }
  }

  // 2. 仅急跌与AI看涨趋势矛盾
  if (filters.sharpMoveFilterEnabled && filters.sharpMoveOnlyDrop && filters.aiAnalysisEnabled) {
    if (filters.aiTrendUp) {
      warnings.push('⚠️ 仅急跌形态与AI看涨趋势可能存在矛盾');
    }
  }

  // 3. 仅急涨与AI看跌趋势矛盾
  if (filters.sharpMoveFilterEnabled && filters.sharpMoveOnlyRise && filters.aiAnalysisEnabled) {
    if (filters.aiTrendDown) {
      warnings.push('⚠️ 仅急涨形态与AI看跌趋势可能存在矛盾');
    }
  }

  // 4. 突破形态与横盘筛选冲突
  if (filters.trendBreakout && filters.consolidationFilterEnabled) {
    warnings.push('⚠️ 突破形态与横盘筛选可能冲突：突破意味着结束横盘');
  }

  // 5. 跌破形态与横盘筛选冲突
  if (filters.trendBreakdown && filters.consolidationFilterEnabled) {
    warnings.push('⚠️ 跌破形态与横盘筛选可能冲突：跌破意味着结束横盘');
  }

  // 6. MACD金叉与死叉同时勾选（虽然技术上可能，但罕见）
  if (filters.macdGoldenCross && filters.macdDeathCross) {
    warnings.push('💡 同时勾选MACD金叉和死叉：将匹配任一条件（OR关系）');
  }

  // 7. RSI超买超卖与趋势方向矛盾
  if (filters.rsiRange.max !== undefined && filters.rsiRange.max < 30 && filters.trendUptrend) {
    warnings.push('⚠️ RSI上限<30（超卖区）与上升趋势可能矛盾');
  }
  if (filters.rsiRange.min !== undefined && filters.rsiRange.min > 70 && filters.trendDowntrend) {
    warnings.push('⚠️ RSI下限>70（超买区）与下降趋势可能矛盾');
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

  // K线形态筛选（计算密集型）
  const candlestickCount = [
    filters.candlestickHammer,
    filters.candlestickShootingStar,
    filters.candlestickDoji,
    filters.candlestickEngulfingBullish,
    filters.candlestickEngulfingBearish,
    filters.candlestickHaramiBullish,
    filters.candlestickHaramiBearish,
    filters.candlestickMorningStar,
    filters.candlestickEveningStar,
    filters.candlestickDarkCloudCover,
    filters.candlestickPiercing,
    filters.candlestickThreeBlackCrows,
    filters.candlestickThreeWhiteSoldiers,
  ].filter(Boolean).length;
  score += candlestickCount * 3;

  // 趋势形态筛选
  const trendCount = [
    filters.trendUptrend,
    filters.trendDowntrend,
    filters.trendSideways,
    filters.trendBreakout,
    filters.trendBreakdown,
  ].filter(Boolean).length;
  score += trendCount * 4;

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
