/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, App, InputNumber, Dropdown } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
  ClearOutlined,
  DownOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import {
  CONSOLIDATION_TYPE_LABELS,
} from '@/utils/consolidationAnalysis';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { AIAnalysisModal } from '@/components/AIAnalysisModal';
import { exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import { exportStockNamesToExcel, exportStockNamesToPng } from '@/utils/stockNamesExportUtils';
import type { ConsolidationType, KLinePeriod, StockInfo, StockOpportunityData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { useOpportunityFilterEngine } from '@/hooks/useOpportunityFilterEngine';
import { getPureCode } from '@/utils/format';
import {
  applyOpportunityFilterPrefsToState,
  loadOpportunityFilterPrefs,
  patchSavedPrefsFiltersToDefaults,
  patchSavedPrefsQueryToDefaults,
  saveOpportunityFilterPrefs,
  visibilityFromActiveFilterPanelKey,
} from '@/utils/opportunityFilterPrefs';
import type { OpportunityFilterPrefs } from '@/utils/opportunityFilterPrefs';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import { OpportunityFiltersPanel, buildOpportunityFilterSummary } from './OpportunityFiltersPanel';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
} from '@/utils/opportunityAnalysisDefaults';
import styles from './OpportunityPage.module.css';

const { Header, Content } = Layout;
const { Panel } = Collapse;

const PERIOD_OPTIONS: { label: string; value: KLinePeriod }[] = [
  { label: '日', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
];

const MARKET_OPTIONS: { label: string; value: string }[] = [
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

const NAME_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

const CONSOLIDATION_TYPE_OPTIONS: { label: string; value: ConsolidationType }[] = [
  { label: CONSOLIDATION_TYPE_LABELS.low_stable, value: 'low_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.high_stable, value: 'high_stable' },
  { label: CONSOLIDATION_TYPE_LABELS.box, value: 'box' },
];

const DEFAULT_CONSOLIDATION_TYPES: ConsolidationType[] = CONSOLIDATION_TYPE_OPTIONS.map((item) => item.value);

/** 与下方 useState 初始值保持一致，供「重置」同步恢复 */
const INITIAL_FILTER_STATE = {
  selectedMarket: 'hs_main' as const,
  nameType: 'non_st' as const,
  priceRange: { min: 3, max: 30 } as { min?: number; max?: number },
  marketCapRange: { min: 30, max: 500 } as { min?: number; max?: number },
  totalSharesRange: { min: 1, max: 50 } as { min?: number; max?: number },
  turnoverRateRange: { min: 1 } as { min?: number; max?: number },
  peRatioRange: {} as { min?: number; max?: number },
  kdjJRange: {} as { min?: number; max?: number },
  recentLimitUpCount: undefined as number | undefined,
  recentLimitDownCount: undefined as number | undefined,
  limitUpPeriod: 20,
  limitDownPeriod: 20,
  consolidationTypes: DEFAULT_CONSOLIDATION_TYPES,
  consolidationLookback: OPPORTUNITY_DEFAULT_CONSOLIDATION.lookback,
  consolidationConsecutive: OPPORTUNITY_DEFAULT_CONSOLIDATION.consecutive,
  consolidationThreshold: OPPORTUNITY_DEFAULT_CONSOLIDATION.threshold,
  /** 连续 N 根横盘段内每日收盘价是否要求 ≥ 当日 MA10 */
  consolidationRequireAboveMa10: OPPORTUNITY_DEFAULT_CONSOLIDATION.requireClosesAboveMa10,
  /** 是否按横盘条件过滤列表（与趋势线可同时开启，关系为 AND） */
  consolidationFilterEnabled: false,
  trendLineLookback: OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
  trendLineConsecutive: OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
  trendLineFilterEnabled: false,
  sharpMoveFilterEnabled: false,
  sharpMoveWindowBars: OPPORTUNITY_DEFAULT_SHARP_MOVE.windowBars,
  sharpMoveMagnitude: OPPORTUNITY_DEFAULT_SHARP_MOVE.magnitude,
  sharpMoveFlatThreshold: 3,
  sharpMoveOnlyDrop: false,
  sharpMoveOnlyRise: false,
  sharpMoveDropThenRiseLoose: false,
  sharpMoveRiseThenDropLoose: false,
  sharpMoveDropFlatRise: false,
  sharpMoveRiseFlatDrop: false,
  /** RSI指标范围 */
  rsiRange: {} as { min?: number; max?: number },
  /** RSI周期 */
  rsiPeriod: 6,
  /** MACD金叉 */
  macdGoldenCross: false,
  /** MACD死叉 */
  macdDeathCross: false,
  /** MACD背离 */
  macdDivergence: false,
  /** 布林带上轨 */
  bollingerUpper: false,
  /** 布林带中轨 */
  bollingerMiddle: false,
  /** 布林带下轨 */
  bollingerLower: false,
  /** K线形态筛选 - 单根 */
  candlestickHammer: false,
  candlestickShootingStar: false,
  candlestickDoji: false,
  /** K线形态筛选 - 双根 */
  candlestickEngulfingBullish: false,
  candlestickEngulfingBearish: false,
  candlestickHaramiBullish: false,
  candlestickHaramiBearish: false,
  /** K线形态筛选 - 三根 */
  candlestickMorningStar: false,
  candlestickEveningStar: false,
  candlestickDarkCloudCover: false,
  candlestickPiercing: false,
  candlestickThreeBlackCrows: false,
  candlestickThreeWhiteSoldiers: false,
  /** K线形态回溯窗口大小（根数） */
  candlestickLookback: 20,
  /** 趋势形态筛选 */
  trendUptrend: false,
  trendDowntrend: false,
  trendSideways: false,
  trendBreakout: false,
  trendBreakdown: false,
  /** 趋势形态回溯窗口大小（根数） */
  trendLookback: 20,
  /** AI分析筛选 */
  aiAnalysisEnabled: false,
  aiTrendUp: false,
  aiTrendDown: false,
  aiTrendSideways: false,
  aiConfidenceRange: {},
  aiRecommendScoreRange: {},
  aiTechnicalScoreRange: {},
  aiPatternScoreRange: {},
  aiTrendScoreRange: {},
  aiRiskScoreRange: {},
  aiRequireSimilarPatterns: false,
  aiMinSimilarity: undefined,
  aiMinSignalCount: undefined as number | undefined,
  aiPatternWinRateRange: {} as { min?: number; max?: number },
  aiMinRiskRewardRatio: undefined as number | undefined,
};

/** 与 opportunityStore 初始值一致，用于「重置」恢复周期与 K 线数量 */
const INITIAL_OPPORTUNITY_QUERY = {
  currentPeriod: 'day' as KLinePeriod,
  currentCount: 300,
};

export function OpportunityPage() {
  const { message } = App.useApp();
  const {
    analysisData,
    loading,
    progress,
    currentPeriod,
    currentCount,
    columnConfig,
    sortConfig,
    errors,
    klineDataCache,
    startAnalysis,
    cancelAnalysis,
    loadCachedData,
    updateColumnConfig,
    updateSortConfig,
    resetColumnConfig,
  } = useOpportunityStore();

  const { allStocks } = useAllStocks();
  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string>(INITIAL_FILTER_STATE.selectedMarket);
  const [priceRange, setPriceRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.priceRange);
  const [nameType, setNameType] = useState<string>(INITIAL_FILTER_STATE.nameType);

  // 筛选条件状态
  const [marketCapRange, setMarketCapRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.marketCapRange
  );
  const [totalSharesRange, setTotalSharesRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.totalSharesRange
  );
  const [turnoverRateRange, setTurnoverRateRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.turnoverRateRange
  );
  const [peRatioRange, setPeRatioRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.peRatioRange);
  const [kdjJRange, setKdjJRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.kdjJRange);
  /** 筛选 Collapse 当前展开的面板 key 列表；[] 表示各组均收起。默认展开所有筛选项 */
  const [filterPanelActiveKey, setFilterPanelActiveKey] = useState<string[]>(['data', 'consolidation', 'trendLine', 'sharpMove', 'technicalIndicators', 'aiAnalysis']);

  // 涨停/跌停筛选状态
  const [recentLimitUpCount, setRecentLimitUpCount] = useState<number | undefined>(
    INITIAL_FILTER_STATE.recentLimitUpCount
  );
  const [recentLimitDownCount, setRecentLimitDownCount] = useState<number | undefined>(
    INITIAL_FILTER_STATE.recentLimitDownCount
  );
  const [limitUpPeriod, setLimitUpPeriod] = useState<number>(INITIAL_FILTER_STATE.limitUpPeriod);
  const [limitDownPeriod, setLimitDownPeriod] = useState<number>(INITIAL_FILTER_STATE.limitDownPeriod);

  // 横盘筛选状态
  const [consolidationTypes, setConsolidationTypes] = useState<ConsolidationType[]>(
    INITIAL_FILTER_STATE.consolidationTypes
  );
  /** 从末尾向前检索的 K 线根数 M */
  const [consolidationLookback, setConsolidationLookback] = useState<number>(INITIAL_FILTER_STATE.consolidationLookback);
  /** 连续 N 根需满足横盘结构 */
  const [consolidationConsecutive, setConsolidationConsecutive] = useState<number>(
    INITIAL_FILTER_STATE.consolidationConsecutive
  );
  const [consolidationThreshold, setConsolidationThreshold] = useState<number>(INITIAL_FILTER_STATE.consolidationThreshold);
  const [consolidationRequireAboveMa10, setConsolidationRequireAboveMa10] = useState<boolean>(
    INITIAL_FILTER_STATE.consolidationRequireAboveMa10
  );
  const [consolidationFilterEnabled, setConsolidationFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.consolidationFilterEnabled
  );

  const [trendLineLookback, setTrendLineLookback] = useState<number>(INITIAL_FILTER_STATE.trendLineLookback);
  const [trendLineConsecutive, setTrendLineConsecutive] = useState<number>(
    INITIAL_FILTER_STATE.trendLineConsecutive
  );
  const [trendLineFilterEnabled, setTrendLineFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.trendLineFilterEnabled
  );

  const [filterSkippedExpanded, setFilterSkippedExpanded] = useState(false);
  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用
  const [aiAnalysisVisible, setAiAnalysisVisible] = useState(false);
  const [selectedStockForAI, setSelectedStockForAI] = useState<{ code: string; name: string } | null>(null);

  const [sharpMoveFilterEnabled, setSharpMoveFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.sharpMoveFilterEnabled
  );
  const [sharpMoveWindowBars, setSharpMoveWindowBars] = useState<number>(INITIAL_FILTER_STATE.sharpMoveWindowBars);
  const [sharpMoveMagnitude, setSharpMoveMagnitude] = useState<number>(INITIAL_FILTER_STATE.sharpMoveMagnitude);
  const [sharpMoveFlatThreshold, setSharpMoveFlatThreshold] = useState<number>(INITIAL_FILTER_STATE.sharpMoveFlatThreshold);
  const [sharpMoveOnlyDrop, setSharpMoveOnlyDrop] = useState<boolean>(INITIAL_FILTER_STATE.sharpMoveOnlyDrop);
  const [sharpMoveOnlyRise, setSharpMoveOnlyRise] = useState<boolean>(INITIAL_FILTER_STATE.sharpMoveOnlyRise);
  const [sharpMoveDropThenRiseLoose, setSharpMoveDropThenRiseLoose] = useState<boolean>(
    INITIAL_FILTER_STATE.sharpMoveDropThenRiseLoose
  );
  const [sharpMoveRiseThenDropLoose, setSharpMoveRiseThenDropLoose] = useState<boolean>(
    INITIAL_FILTER_STATE.sharpMoveRiseThenDropLoose
  );
  const [sharpMoveDropFlatRise, setSharpMoveDropFlatRise] = useState<boolean>(
    INITIAL_FILTER_STATE.sharpMoveDropFlatRise
  );
  const [sharpMoveRiseFlatDrop, setSharpMoveRiseFlatDrop] = useState<boolean>(
    INITIAL_FILTER_STATE.sharpMoveRiseFlatDrop
  );

  // 新增技术指标筛选状态
  const [rsiRange, setRsiRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.rsiRange);
  const [rsiPeriod, setRsiPeriod] = useState<number>(INITIAL_FILTER_STATE.rsiPeriod);
  const [macdGoldenCross, setMacdGoldenCross] = useState<boolean>(INITIAL_FILTER_STATE.macdGoldenCross);
  const [macdDeathCross, setMacdDeathCross] = useState<boolean>(INITIAL_FILTER_STATE.macdDeathCross);
  const [macdDivergence, setMacdDivergence] = useState<boolean>(INITIAL_FILTER_STATE.macdDivergence);
  const [bollingerUpper, setBollingerUpper] = useState<boolean>(INITIAL_FILTER_STATE.bollingerUpper);
  const [bollingerMiddle, setBollingerMiddle] = useState<boolean>(INITIAL_FILTER_STATE.bollingerMiddle);
  const [bollingerLower, setBollingerLower] = useState<boolean>(INITIAL_FILTER_STATE.bollingerLower);

  // K线形态筛选状态 - 单根
  const [candlestickHammer, setCandlestickHammer] = useState<boolean>(INITIAL_FILTER_STATE.candlestickHammer);
  const [candlestickShootingStar, setCandlestickShootingStar] = useState<boolean>(INITIAL_FILTER_STATE.candlestickShootingStar);
  const [candlestickDoji, setCandlestickDoji] = useState<boolean>(INITIAL_FILTER_STATE.candlestickDoji);
  // K线形态筛选状态 - 双根
  const [candlestickEngulfingBullish, setCandlestickEngulfingBullish] = useState<boolean>(INITIAL_FILTER_STATE.candlestickEngulfingBullish);
  const [candlestickEngulfingBearish, setCandlestickEngulfingBearish] = useState<boolean>(INITIAL_FILTER_STATE.candlestickEngulfingBearish);
  const [candlestickHaramiBullish, setCandlestickHaramiBullish] = useState<boolean>(INITIAL_FILTER_STATE.candlestickHaramiBullish);
  const [candlestickHaramiBearish, setCandlestickHaramiBearish] = useState<boolean>(INITIAL_FILTER_STATE.candlestickHaramiBearish);
  // K线形态筛选状态 - 三根
  const [candlestickMorningStar, setCandlestickMorningStar] = useState<boolean>(INITIAL_FILTER_STATE.candlestickMorningStar);
  const [candlestickEveningStar, setCandlestickEveningStar] = useState<boolean>(INITIAL_FILTER_STATE.candlestickEveningStar);
  const [candlestickDarkCloudCover, setCandlestickDarkCloudCover] = useState<boolean>(INITIAL_FILTER_STATE.candlestickDarkCloudCover);
  const [candlestickPiercing, setCandlestickPiercing] = useState<boolean>(INITIAL_FILTER_STATE.candlestickPiercing);
  const [candlestickThreeBlackCrows, setCandlestickThreeBlackCrows] = useState<boolean>(INITIAL_FILTER_STATE.candlestickThreeBlackCrows);
  const [candlestickThreeWhiteSoldiers, setCandlestickThreeWhiteSoldiers] = useState<boolean>(INITIAL_FILTER_STATE.candlestickThreeWhiteSoldiers);
  const [candlestickLookback, setCandlestickLookback] = useState<number>(INITIAL_FILTER_STATE.candlestickLookback);

  // 趋势形态筛选状态
  const [trendUptrend, setTrendUptrend] = useState<boolean>(INITIAL_FILTER_STATE.trendUptrend);
  const [trendDowntrend, setTrendDowntrend] = useState<boolean>(INITIAL_FILTER_STATE.trendDowntrend);
  const [trendSideways, setTrendSideways] = useState<boolean>(INITIAL_FILTER_STATE.trendSideways);
  const [trendBreakout, setTrendBreakout] = useState<boolean>(INITIAL_FILTER_STATE.trendBreakout);
  const [trendBreakdown, setTrendBreakdown] = useState<boolean>(INITIAL_FILTER_STATE.trendBreakdown);
  const [trendLookback, setTrendLookback] = useState<number>(INITIAL_FILTER_STATE.trendLookback);

  // AI分析筛选状态
  const [aiAnalysisEnabled, setAiAnalysisEnabled] = useState<boolean>(INITIAL_FILTER_STATE.aiAnalysisEnabled);
  const [aiTrendUp, setAiTrendUp] = useState<boolean>(INITIAL_FILTER_STATE.aiTrendUp);
  const [aiTrendDown, setAiTrendDown] = useState<boolean>(INITIAL_FILTER_STATE.aiTrendDown);
  const [aiTrendSideways, setAiTrendSideways] = useState<boolean>(INITIAL_FILTER_STATE.aiTrendSideways);
  const [aiConfidenceRange, setAiConfidenceRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiConfidenceRange
  );
  const [aiRecommendScoreRange, setAiRecommendScoreRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiRecommendScoreRange
  );
  const [aiTechnicalScoreRange, setAiTechnicalScoreRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiTechnicalScoreRange
  );
  const [aiPatternScoreRange, setAiPatternScoreRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiPatternScoreRange
  );
  const [aiTrendScoreRange, setAiTrendScoreRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiTrendScoreRange
  );
  const [aiRiskScoreRange, setAiRiskScoreRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiRiskScoreRange
  );
  const [aiRequireSimilarPatterns, setAiRequireSimilarPatterns] = useState<boolean>(
    INITIAL_FILTER_STATE.aiRequireSimilarPatterns
  );
  const [aiMinSimilarity, setAiMinSimilarity] = useState<number | undefined>(
    INITIAL_FILTER_STATE.aiMinSimilarity
  );
  const [aiMinSignalCount, setAiMinSignalCount] = useState<number | undefined>(
    INITIAL_FILTER_STATE.aiMinSignalCount
  );
  const [aiPatternWinRateRange, setAiPatternWinRateRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiPatternWinRateRange
  );
  const [aiMinRiskRewardRatio, setAiMinRiskRewardRatio] = useState<number | undefined>(
    INITIAL_FILTER_STATE.aiMinRiskRewardRatio
  );

  // 标记是否已完成初始恢复
  const isRestoredRef = useRef(false);

  // 先恢复 IndexedDB 中的分析结果与 K 线缓存，再套用 localStorage 中的查询/筛选偏好（纯前端筛选用缓存即可）
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      await loadCachedData();
      if (cancelled) return;
      const prefs = loadOpportunityFilterPrefs();
      if (prefs) {
        applyOpportunityFilterPrefsToState(prefs, {
          setSelectedMarket,
          setNameType,
          setPriceRange,
          setMarketCapRange,
          setTotalSharesRange,
          setTurnoverRateRange,
          setPeRatioRange,
          setKdjJRange,
          setFilterPanelActiveKey,
          setRecentLimitUpCount,
          setRecentLimitDownCount,
          setLimitUpPeriod,
          setLimitDownPeriod,
          setConsolidationTypes,
          setConsolidationLookback,
          setConsolidationConsecutive,
          setConsolidationThreshold,
          setConsolidationRequireAboveMa10,
          setConsolidationFilterEnabled,
          setTrendLineLookback,
          setTrendLineConsecutive,
          setTrendLineFilterEnabled,
          setSharpMoveFilterEnabled,
          setSharpMoveWindowBars,
          setSharpMoveMagnitude,
          setSharpMoveFlatThreshold,
          setSharpMoveOnlyDrop,
          setSharpMoveOnlyRise,
          setSharpMoveDropThenRiseLoose,
          setSharpMoveRiseThenDropLoose,
          setSharpMoveDropFlatRise,
          setSharpMoveRiseFlatDrop,
          // 新增技术指标筛选 actions
          setRsiRange,
          setRsiPeriod,
          // K线形态筛选 actions - 单根
          setCandlestickHammer,
          setCandlestickShootingStar,
          setCandlestickDoji,
          // K线形态筛选 actions - 双根
          setCandlestickEngulfingBullish,
          setCandlestickEngulfingBearish,
          setCandlestickHaramiBullish,
          setCandlestickHaramiBearish,
          // K线形态筛选 actions - 三根
          setCandlestickMorningStar,
          setCandlestickEveningStar,
          setCandlestickDarkCloudCover,
          setCandlestickPiercing,
          setCandlestickThreeBlackCrows,
          setCandlestickThreeWhiteSoldiers,
          setCandlestickLookback,
          // 趋势形态筛选 actions
          setTrendUptrend,
          setTrendDowntrend,
          setTrendSideways,
          setTrendBreakout,
          setTrendBreakdown,
          setTrendLookback,
          // AI分析筛选 actions
          setAiAnalysisEnabled,
          setAiTrendUp,
          setAiTrendDown,
          setAiTrendSideways,
          setAiConfidenceRange,
          setAiRecommendScoreRange,
          setAiTechnicalScoreRange,
          setAiPatternScoreRange,
          setAiTrendScoreRange,
          setAiRiskScoreRange,
          setAiRequireSimilarPatterns,
          setAiMinSimilarity,
          setAiMinSignalCount,
          setAiPatternWinRateRange,
          setAiMinRiskRewardRatio,
        });
      }
      const st = useOpportunityStore.getState();
      if (st.analysisData.length === 0) {
        useOpportunityStore.setState({
          currentPeriod: prefs?.currentPeriod || 'day',
          currentCount: prefs?.currentCount || 300,
        });
      }
      // 标记恢复完成
      isRestoredRef.current = true;
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时恢复缓存与偏好；setter 稳定
  }, [loadCachedData]);

  // 在页面卸载时保存当前的筛选条件
  useEffect(() => {
    return () => {
      const prefs: OpportunityFilterPrefs = {
        version: 1,
        selectedMarket,
        nameType,
        currentPeriod,
        currentCount,
        priceRange: { ...priceRange },
        marketCapRange: { ...marketCapRange },
        totalSharesRange: { ...totalSharesRange },
        turnoverRateRange: { ...turnoverRateRange },
        peRatioRange: { ...peRatioRange },
        kdjJRange: { ...kdjJRange },
        ...visibilityFromActiveFilterPanelKey(filterPanelActiveKey),
        recentLimitUpCount,
        recentLimitDownCount,
        limitUpPeriod,
        limitDownPeriod,
        consolidationTypes: [...consolidationTypes],
        consolidationLookback,
        consolidationConsecutive,
        consolidationThreshold,
        consolidationRequireAboveMa10,
        consolidationFilterEnabled,
        trendLineLookback,
        trendLineConsecutive,
        trendLineFilterEnabled,
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
        rsiRange: { ...rsiRange },
        rsiPeriod,
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
        aiConfidenceRange: { ...aiConfidenceRange },
        aiRecommendScoreRange: { ...aiRecommendScoreRange },
        aiTechnicalScoreRange: { ...aiTechnicalScoreRange },
        aiPatternScoreRange: { ...aiPatternScoreRange },
        aiTrendScoreRange: { ...aiTrendScoreRange },
        aiRiskScoreRange: { ...aiRiskScoreRange },
        aiRequireSimilarPatterns,
        aiMinSimilarity,
        aiMinSignalCount,
        aiPatternWinRateRange: { ...aiPatternWinRateRange },
        aiMinRiskRewardRatio,
      };
      saveOpportunityFilterPrefs(prefs);
    };
  }, [
    selectedMarket,
    nameType,
    currentPeriod,
    currentCount,
    priceRange,
    marketCapRange,
    turnoverRateRange,
    peRatioRange,
    kdjJRange,
    filterPanelActiveKey,
    recentLimitUpCount,
    recentLimitDownCount,
    limitUpPeriod,
    limitDownPeriod,
    consolidationTypes,
    consolidationLookback,
    consolidationConsecutive,
    consolidationThreshold,
    consolidationRequireAboveMa10,
    consolidationFilterEnabled,
    trendLineLookback,
    trendLineConsecutive,
    trendLineFilterEnabled,
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
    rsiPeriod,
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
    aiRequireSimilarPatterns,
    aiMinSimilarity,
    aiMinSignalCount,
    aiPatternWinRateRange,
    aiMinRiskRewardRatio,
  ]);

  // 筛选条件变化时自动保存（防抖300ms）
  useEffect(() => {
    // 如果还未完成初始恢复，不执行保存
    if (!isRestoredRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      const prefs: OpportunityFilterPrefs = {
        version: 1,
        selectedMarket,
        nameType,
        currentPeriod,
        currentCount,
        priceRange: { ...priceRange },
        marketCapRange: { ...marketCapRange },
        totalSharesRange: { ...totalSharesRange },
        turnoverRateRange: { ...turnoverRateRange },
        peRatioRange: { ...peRatioRange },
        kdjJRange: { ...kdjJRange },
        ...visibilityFromActiveFilterPanelKey(filterPanelActiveKey),
        recentLimitUpCount,
        recentLimitDownCount,
        limitUpPeriod,
        limitDownPeriod,
        consolidationTypes: [...consolidationTypes],
        consolidationLookback,
        consolidationConsecutive,
        consolidationThreshold,
        consolidationRequireAboveMa10,
        consolidationFilterEnabled,
        trendLineLookback,
        trendLineConsecutive,
        trendLineFilterEnabled,
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
        rsiRange: { ...rsiRange },
        rsiPeriod,
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
        aiConfidenceRange: { ...aiConfidenceRange },
        aiRecommendScoreRange: { ...aiRecommendScoreRange },
        aiTechnicalScoreRange: { ...aiTechnicalScoreRange },
        aiPatternScoreRange: { ...aiPatternScoreRange },
        aiTrendScoreRange: { ...aiTrendScoreRange },
        aiRiskScoreRange: { ...aiRiskScoreRange },
        aiRequireSimilarPatterns,
        aiMinSimilarity,
        aiMinSignalCount,
        aiPatternWinRateRange: { ...aiPatternWinRateRange },
        aiMinRiskRewardRatio,
      };
      saveOpportunityFilterPrefs(prefs);
    }, 300); // 防抖300ms

    return () => clearTimeout(timer);
  }, [
    selectedMarket,
    nameType,
    currentPeriod,
    currentCount,
    priceRange,
    marketCapRange,
    turnoverRateRange,
    peRatioRange,
    kdjJRange,
    filterPanelActiveKey,
    recentLimitUpCount,
    recentLimitDownCount,
    limitUpPeriod,
    limitDownPeriod,
    consolidationTypes,
    consolidationLookback,
    consolidationConsecutive,
    consolidationThreshold,
    consolidationRequireAboveMa10,
    consolidationFilterEnabled,
    trendLineLookback,
    trendLineConsecutive,
    trendLineFilterEnabled,
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
    rsiPeriod,
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
    aiRequireSimilarPatterns,
    aiMinSimilarity,
    aiMinSignalCount,
    aiPatternWinRateRange,
    aiMinRiskRewardRatio,
  ]);

  // 计算表格高度
  const updateTableHeight = useCallback(() => {
    if (!tableCardRef.current) {
      return;
    }

    const cardBody = tableCardRef.current.querySelector('.ant-card-body') as HTMLElement;
    if (!cardBody) {
      return;
    }

    const bodyHeight = cardBody.clientHeight;
    if (bodyHeight > 0) {
      // 查找分页器
      const pagination = cardBody.querySelector('.ant-pagination') as HTMLElement;
      const paginationHeight = pagination ? pagination.offsetHeight : 64;

      // 表格可用高度 = body高度 - 分页器高度 - 一些边距
      const height = bodyHeight - paginationHeight - 40 - 38 - 10;
      setTableHeight(Math.max(100, height));
    }
  }, []);

  // 使用useLayoutEffect在DOM更新后立即计算高度
  useLayoutEffect(() => {
    if (analysisData.length === 0) {
      return;
    }
    updateTableHeight();
  }, [
    analysisData.length,
    filterPanelActiveKey,
    loading,
    errors.length,
    updateTableHeight,
  ]);

  // 使用ResizeObserver监听表格Card大小变化
  useEffect(() => {
    if (!tableCardRef.current || analysisData.length === 0) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateTableHeight();
    });

    resizeObserver.observe(tableCardRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateTableHeight, analysisData.length]);

  // 根据选择的市场类型和名称类型筛选股票
  // 优化：简化过滤逻辑，减少分支判断
  const filteredStocks = useMemo<StockInfo[]>(() => {
    if (allStocks.length === 0) {
      return [];
    }

    // 预先确定市场匹配函数，避免在循环中重复 switch
    let marketMatchFn: (code: string) => boolean;
    switch (selectedMarket) {
      case 'hs_main':
        marketMatchFn = (pureCode: string) => pureCode.startsWith('60') || pureCode.startsWith('00');
        break;
      case 'sz_gem':
        marketMatchFn = (pureCode: string) => pureCode.startsWith('30');
        break;
      default:
        marketMatchFn = () => false;
    }

    // 预先确定名称类型匹配函数
    let nameTypeMatchFn: (isST: boolean) => boolean;
    switch (nameType) {
      case 'st':
        nameTypeMatchFn = (isST: boolean) => isST;
        break;
      case 'non_st':
        nameTypeMatchFn = (isST: boolean) => !isST;
        break;
      case 'all':
      default:
        nameTypeMatchFn = () => true;
    }

    // 单次遍历，使用预定义的匹配函数
    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      const isST = stock.name.includes('ST');
      return marketMatchFn(pureCode) && nameTypeMatchFn(isST);
    });
  }, [allStocks, selectedMarket, nameType]);

  const filterSnapshot = useMemo<OpportunityFilterSnapshot>(
    () => ({
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
      consolidationTypes,
      consolidationLookback,
      consolidationConsecutive,
      consolidationThreshold,
      consolidationRequireAboveMa10,
      consolidationFilterEnabled,
      trendLineLookback,
      trendLineConsecutive,
      trendLineFilterEnabled,
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
      rsiPeriod,
      macdGoldenCross,
      macdDeathCross,
      macdDivergence,
      bollingerUpper,
      bollingerMiddle,
      bollingerLower,
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
      aiRequireSimilarPatterns,
      aiMinSimilarity,
      aiMinSignalCount,
      aiPatternWinRateRange,
      aiMinRiskRewardRatio,
    }),
    [
      priceRange,
      marketCapRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      recentLimitUpCount,
      recentLimitDownCount,
      limitUpPeriod,
      limitDownPeriod,
      consolidationTypes,
      consolidationLookback,
      consolidationConsecutive,
      consolidationThreshold,
      consolidationRequireAboveMa10,
      consolidationFilterEnabled,
      trendLineLookback,
      trendLineConsecutive,
      trendLineFilterEnabled,
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
      rsiPeriod,
      macdGoldenCross,
      macdDeathCross,
      macdDivergence,
      bollingerUpper,
      bollingerMiddle,
      bollingerLower,
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
      aiRequireSimilarPatterns,
      aiMinSimilarity,
      aiMinSignalCount,
      aiPatternWinRateRange,
      aiMinRiskRewardRatio,
    ]
  );

  const { filteredData: filteredAnalysisData, filtering: filteringAnalysisData, skipped: filterSkippedItems } =
    useOpportunityFilterEngine({
      analysisData,
      klineDataCache,
      filters: filterSnapshot,
    });

  useEffect(() => {
    if (filterSkippedItems.length === 0) {
      setFilterSkippedExpanded(false);
    }
  }, [filterSkippedItems.length]);

  /** 仅重置顶部：市场、名称类型、周期、K 线数量 */
  const handleResetQueryBar = () => {
    const s = INITIAL_FILTER_STATE;
    setSelectedMarket(s.selectedMarket);
    setNameType(s.nameType);
    useOpportunityStore.setState({
      currentPeriod: INITIAL_OPPORTUNITY_QUERY.currentPeriod,
      currentCount: INITIAL_OPPORTUNITY_QUERY.currentCount,
    });
    patchSavedPrefsQueryToDefaults();
    message.info('已恢复默认市场、名称类型、周期与 K 线数量');
  };

  /** 重置数据筛选 / 横盘 / 趋势线 / 急跌急涨等（不含顶部查询条） */
  const handleResetFilterForms = () => {
    const s = INITIAL_FILTER_STATE;
    setPriceRange({ ...s.priceRange });
    setMarketCapRange({ ...s.marketCapRange });
    setTurnoverRateRange({ ...s.turnoverRateRange });
    setPeRatioRange({ ...s.peRatioRange });
    setKdjJRange({ ...s.kdjJRange });
    setFilterPanelActiveKey(['data', 'consolidation', 'trendLine', 'sharpMove', 'technicalIndicators', 'aiAnalysis']);
    setRecentLimitUpCount(s.recentLimitUpCount);
    setRecentLimitDownCount(s.recentLimitDownCount);
    setLimitUpPeriod(s.limitUpPeriod);
    setLimitDownPeriod(s.limitDownPeriod);
    setConsolidationTypes([...s.consolidationTypes]);
    setConsolidationLookback(s.consolidationLookback);
    setConsolidationConsecutive(s.consolidationConsecutive);
    setConsolidationThreshold(s.consolidationThreshold);
    setConsolidationRequireAboveMa10(s.consolidationRequireAboveMa10);
    setConsolidationFilterEnabled(s.consolidationFilterEnabled);
    setTrendLineLookback(s.trendLineLookback);
    setTrendLineConsecutive(s.trendLineConsecutive);
    setTrendLineFilterEnabled(s.trendLineFilterEnabled);
    setSharpMoveFilterEnabled(s.sharpMoveFilterEnabled);
    setSharpMoveWindowBars(s.sharpMoveWindowBars);
    setSharpMoveMagnitude(s.sharpMoveMagnitude);
    setSharpMoveFlatThreshold(s.sharpMoveFlatThreshold);
    setSharpMoveOnlyDrop(s.sharpMoveOnlyDrop);
    setSharpMoveOnlyRise(s.sharpMoveOnlyRise);
    setSharpMoveDropThenRiseLoose(s.sharpMoveDropThenRiseLoose);
    setSharpMoveRiseThenDropLoose(s.sharpMoveRiseThenDropLoose);
    setSharpMoveDropFlatRise(s.sharpMoveDropFlatRise);
    setSharpMoveRiseFlatDrop(s.sharpMoveRiseFlatDrop);
    // 重置新增的技术指标筛选
    setRsiRange({ ...s.rsiRange });
    setRsiPeriod(s.rsiPeriod);
    // 重置K线形态筛选
    setCandlestickHammer(s.candlestickHammer);
    setCandlestickShootingStar(s.candlestickShootingStar);
    setCandlestickDoji(s.candlestickDoji);
    setCandlestickEngulfingBullish(s.candlestickEngulfingBullish);
    setCandlestickEngulfingBearish(s.candlestickEngulfingBearish);
    setCandlestickHaramiBullish(s.candlestickHaramiBullish);
    setCandlestickHaramiBearish(s.candlestickHaramiBearish);
    setCandlestickMorningStar(s.candlestickMorningStar);
    setCandlestickEveningStar(s.candlestickEveningStar);
    setCandlestickDarkCloudCover(s.candlestickDarkCloudCover);
    setCandlestickPiercing(s.candlestickPiercing);
    setCandlestickThreeBlackCrows(s.candlestickThreeBlackCrows);
    setCandlestickThreeWhiteSoldiers(s.candlestickThreeWhiteSoldiers);
    setCandlestickLookback(s.candlestickLookback);
    // 重置趋势形态筛选
    setTrendUptrend(s.trendUptrend);
    setTrendDowntrend(s.trendDowntrend);
    setTrendSideways(s.trendSideways);
    setTrendBreakout(s.trendBreakout);
    setTrendBreakdown(s.trendBreakdown);
    setTrendLookback(s.trendLookback);
    // 重置AI分析筛选
    setAiAnalysisEnabled(s.aiAnalysisEnabled);
    setAiTrendUp(s.aiTrendUp);
    setAiTrendDown(s.aiTrendDown);
    setAiTrendSideways(s.aiTrendSideways);
    setAiConfidenceRange({ ...s.aiConfidenceRange });
    setAiRecommendScoreRange({ ...s.aiRecommendScoreRange });
    setAiTechnicalScoreRange({ ...s.aiTechnicalScoreRange });
    setAiPatternScoreRange({ ...s.aiPatternScoreRange });
    setAiTrendScoreRange({ ...s.aiTrendScoreRange });
    setAiRiskScoreRange({ ...s.aiRiskScoreRange });
    setAiRequireSimilarPatterns(s.aiRequireSimilarPatterns);
    setAiMinSimilarity(s.aiMinSimilarity);
    setAiMinSignalCount(s.aiMinSignalCount);
    setAiPatternWinRateRange({ ...s.aiPatternWinRateRange });
    setAiMinRiskRewardRatio(s.aiMinRiskRewardRatio);
    patchSavedPrefsFiltersToDefaults();
    message.info('已恢复默认筛选条件');
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    // 直接开始分析，不需要保存筛选条件（已通过useEffect自动保存）
    await startAnalysis(currentPeriod, filteredStocks, currentCount);
  };

  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  const handleExport = async (format: 'excel') => {
    if (filteredAnalysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'excel') {
        await exportOpportunityToExcel(filteredAnalysisData, columnConfig);
        message.success('Excel导出成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      console.error('导出失败:', error);
    }
  };

  /** 当前筛选结果中的股票名称，按列最多 20 条导出为图片或 Excel */
  const handleExportNames = async (kind: 'png' | 'excel') => {
    if (filteredAnalysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }
    const names = filteredAnalysisData.map((r) => (r.name || r.code || '').trim()).filter(Boolean);
    if (names.length === 0) {
      message.warning('没有可用的股票名称');
      return;
    }
    try {
      if (kind === 'excel') {
        await exportStockNamesToExcel(names, { fileNamePrefix: '机会分析_股票名称' });
        message.success('名称列表已导出为 Excel');
      } else {
        // 生成筛选条件摘要
        const filterSummary = buildOpportunityFilterSummary({
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
          consolidationTypeOptions: CONSOLIDATION_TYPE_OPTIONS,
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
          aiRequireSimilarPatterns,
          aiMinSimilarity,
          aiMinSignalCount,
          aiPatternWinRateRange,
          aiMinRiskRewardRatio,
        });

        await exportStockNamesToPng(names, {
          fileNamePrefix: '机会分析_股票名称',
          filterSummary: filterSummary || undefined
        });
        message.success('名称列表已导出为图片');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      console.error('导出名称失败:', error);
    }
  };

  const handleColumnSettingsOk = (columns: typeof columnConfig) => {
    updateColumnConfig(columns);
    setColumnSettingsVisible(false);
  };

  const handleShowAIAnalysis = (record: StockOpportunityData) => {
    if (!record.aiAnalysis) {
      message.warning('该股票暂无AI分析数据');
      return;
    }
    setSelectedStockForAI({ code: record.code, name: record.name });
    setAiAnalysisVisible(true);
  };

  return (
    <Layout className={styles.opportunityPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <Space>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>市场：</span>
              <Select
                value={selectedMarket}
                onChange={(value: string) => {
                  setSelectedMarket(value);
                  if (analysisData.length > 0) {
                    message.info('市场已更改，请重新分析');
                  }
                }}
                options={MARKET_OPTIONS}
                style={{ width: 120 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>名称类型：</span>
              <Select
                value={nameType}
                onChange={(value: string) => {
                  setNameType(value);
                  if (analysisData.length > 0) {
                    message.info('名称类型已更改，请重新分析');
                  }
                }}
                options={NAME_TYPE_OPTIONS}
                style={{ width: 120 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space.Compact className={styles.spaceCompact}>
              <span className={styles.label}>周期：</span>
              <Select
                value={currentPeriod}
                onChange={(value: KLinePeriod) => {
                  useOpportunityStore.setState({ currentPeriod: value });
                  if (analysisData.length > 0) {
                    message.info('周期已更改，请重新分析');
                  }
                }}
                options={PERIOD_OPTIONS}
                style={{ width: 100 }}
                disabled={loading}
              />
            </Space.Compact>
            <Space className={styles.spaceCompact}>
              <span className={styles.label}>K线数量：</span>
              <InputNumber
                value={currentCount}
                min={50}
                max={1000}
                step={10}
                style={{ width: 120 }}
                placeholder="count"
                disabled={loading}
                onChange={(v) => {
                  const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 500;
                  useOpportunityStore.setState({ currentCount: next });
                  if (analysisData.length > 0) {
                    message.info('count已更改，请重新分析');
                  }
                }}
              />
            </Space>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyze}
              loading={loading}
              disabled={loading || filteredStocks.length === 0}
            >
              一键分析
            </Button>
            <Button icon={<ClearOutlined />} onClick={handleResetQueryBar} disabled={loading}>
              重置查询
            </Button>
            <Button icon={<ClearOutlined />} onClick={handleResetFilterForms} disabled={loading}>
              重置筛选
            </Button>
            {loading && (
              <Button icon={<StopOutlined />} onClick={handleCancel}>
                取消
              </Button>
            )}
            <Button
              icon={<ExportOutlined />}
              onClick={() => handleExport('excel')}
              disabled={filteredAnalysisData.length === 0}
            >
              导出Excel
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'png', label: '导出为图片（PNG）' },
                  { key: 'xlsx', label: '导出为 Excel' },
                ],
                onClick: ({ key }) => {
                  void handleExportNames(key === 'xlsx' ? 'excel' : 'png');
                },
              }}
              disabled={filteredAnalysisData.length === 0}
            >
              <Button icon={<OrderedListOutlined />} disabled={filteredAnalysisData.length === 0}>
                导出名称 <DownOutlined />
              </Button>
            </Dropdown>
            <Button icon={<SettingOutlined />} onClick={() => setColumnSettingsVisible(true)}>
              列设置
            </Button>
          </Space>
        </div >
      </Header >

      <Content className={styles.content}>
        {loading && (
          <Card className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Progress
                percent={progress.percent}
                status={loading ? 'active' : 'success'}
                format={(percent) => `${percent?.toFixed(1)}%`}
              />
              <div className={styles.progressText}>
                进度: {progress.completed} / {progress.total} (失败: {progress.failed})
              </div>
            </div>
          </Card>
        )}

        {errors.length > 0 && (
          <Card className={styles.errorCard} size="small">
            <Collapse>
              <Panel
                header={
                  <span>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                    分析失败 ({errors.length} 只股票)
                  </span>
                }
                key="errors"
              >
                <div className={styles.errorList}>
                  {errors.map((err, index) => (
                    <div key={index} className={styles.errorItem}>
                      <span className={styles.errorStock}>
                        {err.stock.name} ({err.stock.code})
                      </span>
                      <span className={styles.errorMessage}>{err.error}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </Collapse>
          </Card>
        )}

        {/* 筛选入口 - 始终显示 */}
        <div className={styles.filterContainer}>
          <OpportunityFiltersPanel
            filterPanelActiveKey={filterPanelActiveKey}
            setFilterPanelActiveKey={setFilterPanelActiveKey}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            marketCapRange={marketCapRange}
            setMarketCapRange={setMarketCapRange}
            totalSharesRange={totalSharesRange}
            setTotalSharesRange={setTotalSharesRange}
            turnoverRateRange={turnoverRateRange}
            setTurnoverRateRange={setTurnoverRateRange}
            peRatioRange={peRatioRange}
            setPeRatioRange={setPeRatioRange}
            kdjJRange={kdjJRange}
            setKdjJRange={setKdjJRange}
            recentLimitUpCount={recentLimitUpCount}
            setRecentLimitUpCount={setRecentLimitUpCount}
            recentLimitDownCount={recentLimitDownCount}
            setRecentLimitDownCount={setRecentLimitDownCount}
            limitUpPeriod={limitUpPeriod}
            setLimitUpPeriod={setLimitUpPeriod}
            limitDownPeriod={limitDownPeriod}
            setLimitDownPeriod={setLimitDownPeriod}
            consolidationTypes={consolidationTypes}
            setConsolidationTypes={setConsolidationTypes}
            consolidationLookback={consolidationLookback}
            setConsolidationLookback={setConsolidationLookback}
            consolidationConsecutive={consolidationConsecutive}
            setConsolidationConsecutive={setConsolidationConsecutive}
            consolidationThreshold={consolidationThreshold}
            setConsolidationThreshold={setConsolidationThreshold}
            consolidationRequireAboveMa10={consolidationRequireAboveMa10}
            setConsolidationRequireAboveMa10={setConsolidationRequireAboveMa10}
            consolidationFilterEnabled={consolidationFilterEnabled}
            setConsolidationFilterEnabled={setConsolidationFilterEnabled}
            trendLineLookback={trendLineLookback}
            setTrendLineLookback={setTrendLineLookback}
            trendLineConsecutive={trendLineConsecutive}
            setTrendLineConsecutive={setTrendLineConsecutive}
            trendLineFilterEnabled={trendLineFilterEnabled}
            setTrendLineFilterEnabled={setTrendLineFilterEnabled}
            sharpMoveFilterEnabled={sharpMoveFilterEnabled}
            setSharpMoveFilterEnabled={setSharpMoveFilterEnabled}
            sharpMoveWindowBars={sharpMoveWindowBars}
            setSharpMoveWindowBars={setSharpMoveWindowBars}
            sharpMoveMagnitude={sharpMoveMagnitude}
            setSharpMoveMagnitude={setSharpMoveMagnitude}
            sharpMoveFlatThreshold={sharpMoveFlatThreshold}
            setSharpMoveFlatThreshold={setSharpMoveFlatThreshold}
            sharpMoveOnlyDrop={sharpMoveOnlyDrop}
            setSharpMoveOnlyDrop={setSharpMoveOnlyDrop}
            sharpMoveOnlyRise={sharpMoveOnlyRise}
            setSharpMoveOnlyRise={setSharpMoveOnlyRise}
            sharpMoveDropThenRiseLoose={sharpMoveDropThenRiseLoose}
            setSharpMoveDropThenRiseLoose={setSharpMoveDropThenRiseLoose}
            sharpMoveRiseThenDropLoose={sharpMoveRiseThenDropLoose}
            setSharpMoveRiseThenDropLoose={setSharpMoveRiseThenDropLoose}
            sharpMoveDropFlatRise={sharpMoveDropFlatRise}
            setSharpMoveDropFlatRise={setSharpMoveDropFlatRise}
            sharpMoveRiseFlatDrop={sharpMoveRiseFlatDrop}
            setSharpMoveRiseFlatDrop={setSharpMoveRiseFlatDrop}
            consolidationTypeOptions={CONSOLIDATION_TYPE_OPTIONS}
            // 新增技术指标筛选 props
            rsiRange={rsiRange}
            setRsiRange={setRsiRange}
            rsiPeriod={rsiPeriod}
            setRsiPeriod={setRsiPeriod}
            // K线形态筛选 props
            candlestickHammer={candlestickHammer}
            setCandlestickHammer={setCandlestickHammer}
            candlestickShootingStar={candlestickShootingStar}
            setCandlestickShootingStar={setCandlestickShootingStar}
            candlestickDoji={candlestickDoji}
            setCandlestickDoji={setCandlestickDoji}
            candlestickEngulfingBullish={candlestickEngulfingBullish}
            setCandlestickEngulfingBullish={setCandlestickEngulfingBullish}
            candlestickEngulfingBearish={candlestickEngulfingBearish}
            setCandlestickEngulfingBearish={setCandlestickEngulfingBearish}
            candlestickHaramiBullish={candlestickHaramiBullish}
            setCandlestickHaramiBullish={setCandlestickHaramiBullish}
            candlestickHaramiBearish={candlestickHaramiBearish}
            setCandlestickHaramiBearish={setCandlestickHaramiBearish}
            candlestickMorningStar={candlestickMorningStar}
            setCandlestickMorningStar={setCandlestickMorningStar}
            candlestickEveningStar={candlestickEveningStar}
            setCandlestickEveningStar={setCandlestickEveningStar}
            candlestickDarkCloudCover={candlestickDarkCloudCover}
            setCandlestickDarkCloudCover={setCandlestickDarkCloudCover}
            candlestickPiercing={candlestickPiercing}
            setCandlestickPiercing={setCandlestickPiercing}
            candlestickThreeBlackCrows={candlestickThreeBlackCrows}
            setCandlestickThreeBlackCrows={setCandlestickThreeBlackCrows}
            candlestickThreeWhiteSoldiers={candlestickThreeWhiteSoldiers}
            setCandlestickThreeWhiteSoldiers={setCandlestickThreeWhiteSoldiers}
            candlestickLookback={candlestickLookback}
            setCandlestickLookback={setCandlestickLookback}
            // 趋势形态筛选 props
            trendUptrend={trendUptrend}
            setTrendUptrend={setTrendUptrend}
            trendDowntrend={trendDowntrend}
            setTrendDowntrend={setTrendDowntrend}
            trendSideways={trendSideways}
            setTrendSideways={setTrendSideways}
            trendBreakout={trendBreakout}
            setTrendBreakout={setTrendBreakout}
            trendBreakdown={trendBreakdown}
            setTrendBreakdown={setTrendBreakdown}
            trendLookback={trendLookback}
            setTrendLookback={setTrendLookback}
            // AI分析筛选 props
            aiAnalysisEnabled={aiAnalysisEnabled}
            setAiAnalysisEnabled={setAiAnalysisEnabled}
            aiTrendUp={aiTrendUp}
            setAiTrendUp={setAiTrendUp}
            aiTrendDown={aiTrendDown}
            setAiTrendDown={setAiTrendDown}
            aiTrendSideways={aiTrendSideways}
            setAiTrendSideways={setAiTrendSideways}
            aiConfidenceRange={aiConfidenceRange}
            setAiConfidenceRange={setAiConfidenceRange}
            aiRecommendScoreRange={aiRecommendScoreRange}
            setAiRecommendScoreRange={setAiRecommendScoreRange}
            aiTechnicalScoreRange={aiTechnicalScoreRange}
            setAiTechnicalScoreRange={setAiTechnicalScoreRange}
            aiPatternScoreRange={aiPatternScoreRange}
            setAiPatternScoreRange={setAiPatternScoreRange}
            aiTrendScoreRange={aiTrendScoreRange}
            setAiTrendScoreRange={setAiTrendScoreRange}
            aiRiskScoreRange={aiRiskScoreRange}
            setAiRiskScoreRange={setAiRiskScoreRange}
            aiRequireSimilarPatterns={aiRequireSimilarPatterns}
            setAiRequireSimilarPatterns={setAiRequireSimilarPatterns}
            aiMinSimilarity={aiMinSimilarity}
            setAiMinSimilarity={setAiMinSimilarity}
            aiMinSignalCount={aiMinSignalCount}
            setAiMinSignalCount={setAiMinSignalCount}
            aiPatternWinRateRange={aiPatternWinRateRange}
            setAiPatternWinRateRange={setAiPatternWinRateRange}
            aiMinRiskRewardRatio={aiMinRiskRewardRatio}
            setAiMinRiskRewardRatio={setAiMinRiskRewardRatio}
          />
        </div>

        {/* 筛选结果提示 - 仅在有数据时显示 */}
        {analysisData.length > 0 && (
          <>
            <div className={styles.filterResult}>
              <span>
                {filteredAnalysisData.length !== analysisData.length ? (
                  <>
                    筛选结果：<strong>{filteredAnalysisData.length}</strong> /{' '}
                    {analysisData.length} 条
                  </>
                ) : (
                  <>
                    共 <strong>{filteredAnalysisData.length}</strong> 条数据
                  </>
                )}
              </span>
              {filteringAnalysisData && <span className={styles.filteringTag}>筛选中...</span>}
              {filterSkippedItems.length > 0 && (
                <span className={styles.filterSkipSummary}>
                  跳过 {filterSkippedItems.length} 条
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setFilterSkippedExpanded((prev) => !prev)}
                    className={styles.filterSkipToggle}
                  >
                    {filterSkippedExpanded ? '收起' : '展开'}
                  </Button>
                </span>
              )}
            </div>
            {filterSkippedExpanded && filterSkippedItems.length > 0 && (
              <div className={styles.filterSkipList}>
                {filterSkippedItems.slice(0, 20).map((item) => (
                  <div key={`${item.code}-${item.reason}`} className={styles.filterSkipItem}>
                    {item.name} ({item.code})：{item.reason}
                  </div>
                ))}
                {filterSkippedItems.length > 20 && (
                  <div className={styles.filterSkipMore}>仅展示前 20 条，其余已折叠。</div>
                )}
              </div>
            )}
          </>
        )}

        {/* 表格区域 */}
        {analysisData.length > 0 ? (
          <Card className={styles.tableCard} ref={tableCardRef}>
            <OpportunityTable
              data={filteredAnalysisData}
              columns={columnConfig}
              sortConfig={sortConfig}
              onSortChange={updateSortConfig}
              tableHeight={tableHeight}
              onShowAIAnalysis={handleShowAIAnalysis}
            />
          </Card>
        ) : (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyText}>
              {filteredStocks.length === 0 ? '当前市场暂无股票数据' : '点击"一键分析"按钮开始分析'}
            </div>
          </Card>
        )}
      </Content>

      <ColumnSettings
        visible={columnSettingsVisible}
        columns={columnConfig}
        onOk={handleColumnSettingsOk}
        onCancel={() => setColumnSettingsVisible(false)}
        onReset={resetColumnConfig}
        title="机会列表列设置"
      />

      <AIAnalysisModal
        visible={aiAnalysisVisible}
        analysis={selectedStockForAI ? analysisData.find(d => d.code === selectedStockForAI.code)?.aiAnalysis || null : null}
        stockName={selectedStockForAI?.name || ''}
        stockCode={selectedStockForAI?.code || ''}
        onClose={() => {
          setAiAnalysisVisible(false);
          setSelectedStockForAI(null);
        }}
      />
    </Layout >
  );
}


