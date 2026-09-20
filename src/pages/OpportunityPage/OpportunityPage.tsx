/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, App, Input, InputNumber, Dropdown, Alert, Tag, Tooltip, Badge, Popover, Checkbox, Spin } from 'antd';
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
  FundOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useOpportunityStore } from '@/stores/opportunityStore';
import { useStockStore } from '@/stores/stockStore';
import { apiCache } from '@/utils/storage/apiCache';
import {
  clearStockHistory,
  clearOpportunityData,
  getStocksHistory,
  getAllStockFinanceMetrics,
} from '@/utils/storage/opportunityIndexedDB';
import {
  CONSOLIDATION_TYPE_LABELS,
} from '@/utils/analysis/consolidationAnalysis';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { AIAnalysisModal } from '@/components/AIAnalysisModal';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
import { exportOpportunityToExcel } from '@/utils/export/opportunityExportUtils';
import { exportStockNamesToPng } from '@/utils/export/stockNamesExportUtils';
import { addStocksToTodayRecord } from '@/services/opportunity/recordService';
import { getSinaFinanceMetricsBatch } from '@/services/fundamental/sinaFinance';
import type {
  ConsolidationType,
  KLinePeriod,
  StockInfo,
  StockFinanceMetrics,
  StockOpportunityData,
} from '@/types/stock';
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
  OPPORTUNITY_DEFAULT_AI_ANALYSIS,
  OPPORTUNITY_DEFAULT_INDICATORS,
  OPPORTUNITY_DEFAULT_LIMIT_MOVES,
  OPPORTUNITY_DEFAULT_BASIC_FILTERS,
  OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL,
  OPPORTUNITY_DEFAULT_VOLUME_PULLBACK,
  OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS,
  OPPORTUNITY_DEFAULT_NAME_FILTERS,
} from '@/utils/config/opportunityAnalysisDefaults';
import { getUnifiedSectorBasics } from '@/services/hot/unified-sectors';
import type { IndustrySectorBasicInfo, ConceptSectorBasicInfo } from '@/types/stock';
import {
  getMappedConcepts,
  getMappedIndustry,
  loadSectorStockMapping,
  type SectorInfo,
} from '@/services/stocks/sectorMapping';
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
  financeRevenueRange: {} as { min?: number; max?: number },
  financeNetProfitRange: {} as { min?: number; max?: number },

  // 涨跌停筛选（默认近10天有1次涨停）
  recentLimitUpCount: OPPORTUNITY_DEFAULT_LIMIT_MOVES.minLimitUpCount,
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
  trendLineRequireLatest: OPPORTUNITY_DEFAULT_TREND_LINE.requireEndsAtLatest,
  trendLineMinRisePct: OPPORTUNITY_DEFAULT_TREND_LINE.minRisePct,
  trendLineFilterEnabled: false,

  // 异动筛选
  sharpMoveFilterEnabled: false,
  sharpMoveWindowBars: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.windowBars,
  sharpMoveMagnitude: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.magnitude,
  sharpMoveFlatThreshold: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.flatThreshold,
  sharpMoveOnlyDrop: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.onlyDrop,
  sharpMoveOnlyRise: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.onlyRise,
  sharpMoveDropThenRiseLoose: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.dropThenRiseLoose,
  sharpMoveRiseThenDropLoose: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.riseThenDropLoose,
  sharpMoveDropFlatRise: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.dropFlatRise,
  sharpMoveRiseFlatDrop: OPPORTUNITY_DEFAULT_SHARP_MOVE_FULL.riseFlatDrop,

  // 量价回踩筛选（默认关闭）
  volumePullbackFilterEnabled: false,
  volumePullbackLookback: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.lookback,
  volumePullbackMinRisePct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minRisePct,
  volumePullbackTriggerType: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.triggerType,
  volumePullbackVolumeRatio: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeRatio,
  volumePullbackVolumeMaPeriod: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeMaPeriod,
  volumePullbackMaxBars: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxBars,
  volumePullbackMinPullbackPct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.minPullbackPct,
  volumePullbackMaxPullbackPct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.maxPullbackPct,
  volumePullbackVolumeShrink: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.volumeShrink,
  volumePullbackMa10TolerancePct: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.ma10TolerancePct,
  volumePullbackRequireUpperShadow: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.requireUpperShadow,
  volumePullbackUpperShadowRatio: OPPORTUNITY_DEFAULT_VOLUME_PULLBACK.upperShadowRatio,

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

  // AI分析筛选
  aiAnalysisEnabled: OPPORTUNITY_DEFAULT_AI_ANALYSIS.enabled,
  aiTrendUp: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendUp,
  aiTrendDown: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendDown,
  aiTrendSideways: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendSideways,
  aiConfidenceRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.confidenceMin },
  aiRecommendScoreRange: {},
  aiTechnicalScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.technicalScoreMin },
  aiPatternScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.patternScoreMin },
  aiTrendScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.trendScoreMin },
  aiRiskScoreRange: { min: OPPORTUNITY_DEFAULT_AI_ANALYSIS.riskScoreMin },

  // v3.0 新增筛选条件
  aiSignalConfluence: false,
  aiMinSignalCount: 4,
  aiMinSignalRatio: 0.6,
  aiPatternWinRateRange: {} as { min?: number; max?: number },
  aiMinSimilarPatterns: 3,
  aiMinRiskRewardRatio: undefined as number | undefined,

  // 名称过滤
  excludedNameKeywords: [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedNameKeywords],
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

  // 确保分组数据已加载（用于添加到自选股功能）
  const { loadWatchList } = useStockStore();

  useEffect(() => {
    loadWatchList();
  }, [loadWatchList]);

  const { allStocks } = useAllStocks();

  const [industryMapping, setIndustryMapping] = useState<Map<string, SectorInfo>>(new Map());
  const [conceptMapping, setConceptMapping] = useState<Map<string, SectorInfo[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const loadSectorMapping = async () => {
      const { industryByCode, conceptsByCode } = await loadSectorStockMapping();
      if (cancelled) return;
      setIndustryMapping(industryByCode);
      setConceptMapping(conceptsByCode);
    };
    loadSectorMapping();
    return () => {
      cancelled = true;
    };
  }, []);

  // 补全行业/概念。
  // 交易信号（每只股票都要算 MA5/10/20/60 + KDJ）改由 Worker 计算，
  // 结果经 useOpportunityFilterEngine 的 signalMap 合并回筛选结果，避免主线程长时间阻塞。
  // 第一层：只用 allStocks / analysisData 补全行业与概念（不依赖 IndexedDB 板块映射）
  const baseAnalysisData = useMemo(() => {
    // 构建股票代码到完整信息的映射（包含 industry 和 concepts）
    const stockInfoMap = new Map(
      allStocks.map((stock) => [stock.code, { industry: stock.industry, concepts: stock.concepts }])
    );

    return analysisData.map((item) => {
      // 从 allStocks 中补充 industry 和 concepts（对应原取值优先级的前两级）
      const stockInfo = stockInfoMap.get(item.code);
      const industry = stockInfo?.industry || item.industry || undefined;
      const conceptsFromStock = stockInfo?.concepts;
      const concepts =
        (conceptsFromStock && conceptsFromStock.length > 0 ? conceptsFromStock : undefined) ||
        (item.concepts && item.concepts.length > 0 ? item.concepts : undefined);
      return {
        ...item,
        industry,
        concepts,
      };
    });
  }, [analysisData, allStocks]);

  // 第二层：仅对仍缺行业/概念的股票，用 IndexedDB 成分股映射兜底。
  // 取值优先级与拆分前完全一致：allStocks → 自身字段 → IndexedDB 映射。
  // 板块映射晚到时只走这一层轻量判断，不再重跑第一层，也不会触发交易信号重算。
  const processedData = useMemo(() => {
    if (industryMapping.size === 0 && conceptMapping.size === 0) {
      return baseAnalysisData;
    }
    return baseAnalysisData.map((item) => {
      const industry = item.industry ?? getMappedIndustry(item.code, industryMapping) ?? undefined;
      const concepts =
        item.concepts && item.concepts.length > 0
          ? item.concepts
          : getMappedConcepts(item.code, conceptMapping);
      if (industry === item.industry && concepts === item.concepts) {
        return item;
      }
      return { ...item, industry, concepts };
    });
  }, [baseAnalysisData, industryMapping, conceptMapping]);

  // 需要检测交易信号的股票代码：K 线已在 Worker 内，这里只传代码，避免重复传输大对象。
  // 依赖第一层，板块映射变化不会再触发信号重算。
  const signalCodes = useMemo(() => baseAnalysisData.map((item) => item.code), [baseAnalysisData]);

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
  /** 总营收范围（亿元） */
  const [financeRevenueRange, setFinanceRevenueRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeRevenueRange
  );
  /** 归母净利润范围（亿元） */
  const [financeNetProfitRange, setFinanceNetProfitRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeNetProfitRange
  );
  /** 筛选 Collapse 当前展开的面板 key 列表；[] 表示各组均收起。默认展开所有筛选项 */
  const [filterPanelActiveKey, setFilterPanelActiveKey] = useState<string[]>(['data', 'nameFilter', 'aiAnalysis', 'sharpMove', 'volumePullback', 'consolidation', 'trendLine']);

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
  const [trendLineRequireLatest, setTrendLineRequireLatest] = useState<boolean>(
    INITIAL_FILTER_STATE.trendLineRequireLatest
  );
  const [trendLineMinRisePct, setTrendLineMinRisePct] = useState<number>(
    INITIAL_FILTER_STATE.trendLineMinRisePct
  );
  const [trendLineFilterEnabled, setTrendLineFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.trendLineFilterEnabled
  );

  const [filterSkippedExpanded, setFilterSkippedExpanded] = useState(false);
  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const [tableSearchKeyword, setTableSearchKeyword] = useState<string>(''); // 表格模糊搜索关键字
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用
  const [aiAnalysisVisible, setAiAnalysisVisible] = useState(false);
  const [selectedStockForAI, setSelectedStockForAI] = useState<{ code: string; name: string } | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false); // 筛选抽屉状态
  const [filterDiagnosticsDrawerOpen, setFilterDiagnosticsDrawerOpen] = useState(false); // 筛选诊断抽屉状态
  const [errorExpanded, setErrorExpanded] = useState(false); // 失败详情展开状态

  // AI分析版本选择（切换时自动刷新）；与 store.analysisAiVersion 对齐供一键分析使用
  const [aiVersion, setAiVersion] = useState<'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7'>('v5');
  const [showAddToWatchListModal, setShowAddToWatchListModal] = useState(false);
  const [aiRefreshLoading, setAiRefreshLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false); // 初始数据加载状态

  const aiVersionLabel = (version: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7') =>
    version === 'v7' ? 'v7.0安全增强' : version === 'v6' ? 'v6.0性能增强' : version === 'v5' ? 'v5.0智能增强' : version === 'v3' ? 'v3.0增强版' : version === 'v2' ? 'v2.0优化版' : version === 'v4' ? 'v4.0结构增强' : 'v1.0原始版';

  // AI版本切换时自动执行刷新（无分析数据时仅写入 store，供下次一键分析使用）
  const handleAiVersionChange = async (selectedVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7') => {
    // ⚠️ 当前项目仅启用 v5.0，其余版本暂时停用（模块已注释），自动回退到 v5
    const version = selectedVersion === 'v5' ? selectedVersion : ('v5' as const);
    if (selectedVersion !== version) {
      message.info(`${aiVersionLabel(selectedVersion)} 当前未启用，已使用 v5.0 智能增强`);
    }
    logger.info(`[AI版本切换] 切换到 ${version}`);
    setAiVersion(version);
    useOpportunityStore.setState({ analysisAiVersion: version });

    if (analysisData.length === 0) {
      setAiVersion(version);
      message.info(`已选择 ${aiVersionLabel(version)}，请执行一键分析生效`);
      return;
    }

    try {
      setAiRefreshLoading(true);
      message.loading({ content: `正在切换到${aiVersionLabel(version)}...`, key: 'aiVersionChange' });

      logger.info(`切换AI版本到${version}，总股票数: ${analysisData.length}`);

      // 清空AI缓存（Worker 内也会清一次，这里保证主线程侧一致）
      clearAICache();

      // ⚠️ 重算放在 Worker 中执行：AI 相似形态识别是全池比对（O(N²)），
      // 放到主线程会长时间卡死界面。AI 实现当前仅启用 v5.0（其余版本模块已注释），
      // 详见 src/workers/opportunityFilterWorker.ts
      const result = await recomputeAI(analysisData, ({ completed, total, percent }) => {
        message.loading({
          content: `正在切换到${aiVersionLabel(version)}... ${completed}/${total}（${percent}%）`,
          key: 'aiVersionChange',
        });
      });

      if (!result) {
        // 被新任务取消或页面卸载
        message.info({ content: 'AI 版本切换已取消', key: 'aiVersionChange' });
        return;
      }

      logger.info(`AI分析刷新完成：更新${result.updatedCount}只，跳过${result.skippedCount}只`);

      // 更新store中的分析数据和AI版本
      useOpportunityStore.setState({
        analysisData: result.data,
        analysisAiVersion: version // 同步更新store中的AI版本
      });

      // 更新版本状态
      setAiVersion(version);

      message.success({
        content:
          `已切换到${aiVersionLabel(version)}，共更新 ${result.updatedCount} 只股票` +
          (result.skippedCount > 0 ? `，跳过 ${result.skippedCount} 只` : ''),
        key: 'aiVersionChange'
      });
    } catch (error) {
      logger.error('切换AI版本失败:', error);
      message.error({ content: '切换AI版本失败', key: 'aiVersionChange' });
    } finally {
      setAiRefreshLoading(false);
    }
  };

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

  // 量价回踩筛选状态（放量上涨 → 缩量回踩不破 MA10）
  const [volumePullbackFilterEnabled, setVolumePullbackFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.volumePullbackFilterEnabled
  );
  const [volumePullbackLookback, setVolumePullbackLookback] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackLookback
  );
  const [volumePullbackMinRisePct, setVolumePullbackMinRisePct] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackMinRisePct
  );
  const [volumePullbackTriggerType, setVolumePullbackTriggerType] = useState<'any' | 'limitUp'>(
    INITIAL_FILTER_STATE.volumePullbackTriggerType
  );
  const [volumePullbackVolumeRatio, setVolumePullbackVolumeRatio] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackVolumeRatio
  );
  const [volumePullbackVolumeMaPeriod, setVolumePullbackVolumeMaPeriod] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackVolumeMaPeriod
  );
  const [volumePullbackMaxBars, setVolumePullbackMaxBars] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackMaxBars
  );
  const [volumePullbackMinPullbackPct, setVolumePullbackMinPullbackPct] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackMinPullbackPct
  );
  const [volumePullbackMaxPullbackPct, setVolumePullbackMaxPullbackPct] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackMaxPullbackPct
  );
  const [volumePullbackVolumeShrink, setVolumePullbackVolumeShrink] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackVolumeShrink
  );
  const [volumePullbackMa10TolerancePct, setVolumePullbackMa10TolerancePct] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackMa10TolerancePct
  );
  const [volumePullbackRequireUpperShadow, setVolumePullbackRequireUpperShadow] = useState<boolean>(
    INITIAL_FILTER_STATE.volumePullbackRequireUpperShadow
  );
  const [volumePullbackUpperShadowRatio, setVolumePullbackUpperShadowRatio] = useState<number>(
    INITIAL_FILTER_STATE.volumePullbackUpperShadowRatio
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

  // v3.0 新增筛选条件状态
  const [aiSignalConfluence, setAiSignalConfluence] = useState<boolean>(INITIAL_FILTER_STATE.aiSignalConfluence);
  const [aiMinSignalCount, setAiMinSignalCount] = useState<number>(INITIAL_FILTER_STATE.aiMinSignalCount);
  const [aiMinSignalRatio, setAiMinSignalRatio] = useState<number>(INITIAL_FILTER_STATE.aiMinSignalRatio);
  const [aiPatternWinRateRange, setAiPatternWinRateRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.aiPatternWinRateRange
  );
  const [aiMinSimilarPatterns, setAiMinSimilarPatterns] = useState<number>(INITIAL_FILTER_STATE.aiMinSimilarPatterns);
  const [aiMinRiskRewardRatio, setAiMinRiskRewardRatio] = useState<number | undefined>(
    INITIAL_FILTER_STATE.aiMinRiskRewardRatio
  );

  // 名称筛选状态
  const [enableNameKeywordFilter, setEnableNameKeywordFilter] = useState<boolean>(true);
  const [excludedNameKeywords, setExcludedNameKeywords] = useState<string[]>(
    [...INITIAL_FILTER_STATE.excludedNameKeywords]
  );
  const [enableShortTermNameFilter, setEnableShortTermNameFilter] = useState<boolean>(true);

  /** 导出K线数据状态 */
  const [exportingKline, setExportingKline] = useState(false);
  const [exportKlineProgress, setExportKlineProgress] = useState({ current: 0, total: 0 });
  /** 营收 / 净利润数据（按股票代码索引，仅内存态） */
  const [financeMap, setFinanceMap] = useState<Record<string, StockFinanceMetrics>>({});
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeProgress, setFinanceProgress] = useState({ total: 0, completed: 0, failed: 0 });
  const financeAbortRef = useRef<AbortController | null>(null);
  /** 一键分析成功且无失败后，递增以触发自动「添加到记录」（等筛选完成） */
  const [autoAddToRecordToken, setAutoAddToRecordToken] = useState(0);
  const lastAutoAddToRecordTokenRef = useRef(0);
  const [excludedShortTermNames, setExcludedShortTermNames] = useState<string[]>(
    [...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedShortTermNames]
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
      // 检查是否有缓存数据，如果有则显示 loading
      const stBefore = useOpportunityStore.getState();
      if (stBefore.analysisData.length > 0) {
        setInitialLoading(true);
      }

      await loadCachedData();
      if (cancelled) {
        setInitialLoading(false);
        return;
      }

      // 恢复已持久化的营收/净利润指标（IndexedDB，不受 apiCache.clear() 影响）
      try {
        const financeRecords = await getAllStockFinanceMetrics();
        if (!cancelled && financeRecords.length > 0) {
          const restored: Record<string, StockFinanceMetrics> = {};
          financeRecords.forEach((record) => {
            restored[record.code] = record.metrics;
          });
          setFinanceMap(restored);
        }
      } catch (error) {
        logger.warn('[机会分析] 恢复营收净利润数据失败:', error);
      }

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
          setFinanceRevenueRange,
          setFinanceNetProfitRange,
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
          setTrendLineRequireLatest,
          setTrendLineMinRisePct,
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
          // 量价回踩筛选 actions
          setVolumePullbackFilterEnabled,
          setVolumePullbackLookback,
          setVolumePullbackMinRisePct,
          setVolumePullbackTriggerType,
          setVolumePullbackVolumeRatio,
          setVolumePullbackVolumeMaPeriod,
          setVolumePullbackMaxBars,
          setVolumePullbackMinPullbackPct,
          setVolumePullbackMaxPullbackPct,
          setVolumePullbackVolumeShrink,
          setVolumePullbackMa10TolerancePct,
          setVolumePullbackRequireUpperShadow,
          setVolumePullbackUpperShadowRatio,
          // 新增技术指标筛选 actions
          setRsiRange,
          setRsiPeriod,
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
          // 名称筛选 actions
          setEnableNameKeywordFilter,
          setExcludedNameKeywords,
          setEnableShortTermNameFilter,
          setExcludedShortTermNames,
        });
      }
      // AI 版本使用系统默认值 v5
      useOpportunityStore.setState({ analysisAiVersion: 'v5' });
      const st = useOpportunityStore.getState();
      if (st.analysisData.length === 0) {
        useOpportunityStore.setState({
          currentPeriod: prefs?.currentPeriod || 'day',
          currentCount: prefs?.currentCount || 500,
        });
      }
      // 标记恢复完成
      isRestoredRef.current = true;
      setInitialLoading(false);
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
        financeRevenueRange: { ...financeRevenueRange },
        financeNetProfitRange: { ...financeNetProfitRange },
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
        trendLineRequireLatest,
        trendLineMinRisePct,
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
        volumePullbackFilterEnabled,
        volumePullbackLookback,
        volumePullbackMinRisePct,
        volumePullbackTriggerType,
        volumePullbackVolumeRatio,
        volumePullbackVolumeMaPeriod,
        volumePullbackMaxBars,
        volumePullbackMinPullbackPct,
        volumePullbackMaxPullbackPct,
        volumePullbackVolumeShrink,
        volumePullbackMa10TolerancePct,
        volumePullbackRequireUpperShadow,
        volumePullbackUpperShadowRatio,
        rsiRange: { ...rsiRange },
        rsiPeriod,
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
        enableNameKeywordFilter,
        excludedNameKeywords: [...excludedNameKeywords],
        enableShortTermNameFilter,
        excludedShortTermNames: [...excludedShortTermNames],
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
    trendLineRequireLatest,
    trendLineMinRisePct,
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
    volumePullbackFilterEnabled,
    volumePullbackLookback,
    volumePullbackMinRisePct,
    volumePullbackTriggerType,
    volumePullbackVolumeRatio,
    volumePullbackVolumeMaPeriod,
    volumePullbackMaxBars,
    volumePullbackMinPullbackPct,
    volumePullbackMaxPullbackPct,
    volumePullbackVolumeShrink,
    volumePullbackMa10TolerancePct,
    volumePullbackRequireUpperShadow,
    volumePullbackUpperShadowRatio,
    rsiRange,
    rsiPeriod,
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
    enableNameKeywordFilter,
    excludedNameKeywords,
    enableShortTermNameFilter,
    excludedShortTermNames,
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
        financeRevenueRange: { ...financeRevenueRange },
        financeNetProfitRange: { ...financeNetProfitRange },
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
        trendLineRequireLatest,
        trendLineMinRisePct,
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
        volumePullbackFilterEnabled,
        volumePullbackLookback,
        volumePullbackMinRisePct,
        volumePullbackTriggerType,
        volumePullbackVolumeRatio,
        volumePullbackVolumeMaPeriod,
        volumePullbackMaxBars,
        volumePullbackMinPullbackPct,
        volumePullbackMaxPullbackPct,
        volumePullbackVolumeShrink,
        volumePullbackMa10TolerancePct,
        volumePullbackRequireUpperShadow,
        volumePullbackUpperShadowRatio,
        rsiRange: { ...rsiRange },
        rsiPeriod,
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
        enableNameKeywordFilter,
        excludedNameKeywords: [...excludedNameKeywords],
        enableShortTermNameFilter,
        excludedShortTermNames: [...excludedShortTermNames],
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
    trendLineRequireLatest,
    trendLineMinRisePct,
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
    volumePullbackFilterEnabled,
    volumePullbackLookback,
    volumePullbackMinRisePct,
    volumePullbackTriggerType,
    volumePullbackVolumeRatio,
    volumePullbackVolumeMaPeriod,
    volumePullbackMaxBars,
    volumePullbackMinPullbackPct,
    volumePullbackMaxPullbackPct,
    volumePullbackVolumeShrink,
    volumePullbackMa10TolerancePct,
    volumePullbackRequireUpperShadow,
    volumePullbackUpperShadowRatio,
    rsiRange,
    rsiPeriod,
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
    enableNameKeywordFilter,
    excludedNameKeywords,
    enableShortTermNameFilter,
    excludedShortTermNames,
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
      const industry = stock.industry || getMappedIndustry(stock.code, industryMapping) || undefined;
      const concepts =
        (stock.concepts && stock.concepts.length > 0
          ? stock.concepts
          : getMappedConcepts(stock.code, conceptMapping));

      // 市场筛选
      if (!marketMatchFn(pureCode)) return false;

      // 名称类型筛选
      if (!nameTypeMatchFn(isST)) return false;

      // 行业板块筛选（预过滤）
      if (industrySectors && industrySectors.length > 0) {
        const hasIndustry = industry && industrySectors.includes(industry.code);
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
        if (!concepts || concepts.length === 0) {
          // 如果股票没有概念板块
          if (!conceptSectorInvert) {
            return false; // 正常模式：没有概念板块的股票被排除
          }
          // 反选模式：没有概念板块的股票保留（因为不在排除列表中）
        } else {
          const hasMatchingConcept = concepts.some((c: { code: string; name: string }) => conceptSectors.includes(c.code));
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
  }, [allStocks, selectedMarket, nameType, industrySectors, conceptSectors, industrySectorInvert, conceptSectorInvert, industryMapping, conceptMapping]);

  // 处理添加到自选股
  const handleAddToWatchList = () => {
    setShowAddToWatchListModal(true);
  };

  const filterSnapshot = useMemo<OpportunityFilterSnapshot>(
    () => ({
      priceRange,
      marketCapRange,
      totalSharesRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      financeRevenueRange,
      financeNetProfitRange,
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
      trendLineRequireLatest,
      trendLineMinRisePct,
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
      volumePullbackFilterEnabled,
      volumePullbackLookback,
      volumePullbackMinRisePct,
      volumePullbackTriggerType,
      volumePullbackVolumeRatio,
      volumePullbackVolumeMaPeriod,
      volumePullbackMaxBars,
      volumePullbackMinPullbackPct,
      volumePullbackMaxPullbackPct,
      volumePullbackVolumeShrink,
      volumePullbackMa10TolerancePct,
      volumePullbackRequireUpperShadow,
      volumePullbackUpperShadowRatio,
      rsiRange,
      rsiPeriod,
      bollingerThreshold,
      macdGoldenCross,
      macdDeathCross,
      macdDivergence,
      bollingerUpper,
      bollingerMiddle,
      bollingerLower,
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
      aiVersion,
      industrySectors,
      conceptSectors,
      industrySectorInvert,
      conceptSectorInvert,
      nameType: nameType as 'all' | 'st' | 'non_st',
      enableNameKeywordFilter,
      excludedNameKeywords,
      enableShortTermNameFilter,
      excludedShortTermNames,
    }),
    [
      priceRange,
      marketCapRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      financeRevenueRange,
      financeNetProfitRange,
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
      trendLineRequireLatest,
      trendLineMinRisePct,
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
      volumePullbackFilterEnabled,
      volumePullbackLookback,
      volumePullbackMinRisePct,
      volumePullbackTriggerType,
      volumePullbackVolumeRatio,
      volumePullbackVolumeMaPeriod,
      volumePullbackMaxBars,
      volumePullbackMinPullbackPct,
      volumePullbackMaxPullbackPct,
      volumePullbackVolumeShrink,
      volumePullbackMa10TolerancePct,
      volumePullbackRequireUpperShadow,
      volumePullbackUpperShadowRatio,
      rsiRange,
      rsiPeriod,
      bollingerThreshold,
      macdGoldenCross,
      macdDeathCross,
      macdDivergence,
      bollingerUpper,
      bollingerMiddle,
      bollingerLower,
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
      aiVersion,
      industrySectors,
      conceptSectors,
      industrySectorInvert,
      conceptSectorInvert,
      nameType,
      enableNameKeywordFilter,
      excludedNameKeywords,
      enableShortTermNameFilter,
      excludedShortTermNames,
    ]
  );

  // 筛选条件摘要：原先是 JSX 里的 IIFE，每次渲染都会重算；改为按依赖缓存，输出完全一致
  const filterSummaryText = useMemo(
    () =>
      buildOpportunityFilterSummary({
        priceRange,
        marketCapRange,
        totalSharesRange,
        turnoverRateRange,
        peRatioRange,
        kdjJRange,
        financeRevenueRange,
        financeNetProfitRange,
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
        trendLineRequireLatest,
        trendLineMinRisePct,
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
        volumePullbackFilterEnabled,
        volumePullbackLookback,
        volumePullbackMinRisePct,
        volumePullbackTriggerType,
        volumePullbackVolumeRatio,
        volumePullbackVolumeMaPeriod,
        volumePullbackMaxBars,
        volumePullbackMinPullbackPct,
        volumePullbackMaxPullbackPct,
        volumePullbackVolumeShrink,
        volumePullbackMa10TolerancePct,
        volumePullbackRequireUpperShadow,
        volumePullbackUpperShadowRatio,
        rsiRange,
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
        excludedNameKeywords,
        excludedShortTermNames,
      }),
    [
      priceRange,
      marketCapRange,
      totalSharesRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      financeRevenueRange,
      financeNetProfitRange,
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
      trendLineFilterEnabled,
      trendLineLookback,
      trendLineConsecutive,
      trendLineRequireLatest,
      trendLineMinRisePct,
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
      volumePullbackFilterEnabled,
      volumePullbackLookback,
      volumePullbackMinRisePct,
      volumePullbackTriggerType,
      volumePullbackVolumeRatio,
      volumePullbackVolumeMaPeriod,
      volumePullbackMaxBars,
      volumePullbackMinPullbackPct,
      volumePullbackMaxPullbackPct,
      volumePullbackVolumeShrink,
      volumePullbackMa10TolerancePct,
      volumePullbackRequireUpperShadow,
      volumePullbackUpperShadowRatio,
      rsiRange,
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
      excludedNameKeywords,
      excludedShortTermNames,
    ]
  );

  // 合并已获取的营收/净利润数据（供筛选与展示；不影响交易信号计算）
  const processedDataWithFinance = useMemo(() => {
    if (Object.keys(financeMap).length === 0) {
      return processedData;
    }
    return processedData.map((item) =>
      financeMap[item.code] ? { ...item, finance: financeMap[item.code] } : item
    );
  }, [processedData, financeMap]);

  const { filteredData: filteredAnalysisData, filtering: filteringAnalysisData, skipped: filterSkippedItems, clearAICache, recomputeAI } =
    useOpportunityFilterEngine({
      analysisData: processedDataWithFinance as StockOpportunityData[],
      klineDataCache,
      filters: filterSnapshot,
      industrySectors,
      conceptSectors,
      industrySectorInvert,
      conceptSectorInvert,
      signalCodes,
    });

  // 表格层面的股票名称/代码模糊过滤
  const displayAnalysisData = useMemo(() => {
    const kw = tableSearchKeyword.trim().toLowerCase();
    if (!kw) {
      return filteredAnalysisData;
    }
    return filteredAnalysisData.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const code = (item.code || '').toLowerCase();
      const pureCode = code.replace(/^(sh|sz|bj)/, '');
      return name.includes(kw) || code.includes(kw) || pureCode.includes(kw);
    });
  }, [filteredAnalysisData, tableSearchKeyword]);

  // 将已获取的营收 / 净利润数据合并到表格行
  const displayAnalysisDataWithFinance = useMemo(() => {
    if (Object.keys(financeMap).length === 0) {
      return displayAnalysisData;
    }
    return displayAnalysisData.map((item) =>
      financeMap[item.code] ? { ...item, finance: financeMap[item.code] } : item
    );
  }, [displayAnalysisData, financeMap]);

  // 页面卸载时中断未完成的营收净利润请求
  useEffect(() => {
    return () => {
      financeAbortRef.current?.abort();
    };
  }, []);

  // 一键分析无失败：筛选完成后自动「添加到记录」（与手动按钮同一批筛选结果）
  useEffect(() => {
    if (autoAddToRecordToken === 0) return;
    if (autoAddToRecordToken === lastAutoAddToRecordTokenRef.current) return;
    if (loading || filteringAnalysisData) return;

    lastAutoAddToRecordTokenRef.current = autoAddToRecordToken;

    const {
      errors: currentErrors,
      analysisTimestamp: ts,
    } = useOpportunityStore.getState();
    if (currentErrors.length > 0) {
      return;
    }
    if (filteredAnalysisData.length === 0) {
      message.info('分析完成且无失败，但当前筛选结果为空，未自动添加到记录');
      return;
    }

    void (async () => {
      try {
        await addStocksToTodayRecord(filteredAnalysisData, ts || undefined);
        const dateStr = ts ? new Date(ts).toLocaleDateString('zh-CN') : '今天';
        message.success(`已自动将 ${filteredAnalysisData.length} 只股票添加到 ${dateStr} 的记录`);
      } catch (error) {
        message.error('自动添加到记录失败');
        logger.error('自动添加到记录失败:', error);
      }
    })();
  }, [
    autoAddToRecordToken,
    loading,
    filteringAnalysisData,
    filteredAnalysisData,
    message,
  ]);

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
  const handleResetFilterForms = useCallback(() => {
    const s = INITIAL_FILTER_STATE;
    setPriceRange({ ...s.priceRange });
    setMarketCapRange({ ...s.marketCapRange });
    setTurnoverRateRange({ ...s.turnoverRateRange });
    setPeRatioRange({ ...s.peRatioRange });
    setKdjJRange({ ...s.kdjJRange });
    setFinanceRevenueRange({ ...s.financeRevenueRange });
    setFinanceNetProfitRange({ ...s.financeNetProfitRange });
    setFilterPanelActiveKey(['data', 'consolidation', 'trendLine', 'sharpMove', 'volumePullback', 'technicalIndicators', 'aiAnalysis']);
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
    // 重置量价回踩筛选
    setVolumePullbackFilterEnabled(s.volumePullbackFilterEnabled);
    setVolumePullbackLookback(s.volumePullbackLookback);
    setVolumePullbackMinRisePct(s.volumePullbackMinRisePct);
    setVolumePullbackTriggerType(s.volumePullbackTriggerType);
    setVolumePullbackVolumeRatio(s.volumePullbackVolumeRatio);
    setVolumePullbackVolumeMaPeriod(s.volumePullbackVolumeMaPeriod);
    setVolumePullbackMaxBars(s.volumePullbackMaxBars);
    setVolumePullbackMinPullbackPct(s.volumePullbackMinPullbackPct);
    setVolumePullbackMaxPullbackPct(s.volumePullbackMaxPullbackPct);
    setVolumePullbackVolumeShrink(s.volumePullbackVolumeShrink);
    setVolumePullbackMa10TolerancePct(s.volumePullbackMa10TolerancePct);
    setVolumePullbackRequireUpperShadow(s.volumePullbackRequireUpperShadow);
    setVolumePullbackUpperShadowRatio(s.volumePullbackUpperShadowRatio);
    // 重置新增的技术指标筛选
    setRsiRange({ ...s.rsiRange });
    setRsiPeriod(s.rsiPeriod);
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
    // 重置名称过滤
    // 名称筛选重置
    setEnableNameKeywordFilter(true);
    setExcludedNameKeywords([...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedNameKeywords]);
    setEnableShortTermNameFilter(true);
    setExcludedShortTermNames([...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedShortTermNames]);
    setTableSearchKeyword('');
    patchSavedPrefsFiltersToDefaults();
    message.info('已恢复默认筛选条件');
  }, [message]);

  // 重置筛选按钮：稳定引用，避免每次渲染都新建 JSX 使筛选面板的 memo 失效
  const resetFilterButtonNode = useMemo(
    () => (
      <Button icon={<ClearOutlined />} onClick={handleResetFilterForms} disabled={loading}>
        重置筛选
      </Button>
    ),
    [handleResetFilterForms, loading]
  );

  /** 获取当前股票池（与一键分析一致）的营业总收入 / 归母净利润 */
  const handleFetchFinance = async () => {
    if (financeLoading) {
      return;
    }
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    const controller = new AbortController();
    financeAbortRef.current = controller;
    setFinanceLoading(true);
    setFinanceProgress({ total: filteredStocks.length, completed: 0, failed: 0 });

    try {
      const map = await getSinaFinanceMetricsBatch(filteredStocks, {
        signal: controller.signal,
        onProgress: (p) => {
          setFinanceProgress({ total: p.total, completed: p.completed, failed: p.failed });
        },
      });

      if (map.size === 0) {
        message.warning('未获取到营收/净利润数据');
        return;
      }

      setFinanceMap((prev) => {
        const next = { ...prev };
        map.forEach((value, code) => {
          next[code] = value;
        });
        return next;
      });
      message.success(`营收/净利润数据已就绪，共 ${map.size} 只（命中本地缓存的不重复请求）`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        message.info('已取消获取营收净利润');
      } else {
        logger.error('[OpportunityPage] 获取营收净利润失败:', error);
        message.error('获取营收净利润失败');
      }
    } finally {
      financeAbortRef.current = null;
      setFinanceLoading(false);
      setFinanceProgress({ total: 0, completed: 0, failed: 0 });
    }
  };

  const handleCancelFetchFinance = () => {
    financeAbortRef.current?.abort();
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    // 清空 AI 缓存，防止跨周期数据污染
    clearAICache();

    // 清空 store 中的 K 线数据缓存和分析结果
    useOpportunityStore.getState().clearData();
    logger.info('[机会分析] 已清空 store 中的缓存数据');

    // 实时：清空内存与 IndexedDB，强制拉最新
    apiCache.clear();
    logger.info('[机会分析] 已清空内存缓存，将获取最新数据');
    try {
      await Promise.all([
        clearStockHistory(),
        clearOpportunityData(),
      ]);
      logger.info('[机会分析] 已清空 IndexedDB 中的股票历史数据和分析结果');
    } catch (error) {
      logger.warn('[机会分析] 清空 IndexedDB 失败:', error);
    }

    await startAnalysis(
      currentPeriod,
      filteredStocks,
      currentCount,
      aiVersion
    );

    const {
      errors: analyzeErrors,
      analysisData: analyzed,
    } = useOpportunityStore.getState();
    const successCount = analyzed.filter((item) => !item.error).length;
    if (analyzeErrors.length > 0) {
      message.warning(
        `分析有 ${analyzeErrors.length} 只失败，未自动添加到记录（可重试失败后手动添加）`
      );
      return;
    }
    if (successCount === 0) {
      return;
    }
    setAutoAddToRecordToken((token) => token + 1);
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
    if (displayAnalysisData.length === 0) {
      message.warning('没有数据可添加');
      return;
    }

    try {
      await addStocksToTodayRecord(displayAnalysisData, analysisTimestamp || undefined);
      const dateStr = analysisTimestamp
        ? new Date(analysisTimestamp).toLocaleDateString('zh-CN')
        : '今天';
      message.success(`已将 ${displayAnalysisData.length} 只股票添加到 ${dateStr} 的记录`);
    } catch (error) {
      message.error('添加到记录失败');
      logger.error('添加到记录失败:', error);
    }
  };

  const handleExport = async (format: 'excel') => {
    if (displayAnalysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    try {
      if (format === 'excel') {
        await exportOpportunityToExcel(displayAnalysisDataWithFinance, columnConfig);
        message.success('Excel导出成功');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      logger.error('导出失败:', error);
    }
  };

  /** 当前筛选结果中的股票名称，按列最多 20 条导出为图片 */
  const handleExportNames = async () => {
    if (displayAnalysisData.length === 0) {
      message.warning('没有数据可导出');
      return;
    }
    const names = displayAnalysisData.map((r) => (r.name || r.code || '').trim()).filter(Boolean);
    if (names.length === 0) {
      message.warning('没有可用的股票名称');
      return;
    }
    try {
      // 导出图片仅保留两行时间信息（不展示筛选条件）
      const analysisTime = analysisTimestamp
        ? new Date(analysisTimestamp).toLocaleString('zh-CN')
        : '未知';
      const exportTime = new Date().toLocaleString('zh-CN');
      const filterSummary = `分析时间: ${analysisTime}\n导出时间: ${exportTime}`;

      await exportStockNamesToPng(names, {
        fileNamePrefix: '机会分析_股票名称',
        filterSummary: filterSummary || undefined
      });
      message.success('名称列表已导出为图片');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      logger.error('导出名称失败:', error);
    }
  };

  /** 导出 IndexedDB 中的全量 K 线数据到本地文件 (docs/回测优化/股票数据) */
  const handleExportAllKlineData = async () => {
    if (!window.electronAPI?.batchExportKlineData) {
      message.error('批量导出功能不可用（需在 Electron 环境中运行）');
      return;
    }

    try {
      setExportingKline(true);
      setExportKlineProgress({ current: 0, total: 0 });
      message.info('正在读取 IndexedDB stockHistory...');

      const allHistories = await getStocksHistory([]);
      if (allHistories.length === 0) {
        message.warning('IndexedDB 中没有 stockHistory 数据');
        return;
      }

      setExportKlineProgress({ current: 0, total: allHistories.length });

      const industryByCode = new Map<string, { code: string; name: string }>();
      allStocks.forEach((stock) => {
        const industry =
          stock.industry || getMappedIndustry(stock.code, industryMapping) || null;
        if (industry) {
          industryByCode.set(stock.code, { code: industry.code, name: industry.name });
          industryByCode.set(getPureCode(stock.code), { code: industry.code, name: industry.name });
        }
      });

      const stocksData = allHistories.map((history, index) => {
        const industry =
          history.industry ||
          industryByCode.get(history.code) ||
          industryByCode.get(getPureCode(history.code)) ||
          getMappedIndustry(history.code, industryMapping) ||
          null;
        if ((index + 1) % 50 === 0 || index + 1 === allHistories.length) {
          setExportKlineProgress({ current: index + 1, total: allHistories.length });
        }
        return {
          code: history.code,
          name: history.name,
          klineData: history.dailyLines,
          latestQuote: history.latestQuote,
          updatedAt: history.updatedAt,
          industry,
        };
      });

      message.info(`正在导出 ${stocksData.length} 只股票的 K 线数据...`);
      const result = await window.electronAPI.batchExportKlineData(stocksData);

      if (result.success) {
        const { summary } = result;
        message.success(
          summary
            ? `导出完成！总计 ${summary.total} 只，成功 ${summary.success} 只，失败 ${summary.fail} 只`
            : '导出完成！'
        );
      } else {
        message.error('导出失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      logger.error('[OpportunityPage] 导出K线数据失败:', error);
      message.error('导出失败: ' + (error as Error).message);
    } finally {
      setExportingKline(false);
      setExportKlineProgress({ current: 0, total: 0 });
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
                  message.info('名称类型会立即作用于当前结果；若要缩小分析池请重新分析');
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
          <Button icon={<ClearOutlined />} onClick={handleResetQueryBar} disabled={loading}>
            重置
          </Button>
          {loading && (
            <Button icon={<StopOutlined />} onClick={handleCancel}>
              取消
            </Button>
          )}
          <Button
            icon={<FundOutlined />}
            onClick={handleFetchFinance}
            loading={financeLoading}
            disabled={loading || financeLoading || filteredStocks.length === 0}
            title={`获取当前股票池（${filteredStocks.length} 只）的营业总收入与归母净利润`}
          >
            获取营收净利润
          </Button>
          {financeLoading && (
            <Button icon={<StopOutlined />} onClick={handleCancelFetchFinance}>
              取消获取
            </Button>
          )}
          <Select
            value={aiVersion}
            onChange={handleAiVersionChange}
            style={{ width: 140 }}
            options={[
              { label: 'v1.0 原始版', value: 'v1' },
              { label: 'v2.0 优化版', value: 'v2' },
              { label: 'v3.0 增强版', value: 'v3' },
              { label: 'v4.0 结构增强', value: 'v4' },
              { label: 'v5.0 智能增强', value: 'v5' },
              { label: 'v6.0 性能增强', value: 'v6' },
              { label: 'v7.0 安全增强', value: 'v7' },
            ]}
            disabled={loading || aiRefreshLoading}
            title="切换AI分析算法版本（自动刷新）"
            data-testid="ai-version-select"
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'addToWatchList',
                  label: '添加到自选股',
                  icon: <DatabaseOutlined />,
                  disabled: loading || displayAnalysisData.length === 0,
                },
                { type: 'divider' },
                {
                  key: 'addToRecord',
                  label: '添加到记录',
                  icon: <OrderedListOutlined />,
                  disabled: loading || displayAnalysisData.length === 0,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'addToWatchList') {
                  handleAddToWatchList();
                } else if (key === 'addToRecord') {
                  handleAddToRecord();
                }
              },
            }}
          >
            <Button icon={<OrderedListOutlined />}>
              添加到 <DownOutlined />
            </Button>
          </Dropdown>
          <Dropdown
            menu={{
              items: [
                { key: 'excel', label: '导出Excel' },
                { type: 'divider' },
                { key: 'png', label: '导出名称(PNG)' },
                { type: 'divider' },
                { key: 'columns', label: '列设置', icon: <SettingOutlined /> }
              ],
              onClick: ({ key }) => {
                if (key === 'columns') {
                  setColumnSettingsVisible(true);
                } else if (key === 'excel') {
                  void handleExport('excel');
                } else if (key === 'png') {
                  void handleExportNames();
                }
              },
            }}
          >
            <Button icon={<ExportOutlined />}>
              导出/设置 <DownOutlined />
            </Button>
          </Dropdown>
          <Button
            icon={<ExportOutlined />}
            loading={exportingKline}
            disabled={loading || exportingKline}
            onClick={handleExportAllKlineData}
          >
            导出K线
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

        {exportingKline && exportKlineProgress.total > 0 && (
          <Card className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Progress
                percent={Math.round((exportKlineProgress.current / exportKlineProgress.total) * 100)}
                status="active"
                format={(percent) => `${percent}%`}
              />
              <div className={styles.progressText}>
                导出K线进度: {exportKlineProgress.current} / {exportKlineProgress.total}
              </div>
            </div>
          </Card>
        )}

        {financeLoading && financeProgress.total > 0 && (
          <Card className={styles.progressCard}>
            <div className={styles.progressInfo}>
              <Progress
                percent={Math.round((financeProgress.completed / financeProgress.total) * 100)}
                status="active"
                format={(percent) => `${percent}%`}
              />
              <div className={styles.progressText}>
                获取营收净利润进度: {financeProgress.completed} / {financeProgress.total}（失败:{' '}
                {financeProgress.failed}）
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
            financeRevenueRange={financeRevenueRange}
            setFinanceRevenueRange={setFinanceRevenueRange}
            financeNetProfitRange={financeNetProfitRange}
            setFinanceNetProfitRange={setFinanceNetProfitRange}
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
            trendLineRequireLatest={trendLineRequireLatest}
            setTrendLineRequireLatest={setTrendLineRequireLatest}
            trendLineMinRisePct={trendLineMinRisePct}
            setTrendLineMinRisePct={setTrendLineMinRisePct}
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
            // 量价回踩筛选 props
            volumePullbackFilterEnabled={volumePullbackFilterEnabled}
            setVolumePullbackFilterEnabled={setVolumePullbackFilterEnabled}
            volumePullbackLookback={volumePullbackLookback}
            setVolumePullbackLookback={setVolumePullbackLookback}
            volumePullbackMinRisePct={volumePullbackMinRisePct}
            setVolumePullbackMinRisePct={setVolumePullbackMinRisePct}
            volumePullbackTriggerType={volumePullbackTriggerType}
            setVolumePullbackTriggerType={setVolumePullbackTriggerType}
            volumePullbackVolumeRatio={volumePullbackVolumeRatio}
            setVolumePullbackVolumeRatio={setVolumePullbackVolumeRatio}
            volumePullbackVolumeMaPeriod={volumePullbackVolumeMaPeriod}
            setVolumePullbackVolumeMaPeriod={setVolumePullbackVolumeMaPeriod}
            volumePullbackMaxBars={volumePullbackMaxBars}
            setVolumePullbackMaxBars={setVolumePullbackMaxBars}
            volumePullbackMinPullbackPct={volumePullbackMinPullbackPct}
            setVolumePullbackMinPullbackPct={setVolumePullbackMinPullbackPct}
            volumePullbackMaxPullbackPct={volumePullbackMaxPullbackPct}
            setVolumePullbackMaxPullbackPct={setVolumePullbackMaxPullbackPct}
            volumePullbackVolumeShrink={volumePullbackVolumeShrink}
            setVolumePullbackVolumeShrink={setVolumePullbackVolumeShrink}
            volumePullbackMa10TolerancePct={volumePullbackMa10TolerancePct}
            setVolumePullbackMa10TolerancePct={setVolumePullbackMa10TolerancePct}
            volumePullbackRequireUpperShadow={volumePullbackRequireUpperShadow}
            setVolumePullbackRequireUpperShadow={setVolumePullbackRequireUpperShadow}
            volumePullbackUpperShadowRatio={volumePullbackUpperShadowRatio}
            setVolumePullbackUpperShadowRatio={setVolumePullbackUpperShadowRatio}
            consolidationTypeOptions={CONSOLIDATION_TYPE_OPTIONS}
            // 新增技术指标筛选 props
            rsiRange={rsiRange}
            setRsiRange={setRsiRange}
            rsiPeriod={rsiPeriod}
            setRsiPeriod={setRsiPeriod}
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
            // v3.0 新增筛选条件
            aiVersion={aiVersion}
            aiSignalConfluence={aiSignalConfluence}
            setAiSignalConfluence={setAiSignalConfluence}
            aiMinSignalCount={aiMinSignalCount}
            setAiMinSignalCount={setAiMinSignalCount}
            aiMinSignalRatio={aiMinSignalRatio}
            setAiMinSignalRatio={setAiMinSignalRatio}
            aiPatternWinRateRange={aiPatternWinRateRange}
            setAiPatternWinRateRange={setAiPatternWinRateRange}
            aiMinSimilarPatterns={aiMinSimilarPatterns}
            setAiMinSimilarPatterns={setAiMinSimilarPatterns}
            aiMinRiskRewardRatio={aiMinRiskRewardRatio}
            setAiMinRiskRewardRatio={setAiMinRiskRewardRatio}
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
            // 名称过滤
            // 名称筛选
            enableNameKeywordFilter={enableNameKeywordFilter}
            setEnableNameKeywordFilter={setEnableNameKeywordFilter}
            excludedNameKeywords={excludedNameKeywords}
            setExcludedNameKeywords={setExcludedNameKeywords}
            // 短期排除股票名称
            enableShortTermNameFilter={enableShortTermNameFilter}
            setEnableShortTermNameFilter={setEnableShortTermNameFilter}
            excludedShortTermNames={excludedShortTermNames}
            setExcludedShortTermNames={setExcludedShortTermNames}
            // 重置筛选按钮
            resetFilterButton={resetFilterButtonNode}
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
                {tableSearchKeyword.trim() ? (
                  <>
                    搜索匹配：<strong>{displayAnalysisData.length}</strong> / 筛选结果：{filteredAnalysisData.length}（共 {analysisData.length} 条）
                  </>
                ) : filteredAnalysisData.length !== analysisData.length ? (
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
              {filterSummaryText ? (
                <span
                  className={styles.filterSummaryText}
                  onClick={() => setFilterDrawerOpen(true)}
                  style={{ cursor: 'pointer' }}
                  title="点击打开筛选面板"
                >
                  🔍 {filterSummaryText}
                </span>
              ) : null}

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
          <Card
            className={styles.tableCard}
            ref={tableCardRef}
            style={{ position: 'relative' }}
            title={
              <Space>
                <span>分析结果</span>
              </Space>
            }
            extra={
              <Input
                allowClear
                size="small"
                prefix={<SearchOutlined />}
                placeholder="搜索股票名称/代码"
                value={tableSearchKeyword}
                onChange={(e) => setTableSearchKeyword(e.target.value)}
                style={{ width: 180 }}
              />
            }
          >
            {initialLoading && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(255, 255, 255, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                  borderRadius: 8,
                }}
              >
                <Space direction="vertical" align="center" size={8}>
                  <Spin size="large" />
                  <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                    正在加载历史分析数据...
                  </span>
                </Space>
              </div>
            )}
            <OpportunityTable
              data={displayAnalysisDataWithFinance as StockOpportunityData[]}
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

      <AddStocksToWatchListModal
        visible={showAddToWatchListModal}
        stocks={displayAnalysisData}
        onClose={() => setShowAddToWatchListModal(false)}
      />
    </Layout >
  );
}


