/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, App, InputNumber, Dropdown, Alert, Tag, Tooltip, Badge, Popover, Checkbox } from 'antd';
import {
  RocketOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
  ClearOutlined,
  DownOutlined,
  OrderedListOutlined,
  FilterOutlined,
  ReloadOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import {
  CONSOLIDATION_TYPE_LABELS,
} from '@/utils/analysis/consolidationAnalysis';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { AIAnalysisModal } from '@/components/AIAnalysisModal';
import { exportOpportunityToExcel } from '@/utils/export/opportunityExportUtils';
import { exportStockNamesToExcel, exportStockNamesToPng } from '@/utils/export/stockNamesExportUtils';
import { detectTradingSignal } from '@/utils/analysis/signalDetector';
import { addStocksToTodayRecord } from '@/services/opportunity/recordService';
import type { ConsolidationType, KLinePeriod, StockInfo, StockOpportunityData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { logger } from '@/utils/business/logger';
import { useOpportunityFilterEngine } from '@/hooks/useOpportunityFilterEngine';
import { getPureCode } from '@/utils/format/format';
import {
  applyOpportunityFilterPrefsToState,
  loadOpportunityFilterPrefs,
  patchSavedPrefsFiltersToDefaults,
  patchSavedPrefsQueryToDefaults,
  saveOpportunityFilterPrefs,
  visibilityFromActiveFilterPanelKey,
} from '@/utils/config/opportunityFilterPrefs';
import type { OpportunityFilterPrefs } from '@/utils/config/opportunityFilterPrefs';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';
import { OpportunityFiltersPanel, buildOpportunityFilterSummary } from './OpportunityFiltersPanel';
import { FilterDiagnosticsDrawer } from '@/components/FilterDiagnosticsDrawer';
import {
  OPPORTUNITY_DEFAULT_CONSOLIDATION,
  OPPORTUNITY_DEFAULT_SHARP_MOVE,
  OPPORTUNITY_DEFAULT_TREND_LINE,
  OPPORTUNITY_DEFAULT_CANDLESTICK,
  OPPORTUNITY_DEFAULT_TREND_PATTERN,
  OPPORTUNITY_DEFAULT_AI_ANALYSIS,
  OPPORTUNITY_DEFAULT_INDICATORS,
  OPPORTUNITY_DEFAULT_LIMIT_MOVES,
  OPPORTUNITY_DEFAULT_BASIC_FILTERS,
  OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL,
  OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS,
} from '@/utils/config/opportunityAnalysisDefaults';
import { getUnifiedSectorBasics } from '@/services/hot/unified-sectors';
import type { IndustrySectorBasicInfo, ConceptSectorBasicInfo } from '@/types/stock';
import {
  OPPORTUNITY_TABLE_HEIGHT_PADDING,
  OPPORTUNITY_TABLE_HEIGHT_EXTRA_PADDING,
  OPPORTUNITY_TABLE_HEIGHT_MARGIN,
  FILTER_SAVE_DEBOUNCE_DELAY,
} from '@/utils/config/constants';
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

const DEFAULT_CONSOLIDATION_TYPES: ConsolidationType[] = [];

/** 与下方 useState 初始值保持一致，供「重置」同步恢复 */
const INITIAL_FILTER_STATE = {
  // 基础筛选
  selectedMarket: OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket,
  nameType: OPPORTUNITY_DEFAULT_BASIC_FILTERS.nameType,
  priceRange: { ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.priceRange },
  marketCapRange: { ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.marketCapRange },
  totalSharesRange: { ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.totalSharesRange },
  turnoverRateRange: { ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.turnoverRateRange },
  peRatioRange: {} as { min?: number; max?: number },
  kdjJRange: {} as { min?: number; max?: number },

  // 涨跌停筛选
  recentLimitUpCount: undefined as number | undefined,
  recentLimitDownCount: undefined as number | undefined,
  limitUpPeriod: OPPORTUNITY_DEFAULT_LIMIT_MOVES.period,
  limitDownPeriod: OPPORTUNITY_DEFAULT_LIMIT_MOVES.period,

  // 横盘筛选
  consolidationTypes: DEFAULT_CONSOLIDATION_TYPES,
  consolidationLookback: OPPORTUNITY_DEFAULT_CONSOLIDATION.lookback,
  consolidationConsecutive: OPPORTUNITY_DEFAULT_CONSOLIDATION.consecutive,
  consolidationThreshold: OPPORTUNITY_DEFAULT_CONSOLIDATION.threshold,
  consolidationRequireAboveMa10: OPPORTUNITY_DEFAULT_CONSOLIDATION.requireClosesAboveMa10,
  consolidationFilterEnabled: false,

  // 趋势线筛选
  trendLineLookback: OPPORTUNITY_DEFAULT_TREND_LINE.lookback,
  trendLineConsecutive: OPPORTUNITY_DEFAULT_TREND_LINE.consecutive,
  trendLineFilterEnabled: false,

  // 异动筛选
  sharpMoveFilterEnabled: true,
  sharpMoveWindowBars: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.windowBars,
  sharpMoveMagnitude: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.magnitude,
  sharpMoveFlatThreshold: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.flatThreshold,
  sharpMoveOnlyDrop: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.onlyDrop,
  sharpMoveOnlyRise: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.onlyRise,
  sharpMoveDropThenRiseLoose: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.dropThenRiseLoose,
  sharpMoveRiseThenDropLoose: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.riseThenDropLoose,
  sharpMoveDropFlatRise: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.dropFlatRise,
  sharpMoveRiseFlatDrop: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.riseFlatDrop,

  // 技术指标筛选
  rsiRange: {} as { min?: number; max?: number },
  rsiPeriod: OPPORTUNITY_DEFAULT_INDICATORS.rsiPeriod,
  bollingerThreshold: OPPORTUNITY_DEFAULT_INDICATORS.bollingerThreshold,
  macdGoldenCross: false,
  macdDeathCross: false,
  macdDivergence: false,
  bollingerUpper: false,
  bollingerMiddle: false,
  bollingerLower: false,

  // K线形态筛选
  candlestickHammer: false,
  candlestickShootingStar: false,
  candlestickDoji: false,
  candlestickEngulfingBullish: false,
  candlestickEngulfingBearish: false,
  candlestickHaramiBullish: false,
  candlestickHaramiBearish: false,
  candlestickMorningStar: false,
  candlestickEveningStar: false,
  candlestickDarkCloudCover: false,
  candlestickPiercing: false,
  candlestickThreeBlackCrows: false,
  candlestickThreeWhiteSoldiers: false,
  candlestickLookback: OPPORTUNITY_DEFAULT_CANDLESTICK.lookback,

  // K线形态识别高级配置
  patternUseVolumeConfirmation: OPPORTUNITY_DEFAULT_CANDLESTICK.useVolumeConfirmation,
  patternRequireVolumeForReversal: OPPORTUNITY_DEFAULT_CANDLESTICK.requireVolumeForReversal,
  patternTrendBackgroundLookback: OPPORTUNITY_DEFAULT_CANDLESTICK.trendBackgroundLookback,
  patternVolumeMultiplier: OPPORTUNITY_DEFAULT_CANDLESTICK.volumeMultiplier,

  // 趋势形态筛选
  trendUptrend: false,
  trendDowntrend: false,
  trendSideways: false,
  trendBreakout: false,
  trendBreakdown: false,
  trendLookback: OPPORTUNITY_DEFAULT_TREND_PATTERN.lookback,

  // AI分析筛选
  aiAnalysisEnabled: OPPORTUNITY_DEFAULT_AI_ANALYSIS.enabled,
  aiTrendUp: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendUp,
  aiTrendDown: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendDown,
  aiTrendSideways: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendSideways,
  aiConfidenceRange: {},
  aiRecommendScoreRange: {},
  aiTechnicalScoreRange: {},
  aiPatternScoreRange: {},
  aiTrendScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendScoreMin },
  aiRiskScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.riskScoreMin },
};

