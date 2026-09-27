/**
 * 机会分析页：查询条与筛选面板用到的下拉选项，以及 AI 版本元数据。
 *
 * 原为 OpportunityPage 组件内的常量与内联 JSX 选项，抽离后供页面与面板共用，
 * 避免「文案/选项」在多处各写一份导致不一致。
 */

import type { ConsolidationType } from '@/types/stock';
import { CONSOLIDATION_TYPE_LABELS } from '@/utils/analysis/consolidationAnalysis';

/** 市场选项 */
export const MARKET_OPTIONS: { label: string; value: string }[] = [
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

/** 名称类型选项（ST / 非ST / 不限） */
export const NAME_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

/** 横盘结构类型选项 */
export const CONSOLIDATION_TYPE_OPTIONS: { label: string; value: ConsolidationType }[] = [
  { label: CONSOLIDATION_TYPE_LABELS.low_stable, value: 'low_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.high_stable, value: 'high_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.box, value: 'box' },
];

// ==================== AI 分析版本 ====================

/** AI 分析算法版本 */
export type AiVersion = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';

/**
 * 当前项目实际启用的 AI 版本。
 * 其余版本的实现模块已注释，选择时会自动回退到该版本。
 */
export const ENABLED_AI_VERSION: AiVersion = 'v5';

/** 各版本展示名称（下拉选项与提示文案的唯一来源） */
export const AI_VERSION_LABELS: Record<AiVersion, string> = {
  v1: 'v1.0 原始版',
  v2: 'v2.0 优化版',
  v3: 'v3.0 增强版',
  v4: 'v4.0 结构增强',
  v5: 'v5.0 智能增强',
  v6: 'v6.0 性能增强',
  v7: 'v7.0 安全增强',
};

/** AI 版本下拉选项（顺序与 AI_VERSION_LABELS 声明顺序一致：v1 → v7） */
export const AI_VERSION_OPTIONS: { label: string; value: AiVersion }[] = (
  Object.keys(AI_VERSION_LABELS) as AiVersion[]
).map((value) => ({ label: AI_VERSION_LABELS[value], value }));

/** 取版本展示名称 */
export function getAiVersionLabel(version: AiVersion): string {
  return AI_VERSION_LABELS[version];
}

/** 请求的版本若未启用，回退到当前启用版本 */
export function resolveEnabledAiVersion(requested: AiVersion): AiVersion {
  return requested === ENABLED_AI_VERSION ? requested : ENABLED_AI_VERSION;
}
