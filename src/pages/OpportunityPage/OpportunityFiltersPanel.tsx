/**
 * 机会分析页：筛选条件（单行入口 + 右侧 Drawer，节省主区域高度）
 */

import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button, Drawer, Space, Collapse, InputNumber, Checkbox, Select } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import type { ConsolidationType } from '@/types/stock';
import { PatternTooltip } from '@/components/PatternTooltip/PatternTooltip';
import styles from './OpportunityPage.module.css';

const ALL_FILTER_PANEL_KEYS = ['data', 'aiAnalysis', 'consolidation', 'trendLine', 'sharpMove', 'technicalIndicators'] as const;

/** 筛选抽屉宽度：加宽以减少表单项折行与纵向滚动 */
const FILTER_DRAWER_WIDTH = 'min(1000px, calc(100vw - 48px))' as const;

type NumRange = { min?: number; max?: number };

function fmtNum(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(n);
}

function pushRange(parts: string[], label: string, r: NumRange, unit = '') {
  if (r.min == null && r.max == null) return;
  parts.push(`${label}${fmtNum(r.min)}~${fmtNum(r.max)}${unit}`);
}

export function buildOpportunityFilterSummary(p: {
  priceRange: NumRange;
  marketCapRange: NumRange;
  totalSharesRange: NumRange;
  turnoverRateRange: NumRange;
  peRatioRange: NumRange;
  kdjJRange: NumRange;
  recentLimitUpCount: number | undefined;
  recentLimitDownCount: number | undefined;
  limitUpPeriod: number;
  limitDownPeriod: number;
  consolidationFilterEnabled: boolean;
  consolidationTypes: ConsolidationType[];
  consolidationLookback: number;
  consolidationConsecutive: number;
  consolidationThreshold: number;
  consolidationRequireAboveMa10: boolean;
  consolidationTypeOptions: { label: string; value: ConsolidationType }[];
  trendLineFilterEnabled: boolean;
  trendLineLookback: number;
  trendLineConsecutive: number;
  sharpMoveFilterEnabled: boolean;
  sharpMoveWindowBars: number;
  sharpMoveMagnitude: number;
  sharpMoveFlatThreshold: number;
  sharpMoveOnlyDrop: boolean;
  sharpMoveOnlyRise: boolean;
  sharpMoveDropThenRiseLoose: boolean;
  sharpMoveRiseThenDropLoose: boolean;
  sharpMoveDropFlatRise: boolean;
  sharpMoveRiseFlatDrop: boolean;
  // 新增技术指标筛选
  rsiRange: NumRange;
  // K线形态筛选 - 单根
  candlestickHammer: boolean;
  candlestickShootingStar: boolean;
  candlestickDoji: boolean;
  // K线形态筛选 - 双根
  candlestickEngulfingBullish: boolean;
  candlestickEngulfingBearish: boolean;
  candlestickHaramiBullish: boolean;
  candlestickHaramiBearish: boolean;
  // K线形态筛选 - 三根
  candlestickMorningStar: boolean;
  candlestickEveningStar: boolean;
  candlestickDarkCloudCover: boolean;
  candlestickPiercing: boolean;
  candlestickThreeBlackCrows: boolean;
  candlestickThreeWhiteSoldiers: boolean;
  candlestickLookback: number;
  // K线形态识别高级配置
  patternUseVolumeConfirmation: boolean;
  patternRequireVolumeForReversal: boolean;
  patternTrendBackgroundLookback: number;
  patternVolumeMultiplier: number;
  // 趋势形态筛选
  trendUptrend: boolean;
  trendDowntrend: boolean;
  trendSideways: boolean;
  trendBreakout: boolean;
  trendBreakdown: boolean;
  trendLookback: number;
  // AI分析筛选
  aiAnalysisEnabled: boolean;
  aiTrendUp: boolean;
  aiTrendDown: boolean;
  aiTrendSideways: boolean;
  aiConfidenceRange: NumRange;
  aiRecommendScoreRange: NumRange;
  aiTechnicalScoreRange: NumRange;
  aiPatternScoreRange: NumRange;
  aiTrendScoreRange: NumRange;
  aiRiskScoreRange: NumRange;
  // 行业与概念板块
  industrySectors?: string[];
  conceptSectors?: string[];
  industrySectorOptions?: { label: string; value: string }[];
  conceptSectorOptions?: { label: string; value: string }[];
}): string {
  const parts: string[] = [];
  pushRange(parts, '价', p.priceRange);
  pushRange(parts, '市值', p.marketCapRange, '亿');
  pushRange(parts, '总股数', p.totalSharesRange, '亿');
  pushRange(parts, '换手', p.turnoverRateRange, '%');
  if (p.peRatioRange.min != null || p.peRatioRange.max != null) {
    pushRange(parts, '市盈', p.peRatioRange);
  }
  if (p.kdjJRange.min != null || p.kdjJRange.max != null) {
    pushRange(parts, 'KDJ-J', p.kdjJRange);
  }
  if (p.recentLimitUpCount != null) {
    parts.push(`涨停≥${p.recentLimitUpCount}·${p.limitUpPeriod}天`);
  }
  if (p.recentLimitDownCount != null) {
    parts.push(`跌停≥${p.recentLimitDownCount}·${p.limitDownPeriod}天`);
  }
  if (p.consolidationFilterEnabled) {
    let typePart: string;
    if (p.consolidationTypes.length === 0) {
      typePart = '类型无';
    } else if (
      p.consolidationTypeOptions.length > 0 &&
      p.consolidationTypes.length === p.consolidationTypeOptions.length
    ) {
      typePart = '全类型';
    } else {
      const labels = p.consolidationTypes.map((t) => {
        const o = p.consolidationTypeOptions.find((x) => x.value === t);
        return o ? o.label : t;
      });
      typePart = `类型${labels.join('、')}`;
    }
    const ma10 = p.consolidationRequireAboveMa10 ? '·MA10上' : '';
    parts.push(
      `横盘·${typePart}·检索${p.consolidationLookback}根·连续${p.consolidationConsecutive}根·阈值${fmtNum(p.consolidationThreshold)}%${ma10}`,
    );
  }
  if (p.trendLineFilterEnabled) {
    parts.push(`趋势线·M=${p.trendLineLookback}根·N=${p.trendLineConsecutive}根`);
  }
  const sharpOn =
    p.sharpMoveOnlyDrop ||
    p.sharpMoveOnlyRise ||
    p.sharpMoveDropThenRiseLoose ||
    p.sharpMoveRiseThenDropLoose ||
    p.sharpMoveDropFlatRise ||
    p.sharpMoveRiseFlatDrop;
  if (p.sharpMoveFilterEnabled && sharpOn) {
    parts.push(`异动${p.sharpMoveWindowBars}根/${p.sharpMoveMagnitude}%·形态`);
  } else if (p.sharpMoveFilterEnabled) {
    parts.push(`异动${p.sharpMoveWindowBars}根/${p.sharpMoveMagnitude}%`);
  }

  // K线形态汇总
  const candleParts: string[] = [];
  if (p.candlestickHammer) candleParts.push('锤头');
  if (p.candlestickShootingStar) candleParts.push('射击');
  if (p.candlestickDoji) candleParts.push('十字');
  if (p.candlestickEngulfingBullish) candleParts.push('阳包阴');
  if (p.candlestickEngulfingBearish) candleParts.push('阴包阳');
  if (p.candlestickHaramiBullish) candleParts.push('阳孕阴');
  if (p.candlestickHaramiBearish) candleParts.push('阴孕阳');
  if (p.candlestickMorningStar) candleParts.push('早晨');
  if (p.candlestickEveningStar) candleParts.push('黄昏');
  if (p.candlestickDarkCloudCover) candleParts.push('乌云');
  if (p.candlestickPiercing) candleParts.push('刺透');
  if (p.candlestickThreeBlackCrows) candleParts.push('三鸦');
  if (p.candlestickThreeWhiteSoldiers) candleParts.push('三兵');
  if (candleParts.length > 0) {
    parts.push(`形态${candleParts.join('、')}`);
  }

  // AI分析汇总
  if (p.aiAnalysisEnabled) {
    const aiParts: string[] = [];
    if (p.aiTrendUp) aiParts.push('看涨');
    if (p.aiTrendDown) aiParts.push('看跌');
    if (p.aiTrendSideways) aiParts.push('横盘');
    if (aiParts.length > 0) {
      parts.push(`AI趋势${aiParts.join('、')}`);
    }
    if (p.aiConfidenceRange.min != null || p.aiConfidenceRange.max != null) {
      pushRange(parts, 'AI置信度', p.aiConfidenceRange, '%');
    }
    if (p.aiRecommendScoreRange.min != null || p.aiRecommendScoreRange.max != null) {
      pushRange(parts, 'AI综合评分', p.aiRecommendScoreRange);
    }
    if (p.aiTechnicalScoreRange.min != null || p.aiTechnicalScoreRange.max != null) {
      pushRange(parts, 'AI技术面', p.aiTechnicalScoreRange);
    }
    if (p.aiPatternScoreRange.min != null || p.aiPatternScoreRange.max != null) {
      pushRange(parts, 'AI形态', p.aiPatternScoreRange);
    }
    if (p.aiTrendScoreRange.min != null || p.aiTrendScoreRange.max != null) {
      pushRange(parts, 'AI趋势', p.aiTrendScoreRange);
    }
    if (p.aiRiskScoreRange.min != null || p.aiRiskScoreRange.max != null) {
      pushRange(parts, 'AI风险', p.aiRiskScoreRange);
    }
  }

  // 行业板块汇总
  if (p.industrySectors && p.industrySectors.length > 0) {
    const labels = p.industrySectors.map((code) => {
      const opt = p.industrySectorOptions?.find((o) => o.value === code);
      return opt ? opt.label : code;
    });
    parts.push(`行业${labels.join('、')}`);
  }

  // 概念板块汇总
  if (p.conceptSectors && p.conceptSectors.length > 0) {
    const labels = p.conceptSectors.map((code) => {
      const opt = p.conceptSectorOptions?.find((o) => o.value === code);
      return opt ? opt.label : code;
    });
    parts.push(`概念${labels.join('、')}`);
  }

  return parts.join(' · ');
}
type SetRange = Dispatch<SetStateAction<NumRange>>;

