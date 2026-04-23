/**
 * 声明式筛选规则配置
 * 所有筛选逻辑（包括AI和其他类型）均通过此配置驱动
 * 这解决了可维护性问题，并支持AI按需计算
 */

import type { ConsolidationType } from '@/types/stock';
import type { NumberRange } from '@/types/opportunityFilter';

export interface FilterRule {
  id: string;
  category: 'basic' | 'consolidation' | 'trend' | 'sharpMove' | 'technical' | 'ai';
  field?: string;
  operator?: 'equals' | 'range' | 'gt' | 'lt' | 'contains';
  value?: any;
  weight?: number;
  dependencies?: string[];
  requiresAI?: boolean;
  skipReasonTemplate?: string;
  scorer?: string; // 用于加权评分
  description: string;
}

export const defaultFilterRules: FilterRule[] = [
  // 基础数据筛选规则
  {
    id: 'price_range',
    category: 'basic',
    field: 'price',
    operator: 'range',
    dependencies: [],
    description: '价格区间筛选',
  },
  {
    id: 'market_cap_range',
    category: 'basic',
    field: 'marketCap',
    operator: 'range',
    description: '市值区间筛选',
  },
  // AI 规则 (仅在 aiAnalysisEnabled 时激活)
  {
    id: 'ai_enabled',
    category: 'ai',
    field: 'aiAnalysisEnabled',
    operator: 'equals',
    value: true,
    requiresAI: true,
    description: '启用AI分析筛选',
  },
  {
    id: 'ai_trend_up',
    category: 'ai',
    field: 'trendPrediction.direction',
    operator: 'equals',
    value: 'up',
    dependencies: ['ai_enabled'],
    requiresAI: true,
    skipReasonTemplate: '趋势不匹配：期望看涨，实际为{actual}',
    description: 'AI看涨趋势预测',
  },
  {
    id: 'ai_min_confidence',
    category: 'ai',
    field: 'trendPrediction.confidence',
    operator: 'gt',
    dependencies: ['ai_enabled'],
    requiresAI: true,
    skipReasonTemplate: '置信度过低：{value} < {min}',
    description: 'AI置信度最低要求',
  },
  // 相似形态规则
  {
    id: 'similar_patterns',
    category: 'ai',
    field: 'similarPatterns',
    operator: 'contains',
    dependencies: ['ai_enabled'],
    requiresAI: true,
    skipReasonTemplate: '无相似形态匹配',
    description: '要求有相似形态匹配',
  },
  // ... 其他规则 (技术指标、横盘等) 将在后续步骤补充
  // 此配置驱动方式彻底解决之前的所有硬编码if-else问题
];

export function getRulesByCategory(category: FilterRule['category']): FilterRule[] {
  return defaultFilterRules.filter((rule) => rule.category === category);
}

export function getAIRules(): FilterRule[] {
  return defaultFilterRules.filter((rule) => rule.category === 'ai');
}