/** 与 opportunityStore 初始值一致，用于「重置」恢复周期与 K 线数量 */
const INITIAL_OPPORTUNITY_QUERY = {
  currentPeriod: 'day' as KLinePeriod,
  currentCount: 500,
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
    analysisTimestamp,
    startAnalysis,
    cancelAnalysis,
    retryFailedStocks,
    loadCachedData,
    updateColumnConfig,
    updateSortConfig,
    resetColumnConfig,
  } = useOpportunityStore();

  const { allStocks } = useAllStocks();

  // 为每只股票计算交易信号
  const processedData = useMemo(() => {
    return analysisData.map((item) => {
      // 从 klineDataCache 中获取 K 线数据
      const cachedKline = klineDataCache?.get(item.code);
      if (!cachedKline || cachedKline.length < 60) {
        // 如果K线数据不足，移除tradingSignal字段
        const { tradingSignal: _, ...rest } = item;
        return rest;
      }

      const signal = detectTradingSignal(cachedKline);
      // 确保 tradingSignal 要么是 TradingSignal 对象，要么不存在（undefined）
      if (signal) {
        return { ...item, tradingSignal: signal };
      }
      // 如果没有信号，移除tradingSignal字段
      const { tradingSignal: __, ...rest } = item;
      return rest;
    });
  }, [analysisData, klineDataCache]);

  const [columnSettingsVisible, setColumnSettingsVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<string[]>([...INITIAL_FILTER_STATE.selectedMarket]);
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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false); // 筛选抽屉状态
  const [filterDiagnosticsDrawerOpen, setFilterDiagnosticsDrawerOpen] = useState(false); // 筛选诊断抽屉状态
  const [errorExpanded, setErrorExpanded] = useState(false); // 失败详情展开状态

  // AI分析版本选择
  const [aiVersion, setAiVersion] = useState<'v1' | 'v2'>('v1'); // 默认使用v1.0原始版

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
  const [bollingerThreshold, setBollingerThreshold] = useState<number>(INITIAL_FILTER_STATE.bollingerThreshold);
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

  // K线形态识别高级配置状态
  const [patternUseVolumeConfirmation, setPatternUseVolumeConfirmation] = useState<boolean>(
    INITIAL_FILTER_STATE.patternUseVolumeConfirmation
  );
  const [patternRequireVolumeForReversal, setPatternRequireVolumeForReversal] = useState<boolean>(
    INITIAL_FILTER_STATE.patternRequireVolumeForReversal
  );
  const [patternTrendBackgroundLookback, setPatternTrendBackgroundLookback] = useState<number>(
    INITIAL_FILTER_STATE.patternTrendBackgroundLookback
  );
  const [patternVolumeMultiplier, setPatternVolumeMultiplier] = useState<number>(
    INITIAL_FILTER_STATE.patternVolumeMultiplier
  );

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

  // 行业板块筛选状态
  const [industrySectors, setIndustrySectors] = useState<string[]>([...OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.excludedIndustries]);
  const [industrySectorInvert, setIndustrySectorInvert] = useState<boolean>(OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.invertEnabled);
  // 概念板块筛选状态
  const [conceptSectors, setConceptSectors] = useState<string[]>([]);
  const [conceptSectorInvert, setConceptSectorInvert] = useState<boolean>(false); // 概念板块反选状态
  // 行业板块选项
  const [industrySectorOptions, setIndustrySectorOptions] = useState<{ label: string; value: string }[]>([]);
  // 概念板块选项
  const [conceptSectorOptions, setConceptSectorOptions] = useState<{ label: string; value: string }[]>([]);

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
        });
      }
      const st = useOpportunityStore.getState();
      if (st.analysisData.length === 0) {
        useOpportunityStore.setState({
          currentPeriod: prefs?.currentPeriod || 'day',
          currentCount: prefs?.currentCount || 500,
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

  // 加载行业和概念板块选项（使用统一缓存服务）
  useEffect(() => {
    let cancelled = false;
    const loadSectors = async () => {
      try {
        const { industry: industryData, concept: conceptData } = await getUnifiedSectorBasics();
        if (cancelled) return;
        setIndustrySectorOptions(
          industryData.map((s) => ({ label: s.name, value: s.code }))
        );
        setConceptSectorOptions(
          conceptData.map((s) => ({ label: s.name, value: s.code }))
        );
      } catch (error) {
        logger.error('加载板块选项失败:', error);
        message.warning('加载板块选项失败，筛选功能可能受限');
      }
    };
    loadSectors();
    return () => {
      cancelled = true;
    };
  }, []);

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
      };
      saveOpportunityFilterPrefs(prefs);
    }, FILTER_SAVE_DEBOUNCE_DELAY); // 防抖300ms

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
      const paginationHeight = pagination ? pagination.offsetHeight : 24;

      // 表格可用高度 = body高度 - 分页器高度 - 一些边距
      const height = bodyHeight - paginationHeight - OPPORTUNITY_TABLE_HEIGHT_PADDING - OPPORTUNITY_TABLE_HEIGHT_EXTRA_PADDING - OPPORTUNITY_TABLE_HEIGHT_MARGIN;
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

  // 根据选择的市场类型、名称类型、行业和概念板块筛选股票
  // 优化：简化过滤逻辑，减少分支判断
  const filteredStocks = useMemo<StockInfo[]>(() => {
    if (allStocks.length === 0) {
      return [];
    }

    // 预先确定市场匹配函数，避免在循环中重复 switch
    let marketMatchFn: (code: string) => boolean;

    // 如果没有选择任何市场，则不显示任何股票
    if (selectedMarket.length === 0) {
      return [];
    }

    // 构建市场匹配函数数组
    const marketMatchers: Array<(pureCode: string) => boolean> = [];
    selectedMarket.forEach(market => {
      switch (market) {
        case 'hs_main':
          marketMatchers.push((pureCode: string) => pureCode.startsWith('60') || pureCode.startsWith('00'));
          break;
        case 'sz_gem':
          marketMatchers.push((pureCode: string) => pureCode.startsWith('30'));
          break;
      }
    });

    // 如果没有任何有效的市场选择，返回空数组
    if (marketMatchers.length === 0) {
      return [];
    }

    // 只要匹配任何一个选中的市场即可
    marketMatchFn = (pureCode: string) => marketMatchers.some(matcher => matcher(pureCode));

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

      // 市场筛选
      if (!marketMatchFn(pureCode)) return false;

      // 名称类型筛选
      if (!nameTypeMatchFn(isST)) return false;

      // 行业板块筛选（预过滤）
      if (industrySectors && industrySectors.length > 0) {
        const hasIndustry = stock.industry && industrySectors.includes(stock.industry.code);
        if (industrySectorInvert) {
          // 反选模式：排除选中板块的股票
          if (hasIndustry) return false;
        } else {
          // 正常模式：只包含选中板块的股票
          if (!hasIndustry) return false;
        }
      }

      // 概念板块筛选（预过滤）
      if (conceptSectors && conceptSectors.length > 0) {
        if (!stock.concepts || stock.concepts.length === 0) {
          // 如果股票没有概念板块
          if (!conceptSectorInvert) {
            return false; // 正常模式：没有概念板块的股票被排除
          }
          // 反选模式：没有概念板块的股票保留（因为不在排除列表中）
        } else {
          const hasMatchingConcept = stock.concepts.some((c: { code: string; name: string }) => conceptSectors.includes(c.code));
          if (conceptSectorInvert) {
            // 反选模式：排除选中板块的股票
            if (hasMatchingConcept) return false;
          } else {
            // 正常模式：只包含选中板块的股票
            if (!hasMatchingConcept) return false;
          }
        }
      }

      return true;
    });
  }, [allStocks, selectedMarket, nameType, industrySectors, conceptSectors, industrySectorInvert, conceptSectorInvert]);

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
      bollingerThreshold,
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
      bollingerThreshold,
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

  const { filteredData: filteredAnalysisData, filtering: filteringAnalysisData, skipped: filterSkippedItems, clearAICache } =
    useOpportunityFilterEngine({
      analysisData: processedData as StockOpportunityData[],
      klineDataCache,
      filters: filterSnapshot,
      industrySectors,
      conceptSectors,
      industrySectorInvert,
      conceptSectorInvert,
    });

  // 打印反选后的股票信息
  useEffect(() => {
    const hasIndustryFilter = industrySectors && industrySectors.length > 0;
    const hasConceptFilter = conceptSectors && conceptSectors.length > 0;

    if ((hasIndustryFilter || hasConceptFilter) && filteredAnalysisData.length > 0) {
      logger.debug('=== 板块筛选结果 ===');

      if (hasIndustryFilter) {
        logger.debug('行业筛选:', {
          选中板块: industrySectors,
          模式: industrySectorInvert ? '排除选中' : '只包含选中'
        });
      }

      if (hasConceptFilter) {
        logger.debug('概念筛选:', {
          选中板块: conceptSectors,
          模式: conceptSectorInvert ? '排除选中' : '只包含选中'
        });
      }

      logger.debug('筛选后股票数量:', filteredAnalysisData.length);
      logger.debug('筛选后股票列表:', filteredAnalysisData.map(item => ({
        code: item.code,
        name: item.name,
        industry: item.industry,
        concepts: item.concepts
      })));
      logger.debug('==================');
    }
  }, [filteredAnalysisData, industrySectors, conceptSectors, industrySectorInvert, conceptSectorInvert]);

  useEffect(() => {
    if (filterSkippedItems.length === 0) {
      setFilterSkippedExpanded(false);
    }
  }, [filterSkippedItems.length]);

  /** 仅重置顶部：市场、名称类型、周期、K 线数量 */
  const handleResetQueryBar = () => {
    const s = INITIAL_FILTER_STATE;
    setSelectedMarket([...s.selectedMarket]);
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
    // 重置行业板块和概念板块筛选
    setIndustrySectors([...OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.excludedIndustries]);
    setConceptSectors([]);
    setIndustrySectorInvert(OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS.invertEnabled);
    setConceptSectorInvert(false);
    patchSavedPrefsFiltersToDefaults();
    message.info('已恢复默认筛选条件');
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    // 清空 AI 缓存，防止跨周期数据污染
    clearAICache();

    // 直接开始分析，不需要保存筛选条件（已通过useEffect自动保存）
    await startAnalysis(currentPeriod, filteredStocks, currentCount);
  };

  // 仅刷新AI分析（不重新获取K线数据）
  const handleRefreshAI = async () => {
    if (analysisData.length === 0) {
      message.warning('请先执行一键分析');
      return;
    }

    try {
      message.loading({ content: '正在刷新AI分析...', key: 'refreshAI' });

      logger.info(`开始刷新AI分析，总股票数: ${analysisData.length}`);

      // 清空AI缓存
      clearAICache();

      // 根据版本选择导入对应的AI分析模块（使用相对路径）
      let performAIAnalysis: any;
      if (aiVersion === 'v2') {
        const module = await import('../../services/opportunity/ai-v2.0');
        performAIAnalysis = module.performAIAnalysis;
      } else {
        const module = await import('../../services/opportunity/ai');
        performAIAnalysis = module.performAIAnalysis;
      }

      // 批量重新计算AI分析
      let updatedCount = 0;
      let skippedCount = 0;
      const updatedData = analysisData.map(stock => {
        const klineData = klineDataCache.get(stock.code);
        if (klineData && klineData.length >= 30) {
          try {
            // 构建 allStockData Map（用于相似形态匹配）
            const allStockData = new Map<string, { code: string; name: string; klineData: typeof klineData }>();
            allStockData.set(stock.code, { code: stock.code, name: stock.name, klineData });

            // 重新计算AI分析
            const aiAnalysis = performAIAnalysis(klineData, stock, allStockData);
            updatedCount++;
            return {
              ...stock,
              aiAnalysis,
              analysisTimestamp: Date.now(),
            };
          } catch (error) {
            logger.warn(`[${stock.code}] AI分析刷新失败:`, error);
            return stock; // 失败则保留原数据
          }
        } else {
          skippedCount++;
          logger.debug(`[${stock.code}] 跳过：K线数据不足 (${klineData?.length || 0}条)`);
        }
        return stock;
      });

      logger.info(`AI分析刷新完成：更新${updatedCount}只，跳过${skippedCount}只`);

      // 更新store中的分析数据
      useOpportunityStore.setState({ analysisData: updatedData });

      message.success({
        content: `AI分析已刷新（${aiVersion === 'v2' ? 'v2.0优化版' : 'v1.0原始版'}），共更新 ${updatedCount} 只股票`,
        key: 'refreshAI'
      });
    } catch (error) {
      logger.error('刷新AI分析失败:', error);
      message.error({ content: '刷新AI分析失败', key: 'refreshAI' });
    }
  };

  const handleCancel = () => {
    cancelAnalysis();
    message.info('分析已取消');
  };

  const handleRetryFailed = async () => {
    if (errors.length === 0) {
      return;
    }
    await retryFailedStocks();
  };

  // 添加到记录
  const handleAddToRecord = async () => {
    if (filteredAnalysisData.length === 0) {
      message.warning('没有数据可添加');
      return;
    }

    try {
      await addStocksToTodayRecord(filteredAnalysisData, analysisTimestamp || undefined);
      const dateStr = analysisTimestamp
        ? new Date(analysisTimestamp).toLocaleDateString('zh-CN')
        : '今天';
      message.success(`已将 ${filteredAnalysisData.length} 只股票添加到 ${dateStr} 的记录`);
    } catch (error) {
      message.error('添加到记录失败');
      logger.error('添加到记录失败:', error);
    }
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
      logger.error('导出失败:', error);
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
        const filterSummaryBase = buildOpportunityFilterSummary({
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
        });

        // 构建包含两行时间的完整文案
        const analysisTime = analysisTimestamp
          ? new Date(analysisTimestamp).toLocaleString('zh-CN')
          : '未知';
        const exportTime = new Date().toLocaleString('zh-CN');
        const filterSummary = `分析时间: ${analysisTime}\n导出时间: ${exportTime}${filterSummaryBase ? '\n筛选条件: ' + filterSummaryBase : ''}`;

        await exportStockNamesToPng(names, {
          fileNamePrefix: '机会分析_股票名称',
          filterSummary: filterSummary || undefined
        });
        message.success('名称列表已导出为图片');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      logger.error('导出名称失败:', error);
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
      {/* 统一的工具栏：查询条件 + 操作按钮 */}
      <div className={styles.toolbarRow}>
        <Space wrap size="small" align="center">
          {/* 查询条件 */}
          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>市场：</span>
            <Select
              mode="multiple"
              value={selectedMarket}
              onChange={(value: string[]) => {
                setSelectedMarket(value);
                if (analysisData.length > 0) {
                  message.info('市场已更改，请重新分析');
                }
              }}
              options={MARKET_OPTIONS}
              style={{ width: 200 }}
              disabled={loading}
              maxTagCount={2}
              maxTagPlaceholder={(omitted) => `+${omitted.length}`}
            />
          </Space.Compact>
          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>名称：</span>
            <Select
              value={nameType}
              onChange={(value: string) => {
                setNameType(value);
                if (analysisData.length > 0) {
                  message.info('名称类型已更改，请重新分析');
                }
              }}
              options={NAME_TYPE_OPTIONS}
              style={{ width: 100 }}
              disabled={loading}
            />
          </Space.Compact>
          <Space.Compact className={styles.spaceCompact} style={{ flex: 3, minWidth: 280 }}>
            <span className={styles.label}>行业：</span>
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择"
              value={industrySectors}
              onChange={(values: string[]) => {
                setIndustrySectors(values);
                if (analysisData.length > 0) {
                  message.info('行业板块已更改，请重新分析');
                }
              }}
              options={industrySectorOptions}
              style={{ flex: 1, minWidth: 220 }}
              disabled={loading}
              maxTagCount={2}
              maxTagPlaceholder={(omitted) => `+${omitted.length}`}
            />
            <Checkbox
              checked={industrySectorInvert}
              onChange={(e) => setIndustrySectorInvert(e.target.checked)}
              style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
              disabled={loading || industrySectors.length === 0}
            >
              排除选中
            </Checkbox>
          </Space.Compact>
          <Space.Compact className={styles.spaceCompact} style={{ flex: 3, minWidth: 280 }}>
            <span className={styles.label}>概念：</span>
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择"
              value={conceptSectors}
              onChange={(values: string[]) => {
                setConceptSectors(values);
                if (analysisData.length > 0) {
                  message.info('概念板块已更改，请重新分析');
                }
              }}
              options={conceptSectorOptions}
              style={{ flex: 1, minWidth: 220 }}
              disabled={loading}
              maxTagCount={2}
              maxTagPlaceholder={(omitted) => `+${omitted.length}`}
            />
            <Checkbox
              checked={conceptSectorInvert}
              onChange={(e) => setConceptSectorInvert(e.target.checked)}
              style={{ marginLeft: 8, whiteSpace: 'nowrap' }}
              disabled={loading || conceptSectors.length === 0}
            >
              排除选中
            </Checkbox>
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
              style={{ width: 90 }}
              disabled={loading}
            />
          </Space.Compact>
          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>K线：</span>
            <InputNumber
              value={currentCount}
              min={50}
              max={1000}
              step={10}
              style={{ width: 100 }}
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
          </Space.Compact>

          {/* 操作按钮 */}
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleAnalyze}
            loading={loading}
            disabled={loading || filteredStocks.length === 0}
          >
            一键分析
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefreshAI}
            disabled={loading || analysisData.length === 0}
            title="仅重新计算AI分析，速度更快"
          >
            刷新AI
          </Button>
          <Select
            value={aiVersion}
            onChange={(value) => setAiVersion(value)}
            style={{ width: 120 }}
            options={[
              { label: 'v1.0 原始版', value: 'v1' },
              { label: 'v2.0 优化版', value: 'v2' },
            ]}
            disabled={loading}
            title="选择AI分析算法版本"
          />
          <Button icon={<ClearOutlined />} onClick={handleResetQueryBar} disabled={loading}>
            重置
          </Button>
          {loading && (
            <Button icon={<StopOutlined />} onClick={handleCancel}>
              取消
            </Button>
          )}
          <Dropdown
            menu={{
              items: [
                { key: 'excel', label: '导出Excel' },
                { type: 'divider' },
                { key: 'png', label: '导出名称(PNG)' },
                { key: 'names-xlsx', label: '导出名称(Excel)' },
                { type: 'divider' },
                { key: 'columns', label: '列设置', icon: <SettingOutlined /> }
              ],
              onClick: ({ key }) => {
                if (key === 'columns') {
                  setColumnSettingsVisible(true);
                } else if (key === 'excel') {
                  void handleExport('excel');
                } else {
                  void handleExportNames(key === 'names-xlsx' ? 'excel' : 'png');
                }
              },
            }}
          >
            <Button icon={<ExportOutlined />}>
              导出/设置 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            icon={<DatabaseOutlined />}
            onClick={handleAddToRecord}
            disabled={loading || filteredAnalysisData.length === 0}
          >
            添加到记录
          </Button>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setFilterDrawerOpen(true)}
          >
            筛选条件
          </Button>
        </Space>
      </div>

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
            <div className={styles.errorCardHeader}>
              <div className={styles.errorCardTitle}>
                <span className={styles.errorIcon}>⚠️</span>
                <span>分析失败 <span className={styles.errorCount}>{errors.length}</span> 只股票</span>
              </div>
              <Space size="small">
                <Button
                  size="small"
                  onClick={() => setErrorExpanded(!errorExpanded)}
                >
                  {errorExpanded ? '收起' : '查看详情'}
                </Button>
                <Button
                  type="primary"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRetryFailed}
                  loading={loading}
                  disabled={loading}
                >
                  重试失败股票
                </Button>
              </Space>
            </div>

            {errorExpanded && (
              <div className={styles.errorList}>
                {errors.map((err, index) => (
                  <Tooltip key={index} title={err.error} placement="top">
                    <div className={styles.errorItem}>
                      <span className={styles.errorStock}>
                        {err.stock.code} {err.stock.name}
                      </span>
                      <span className={styles.errorMessage}>{err.error}</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            )}
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
            // K线形态识别高级配置 props
            patternUseVolumeConfirmation={patternUseVolumeConfirmation}
            setPatternUseVolumeConfirmation={setPatternUseVolumeConfirmation}
            patternRequireVolumeForReversal={patternRequireVolumeForReversal}
            setPatternRequireVolumeForReversal={setPatternRequireVolumeForReversal}
            patternTrendBackgroundLookback={patternTrendBackgroundLookback}
            setPatternTrendBackgroundLookback={setPatternTrendBackgroundLookback}
            patternVolumeMultiplier={patternVolumeMultiplier}
            setPatternVolumeMultiplier={setPatternVolumeMultiplier}
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
            // 行业板块筛选
            industrySectors={industrySectors}
            setIndustrySectors={setIndustrySectors}
            industrySectorOptions={industrySectorOptions}
            industrySectorInvert={industrySectorInvert}
            setIndustrySectorInvert={setIndustrySectorInvert}
            // 概念板块筛选
            conceptSectors={conceptSectors}
            setConceptSectors={setConceptSectors}
            conceptSectorOptions={conceptSectorOptions}
            conceptSectorInvert={conceptSectorInvert}
            setConceptSectorInvert={setConceptSectorInvert}
            // 重置筛选按钮
            resetFilterButton={
              <Button icon={<ClearOutlined />} onClick={handleResetFilterForms} disabled={loading}>
                重置筛选
              </Button>
            }
            // 外部控制抽屉状态
            drawerOpen={filterDrawerOpen}
            setDrawerOpen={setFilterDrawerOpen}
          />
        </div>



        {/* 筛选结果提示 - 仅在有数据时显示 */}
        {analysisData.length > 0 && (
          <div className={styles.filterResultWrapper}>
            <div className={styles.filterResult}>
              {/* 筛选结果计数 - 放在最左侧 */}
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
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

              {/* 筛选条件摘要 - 放在右侧 */}
              {(() => {
                const summary = buildOpportunityFilterSummary({
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
                  industrySectors,
                  conceptSectors,
                  industrySectorOptions,
                  conceptSectorOptions,
                });
                return summary ? (
                  <span
                    className={styles.filterSummaryText}
                    onClick={() => setFilterDrawerOpen(true)}
                    style={{ cursor: 'pointer' }}
                    title="点击打开筛选面板"
                  >
                    🔍 {summary}
                  </span>
                ) : null;
              })()}

              {filteringAnalysisData && <span className={styles.filteringTag}>筛选中...</span>}
              {filterSkippedItems.length > 0 && (
                <Badge count={filterSkippedItems.length} overflowCount={999} showZero={false}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ExclamationCircleOutlined />}
                    className={styles.filterSkipButton}
                    onClick={() => setFilterDiagnosticsDrawerOpen(true)}
                  >
                    跳过详情
                  </Button>
                </Badge>
              )}
              {analysisTimestamp && (
                <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginLeft: 8 }}>
                  🕐 分析时间：{new Date(analysisTimestamp).toLocaleString('zh-CN')}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 表格区域 */}
        {analysisData.length > 0 ? (
          <Card className={styles.tableCard} ref={tableCardRef}>
            <OpportunityTable
              data={filteredAnalysisData as StockOpportunityData[]}
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

      <FilterDiagnosticsDrawer
        open={filterDiagnosticsDrawerOpen}
        onClose={() => setFilterDiagnosticsDrawerOpen(false)}
        skipped={filterSkippedItems}
      />
    </Layout >
  );
}


