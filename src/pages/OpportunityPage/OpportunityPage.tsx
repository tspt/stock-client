/**
 * 机会分析页面
 */

import { useEffect, useState, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Layout, Card, Button, Space, Progress, Select, Collapse, message, InputNumber, Checkbox, Dropdown } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  ExportOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
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
import { exportOpportunityToExcel } from '@/utils/opportunityExportUtils';
import { exportStockNamesToExcel, exportStockNamesToPng } from '@/utils/stockNamesExportUtils';
import type { ConsolidationType, KLinePeriod, StockInfo } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { useOpportunityFilterEngine } from '@/hooks/useOpportunityFilterEngine';
import { getPureCode } from '@/utils/format';
import {
  applyOpportunityFilterPrefsToState,
  loadOpportunityFilterPrefs,
  patchSavedPrefsFiltersToDefaults,
  patchSavedPrefsQueryToDefaults,
  saveOpportunityFilterPrefs,
} from '@/utils/opportunityFilterPrefs';
import type { OpportunityFilterPrefs } from '@/utils/opportunityFilterPrefs';
import type { OpportunityFilterSnapshot } from '@/types/opportunityFilter';
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
  turnoverRateRange: { min: 1 } as { min?: number; max?: number },
  peRatioRange: {} as { min?: number; max?: number },
  kdjJRange: {} as { min?: number; max?: number },
  recentLimitUpCount: undefined as number | undefined,
  recentLimitDownCount: undefined as number | undefined,
  limitUpPeriod: 20,
  limitDownPeriod: 20,
  consolidationTypes: DEFAULT_CONSOLIDATION_TYPES,
  consolidationLookback: 10,
  consolidationConsecutive: 3,
  consolidationThreshold: 1.5,
  /** 连续 N 根横盘段内每日收盘价是否要求 ≥ 当日 MA10 */
  consolidationRequireAboveMa10: false,
  /** 是否按横盘条件过滤列表（与趋势线可同时开启，关系为 AND） */
  consolidationFilterEnabled: true,
  trendLineLookback: 10,
  trendLineConsecutive: 3,
  trendLineFilterEnabled: false,
  volumeSurgeDropEnabled: false,
  volumeSurgeRiseEnabled: false,
  volumeSurgePeriod: 10,
  dropRisePercentRange: '5-10' as const,
  afterDropType: 'all' as const,
  afterRiseType: 'all' as const,
  afterDropPercentRange: '5-10' as const,
  afterRisePercentRange: '5-10' as const,
};

/** 与 opportunityStore 初始值一致，用于「重置」恢复周期与 K 线数量 */
const INITIAL_OPPORTUNITY_QUERY = {
  currentPeriod: 'day' as KLinePeriod,
  currentCount: 300,
};