export interface OpportunityFiltersPanelProps {
  filterPanelActiveKey: string[];
  setFilterPanelActiveKey: (v: string[]) => void;
  priceRange: { min?: number; max?: number };
  setPriceRange: SetRange;
  marketCapRange: { min?: number; max?: number };
  setMarketCapRange: SetRange;
  totalSharesRange: { min?: number; max?: number };
  setTotalSharesRange: SetRange;
  turnoverRateRange: { min?: number; max?: number };
  setTurnoverRateRange: SetRange;
  peRatioRange: { min?: number; max?: number };
  setPeRatioRange: SetRange;
  kdjJRange: { min?: number; max?: number };
  setKdjJRange: SetRange;
  recentLimitUpCount: number | undefined;
  setRecentLimitUpCount: (v: number | undefined) => void;
  recentLimitDownCount: number | undefined;
  setRecentLimitDownCount: (v: number | undefined) => void;
  limitUpPeriod: number;
  setLimitUpPeriod: (v: number) => void;
  limitDownPeriod: number;
  setLimitDownPeriod: (v: number) => void;
  consolidationTypes: ConsolidationType[];
  setConsolidationTypes: (v: ConsolidationType[]) => void;
  consolidationLookback: number;
  setConsolidationLookback: (v: number) => void;
  consolidationConsecutive: number;
  setConsolidationConsecutive: (v: number) => void;
  consolidationThreshold: number;
  setConsolidationThreshold: (v: number) => void;
  consolidationRequireAboveMa10: boolean;
  setConsolidationRequireAboveMa10: (v: boolean) => void;
  consolidationFilterEnabled: boolean;
  setConsolidationFilterEnabled: (v: boolean) => void;
  trendLineLookback: number;
  setTrendLineLookback: (v: number) => void;
  trendLineConsecutive: number;
  setTrendLineConsecutive: (v: number) => void;
  trendLineFilterEnabled: boolean;
  setTrendLineFilterEnabled: (v: boolean) => void;
  sharpMoveFilterEnabled: boolean;
  setSharpMoveFilterEnabled: (v: boolean) => void;
  sharpMoveWindowBars: number;
  setSharpMoveWindowBars: (v: number) => void;
  sharpMoveMagnitude: number;
  setSharpMoveMagnitude: (v: number) => void;
  sharpMoveFlatThreshold: number;
  setSharpMoveFlatThreshold: (v: number) => void;
  sharpMoveOnlyDrop: boolean;
  setSharpMoveOnlyDrop: (v: boolean) => void;
  sharpMoveOnlyRise: boolean;
  setSharpMoveOnlyRise: (v: boolean) => void;
  sharpMoveDropThenRiseLoose: boolean;
  setSharpMoveDropThenRiseLoose: (v: boolean) => void;
  sharpMoveRiseThenDropLoose: boolean;
  setSharpMoveRiseThenDropLoose: (v: boolean) => void;
  sharpMoveDropFlatRise: boolean;
  setSharpMoveDropFlatRise: (v: boolean) => void;
  sharpMoveRiseFlatDrop: boolean;
  setSharpMoveRiseFlatDrop: (v: boolean) => void;
  consolidationTypeOptions: { label: string; value: ConsolidationType }[];
  // 新增技术指标筛选 props
  rsiRange: { min?: number; max?: number };
  setRsiRange: SetRange;
  rsiPeriod: number;
  setRsiPeriod: (v: number) => void;
  // K线形态筛选 props - 单根
  candlestickHammer: boolean;
  setCandlestickHammer: (v: boolean) => void;
  candlestickShootingStar: boolean;
  setCandlestickShootingStar: (v: boolean) => void;
  candlestickDoji: boolean;
  setCandlestickDoji: (v: boolean) => void;
  // K线形态筛选 props - 双根
  candlestickEngulfingBullish: boolean;
  setCandlestickEngulfingBullish: (v: boolean) => void;
  candlestickEngulfingBearish: boolean;
  setCandlestickEngulfingBearish: (v: boolean) => void;
  candlestickHaramiBullish: boolean;
  setCandlestickHaramiBullish: (v: boolean) => void;
  candlestickHaramiBearish: boolean;
  setCandlestickHaramiBearish: (v: boolean) => void;
  // K线形态筛选 props - 三根
  candlestickMorningStar: boolean;
  setCandlestickMorningStar: (v: boolean) => void;
  candlestickEveningStar: boolean;
  setCandlestickEveningStar: (v: boolean) => void;
  candlestickDarkCloudCover: boolean;
  setCandlestickDarkCloudCover: (v: boolean) => void;
  candlestickPiercing: boolean;
  setCandlestickPiercing: (v: boolean) => void;
  candlestickThreeBlackCrows: boolean;
  setCandlestickThreeBlackCrows: (v: boolean) => void;
  candlestickThreeWhiteSoldiers: boolean;
  setCandlestickThreeWhiteSoldiers: (v: boolean) => void;
  candlestickLookback: number;
  setCandlestickLookback: (v: number) => void;
  // K线形态识别高级配置 props
  patternUseVolumeConfirmation: boolean;
  setPatternUseVolumeConfirmation: (v: boolean) => void;
  patternRequireVolumeForReversal: boolean;
  setPatternRequireVolumeForReversal: (v: boolean) => void;
  patternTrendBackgroundLookback: number;
  setPatternTrendBackgroundLookback: (v: number) => void;
  patternVolumeMultiplier: number;
  setPatternVolumeMultiplier: (v: number) => void;
  // 趋势形态筛选 props
  trendUptrend: boolean;
  setTrendUptrend: (v: boolean) => void;
  trendDowntrend: boolean;
  setTrendDowntrend: (v: boolean) => void;
  trendSideways: boolean;
  setTrendSideways: (v: boolean) => void;
  trendBreakout: boolean;
  setTrendBreakout: (v: boolean) => void;
  trendBreakdown: boolean;
  setTrendBreakdown: (v: boolean) => void;
  trendLookback: number;
  setTrendLookback: (v: number) => void;
  // AI分析筛选 props
  aiAnalysisEnabled: boolean;
  setAiAnalysisEnabled: (v: boolean) => void;
  aiTrendUp: boolean;
  setAiTrendUp: (v: boolean) => void;
  aiTrendDown: boolean;
  setAiTrendDown: (v: boolean) => void;
  aiTrendSideways: boolean;
  setAiTrendSideways: (v: boolean) => void;
  aiConfidenceRange: { min?: number; max?: number };
  setAiConfidenceRange: SetRange;
  aiRecommendScoreRange: { min?: number; max?: number };
  setAiRecommendScoreRange: SetRange;
  aiTechnicalScoreRange: { min?: number; max?: number };
  setAiTechnicalScoreRange: SetRange;
  aiPatternScoreRange: { min?: number; max?: number };
  setAiPatternScoreRange: SetRange;
  aiTrendScoreRange: { min?: number; max?: number };
  setAiTrendScoreRange: SetRange;
  aiRiskScoreRange: { min?: number; max?: number };
  setAiRiskScoreRange: SetRange;

