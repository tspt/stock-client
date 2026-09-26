/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Select, App, Input, InputNumber, Dropdown, Tooltip, Badge, Checkbox, Spin } from 'antd';
import type { TablePaginationConfig } from 'antd';
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
import { useTempStockListStore } from '@/stores/tempStockListStore';
import { apiCache } from '@/utils/storage/apiCache';
import {
  clearStockHistory,
  clearOpportunityData,
  getStocksHistory,
  getAllStockFinanceMetrics,
} from '@/utils/storage/opportunityIndexedDB';
import { OpportunityTable } from '@/components/OpportunityTable/OpportunityTable';
import { ColumnSettings } from '@/components/ColumnSettings/ColumnSettings';
import { AIAnalysisModal } from '@/components/AIAnalysisModal';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
import { exportStockNamesToPng } from '@/utils/export/stockNamesExportUtils';
import { addStocksToTodayRecord } from '@/services/opportunity/recordService';
import { getSinaFinanceMetricsBatch } from '@/services/fundamental/sinaFinance';
import type {
  ConsolidationType,
  KLinePeriod,
  StockFinanceMetrics,
  StockOpportunityData,
} from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { sortOpportunityData } from '@/utils/sort/tableSort';
import { logger } from '@/utils/business/logger';
import { useOpportunityFilterEngine } from '@/hooks/useOpportunityFilterEngine';
import { getPureCode } from '@/utils/format/format';
import {
  DEFAULT_FILTER_PANEL_ACTIVE_KEYS,
  applyOpportunityFilterPrefsToState,
  loadOpportunityFilterPrefs,
  patchSavedPrefsFiltersToDefaults,
  patchSavedPrefsQueryToDefaults,
  saveOpportunityFilterPrefs,
} from '@/utils/config/opportunityFilterPrefs';
import {
  buildOpportunityFilterPrefs,
  buildOpportunityFilterSnapshot,
  type OpportunityFilterFormState,
} from '@/utils/config/opportunityFilterFormState';
import {
  AI_VERSION_OPTIONS,
  CONSOLIDATION_TYPE_OPTIONS,
  ENABLED_AI_VERSION,
  MARKET_OPTIONS,
  NAME_TYPE_OPTIONS,
  PERIOD_OPTIONS,
  getAiVersionLabel,
  resolveEnabledAiVersion,
  type AiVersion,
} from '@/utils/config/opportunityPageOptions';
import { filterStocksByMarketAndSectors } from '@/utils/analysis/stockFiltering';
import { mergeFinanceMetrics } from '@/utils/analysis/stockFinanceMerge';
import { filterByStockKeyword } from '@/utils/format/textMatch';
import { ProgressCard } from '@/components/common/ProgressCard/ProgressCard';
import { OpportunityFiltersPanel, buildOpportunityFilterSummary } from './OpportunityFiltersPanel';
import { DailyChartModal } from './DailyChartModal';
import { FilterDiagnosticsDrawer } from '@/components/FilterDiagnosticsDrawer';
import {
  INITIAL_FILTER_STATE,
  INITIAL_OPPORTUNITY_QUERY,
  OPPORTUNITY_DEFAULT_INDUSTRY_SECTORS,
  OPPORTUNITY_DEFAULT_NAME_FILTERS,
  OPPORTUNITY_INDUSTRY_GROUPS,
  OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER,
} from '@/utils/config/opportunityAnalysisDefaults';
import { getUnifiedSectorBasics } from '@/services/hot/unified-sectors';
import type { TradingSignalType } from '@/types/stock';
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

const { Content } = Layout;