export function OpportunityPage() {
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
  const [turnoverRateRange, setTurnoverRateRange] = useState<{ min?: number; max?: number }>(
    INITIAL_FILTER_STATE.turnoverRateRange
  );
  const [peRatioRange, setPeRatioRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.peRatioRange);
  const [kdjJRange, setKdjJRange] = useState<{ min?: number; max?: number }>(INITIAL_FILTER_STATE.kdjJRange);
  const [filterVisible, setFilterVisible] = useState(true);

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
  const [consolidationFilterVisible, setConsolidationFilterVisible] = useState(true);

  const [trendLineLookback, setTrendLineLookback] = useState<number>(INITIAL_FILTER_STATE.trendLineLookback);
  const [trendLineConsecutive, setTrendLineConsecutive] = useState<number>(
    INITIAL_FILTER_STATE.trendLineConsecutive
  );
  const [trendLineFilterEnabled, setTrendLineFilterEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.trendLineFilterEnabled
  );
  const [trendLineFilterVisible, setTrendLineFilterVisible] = useState(true);

  // 放量急跌/拉升筛选显示状态
  const [volumeSurgeFilterVisible, setVolumeSurgeFilterVisible] = useState<boolean>(true);
  const [filterSkippedExpanded, setFilterSkippedExpanded] = useState(false);
  const [tableHeight, setTableHeight] = useState<number>(400); // 表格高度
  const tableCardRef = useRef<HTMLDivElement>(null); // 表格Card的引用

  // 急跌/急涨筛选状态（单日模式，去掉放量逻辑）
  const [volumeSurgeDropEnabled, setVolumeSurgeDropEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.volumeSurgeDropEnabled
  );
  const [volumeSurgeRiseEnabled, setVolumeSurgeRiseEnabled] = useState<boolean>(
    INITIAL_FILTER_STATE.volumeSurgeRiseEnabled
  );
  const [volumeSurgePeriod, setVolumeSurgePeriod] = useState<number>(INITIAL_FILTER_STATE.volumeSurgePeriod);
  const [dropRisePercentRange, setDropRisePercentRange] = useState<string>(INITIAL_FILTER_STATE.dropRisePercentRange);
  const [afterDropType, setAfterDropType] = useState<string>(INITIAL_FILTER_STATE.afterDropType);
  const [afterRiseType, setAfterRiseType] = useState<string>(INITIAL_FILTER_STATE.afterRiseType);
  const [afterDropPercentRange, setAfterDropPercentRange] = useState<string>(INITIAL_FILTER_STATE.afterDropPercentRange);
  const [afterRisePercentRange, setAfterRisePercentRange] = useState<string>(INITIAL_FILTER_STATE.afterRisePercentRange);

  // 先恢复 IndexedDB 中的分析结果与 K 线缓存，再套用 localStorage 中的查询/筛选偏好（纯前端筛选用缓存即可）
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      await loadCachedData();
      if (cancelled) return;
      const prefs = loadOpportunityFilterPrefs();
      if (!prefs) return;
      applyOpportunityFilterPrefsToState(prefs, {
        setSelectedMarket,
        setNameType,
        setPriceRange,
        setMarketCapRange,
        setTurnoverRateRange,
        setPeRatioRange,
        setKdjJRange,
        setFilterVisible,
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
        setConsolidationFilterVisible,
        setTrendLineLookback,
        setTrendLineConsecutive,
        setTrendLineFilterEnabled,
        setTrendLineFilterVisible,
        setVolumeSurgeFilterVisible,
        setVolumeSurgeDropEnabled,
        setVolumeSurgeRiseEnabled,
        setVolumeSurgePeriod,
        setDropRisePercentRange,
        setAfterDropType,
        setAfterRiseType,
        setAfterDropPercentRange,
        setAfterRisePercentRange,
      });
      const st = useOpportunityStore.getState();
      if (st.analysisData.length === 0) {
        useOpportunityStore.setState({
          currentPeriod: prefs.currentPeriod,
          currentCount: prefs.currentCount,
        });
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时恢复缓存与偏好；setter 稳定
  }, [loadCachedData]);

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
    filterVisible,
    consolidationFilterVisible,
    trendLineFilterVisible,
    volumeSurgeFilterVisible,
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
  const filteredStocks = useMemo<StockInfo[]>(() => {
    if (allStocks.length === 0) {
      return [];
    }

    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      const isST = stock.name.includes('ST');

      // 市场类型过滤
      let marketMatch = false;
      switch (selectedMarket) {
        case 'hs_main':
          // 沪深主板：60开头或00开头
          marketMatch = pureCode.startsWith('60') || pureCode.startsWith('00');
          break;
        case 'sz_gem':
          // 创业板：30开头
          marketMatch = pureCode.startsWith('30');
          break;
        default:
          marketMatch = false;
      }

      // 名称类型过滤
      let nameTypeMatch = false;
      switch (nameType) {
        case 'all':
          // 不限
          nameTypeMatch = true;
          break;
        case 'st':
          // ST股票
          nameTypeMatch = isST;
          break;
        case 'non_st':
          // 非ST股票
          nameTypeMatch = !isST;
          break;
        default:
          nameTypeMatch = true;
      }

      return marketMatch && nameTypeMatch;
    });
  }, [allStocks, selectedMarket, nameType]);

  const filterSnapshot = useMemo<OpportunityFilterSnapshot>(
    () => ({
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
      volumeSurgeDropEnabled,
      volumeSurgeRiseEnabled,
      volumeSurgePeriod,
      dropRisePercentRange,
      afterDropType,
      afterRiseType,
      afterDropPercentRange,
      afterRisePercentRange,
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
      volumeSurgeDropEnabled,
      volumeSurgeRiseEnabled,
      volumeSurgePeriod,
      dropRisePercentRange,
      afterDropType,
      afterRiseType,
      afterDropPercentRange,
      afterRisePercentRange,
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
    setFilterVisible(true);
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
    setConsolidationFilterVisible(true);
    setTrendLineFilterVisible(true);
    setVolumeSurgeFilterVisible(true);
    setVolumeSurgeDropEnabled(s.volumeSurgeDropEnabled);
    setVolumeSurgeRiseEnabled(s.volumeSurgeRiseEnabled);
    setVolumeSurgePeriod(s.volumeSurgePeriod);
    setDropRisePercentRange(s.dropRisePercentRange);
    setAfterDropType(s.afterDropType);
    setAfterRiseType(s.afterRiseType);
    setAfterDropPercentRange(s.afterDropPercentRange);
    setAfterRisePercentRange(s.afterRisePercentRange);
    patchSavedPrefsFiltersToDefaults();
    message.info('已恢复默认筛选条件');
  };

  const handleAnalyze = async () => {
    if (filteredStocks.length === 0) {
      message.warning('当前市场暂无股票数据');
      return;
    }

    const prefs: OpportunityFilterPrefs = {
      version: 1,
      selectedMarket,
      nameType,
      currentPeriod,
      currentCount,
      priceRange: { ...priceRange },
      marketCapRange: { ...marketCapRange },
      turnoverRateRange: { ...turnoverRateRange },
      peRatioRange: { ...peRatioRange },
      kdjJRange: { ...kdjJRange },
      filterVisible,
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
      consolidationFilterVisible,
      trendLineLookback,
      trendLineConsecutive,
      trendLineFilterEnabled,
      trendLineFilterVisible,
      volumeSurgeFilterVisible,
      volumeSurgeDropEnabled,
      volumeSurgeRiseEnabled,
      volumeSurgePeriod,
      dropRisePercentRange,
      afterDropType,
      afterRiseType,
      afterDropPercentRange,
      afterRisePercentRange,
    };
    saveOpportunityFilterPrefs(prefs);

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
        await exportStockNamesToPng(names, { fileNamePrefix: '机会分析_股票名称' });
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

        {analysisData.length > 0 ? (
          <>
            {/* 筛选区域容器 */}
            <div className={styles.filterContainer}>
              {/* 筛选区域 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>数据筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={filterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setFilterVisible(!filterVisible)}
                    >
                      {filterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {filterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>价格范围：</span>
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
                )}
              </Card>

              {/* 横盘筛选区域 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>横盘筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={consolidationFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setConsolidationFilterVisible(!consolidationFilterVisible)}
                    >
                      {consolidationFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {consolidationFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={consolidationFilterEnabled}
                          onChange={(e) => setConsolidationFilterEnabled(e.target.checked)}
                        >
                          启用横盘筛选（关闭后不按横盘过滤列表）
                        </Checkbox>
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
                          {CONSOLIDATION_TYPE_OPTIONS.map((item) => (
                            <Checkbox key={item.value} value={item.value}>
                              {item.label}
                            </Checkbox>
                          ))}
                        </Checkbox.Group>
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
                        <span style={{ marginLeft: 4 }}>根（从最新K线向前）</span>
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
                        <Checkbox
                          checked={consolidationRequireAboveMa10}
                          onChange={(e) => setConsolidationRequireAboveMa10(e.target.checked)}
                        >
                          连续根数段内每日收盘价均在MA10之上
                        </Checkbox>
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <span className={styles.filterLabel}>命中说明：</span>
                        <span>
                          检索窗内任一段「连续根数」满足横盘即命中；勾选 MA10 则该段每日收盘≥当日 MA10。类型见左列，本列为简要波动与位置。
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* 趋势线筛选 */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>趋势线筛选</span>
                    <Button
                      type="text"
                      size="small"
                      icon={trendLineFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setTrendLineFilterVisible(!trendLineFilterVisible)}
                    >
                      {trendLineFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {trendLineFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={trendLineFilterEnabled}
                          onChange={(e) => setTrendLineFilterEnabled(e.target.checked)}
                        >
                          启用趋势线筛选（与横盘同时开启时为 AND）
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
                        <span className={styles.filterLabel}>说明：</span>
                        <span>
                          窗内取<strong>最靠后</strong>一段连续 N 根：每日收盘≥昨收且≥当日 MA5（当前K线周期下的
                          5 周期均线）。
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* 急跌/急涨筛选区域（单日模式） */}
              <Card className={styles.filterCard} size="small">
                <div className={styles.filterHeader}>
                  <Space>
                    <FilterOutlined />
                    <span>急跌/急涨筛选（单日模式）</span>
                    <Button
                      type="text"
                      size="small"
                      icon={volumeSurgeFilterVisible ? <ExclamationCircleOutlined /> : null}
                      onClick={() => setVolumeSurgeFilterVisible(!volumeSurgeFilterVisible)}
                    >
                      {volumeSurgeFilterVisible ? '收起' : '展开'}
                    </Button>
                  </Space>
                </div>
                {volumeSurgeFilterVisible && (
                  <div className={styles.filterContent}>
                    <div className={styles.filterRow}>
                      <div className={styles.filterItem}>
                        <Checkbox
                          checked={volumeSurgeDropEnabled}
                          onChange={(e) => setVolumeSurgeDropEnabled(e.target.checked)}
                        >
                          启用急跌筛选
                        </Checkbox>
                        <Checkbox
                          checked={volumeSurgeRiseEnabled}
                          onChange={(e) => setVolumeSurgeRiseEnabled(e.target.checked)}
                          style={{ marginLeft: 16 }}
                        >
                          启用急涨筛选
                        </Checkbox>
                      </div>
                    </div>

                    {(volumeSurgeDropEnabled || volumeSurgeRiseEnabled) && (
                      <>
                        <div className={styles.filterRow}>
                          <div className={styles.filterItem}>
                            <span className={styles.filterLabel}>周期：</span>
                            <InputNumber
                              value={volumeSurgePeriod}
                              min={5}
                              max={30}
                              step={1}
                              style={{ width: 100 }}
                              onChange={(v) => {
                                const next = typeof v === 'number' && isFinite(v) ? Math.floor(v) : 10;
                                setVolumeSurgePeriod(next);
                              }}
                            />
                            <span style={{ marginLeft: 4 }}>天</span>
                          </div>
                          <div className={styles.filterItem}>
                            <span className={styles.filterLabel}>急跌/急涨幅度：</span>
                            <Select
                              value={dropRisePercentRange}
                              onChange={(value) => setDropRisePercentRange(value)}
                              style={{ width: 150 }}
                              options={[
                                { label: '5-10%', value: '5-10' },
                                { label: '10%以上', value: '10+' },
                              ]}
                            />
                          </div>
                        </div>

                        {volumeSurgeDropEnabled && (
                          <>
                            <div className={styles.filterRow}>
                              <div className={styles.filterItem}>
                                <span className={styles.filterLabel}>急跌后类型：</span>
                                <Select
                                  value={afterDropType}
                                  onChange={(value) => setAfterDropType(value)}
                                  style={{ width: 200 }}
                                  options={[
                                    { label: '不限', value: 'all' },
                                    { label: '横盘', value: 'consolidation' },
                                    { label: '横盘后上涨', value: 'consolidation_with_rise' },
                                    { label: '横盘后下跌', value: 'consolidation_with_drop' },
                                  ]}
                                />
                              </div>
                            </div>
                            {(afterDropType === 'consolidation_with_rise' || afterDropType === 'consolidation_with_drop') && (
                              <div className={styles.filterRow}>
                                <div className={styles.filterItem}>
                                  <span className={styles.filterLabel}>横盘后幅度：</span>
                                  <Select
                                    value={afterDropPercentRange}
                                    onChange={(value) => setAfterDropPercentRange(value)}
                                    style={{ width: 150 }}
                                    options={[
                                      { label: '5-10%', value: '5-10' },
                                      { label: '10%以上', value: '10+' },
                                    ]}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {volumeSurgeRiseEnabled && (
                          <>
                            <div className={styles.filterRow}>
                              <div className={styles.filterItem}>
                                <span className={styles.filterLabel}>急涨后类型：</span>
                                <Select
                                  value={afterRiseType}
                                  onChange={(value) => setAfterRiseType(value)}
                                  style={{ width: 200 }}
                                  options={[
                                    { label: '不限', value: 'all' },
                                    { label: '横盘', value: 'consolidation' },
                                    { label: '横盘后上涨', value: 'consolidation_with_rise' },
                                    { label: '横盘后下跌', value: 'consolidation_with_drop' },
                                  ]}
                                />
                              </div>
                            </div>
                            {(afterRiseType === 'consolidation_with_rise' || afterRiseType === 'consolidation_with_drop') && (
                              <div className={styles.filterRow}>
                                <div className={styles.filterItem}>
                                  <span className={styles.filterLabel}>横盘后幅度：</span>
                                  <Select
                                    value={afterRisePercentRange}
                                    onChange={(value) => setAfterRisePercentRange(value)}
                                    style={{ width: 150 }}
                                    options={[
                                      { label: '5-10%', value: '5-10' },
                                      { label: '10%以上', value: '10+' },
                                    ]}
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Card>

              {/* 筛选结果提示 */}
              {analysisData.length > 0 && (
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
              )}
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
            </div>

            {/* 表格区域 */}
            <Card className={styles.tableCard} ref={tableCardRef}>
              <OpportunityTable
                data={filteredAnalysisData}
                columns={columnConfig}
                sortConfig={sortConfig}
                onSortChange={updateSortConfig}
                tableHeight={tableHeight}
              />
            </Card>
          </>
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
    </Layout >
  );
}