  // 行业板块筛选
  industrySectors?: string[];
  setIndustrySectors: (v: string[]) => void;
  industrySectorOptions?: { label: string; value: string }[];
  industrySectorInvert?: boolean;
  setIndustrySectorInvert?: (v: boolean) => void;
  // 概念板块筛选
  conceptSectors?: string[];
  setConceptSectors: (v: string[]) => void;
  conceptSectorOptions?: { label: string; value: string }[];
  conceptSectorInvert?: boolean;
  setConceptSectorInvert?: (v: boolean) => void;
  // 重置筛选按钮
  resetFilterButton?: React.ReactNode;
  // 外部控制的抽屉状态
  drawerOpen?: boolean;
  setDrawerOpen?: (open: boolean) => void;
}

export function OpportunityFiltersPanel({
  filterPanelActiveKey,
  setFilterPanelActiveKey,
  priceRange,
  setPriceRange,
  marketCapRange,
  setMarketCapRange,
  totalSharesRange,
  setTotalSharesRange,
  turnoverRateRange,
  setTurnoverRateRange,
  peRatioRange,
  setPeRatioRange,
  kdjJRange,
  setKdjJRange,
  recentLimitUpCount,
  setRecentLimitUpCount,
  recentLimitDownCount,
  setRecentLimitDownCount,
  limitUpPeriod,
  setLimitUpPeriod,
  limitDownPeriod,
  setLimitDownPeriod,
  consolidationTypes,
  setConsolidationTypes,
  consolidationLookback,
  setConsolidationLookback,
  consolidationConsecutive,
  setConsolidationConsecutive,
  consolidationThreshold,
  setConsolidationThreshold,
  consolidationRequireAboveMa10,
  setConsolidationRequireAboveMa10,
  consolidationFilterEnabled,
  setConsolidationFilterEnabled,
  trendLineLookback,
  setTrendLineLookback,
  trendLineConsecutive,
  setTrendLineConsecutive,
  trendLineFilterEnabled,
  setTrendLineFilterEnabled,
  sharpMoveFilterEnabled,
  setSharpMoveFilterEnabled,
  sharpMoveWindowBars,
  setSharpMoveWindowBars,
  sharpMoveMagnitude,
  setSharpMoveMagnitude,
  sharpMoveFlatThreshold,
  setSharpMoveFlatThreshold,
  sharpMoveOnlyDrop,
  setSharpMoveOnlyDrop,
  sharpMoveOnlyRise,
  setSharpMoveOnlyRise,
  sharpMoveDropThenRiseLoose,
  setSharpMoveDropThenRiseLoose,
  sharpMoveRiseThenDropLoose,
  setSharpMoveRiseThenDropLoose,
  sharpMoveDropFlatRise,
  setSharpMoveDropFlatRise,
  sharpMoveRiseFlatDrop,
  setSharpMoveRiseFlatDrop,
  consolidationTypeOptions,
  // 新增技术指标筛选
  rsiRange,
  setRsiRange,
  rsiPeriod,
  setRsiPeriod,
  // K线形态筛选 - 单根
  candlestickHammer,
  setCandlestickHammer,
  candlestickShootingStar,
  setCandlestickShootingStar,
  candlestickDoji,
  setCandlestickDoji,
  // K线形态筛选 - 双根
  candlestickEngulfingBullish,
  setCandlestickEngulfingBullish,
  candlestickEngulfingBearish,
  setCandlestickEngulfingBearish,
  candlestickHaramiBullish,
  setCandlestickHaramiBullish,
  candlestickHaramiBearish,
  setCandlestickHaramiBearish,
  // K线形态筛选 - 三根
  candlestickMorningStar,
  setCandlestickMorningStar,
  candlestickEveningStar,
  setCandlestickEveningStar,
  candlestickDarkCloudCover,
  setCandlestickDarkCloudCover,
  candlestickPiercing,
  setCandlestickPiercing,
  candlestickThreeBlackCrows,
  setCandlestickThreeBlackCrows,
  candlestickThreeWhiteSoldiers,
  setCandlestickThreeWhiteSoldiers,
  candlestickLookback,
  setCandlestickLookback,
  // K线形态识别高级配置
  patternUseVolumeConfirmation,
  setPatternUseVolumeConfirmation,
  patternRequireVolumeForReversal,
  setPatternRequireVolumeForReversal,
  patternTrendBackgroundLookback,
  setPatternTrendBackgroundLookback,
  patternVolumeMultiplier,
  setPatternVolumeMultiplier,
  // 趋势形态筛选
  trendUptrend,
  setTrendUptrend,
  trendDowntrend,
  setTrendDowntrend,
  trendSideways,
  setTrendSideways,
  trendBreakout,
  setTrendBreakout,
  trendBreakdown,
  setTrendBreakdown,
  trendLookback,
  setTrendLookback,
  // AI分析筛选
  aiAnalysisEnabled,
  setAiAnalysisEnabled,
  aiTrendUp,
  setAiTrendUp,
  aiTrendDown,
  setAiTrendDown,
  aiTrendSideways,
  setAiTrendSideways,
  aiConfidenceRange,
  setAiConfidenceRange,
  aiRecommendScoreRange,
  setAiRecommendScoreRange,
  aiTechnicalScoreRange,
  setAiTechnicalScoreRange,
  aiPatternScoreRange,
  setAiPatternScoreRange,
  aiTrendScoreRange,
  setAiTrendScoreRange,
  aiRiskScoreRange,
  setAiRiskScoreRange,

  // 行业板块筛选
  industrySectors,
  setIndustrySectors,
  industrySectorOptions = [],
  industrySectorInvert = false,
  setIndustrySectorInvert,
  // 概念板块筛选
  conceptSectors,
  setConceptSectors,
  conceptSectorOptions = [],
  conceptSectorInvert = false,
  setConceptSectorInvert,
  // 重置筛选按钮
  resetFilterButton,
  // 外部控制的抽屉状态
  drawerOpen: externalDrawerOpen,
  setDrawerOpen: externalSetDrawerOpen,
}: OpportunityFiltersPanelProps) {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const [showPatternAdvanced, setShowPatternAdvanced] = useState(false);

  // 如果外部提供了控制，则使用外部的；否则使用内部的
  const drawerOpen = externalDrawerOpen !== undefined ? externalDrawerOpen : internalDrawerOpen;
  const setDrawerOpen = externalSetDrawerOpen || setInternalDrawerOpen;

  const summaryText = useMemo(
    () =>
      buildOpportunityFilterSummary({
        priceRange,
        marketCapRange,
        totalSharesRange,
        turnoverRateRange,
        peRatioRange,
        kdjJRange,
        recentLimitUpCount,
        recentLimitDownCount,
        limitUpPeriod,
        limitDownPeriod,
        consolidationFilterEnabled,
        consolidationTypes,
        consolidationLookback,
        consolidationConsecutive,
        consolidationThreshold,
        consolidationRequireAboveMa10,
        consolidationTypeOptions,
        trendLineFilterEnabled,
        trendLineLookback,
        trendLineConsecutive,
        sharpMoveFilterEnabled,
        sharpMoveWindowBars,
        sharpMoveMagnitude,
        sharpMoveFlatThreshold,
        sharpMoveOnlyDrop,
        sharpMoveOnlyRise,
        sharpMoveDropThenRiseLoose,
        sharpMoveRiseThenDropLoose,
        sharpMoveDropFlatRise,
        sharpMoveRiseFlatDrop,
        rsiRange,
        candlestickHammer,
        candlestickShootingStar,
        candlestickDoji,
        candlestickEngulfingBullish,
        candlestickEngulfingBearish,
        candlestickHaramiBullish,
        candlestickHaramiBearish,
        candlestickMorningStar,
        candlestickEveningStar,
        candlestickDarkCloudCover,
        candlestickPiercing,
        candlestickThreeBlackCrows,
        candlestickThreeWhiteSoldiers,
        candlestickLookback,
        patternUseVolumeConfirmation,
        patternRequireVolumeForReversal,
        patternTrendBackgroundLookback,
        patternVolumeMultiplier,
        trendUptrend,
        trendDowntrend,
        trendSideways,
        trendBreakout,
        trendBreakdown,
        trendLookback,
        aiAnalysisEnabled,
        aiTrendUp,
        aiTrendDown,
        aiTrendSideways,
        aiConfidenceRange,
        aiRecommendScoreRange,
        aiTechnicalScoreRange,
        aiPatternScoreRange,
        aiTrendScoreRange,
        aiRiskScoreRange,
      }),
    [
      priceRange,
      marketCapRange,
      totalSharesRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      recentLimitUpCount,
      recentLimitDownCount,
      limitUpPeriod,
      limitDownPeriod,
      consolidationFilterEnabled,
      consolidationTypes,
      consolidationLookback,
      consolidationConsecutive,
      consolidationThreshold,
      consolidationRequireAboveMa10,
      consolidationTypeOptions,
      trendLineFilterEnabled,
      trendLineLookback,
      trendLineConsecutive,
      sharpMoveFilterEnabled,
      sharpMoveWindowBars,
      sharpMoveMagnitude,
      sharpMoveFlatThreshold,
      sharpMoveOnlyDrop,
      sharpMoveOnlyRise,
      sharpMoveDropThenRiseLoose,
      sharpMoveRiseThenDropLoose,
      sharpMoveDropFlatRise,
      sharpMoveRiseFlatDrop,
      rsiRange,
      candlestickHammer,
      candlestickShootingStar,
      candlestickDoji,
      candlestickEngulfingBullish,
      candlestickEngulfingBearish,
      candlestickHaramiBullish,
      candlestickHaramiBearish,
      candlestickMorningStar,
      candlestickEveningStar,
      candlestickDarkCloudCover,
      candlestickPiercing,
      candlestickThreeBlackCrows,
      candlestickThreeWhiteSoldiers,
      candlestickLookback,
      patternUseVolumeConfirmation,
      patternRequireVolumeForReversal,
      patternTrendBackgroundLookback,
      patternVolumeMultiplier,
      trendUptrend,
      trendDowntrend,
      trendSideways,
      trendBreakout,
      trendBreakdown,
      trendLookback,
      aiAnalysisEnabled,
      aiTrendUp,
      aiTrendDown,
      aiTrendSideways,
      aiConfidenceRange,
      aiRecommendScoreRange,
      aiTechnicalScoreRange,
      aiPatternScoreRange,
      aiTrendScoreRange,
      aiRiskScoreRange,
    ]
  );

  return (
    <>
      {/* 如果外部控制了抽屉，则不显示内部的按钮栏 */}
      {!externalSetDrawerOpen && (
        <div className={styles.filterCompactBar}>
          <Button type="primary" icon={<FilterOutlined />} onClick={() => setDrawerOpen(true)}>
            筛选条件
          </Button>
          {resetFilterButton}
          <button
            type="button"
            className={styles.filterCompactSummaryBtn}
            onClick={() => setDrawerOpen(true)}
            title={summaryText}
          >
            {summaryText}
          </button>
        </div>
      )}
      <Drawer
        title={
          <Space size="middle">
            <span>筛选条件</span>
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', fontWeight: 'normal' }}>
              💡 提示：所有"检索根数"均指从最新K线向前追溯的交易日数量
            </span>
          </Space>
        }
        placement="right"
        width={FILTER_DRAWER_WIDTH}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose={false}
        extra={
          <Space size={0} wrap className={styles.filterCardExtra}>
            {resetFilterButton}
            <Button type="link" size="small" onClick={() => setFilterPanelActiveKey([...ALL_FILTER_PANEL_KEYS])}>
              展开全部
            </Button>
            <Button type="link" size="small" onClick={() => setFilterPanelActiveKey([])}>
              收起分组
            </Button>
          </Space>
        }
        styles={{ body: { paddingTop: 8 } }}
        className={styles.filterDrawerWrap}
      >
        <div className={styles.filterDrawerBody}>
          <Collapse
            bordered={false}
            ghost
            size="small"
            expandIconPosition="end"
            className={styles.filterCollapse}
            activeKey={filterPanelActiveKey}
            onChange={(key) => {
              const keys = Array.isArray(key) ? key : key === undefined ? [] : [key];
              setFilterPanelActiveKey(keys);
            }}
            items={[
              {
                key: 'data',
                label: '数据筛选',
                children: (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>价格：</span>
                        <InputNumber
                          value={priceRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最低价"
                          onChange={(v) => {
                            setPriceRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={priceRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最高价"
                          onChange={(v) => {
                            setPriceRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>总市值(亿)：</span>
                        <InputNumber
                          value={marketCapRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setMarketCapRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={marketCapRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setMarketCapRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>总股数(亿)：</span>
                        <InputNumber
                          value={totalSharesRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setTotalSharesRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={totalSharesRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setTotalSharesRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>市盈率：</span>
                        <InputNumber
                          value={peRatioRange.min}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setPeRatioRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={peRatioRange.max}
                          min={0}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setPeRatioRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>换手率(%)：</span>
                        <InputNumber
                          value={turnoverRateRange.min}
                          min={0}
                          max={100}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setTurnoverRateRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={turnoverRateRange.max}
                          min={0}
                          max={100}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setTurnoverRateRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>KDJ-J：</span>
                        <InputNumber
                          value={kdjJRange.min}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setKdjJRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={kdjJRange.max}
                          step={0.01}
                          precision={2}
                          style={{ width: 100 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setKdjJRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>RSI：</span>
                        <InputNumber
                          value={rsiRange.min}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 80 }}
                          placeholder="最小值"
                          onChange={(v) => {
                            setRsiRange((prev) => ({
                              ...prev,
                              min: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                        <span style={{ margin: '0 4px' }}>~</span>
                        <InputNumber
                          value={rsiRange.max}
                          min={0}
                          max={100}
                          step={1}
                          style={{ width: 80 }}
                          placeholder="最大值"
                          onChange={(v) => {
                            setRsiRange((prev) => ({
                              ...prev,
                              max: typeof v === 'number' && isFinite(v) ? v : undefined,
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>RSI周期：</span>
                        <Select
                          value={rsiPeriod}
                          style={{ width: 120 }}
                          onChange={(v) => setRsiPeriod(v)}
                          options={[
                            { label: '6日', value: 6 },
                            { label: '12日', value: 12 },
                            { label: '24日', value: 24 },
                          ]}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>最近涨停数：</span>
                        <InputNumber
                          value={recentLimitUpCount}
                          min={0}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            setRecentLimitUpCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>涨停周期范围：</span>
                        <InputNumber
                          value={limitUpPeriod}
                          min={1}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            setLimitUpPeriod(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>天</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>最近跌停数：</span>
                        <InputNumber
                          value={recentLimitDownCount}
                          min={0}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            setRecentLimitDownCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : undefined);
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>跌停周期范围：</span>
                        <InputNumber
                          value={limitDownPeriod}
                          min={1}
                          max={100}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            setLimitDownPeriod(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>天</span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'aiAnalysis',
                label: 'AI分析筛选',
                children: (
                  <div className={styles.filterContent} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                    {/* 启用开关 */}
                    <div className={styles.filterItem} style={{ width: '100%', marginBottom: 8 }}>
                      <Checkbox
                        checked={aiAnalysisEnabled}
                        onChange={(e) => setAiAnalysisEnabled(e.target.checked)}
                      >
                        启用AI分析筛选
                      </Checkbox>
                    </div>

                    {/* 趋势预测 */}
                    <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8, width: '100%' }}>
                      <span className={styles.filterLabel}>趋势预测：</span>
                      <Checkbox
                        checked={aiTrendUp}
                        onChange={(e) => setAiTrendUp(e.target.checked)}
                        disabled={!aiAnalysisEnabled}
                      >
                        看涨
                      </Checkbox>
                      <Checkbox
                        checked={aiTrendDown}
                        onChange={(e) => setAiTrendDown(e.target.checked)}
                        disabled={!aiAnalysisEnabled}
                      >
                        看跌
                      </Checkbox>
                      <Checkbox
                        checked={aiTrendSideways}
                        onChange={(e) => setAiTrendSideways(e.target.checked)}
                        disabled={!aiAnalysisEnabled}
                      >
                        横盘
                      </Checkbox>
                    </div>

                    {/* 推荐评分 */}
                    <div className={styles.filterItem} style={{ minWidth: 240 }}>
                      <span className={styles.filterLabel}>推荐评分：</span>
                      <InputNumber
                        value={aiRecommendScoreRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiRecommendScoreRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiRecommendScoreRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiRecommendScoreRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                    </div>

                    {/* 置信度 */}
                    <div className={styles.filterItem} style={{ minWidth: 240 }}>
                      <span className={styles.filterLabel}>置信度：</span>
                      <InputNumber
                        value={aiConfidenceRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低%"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiConfidenceRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiConfidenceRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高%"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiConfidenceRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                    </div>

                    {/* 技术面评分 */}
                    <div className={styles.filterItem} style={{ minWidth: 240 }}>
                      <span className={styles.filterLabel}>技术面评分：</span>
                      <InputNumber
                        value={aiTechnicalScoreRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiTechnicalScoreRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiTechnicalScoreRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiTechnicalScoreRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                    </div>

                    {/* 形态评分 */}
                    <div className={styles.filterItem} style={{ minWidth: 240 }}>
                      <span className={styles.filterLabel}>形态评分：</span>
                      <InputNumber
                        value={aiPatternScoreRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiPatternScoreRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiPatternScoreRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiPatternScoreRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                    </div>

                    {/* 趋势评分 */}
                    <div className={styles.filterItem} style={{ minWidth: 240 }}>
                      <span className={styles.filterLabel}>趋势评分：</span>
                      <InputNumber
                        value={aiTrendScoreRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiTrendScoreRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiTrendScoreRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiTrendScoreRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                    </div>

                    {/* 风险评分 */}
                    <div className={styles.filterItem} style={{ minWidth: 320 }}>
                      <span className={styles.filterLabel}>风险评分：</span>
                      <InputNumber
                        value={aiRiskScoreRange.min}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最低"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiRiskScoreRange((prev) => ({
                            ...prev,
                            min: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ margin: '0 4px' }}>~</span>
                      <InputNumber
                        value={aiRiskScoreRange.max}
                        min={0}
                        max={100}
                        step={1}
                        style={{ width: 70 }}
                        placeholder="最高"
                        disabled={!aiAnalysisEnabled}
                        onChange={(v) => {
                          setAiRiskScoreRange((prev) => ({
                            ...prev,
                            max: typeof v === 'number' && isFinite(v) ? v : undefined,
                          }));
                        }}
                      />
                      <span style={{ marginLeft: 8, color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>
                        （分数越高风险越低）
                      </span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'consolidation',
                label: '横盘筛选',
                children: (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={consolidationFilterEnabled}
                          onChange={(e) => setConsolidationFilterEnabled(e.target.checked)}
                        >
                          启用横盘筛选
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>检索根数：</span>
                        <InputNumber
                          value={consolidationLookback}
                          min={3}
                          max={500}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            const clamped = Math.min(500, Math.max(3, next));
                            setConsolidationLookback(clamped);
                            if (consolidationConsecutive > clamped) {
                              setConsolidationConsecutive(Math.max(3, clamped));
                            }
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>连续根数：</span>
                        <InputNumber
                          value={consolidationConsecutive}
                          min={3}
                          max={consolidationLookback}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                            const maxN = Math.max(3, consolidationLookback);
                            setConsolidationConsecutive(Math.min(maxN, Math.max(3, next)));
                          }}
                        />
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>波动阈值(%)：</span>
                        <InputNumber
                          value={consolidationThreshold}
                          min={0}
                          max={20}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? v : 2;
                            setConsolidationThreshold(next);
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>横盘类型：</span>
                        <Checkbox.Group
                          value={consolidationTypes}
                          onChange={(values) => {
                            setConsolidationTypes(values as ConsolidationType[]);
                          }}
                        >
                          {consolidationTypeOptions.map((item) => (
                            <Checkbox key={item.value} value={item.value}>
                              {item.label}
                            </Checkbox>
                          ))}
                        </Checkbox.Group>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={consolidationRequireAboveMa10}
                          onChange={(e) => setConsolidationRequireAboveMa10(e.target.checked)}
                        >
                          连续根数段内每日收盘价均在MA10之上
                        </Checkbox>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'trendLine',
                label: '趋势线筛选',
                children: (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={trendLineFilterEnabled}
                          onChange={(e) => setTrendLineFilterEnabled(e.target.checked)}
                        >
                          启用趋势线筛选
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>检索根数：</span>
                        <InputNumber
                          value={trendLineLookback}
                          min={3}
                          max={500}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                            const clamped = Math.min(500, Math.max(3, next));
                            setTrendLineLookback(clamped);
                            if (trendLineConsecutive > clamped) {
                              setTrendLineConsecutive(Math.max(3, clamped));
                            }
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                      </div>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>连续根数：</span>
                        <InputNumber
                          value={trendLineConsecutive}
                          min={3}
                          max={trendLineLookback}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 3;
                            const maxN = Math.max(3, trendLineLookback);
                            setTrendLineConsecutive(Math.min(maxN, Math.max(3, next)));
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>命中说明：</span>
                        <span style={{ lineHeight: '1.8' }}>
                          1️⃣ 每日收盘价 ≥ 前一日收盘价（不跌）；2️⃣ 每日收盘价 ≥ 当日MA5均线；✅ 若找到，取最靠近最新K线的一段
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'sharpMove',
                label: '单日异动筛选',
                children: (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={sharpMoveFilterEnabled}
                          onChange={(e) => setSharpMoveFilterEnabled(e.target.checked)}
                        >
                          启用单日异动筛选
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>检索根数：</span>
                        <InputNumber
                          value={sharpMoveWindowBars}
                          min={5}
                          max={500}
                          step={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.max(1, Math.floor(v)) : 20;
                            setSharpMoveWindowBars(next);
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                        <span className={styles.filterLabel} style={{ marginLeft: 16 }}>
                          阈值M(%)：
                        </span>
                        <InputNumber
                          value={sharpMoveMagnitude}
                          min={0.5}
                          max={30}
                          step={0.5}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) && v > 0 ? v : 6;
                            setSharpMoveMagnitude(next);
                          }}
                        />
                        <span className={styles.filterLabel} style={{ marginLeft: 16 }}>横盘幅度(%)：</span>
                        <InputNumber
                          value={sharpMoveFlatThreshold}
                          min={0.1}
                          max={10}
                          step={0.1}
                          precision={1}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) && v > 0 ? v : 3;
                            setSharpMoveFlatThreshold(next);
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={styles.filterLabel}>异动类型：</span>
                        <Checkbox checked={sharpMoveOnlyDrop} onChange={(e) => setSharpMoveOnlyDrop(e.target.checked)}>
                          仅急跌
                        </Checkbox>
                        <Checkbox checked={sharpMoveOnlyRise} onChange={(e) => setSharpMoveOnlyRise(e.target.checked)}>
                          仅急涨
                        </Checkbox>
                        <Checkbox
                          checked={sharpMoveDropThenRiseLoose}
                          onChange={(e) => setSharpMoveDropThenRiseLoose(e.target.checked)}
                        >
                          急跌→急涨
                        </Checkbox>
                        <Checkbox
                          checked={sharpMoveRiseThenDropLoose}
                          onChange={(e) => setSharpMoveRiseThenDropLoose(e.target.checked)}
                        >
                          急涨→急跌
                        </Checkbox>
                        <Checkbox
                          checked={sharpMoveDropFlatRise}
                          onChange={(e) => setSharpMoveDropFlatRise(e.target.checked)}
                        >
                          急跌横盘急涨
                        </Checkbox>
                        <Checkbox
                          checked={sharpMoveRiseFlatDrop}
                          onChange={(e) => setSharpMoveRiseFlatDrop(e.target.checked)}
                        >
                          急涨横盘急跌
                        </Checkbox>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'technicalIndicators',
                label: '形态筛选',
                children: (
                  <div className={styles.filterContent}>
                    {/* K线形态回溯窗口 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>K线形态检索根数：</span>
                        <InputNumber
                          value={candlestickLookback}
                          min={5}
                          max={200}
                          step={5}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 20;
                            setCandlestickLookback(Math.min(200, Math.max(5, next)));
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                      </div>
                    </div>

                    {/* K线形态识别高级配置 */}
                    <div className={styles.filterRow}>
                      <Collapse
                        ghost
                        activeKey={showPatternAdvanced ? ['advanced'] : []}
                        onChange={(keys) => setShowPatternAdvanced((keys as string[]).includes('advanced'))}
                        items={[
                          {
                            key: 'advanced',
                            label: <span style={{ fontSize: 13, color: '#666' }}>🔧 形态识别高级配置</span>,
                            children: (
                              <>
                                {/* 启用成交量确认 */}
                                <div className={styles.filterRow}>
                                  <div className={styles.filterItem}>
                                    <Checkbox
                                      checked={patternUseVolumeConfirmation}
                                      onChange={(e) => setPatternUseVolumeConfirmation(e.target.checked)}
                                    >
                                      启用成交量确认
                                    </Checkbox>
                                  </div>
                                </div>

                                {patternUseVolumeConfirmation && (
                                  <>
                                    <div className={styles.filterRow}>
                                      <div className={styles.filterItem}>
                                        <span className={styles.filterLabel}>成交量倍数：</span>
                                        <InputNumber
                                          value={patternVolumeMultiplier}
                                          min={1.0}
                                          max={5.0}
                                          step={0.1}
                                          precision={1}
                                          style={{ width: 80 }}
                                          onChange={(v) => {
                                            const next = typeof v === 'number' && isFinite(v) ? v : 1.5;
                                            setPatternVolumeMultiplier(Math.max(1.0, Math.min(5.0, next)));
                                          }}
                                        />
                                        <span style={{ marginLeft: 4, fontSize: 12, color: '#999' }}>倍</span>
                                      </div>
                                    </div>

                                    <div className={styles.filterRow}>
                                      <div className={styles.filterItem}>
                                        <Checkbox
                                          checked={patternRequireVolumeForReversal}
                                          onChange={(e) => setPatternRequireVolumeForReversal(e.target.checked)}
                                        >
                                          反转形态强制成交量确认
                                        </Checkbox>
                                      </div>
                                    </div>
                                  </>
                                )}

                                {/* 趋势背景周期 */}
                                <div className={styles.filterRow}>
                                  <div className={styles.filterItem}>
                                    <span className={styles.filterLabel}>趋势背景周期：</span>
                                    <InputNumber
                                      value={patternTrendBackgroundLookback}
                                      min={5}
                                      max={30}
                                      step={1}
                                      style={{ width: 80 }}
                                      onChange={(v) => {
                                        const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                                        setPatternTrendBackgroundLookback(Math.min(30, Math.max(5, next)));
                                      }}
                                    />
                                    <span style={{ marginLeft: 4, fontSize: 12, color: '#999' }}>根K线</span>
                                  </div>
                                </div>

                                {/* 说明文字 */}
                                <div
                                  style={{
                                    marginTop: 8,
                                    padding: 8,
                                    background: '#f5f5f5',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    color: '#666',
                                  }}
                                >
                                  <div>
                                    💡 <strong>说明：</strong>
                                  </div>
                                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                                    <li>
                                      <strong>成交量确认</strong>：形态出现时成交量需放大到均量的指定倍数
                                    </li>
                                    <li>
                                      <strong>趋势背景</strong>：检查形态前N根K线的趋势方向，确保形态出现在合适的趋势环境中
                                    </li>
                                    <li>
                                      <strong>强制确认</strong>：开启后，反转形态必须满足成交量条件才有效
                                    </li>
                                  </ul>
                                </div>
                              </>
                            ),
                          },
                        ]}
                      />
                    </div>

                    {/* K线形态筛选 - 单根 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={styles.filterLabel}>单根形态：</span>
                        <PatternTooltip pattern="hammer" placement="top">
                          <Checkbox checked={candlestickHammer} onChange={(e) => setCandlestickHammer(e.target.checked)}>
                            锤头线
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="shootingStar" placement="top">
                          <Checkbox checked={candlestickShootingStar} onChange={(e) => setCandlestickShootingStar(e.target.checked)}>
                            射击之星
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="doji" placement="top">
                          <Checkbox checked={candlestickDoji} onChange={(e) => setCandlestickDoji(e.target.checked)}>
                            十字星
                          </Checkbox>
                        </PatternTooltip>
                      </div>
                    </div>

                    {/* K线形态筛选 - 双根 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={styles.filterLabel}>双根形态：</span>
                        <PatternTooltip pattern="engulfingBullish" placement="top">
                          <Checkbox checked={candlestickEngulfingBullish} onChange={(e) => setCandlestickEngulfingBullish(e.target.checked)}>
                            阳包阴
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="engulfingBearish" placement="top">
                          <Checkbox checked={candlestickEngulfingBearish} onChange={(e) => setCandlestickEngulfingBearish(e.target.checked)}>
                            阴包阳
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="haramiBullish" placement="top">
                          <Checkbox checked={candlestickHaramiBullish} onChange={(e) => setCandlestickHaramiBullish(e.target.checked)}>
                            阳孕阴
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="haramiBearish" placement="top">
                          <Checkbox checked={candlestickHaramiBearish} onChange={(e) => setCandlestickHaramiBearish(e.target.checked)}>
                            阴孕阳
                          </Checkbox>
                        </PatternTooltip>
                      </div>
                    </div>

                    {/* K线形态筛选 - 三根 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={styles.filterLabel}>三根形态：</span>
                        <PatternTooltip pattern="morningStar" placement="top">
                          <Checkbox checked={candlestickMorningStar} onChange={(e) => setCandlestickMorningStar(e.target.checked)}>
                            早晨之星
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="eveningStar" placement="top">
                          <Checkbox checked={candlestickEveningStar} onChange={(e) => setCandlestickEveningStar(e.target.checked)}>
                            黄昏之星
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="darkCloudCover" placement="top">
                          <Checkbox checked={candlestickDarkCloudCover} onChange={(e) => setCandlestickDarkCloudCover(e.target.checked)}>
                            乌云盖顶
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="piercing" placement="top">
                          <Checkbox checked={candlestickPiercing} onChange={(e) => setCandlestickPiercing(e.target.checked)}>
                            刺透形态
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="threeBlackCrows" placement="top">
                          <Checkbox checked={candlestickThreeBlackCrows} onChange={(e) => setCandlestickThreeBlackCrows(e.target.checked)}>
                            三只乌鸦
                          </Checkbox>
                        </PatternTooltip>
                        <PatternTooltip pattern="threeWhiteSoldiers" placement="top">
                          <Checkbox checked={candlestickThreeWhiteSoldiers} onChange={(e) => setCandlestickThreeWhiteSoldiers(e.target.checked)}>
                            三兵红烛
                          </Checkbox>
                        </PatternTooltip>
                      </div>
                    </div>


                    {/* 趋势形态回溯窗口 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>趋势形态检索根数：</span>
                        <InputNumber
                          value={trendLookback}
                          min={5}
                          max={200}
                          step={5}
                          style={{ width: 100 }}
                          onChange={(v) => {
                            const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 20;
                            setTrendLookback(Math.min(200, Math.max(5, next)));
                          }}
                        />
                        <span style={{ marginLeft: 4 }}>根</span>
                      </div>
                    </div>

                    {/* 趋势形态筛选 */}
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem} style={{ flexWrap: 'wrap', gap: 8 }}>
                        <span className={styles.filterLabel}>趋势形态：</span>
                        <Checkbox checked={trendUptrend} onChange={(e) => setTrendUptrend(e.target.checked)}>
                          上升趋势
                        </Checkbox>
                        <Checkbox checked={trendDowntrend} onChange={(e) => setTrendDowntrend(e.target.checked)}>
                          下降趋势
                        </Checkbox>
                        <Checkbox checked={trendSideways} onChange={(e) => setTrendSideways(e.target.checked)}>
                          横盘整理
                        </Checkbox>
                        <Checkbox checked={trendBreakout} onChange={(e) => setTrendBreakout(e.target.checked)}>
                          突破形态
                        </Checkbox>
                        <Checkbox checked={trendBreakdown} onChange={(e) => setTrendBreakdown(e.target.checked)}>
                          跌破形态
                        </Checkbox>
                      </div>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </Drawer>
    </>
  );
}