export function OpportunityPage() {
  const { message } = App.useApp();
  /** K线/筹码弹窗里「加入临时列表」收集的股票（全局、仅内存） */
  const tempStockList = useTempStockListStore((state) => state.items);
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
    ensureKlineForCode,
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
  /** 总营收增长率范围（%） */
  const [financeRevenueGrowthRange, setFinanceRevenueGrowthRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeRevenueGrowthRange
  );
  /** 归母净利润增长率范围（%） */
  const [financeNetProfitGrowthRange, setFinanceNetProfitGrowthRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeNetProfitGrowthRange
  );
  /** 净资产收益率（ROE）范围（%） */
  const [financeRoeRange, setFinanceRoeRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeRoeRange
  );
  /** 资产负债率范围（%） */
  const [financeDebtRatioRange, setFinanceDebtRatioRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.financeDebtRatioRange
  );
  /** 筛选面板当前展开的 key 列表；[] 表示各组均收起。默认展开所有筛选项 */
  const [filterPanelActiveKey, setFilterPanelActiveKey] = useState<string[]>([
    ...DEFAULT_FILTER_PANEL_ACTIVE_KEYS,
  ]);

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

  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const [tableSearchKeyword, setTableSearchKeyword] = useState<string>(''); // 表格模糊搜索关键字
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用
  const [aiAnalysisVisible, setAiAnalysisVisible] = useState(false);
  const [selectedStockForAI, setSelectedStockForAI] = useState<{ code: string; name: string } | null>(null);
  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null); // K线弹窗状态
  /** 表格分页（受控）：弹窗内 ← / → 切换股票时同步翻页，保证表格与弹窗始终指向同一只 */
  const [tablePagination, setTablePagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 100,
  });
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false); // 筛选抽屉状态
  const [filterDiagnosticsDrawerOpen, setFilterDiagnosticsDrawerOpen] = useState(false); // 筛选诊断抽屉状态
  const [errorExpanded, setErrorExpanded] = useState(false); // 失败详情展开状态

  // AI分析版本选择（切换时自动刷新）；与 store.analysisAiVersion 对齐供一键分析使用
  const [aiVersion, setAiVersion] = useState<AiVersion>(ENABLED_AI_VERSION);
  const [showAddToWatchListModal, setShowAddToWatchListModal] = useState(false);
  const [aiRefreshLoading, setAiRefreshLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false); // 初始数据加载状态

  // AI版本切换时自动执行刷新（无分析数据时仅写入 store，供下次一键分析使用）
  const handleAiVersionChange = async (selectedVersion: AiVersion) => {
    // ⚠️ 当前项目仅启用 v5.0，其余版本暂时停用（模块已注释），自动回退到已启用版本
    const version = resolveEnabledAiVersion(selectedVersion);
    if (selectedVersion !== version) {
      message.info(
        `${getAiVersionLabel(selectedVersion)} 当前未启用，已使用 ${getAiVersionLabel(version)}`
      );
    }
    logger.info(`[AI版本切换] 切换到 ${version}`);
    setAiVersion(version);
    useOpportunityStore.setState({ analysisAiVersion: version });

    if (analysisData.length === 0) {
      setAiVersion(version);
      message.info(`已选择 ${getAiVersionLabel(version)}，请执行一键分析生效`);
      return;
    }

    try {
      setAiRefreshLoading(true);
      message.loading({ content: `正在切换到${getAiVersionLabel(version)}...`, key: 'aiVersionChange' });

      logger.info(`切换AI版本到${version}，总股票数: ${analysisData.length}`);

      // 清空AI缓存（Worker 内也会清一次，这里保证主线程侧一致）
      clearAICache();

      // ⚠️ 重算放在 Worker 中执行：AI 相似形态识别是全池比对（O(N²)），
      // 放到主线程会长时间卡死界面。AI 实现当前仅启用 v5.0（其余版本模块已注释），
      // 详见 src/workers/opportunityFilterWorker.ts
      const result = await recomputeAI(analysisData, ({ completed, total, percent }) => {
        message.loading({
          content: `正在切换到${getAiVersionLabel(version)}... ${completed}/${total}（${percent}%）`,
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
          `已切换到${getAiVersionLabel(version)}，共更新 ${result.updatedCount} 只股票` +
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
  // 交易信号筛选状态（空数组＝不筛选）
  const [tradingSignalTypes, setTradingSignalTypes] = useState<TradingSignalType[]>(
    INITIAL_FILTER_STATE.tradingSignalTypes
  );

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
  /**
   * 名称筛选面板的「行业分组」：与顶部工具栏「行业」完全独立，
   * 只作用于筛选结果，不参与「一键分析」股票池的构造。
   */
  const [nameFilterIndustryGroups, setNameFilterIndustryGroups] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.selectedGroups,
  ]);
  const [nameFilterIndustryInvert, setNameFilterIndustryInvert] = useState<boolean>(
    OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.invertEnabled
  );
  // 行业板块选项
  const [industrySectorOptions, setIndustrySectorOptions] = useState<{ label: string; value: string }[]>([]);
  // 概念板块选项
  const [conceptSectorOptions, setConceptSectorOptions] = useState<{ label: string; value: string }[]>([]);

  /** 名称筛选面板选中的行业分组 → 行业板块代码集合（独立于顶部「行业」筛选） */
  const nameFilterIndustryCodes = useMemo(() => {
    if (nameFilterIndustryGroups.length === 0) {
      return [];
    }
    const labels = new Set(nameFilterIndustryGroups);
    return [
      ...new Set(
        OPPORTUNITY_INDUSTRY_GROUPS.filter((group) => labels.has(group.label)).flatMap((group) => [
          ...group.codes,
        ])
      ),
    ];
  }, [nameFilterIndustryGroups]);

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
          setFinanceRevenueGrowthRange,
          setFinanceNetProfitGrowthRange,
          setFinanceRoeRange,
          setFinanceDebtRatioRange,
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
          // 交易信号筛选 actions
          setTradingSignalTypes,
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
          // 名称筛选面板：行业分组 actions（独立于顶部「行业」筛选）
          setNameFilterIndustryGroups,
          setNameFilterIndustryInvert,
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

  /**
   * 筛选表单状态汇总：既是 localStorage 持久化的来源，也是筛选引擎快照的来源。
   * 字段清单与归一化规则集中在 utils/config/opportunityFilterFormState.ts，避免多处重复维护。
   */
  const filterFormState = useMemo<OpportunityFilterFormState>(
    () => ({
      priceRange,
      marketCapRange,
      totalSharesRange,
      turnoverRateRange,
      peRatioRange,
      kdjJRange,
      financeRevenueRange,
      financeNetProfitRange,
      financeRevenueGrowthRange,
      financeNetProfitGrowthRange,
      financeRoeRange,
      financeDebtRatioRange,
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
      tradingSignalTypes,
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
    }),
    [
      priceRange, marketCapRange, totalSharesRange, turnoverRateRange, peRatioRange, kdjJRange,
      financeRevenueRange, financeNetProfitRange, financeRevenueGrowthRange, financeNetProfitGrowthRange,
      financeRoeRange, financeDebtRatioRange,
      recentLimitUpCount, recentLimitDownCount, limitUpPeriod, limitDownPeriod,
      consolidationTypes, consolidationLookback, consolidationConsecutive, consolidationThreshold,
      consolidationRequireAboveMa10, consolidationFilterEnabled,
      trendLineLookback, trendLineConsecutive, trendLineFilterEnabled,
      sharpMoveFilterEnabled, sharpMoveWindowBars, sharpMoveMagnitude, sharpMoveFlatThreshold,
      sharpMoveOnlyDrop, sharpMoveOnlyRise, sharpMoveDropThenRiseLoose, sharpMoveRiseThenDropLoose,
      sharpMoveDropFlatRise, sharpMoveRiseFlatDrop,
      volumePullbackFilterEnabled, volumePullbackLookback, volumePullbackMinRisePct,
      volumePullbackTriggerType, volumePullbackVolumeRatio, volumePullbackVolumeMaPeriod,
      volumePullbackMaxBars, volumePullbackMinPullbackPct, volumePullbackMaxPullbackPct,
      volumePullbackVolumeShrink, volumePullbackMa10TolerancePct,
      volumePullbackRequireUpperShadow, volumePullbackUpperShadowRatio,
      rsiRange, rsiPeriod, tradingSignalTypes,
      aiAnalysisEnabled, aiTrendUp, aiTrendDown, aiTrendSideways,
      aiConfidenceRange, aiRecommendScoreRange, aiTechnicalScoreRange,
      aiPatternScoreRange, aiTrendScoreRange, aiRiskScoreRange,
      enableNameKeywordFilter, excludedNameKeywords, enableShortTermNameFilter, excludedShortTermNames,
    ]
  );

  /** 当前筛选状态对应的持久化偏好（顶部查询条 + 表单状态） */
  const currentFilterPrefs = useCallback(
    () =>
      buildOpportunityFilterPrefs(
        filterFormState,
        {
          selectedMarket,
          nameType,
          filterPanelActiveKey,
          nameFilterIndustryGroups,
          nameFilterIndustryInvert,
        },
        { currentPeriod, currentCount }
      ),
    [
      filterFormState,
      selectedMarket,
      nameType,
      filterPanelActiveKey,
      currentPeriod,
      currentCount,
      nameFilterIndustryGroups,
      nameFilterIndustryInvert,
    ]
  );

  // 在页面卸载时保存当前的筛选条件
  useEffect(() => {
    return () => {
      saveOpportunityFilterPrefs(currentFilterPrefs());
    };
  }, [currentFilterPrefs]);

  // 筛选条件变化时自动保存（防抖300ms）
  useEffect(() => {
    // 如果还未完成初始恢复，不执行保存
    if (!isRestoredRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      saveOpportunityFilterPrefs(currentFilterPrefs());
    }, FILTER_SAVE_DEBOUNCE_DELAY); // 防抖300ms

    return () => clearTimeout(timer);
  }, [currentFilterPrefs]);

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

  // 根据选择的市场、名称类型、行业和概念板块筛选股票池（实现见 utils/analysis/stockFiltering）
  const filteredStocks = useMemo(
    () =>
      filterStocksByMarketAndSectors(allStocks, {
        selectedMarket,
        nameType,
        industrySectors,
        conceptSectors,
        industrySectorInvert,
        conceptSectorInvert,
        industryMapping,
        conceptMapping,
      }),
    [allStocks, selectedMarket, nameType, industrySectors, conceptSectors, industrySectorInvert, conceptSectorInvert, industryMapping, conceptMapping]
  );

  // 处理添加到自选股
  const handleAddToWatchList = () => {
    setShowAddToWatchListModal(true);
  };

  // 筛选引擎快照：共享字段来自 filterFormState，其余为不参与持久化的补充项
  const filterSnapshot = useMemo(
    () =>
      buildOpportunityFilterSnapshot(filterFormState, {
        aiVersion,
        industrySectors,
        conceptSectors,
        industrySectorInvert,
        conceptSectorInvert,
        nameFilterIndustryCodes,
        nameFilterIndustryInvert,
        nameType: nameType as 'all' | 'st' | 'non_st',
      }),
    [
      filterFormState,
      aiVersion,
      industrySectors,
      conceptSectors,
      industrySectorInvert,
      conceptSectorInvert,
      nameFilterIndustryCodes,
      nameFilterIndustryInvert,
      nameType,
    ]
  );

  // 筛选条件摘要：共享字段来自 filterFormState，输出与拆分前完全一致
  const filterSummaryText = useMemo(
    () =>
      buildOpportunityFilterSummary({
        ...filterFormState,
        consolidationTypeOptions: CONSOLIDATION_TYPE_OPTIONS,
        aiVersion,
        industrySectors,
        conceptSectors,
        industrySectorOptions,
        conceptSectorOptions,
        nameFilterIndustryGroups,
        nameFilterIndustryInvert,
      }),
    [
      filterFormState,
      aiVersion,
      industrySectors,
      conceptSectors,
      industrySectorOptions,
      conceptSectorOptions,
      nameFilterIndustryGroups,
      nameFilterIndustryInvert,
    ]
  );

  // 合并已获取的营收/净利润数据（供筛选与展示；不影响交易信号计算）
  const processedDataWithFinance = useMemo(
    () => mergeFinanceMetrics(processedData, financeMap),
    [processedData, financeMap]
  );

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

  // 表格层面的股票名称/代码模糊过滤（复用 getPureCode 归一，见 utils/format/textMatch）
  const displayAnalysisData = useMemo(
    () => filterByStockKeyword(filteredAnalysisData, tableSearchKeyword),
    [filteredAnalysisData, tableSearchKeyword]
  );

  // 将已获取的营收 / 净利润数据合并到表格行
  const displayAnalysisDataWithFinance = useMemo(
    () => mergeFinanceMetrics(displayAnalysisData, financeMap),
    [displayAnalysisData, financeMap]
  );

  /**
   * 图表弹窗的行导航列表：顺序与表格当前排序（sortConfig，含用户点选的列排序）完全一致，
   * 因此 ← / → 切到的就是屏幕上真正的上一行 / 下一行。
   */
  const chartNavRecords = useMemo(
    () =>
      sortOpportunityData(displayAnalysisDataWithFinance, sortConfig).map((item) => ({
        code: item.code,
        name: item.name,
      })),
    [displayAnalysisDataWithFinance, sortConfig]
  );

  /** 弹窗标题展示的所属行业：跟随当前弹窗个股 */
  const chartIndustry = useMemo(
    () =>
      displayAnalysisDataWithFinance.find((item) => item.code === chartState?.code)?.industry?.name,
    [displayAnalysisDataWithFinance, chartState?.code]
  );

  /** 弹窗标题展示的所属概念：跟随当前弹窗个股 */
  const chartConcepts = useMemo(
    () => displayAnalysisDataWithFinance.find((item) => item.code === chartState?.code)?.concepts,
    [displayAnalysisDataWithFinance, chartState?.code]
  );

  /** AI 分析弹窗的数据：按当前选中个股缓存，避免每次渲染都遍历分析结果 */
  const selectedStockAIAnalysis = useMemo(
    () =>
      selectedStockForAI
        ? analysisData.find((item) => item.code === selectedStockForAI.code)?.aiAnalysis ?? null
        : null,
    [analysisData, selectedStockForAI]
  );

  /**
   * 弹窗内切换到表格上一行 / 下一行：
   * 除更新弹窗数据外，同步把表格翻到该行所在页，避免「弹窗换了、表格还停在旧页」。
   */
  const handleChartNavigate = useCallback(
    (record: { code: string; name: string }) => {
      const index = chartNavRecords.findIndex((item) => item.code === record.code);
      const pageSize = Number(tablePagination.pageSize) || 100;
      if (index >= 0) {
        const targetPage = Math.floor(index / pageSize) + 1;
        setTablePagination((prev) =>
          prev.current === targetPage ? prev : { ...prev, current: targetPage }
        );
      }
      setChartState({ code: record.code, name: record.name });
    },
    [chartNavRecords, tablePagination.pageSize]
  );

  // 页面卸载时中断未完成的营收净利润请求
  useEffect(() => {
    return () => {
      financeAbortRef.current?.abort();
    };
  }, []);

  /**
   * K 线弹窗打开（含弹窗内左右切换）时确保该股 K 线就绪。
   * 普通日线走 stockHistory 恢复，命中则不发请求；缺失时才按需补齐。
   */
  useEffect(() => {
    if (chartState?.code) {
      void ensureKlineForCode(chartState.code);
    }
  }, [chartState?.code, ensureKlineForCode]);

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
    setFinanceRevenueGrowthRange({ ...s.financeRevenueGrowthRange });
    setFinanceNetProfitGrowthRange({ ...s.financeNetProfitGrowthRange });
    setFinanceRoeRange({ ...s.financeRoeRange });
    setFinanceDebtRatioRange({ ...s.financeDebtRatioRange });
    setFilterPanelActiveKey([...DEFAULT_FILTER_PANEL_ACTIVE_KEYS]);
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
    // 重置交易信号筛选
    setTradingSignalTypes([...s.tradingSignalTypes]);
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
    // 重置名称筛选面板的行业分组（与顶部「行业」筛选彼此独立）
    setNameFilterIndustryGroups([...OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.selectedGroups]);
    setNameFilterIndustryInvert(OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.invertEnabled);
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

  /**
   * 批量获取指定股票池的财务指标（营业总收入、归母净利润及其增长率、ROE、资产负债率），结果合并进 financeMap。
   * 注意：请求量越大越容易触发新浪限流，因此「筛选后」按钮只请求当前筛选结果。
   */
  const fetchFinanceForStocks = async (stocks: Array<{ code: string }>, emptyHint: string) => {
    if (financeLoading) {
      return;
    }
    if (stocks.length === 0) {
      message.warning(emptyHint);
      return;
    }

    const controller = new AbortController();
    financeAbortRef.current = controller;
    setFinanceLoading(true);
    setFinanceProgress({ total: stocks.length, completed: 0, failed: 0 });

    try {
      const map = await getSinaFinanceMetricsBatch(stocks, {
        signal: controller.signal,
        onProgress: (p) => {
          setFinanceProgress({ total: p.total, completed: p.completed, failed: p.failed });
        },
      });

      if (map.size === 0) {
        message.warning('未获取到财务指标数据');
        return;
      }

      setFinanceMap((prev) => {
        const next = { ...prev };
        map.forEach((value, code) => {
          next[code] = value;
        });
        return next;
      });
      message.success(`财务指标数据已就绪，共 ${map.size} 只（命中本地缓存的不重复请求）`);
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

  /** 获取当前股票池（与一键分析一致）的营业总收入 / 归母净利润 */
  const handleFetchFinance = () =>
    fetchFinanceForStocks(filteredStocks, '当前市场暂无股票数据');

  /** 仅获取「当前筛选结果」中股票的营收 / 净利润，避免全池请求触发新浪限流 */
  const handleFetchFinanceForFiltered = () =>
    fetchFinanceForStocks(
      filteredAnalysisData,
      '当前筛选结果为空，无法获取营收净利润（若由「总营收」等财务条件导致，请先清空该类条件）'
    );

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

  /** 导出弹窗内「加入临时列表」收集到的股票名称（PNG，多列排版） */
  const handleExportTempList = async () => {
    if (tempStockList.length === 0) {
      message.warning('临时列表为空');
      return;
    }
    const names = tempStockList
      .map((item) => (item.name || item.code || '').trim())
      .filter(Boolean);
    if (names.length === 0) {
      message.warning('临时列表没有可用的股票名称');
      return;
    }
    try {
      const exportTime = new Date().toLocaleString('zh-CN');
      await exportStockNamesToPng(names, {
        fileNamePrefix: '机会分析_临时列表',
        filterSummary: `来源: 机会分析\n临时列表共 ${names.length} 只\n导出时间: ${exportTime}`,
      });
      message.success('临时列表已导出为图片');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导出失败';
      message.error(errorMessage);
      logger.error('导出临时列表失败:', error);
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
            title={`获取当前股票池（${filteredStocks.length} 只）的营业总收入、归母净利润、ROE 与资产负债率`}
          >
            获取营收净利润
          </Button>
          <Button
            icon={<FilterOutlined />}
            onClick={handleFetchFinanceForFiltered}
            loading={financeLoading}
            disabled={loading || financeLoading}
            title={`仅获取当前筛选结果（${filteredAnalysisData.length} 只）的营业总收入、归母净利润及其增长率、ROE、资产负债率，避免全池请求触发新浪限流`}
          >
            获取筛选后营收净利润
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
            options={AI_VERSION_OPTIONS}
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
                { key: 'png', label: '导出名称(PNG)' },
                { type: 'divider' },
                {
                  key: 'tempList',
                  label: `导出临时列表(PNG)${
                    tempStockList.length > 0 ? `（${tempStockList.length}）` : ''
                  }`,
                  disabled: tempStockList.length === 0,
                },
                { type: 'divider' },
                { key: 'columns', label: '列设置', icon: <SettingOutlined /> }
              ],
              onClick: ({ key }) => {
                if (key === 'columns') {
                  setColumnSettingsVisible(true);
                } else if (key === 'png') {
                  void handleExportNames();
                } else if (key === 'tempList') {
                  void handleExportTempList();
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
          <ProgressCard
            percent={progress.percent}
            status="active"
            formatPercent={(percent) => `${(percent ?? 0).toFixed(1)}%`}
            text={`进度: ${progress.completed} / ${progress.total} (失败: ${progress.failed})`}
          />
        )}

        {exportingKline && exportKlineProgress.total > 0 && (
          <ProgressCard
            percent={Math.round((exportKlineProgress.current / exportKlineProgress.total) * 100)}
            text={`导出K线进度: ${exportKlineProgress.current} / ${exportKlineProgress.total}`}
          />
        )}

        {financeLoading && financeProgress.total > 0 && (
          <ProgressCard
            percent={Math.round((financeProgress.completed / financeProgress.total) * 100)}
            text={`获取营收净利润进度: ${financeProgress.completed} / ${financeProgress.total}（失败: ${financeProgress.failed}）`}
          />
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
            financeRevenueGrowthRange={financeRevenueGrowthRange}
            setFinanceRevenueGrowthRange={setFinanceRevenueGrowthRange}
            financeNetProfitGrowthRange={financeNetProfitGrowthRange}
            setFinanceNetProfitGrowthRange={setFinanceNetProfitGrowthRange}
            financeRoeRange={financeRoeRange}
            setFinanceRoeRange={setFinanceRoeRange}
            financeDebtRatioRange={financeDebtRatioRange}
            setFinanceDebtRatioRange={setFinanceDebtRatioRange}
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
            // 交易信号筛选 props
            tradingSignalTypes={tradingSignalTypes}
            setTradingSignalTypes={setTradingSignalTypes}
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
            // 名称筛选面板：行业分组（独立于顶部「行业」筛选，单独控制）
            nameFilterIndustryGroups={nameFilterIndustryGroups}
            setNameFilterIndustryGroups={setNameFilterIndustryGroups}
            nameFilterIndustryInvert={nameFilterIndustryInvert}
            setNameFilterIndustryInvert={setNameFilterIndustryInvert}
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
              onRowClick={(record) => setChartState({ code: record.code, name: record.name })}
              pagination={tablePagination}
              onPaginationChange={setTablePagination}
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
        analysis={selectedStockAIAnalysis}
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

      <DailyChartModal
        open={chartState !== null}
        code={chartState?.code ?? ''}
        name={chartState?.name ?? ''}
        kline={chartState ? klineDataCache.get(chartState.code) ?? [] : []}
        period={currentPeriod}
        industry={chartIndustry}
        concepts={chartConcepts}
        records={chartNavRecords}
        onNavigate={handleChartNavigate}
        onClose={() => setChartState(null)}
      />

      <AddStocksToWatchListModal
        visible={showAddToWatchListModal}
        stocks={displayAnalysisData}
        onClose={() => setShowAddToWatchListModal(false)}
      />
    </Layout >
  );
}


