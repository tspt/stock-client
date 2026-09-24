/**
 * 周线选股：市场池 → 周K → 趋势/战法/共振评分 → 硬门槛过滤 → 名单（单表展示）
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  Dropdown,
  Input,
  InputNumber,
  Layout,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import {
  DatabaseOutlined,
  DownOutlined,
  ExperimentOutlined,
  ExportOutlined,
  FilterOutlined,
  FundOutlined,
  OrderedListOutlined,
  RocketOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
import { addStocksToTodayRecord } from '@/services/opportunity/recordService';
import type { StockOpportunityData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { getPureCode, normalizeStockNameList } from '@/utils/format/format';
import { getUnifiedSectorBasics } from '@/services/hot/unified-sectors';
import { getSinaFinanceMetricsBatch } from '@/services/fundamental/sinaFinance';
import { apiCache } from '@/utils/storage/apiCache';
import {
  DEFAULT_WEEKLY_FILTERS,
  WEEKLY_SETUP_GRADE_LABELS,
  WEEKLY_SETUP_LABELS,
  YI,
  analyzeWeeklyKlines,
  applyWeeklyFilters,
  isRunningWeek,
  resonanceLayers,
  type SetupKey,
  type WeeklyAnalysis,
  type WeeklyFilterOptions,
  type WeeklySetupGrade,
} from '@/utils/analysis/weekly';
import {
  getAllStockFinanceMetrics,
  getOpportunityData,
  getOpportunityKlines,
  getStocksHistory,
} from '@/utils/storage/opportunityIndexedDB';
import {
  fetchWeeklyKlines,
  loadCachedWeeklyKlines,
  type WeeklyFetchProgress,
} from '@/services/stocks/weeklyKlineService';
import { exportWeeklyResultToPng } from '@/utils/export/weeklyKlineExportUtils';
import {
  findDefaultTableSorter,
  sortRowsByTableSorter,
  type ActiveTableSorter,
} from '@/utils/sort/tableSort';
import { logger } from '@/utils/business/logger';
import {
  OPPORTUNITY_TABLE_HEIGHT_EXTRA_PADDING,
  OPPORTUNITY_TABLE_HEIGHT_MARGIN,
  OPPORTUNITY_TABLE_HEIGHT_PADDING,
  WEEKLY_KLINE_DEFAULT_COUNT,
} from '@/utils/config/constants';
import {
  OPPORTUNITY_DEFAULT_BASIC_FILTERS,
  OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER,
  OPPORTUNITY_DEFAULT_NAME_FILTERS,
  OPPORTUNITY_INDUSTRY_GROUPS,
} from '@/utils/config/opportunityAnalysisDefaults';
import type { KLineData, StockFinanceMetrics } from '@/types/stock';
import type { NumberRange } from '@/types/opportunityFilter';
import { WeeklyChartModal } from './WeeklyChartModal';
import { WeeklyBacktestDrawer } from './WeeklyBacktestDrawer';
import styles from './WeeklyKPage.module.css';

const { Content } = Layout;
const { Text } = Typography;

const MARKET_OPTIONS = [
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

/** 名称类型：与机会分析页面保持一致 */
const NAME_TYPE_OPTIONS = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

const SETUP_OPTIONS = (Object.keys(WEEKLY_SETUP_LABELS) as SetupKey[]).map((key) => ({
  label: WEEKLY_SETUP_LABELS[key],
  value: key,
}));

/** 档位：满分档 = 战法全部条件成立，部分档 = 形态基本成型但缺关键确认 */
const SETUP_GRADE_OPTIONS = (Object.keys(WEEKLY_SETUP_GRADE_LABELS) as WeeklySetupGrade[]).map(
  (key) => ({ label: WEEKLY_SETUP_GRADE_LABELS[key], value: key })
);

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function percentNode(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return <Text type="secondary">-</Text>;
  const color = value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
  return <span style={{ color }}>{value.toFixed(digits)}%</span>;
}

/**
 * 基本面：总市值(亿) / 总股数(亿股) / 总营收·归母净利润(亿) / 增长率(%)，
 * 复用机会分析缓存与「获取营收净利润」结果。
 */
type FundamentalsMap = Map<
  string,
  {
    marketCap?: number;
    totalShares?: number;
    financeRevenue?: number;
    financeNetProfit?: number;
    financeRevenueGrowth?: number;
    financeNetProfitGrowth?: number;
  }
>;

/** 把单只股票的最新财务指标折算成「亿元 / %」写入基本面 Map */
function applyFinanceMetrics(
  map: FundamentalsMap,
  code: string,
  metrics: StockFinanceMetrics
): void {
  const prev = map.get(code) ?? {};
  map.set(code, {
    ...prev,
    financeRevenue: metrics.revenue !== undefined ? metrics.revenue / YI : undefined,
    financeNetProfit: metrics.netProfit !== undefined ? metrics.netProfit / YI : undefined,
    financeRevenueGrowth: metrics.revenueYoy,
    financeNetProfitGrowth: metrics.netProfitYoy,
  });
}

/** 区间文案：未设置（起止都为空）返回 null */
function rangeLabel(range?: NumberRange): string | null {
  if (!range) return null;
  const { min, max } = range;
  if (min === undefined && max === undefined) return null;
  return `${min ?? '—'}~${max ?? '—'}`;
}

/** 周线筛选分组 key：新增分组时在此登记（供「展开全部」使用） */
const WEEKLY_FILTER_PANEL_KEYS = ['data', 'nameFilter'] as const;

/** 名称筛选面板：行业分组选项（与机会分析页共用同一份分组定义） */
const NAME_FILTER_INDUSTRY_GROUP_OPTIONS = OPPORTUNITY_INDUSTRY_GROUPS.map((group) => ({
  label: group.label,
  value: group.label,
}));

/** 名称筛选：行业分组标签 → 行业板块代码（与机会分析页 nameFilterIndustryCodes 口径一致） */
function resolveIndustryGroupCodes(labels: string[]): string[] {
  if (labels.length === 0) return [];
  const selected = new Set(labels);
  return OPPORTUNITY_INDUSTRY_GROUPS.filter((group) => selected.has(group.label)).flatMap(
    (group) => [...group.codes]
  );
}

/** 抽屉宽度：与机会分析一致，避免表单项折行 */
const FILTER_DRAWER_WIDTH = 'min(1000px, calc(100vw - 48px))' as const;

/** 区间输入：起止两个 InputNumber，留空表示不限 */
function RangeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: NumberRange;
  disabled?: boolean;
  onChange: (range: NumberRange) => void;
}) {
  const patch = (key: 'min' | 'max', v: number | null) =>
    onChange({
      ...(value ?? {}),
      [key]: typeof v === 'number' && isFinite(v) ? v : undefined,
    });
  return (
    <div className={styles.filterItem}>
      <span className={styles.filterLabel}>{label}</span>
      <InputNumber
        value={value?.min}
        min={0}
        step={0.01}
        precision={2}
        style={{ width: 100 }}
        placeholder="最小值"
        disabled={disabled}
        onChange={(v) => patch('min', v)}
      />
      <span style={{ margin: '0 4px' }}>~</span>
      <InputNumber
        value={value?.max}
        min={0}
        step={0.01}
        precision={2}
        style={{ width: 100 }}
        placeholder="最大值"
        disabled={disabled}
        onChange={(v) => patch('max', v)}
      />
    </div>
  );
}

/**
 * 周线选股筛选面板：右侧 Drawer + Collapse 分组。
 * 结构与机会分析页 OpportunityFiltersPanel 一致，便于后续按分组扩展更多筛选项：
 * 新增分组时只需在 WEEKLY_FILTER_PANEL_KEYS 登记 key，并在 items 里追加一个条目。
 */
function WeeklyFiltersPanel({
  filterPanelActiveKey,
  setFilterPanelActiveKey,
  priceRange,
  setPriceRange,
  marketCapRange,
  setMarketCapRange,
  totalSharesRange,
  setTotalSharesRange,
  financeRevenueRange,
  setFinanceRevenueRange,
  financeNetProfitRange,
  setFinanceNetProfitRange,
  financeRevenueGrowthRange,
  setFinanceRevenueGrowthRange,
  financeNetProfitGrowthRange,
  setFinanceNetProfitGrowthRange,
  nameFilterIndustryGroups,
  setNameFilterIndustryGroups,
  nameFilterIndustryInvert,
  setNameFilterIndustryInvert,
  enableNameKeywordFilter,
  setEnableNameKeywordFilter,
  excludedNameKeywords,
  setExcludedNameKeywords,
  enableShortTermNameFilter,
  setEnableShortTermNameFilter,
  excludedShortTermNames,
  setExcludedShortTermNames,
  disabled,
  open,
  onOpenChange,
}: {
  filterPanelActiveKey: string[];
  setFilterPanelActiveKey: (v: string[]) => void;
  priceRange?: NumberRange;
  setPriceRange: (r: NumberRange) => void;
  marketCapRange?: NumberRange;
  setMarketCapRange: (r: NumberRange) => void;
  totalSharesRange?: NumberRange;
  setTotalSharesRange: (r: NumberRange) => void;
  financeRevenueRange?: NumberRange;
  setFinanceRevenueRange: (r: NumberRange) => void;
  financeNetProfitRange?: NumberRange;
  setFinanceNetProfitRange: (r: NumberRange) => void;
  financeRevenueGrowthRange?: NumberRange;
  setFinanceRevenueGrowthRange: (r: NumberRange) => void;
  financeNetProfitGrowthRange?: NumberRange;
  setFinanceNetProfitGrowthRange: (r: NumberRange) => void;
  /** 名称筛选：行业分组（与顶部「行业」筛选彼此独立） */
  nameFilterIndustryGroups: string[];
  setNameFilterIndustryGroups: (v: string[]) => void;
  nameFilterIndustryInvert: boolean;
  setNameFilterIndustryInvert: (v: boolean) => void;
  enableNameKeywordFilter: boolean;
  setEnableNameKeywordFilter: (v: boolean) => void;
  excludedNameKeywords: string[];
  setExcludedNameKeywords: (v: string[]) => void;
  enableShortTermNameFilter: boolean;
  setEnableShortTermNameFilter: (v: boolean) => void;
  excludedShortTermNames: string[];
  setExcludedShortTermNames: (v: string[]) => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <Button
        icon={<FilterOutlined />}
        disabled={disabled}
        onClick={() => onOpenChange(true)}
      >
        筛选条件
      </Button>

      <Drawer
        title="筛选条件"
        placement="right"
        width={FILTER_DRAWER_WIDTH}
        open={open}
        onClose={() => onOpenChange(false)}
        destroyOnClose={false}
        extra={
          <Space size={0} wrap className={styles.filterCardExtra}>
            <Button
              type="link"
              size="small"
              onClick={() => setFilterPanelActiveKey([...WEEKLY_FILTER_PANEL_KEYS])}
            >
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
                      <RangeField
                        label="价格："
                        value={priceRange}
                        disabled={disabled}
                        onChange={setPriceRange}
                      />
                      <RangeField
                        label="总市值(亿)："
                        value={marketCapRange}
                        disabled={disabled}
                        onChange={setMarketCapRange}
                      />
                      <RangeField
                        label="总股数(亿)："
                        value={totalSharesRange}
                        disabled={disabled}
                        onChange={setTotalSharesRange}
                      />
                    </div>
                    <div className={styles.filterRow}>
                      <RangeField
                        label="总营收(亿)："
                        value={financeRevenueRange}
                        disabled={disabled}
                        onChange={setFinanceRevenueRange}
                      />
                      <RangeField
                        label="归母净利润(亿)："
                        value={financeNetProfitRange}
                        disabled={disabled}
                        onChange={setFinanceNetProfitRange}
                      />
                    </div>
                    <div className={styles.filterRow}>
                      <RangeField
                        label="总营收增长率(%)："
                        value={financeRevenueGrowthRange}
                        disabled={disabled}
                        onChange={setFinanceRevenueGrowthRange}
                      />
                      <RangeField
                        label="归母净利润增长率(%)："
                        value={financeNetProfitGrowthRange}
                        disabled={disabled}
                        onChange={setFinanceNetProfitGrowthRange}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'nameFilter',
                label: '名称筛选',
                children: (
                  <div className={styles.filterContent}>
                    <div
                      className={styles.filterRow}
                      style={{ marginBottom: 16, alignItems: 'flex-start' }}
                    >
                      <div
                        className={styles.filterItem}
                        style={{ flex: '0 0 160px', justifyContent: 'flex-start' }}
                      >
                        <span className={styles.filterLabel} style={{ whiteSpace: 'nowrap' }}>
                          行业分组：
                        </span>
                      </div>
                      <div
                        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="请选择行业分组（仅作用于筛选结果，与顶部「行业」互不影响）"
                          value={nameFilterIndustryGroups}
                          onChange={(labels: string[]) => setNameFilterIndustryGroups(labels)}
                          options={NAME_FILTER_INDUSTRY_GROUP_OPTIONS}
                          style={{ flex: 1, minWidth: 0 }}
                          maxTagCount="responsive"
                          disabled={disabled}
                        />
                        <Checkbox
                          checked={nameFilterIndustryInvert}
                          onChange={(e) => setNameFilterIndustryInvert(e.target.checked)}
                          style={{ whiteSpace: 'nowrap' }}
                          disabled={disabled || nameFilterIndustryGroups.length === 0}
                        >
                          排除选中
                        </Checkbox>
                        <span
                          style={{
                            color: 'var(--ant-color-text-secondary)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          独立于顶部行业筛选
                        </span>
                      </div>
                    </div>
                    <div
                      className={styles.filterRow}
                      style={{ marginBottom: 16, alignItems: 'flex-start' }}
                    >
                      <div
                        className={styles.filterItem}
                        style={{ flex: '0 0 160px', justifyContent: 'flex-start' }}
                      >
                        <Checkbox
                          checked={enableNameKeywordFilter}
                          onChange={(e) => setEnableNameKeywordFilter(e.target.checked)}
                          disabled={disabled}
                        >
                          <span className={styles.filterLabel} style={{ whiteSpace: 'nowrap' }}>
                            排除名称包含：
                          </span>
                        </Checkbox>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Select
                          mode="tags"
                          value={excludedNameKeywords}
                          onChange={(values) =>
                            setExcludedNameKeywords(normalizeStockNameList(values as string[]))
                          }
                          style={{ width: '100%' }}
                          placeholder="输入关键词，按回车添加"
                          options={[]}
                          allowClear
                          maxTagCount="responsive"
                          disabled={disabled || !enableNameKeywordFilter}
                        />
                      </div>
                    </div>
                    <div className={styles.filterRow} style={{ marginTop: 16, alignItems: 'flex-start' }}>
                      <div
                        className={styles.filterItem}
                        style={{ flex: '0 0 160px', justifyContent: 'flex-start' }}
                      >
                        <Checkbox
                          checked={enableShortTermNameFilter}
                          onChange={(e) => setEnableShortTermNameFilter(e.target.checked)}
                          disabled={disabled}
                        >
                          <span className={styles.filterLabel} style={{ whiteSpace: 'nowrap' }}>
                            短期排除股票名称：
                          </span>
                        </Checkbox>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Select
                          mode="tags"
                          value={excludedShortTermNames}
                          onChange={(values) =>
                            setExcludedShortTermNames(normalizeStockNameList(values as string[]))
                          }
                          style={{ width: '100%' }}
                          placeholder="输入完整股票名称，按回车添加"
                          options={[]}
                          allowClear
                          maxTagCount="responsive"
                          disabled={disabled || !enableShortTermNameFilter}
                        />
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

export function WeeklyKPage() {
  const { message } = App.useApp();
  const { allStocks } = useAllStocks();

  const [selectedMarket, setSelectedMarket] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket,
  ]);
  const [nameType, setNameType] = useState<string>(OPPORTUNITY_DEFAULT_BASIC_FILTERS.nameType);
  const [industrySectors, setIndustrySectors] = useState<string[]>([]);
  const [industrySectorInvert, setIndustrySectorInvert] = useState(false);
  const [industrySectorOptions, setIndustrySectorOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [klineCount, setKlineCount] = useState<number>(WEEKLY_KLINE_DEFAULT_COUNT);
  const [forceRefresh, setForceRefresh] = useState(false);
  /** 只用完整周：忽略「进行中的本周」，评分/涨幅/价格筛选一律按最近已收盘周 */
  const [completeWeeksOnly, setCompleteWeeksOnly] = useState(true);
  const [filters, setFilters] = useState<WeeklyFilterOptions>({ ...DEFAULT_WEEKLY_FILTERS });
  /** 名称筛选：与机会分析页「名称筛选」面板同一套字段与默认值 */
  const [nameFilterIndustryGroups, setNameFilterIndustryGroups] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.selectedGroups,
  ]);
  const [nameFilterIndustryInvert, setNameFilterIndustryInvert] = useState<boolean>(
    OPPORTUNITY_DEFAULT_INDUSTRY_GROUP_FILTER.invertEnabled
  );
  const [enableNameKeywordFilter, setEnableNameKeywordFilter] = useState<boolean>(true);
  const [excludedNameKeywords, setExcludedNameKeywords] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedNameKeywords,
  ]);
  const [enableShortTermNameFilter, setEnableShortTermNameFilter] = useState<boolean>(true);
  const [excludedShortTermNames, setExcludedShortTermNames] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_NAME_FILTERS.excludedShortTermNames,
  ]);
  /** 筛选 Collapse 当前展开的分组；默认展开「数据筛选」「名称筛选」 */
  const [filterPanelActiveKey, setFilterPanelActiveKey] = useState<string[]>(['data', 'nameFilter']);
  /** 右侧筛选抽屉开关 */
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showAddToWatchList, setShowAddToWatchList] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);

  const [rows, setRows] = useState<WeeklyAnalysis[]>([]);
  const [klines, setKlines] = useState<Map<string, KLineData[]>>(new Map());
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  /** 日线数据：复用机会分析已落到 IndexedDB 的 stockHistory，不单独拉取 */
  const [dailyKlines, setDailyKlines] = useState<Map<string, KLineData[]>>(new Map());
  /** 基本面（总市值/总股数）：复用机会分析结果，不单独拉取详情 */
  const [fundamentals, setFundamentals] = useState<FundamentalsMap>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [progress, setProgress] = useState<WeeklyFetchProgress>({ completed: 0, total: 0, failed: 0 });
  const [failures, setFailures] = useState<Array<{ code: string; name: string; error: string }>>([]);
  const [staleCache, setStaleCache] = useState(0);

  /** 营收 / 净利润拉取状态 */
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeProgress, setFinanceProgress] = useState({ total: 0, completed: 0, failed: 0 });
  const financeAbortRef = useRef<AbortController | null>(null);

  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null);

  /** 表格高度自适应 + 分页（与机会分析页一致） */
  const [tableHeight, setTableHeight] = useState(400);
  const [tablePagination, setTablePagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 100,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total} 条`,
    pageSizeOptions: ['50', '100', '200'],
  });
  /** 表格当前排序状态（点表头后由 onChange 写入）；null = 还没点过，用列的 defaultSortOrder 兜底 */
  const [tableSorter, setTableSorter] = useState<ActiveTableSorter | null>(null);
  const tableCardRef = useRef<HTMLDivElement>(null);

  const cancelRef = useRef(false);
  const hydratedRef = useRef(false);

  const industryMap = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    allStocks.forEach((stock) => {
      if (stock.industry?.code) {
        map.set(stock.code, { code: stock.industry.code, name: stock.industry.name });
      }
    });
    return map;
  }, [allStocks]);

  // 行业板块选项：与机会分析页面共用统一缓存服务
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { industry } = await getUnifiedSectorBasics();
        if (cancelled) return;
        setIndustrySectorOptions(industry.map((s) => ({ label: s.name, value: s.code })));
      } catch (error) {
        logger.error('[WeeklyKPage] 加载行业板块选项失败:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAnalysis = useCallback(
    (
      klineMap: Map<string, KLineData[]>,
      names: Map<string, string>,
      poolCodes: Set<string> | null
    ) => {
      const analyzed = analyzeWeeklyKlines(klineMap, names, {
        poolCodes,
        industries: industryMap,
        dailyKlines,
        fundamentals,
        completeWeeksOnly,
      });
      setRows(analyzed);
    },
    [industryMap, dailyKlines, fundamentals, completeWeeksOnly]
  );

  /**
   * 载入日线数据用于「多周期共振」：机会分析页面已写入 IndexedDB，这里直接复用其全量缓存，
   * 不额外发起网络请求。返回最终 Map，便于「一键分析」拿到最新日线后再触发评分。
   */
  const loadDailyKlines = useCallback(async (): Promise<Map<string, KLineData[]>> => {
    try {
      /**
       * 首选机会分析的日线缓存 opportunityKlineCache：每次机会分析都会整表重写，
       * 是最新的一份日线数据（也是文档第三章「日线站上20日均线」的判定依据）。
       * 老版本数据可能只落在 stockHistory 里，故保留一次回退读取。
       */
      const map = new Map<string, KLineData[]>();
      const cached = await getOpportunityKlines();
      cached.forEach(([code, kline]) => {
        if (kline && kline.length > 0) map.set(code, kline);
      });
      if (map.size === 0) {
        const histories = await getStocksHistory([]);
        histories.forEach((h) => {
          if (h.dailyLines && h.dailyLines.length > 0) map.set(h.code, h.dailyLines);
        });
      }
      setDailyKlines(map);
      return map;
    } catch (error) {
      logger.error('[WeeklyKPage] 读取日线数据失败:', error);
      return new Map<string, KLineData[]>();
    }
  }, []);

  // 进入页面先读一次；「一键分析」前会再刷新一次，避免读到机会分析更新前的旧日线
  useEffect(() => {
    void loadDailyKlines();
  }, [loadDailyKlines]);

  /**
   * 载入基本面（总市值/总股数/营收/净利润及其增长率）用于「数据筛选」：
   * - 市值/股本：复用机会分析结果（IndexedDB），保证与机会分析页口径一致；
   * - 营收/净利润：读取机会分析「获取营收净利润」写入的独立缓存。
   * 均不额外发起网络请求；totalShares 折算成「亿股」，营收/净利润折算成「亿元」。
   */
  const loadFundamentals = useCallback(async (): Promise<FundamentalsMap> => {
    const map: FundamentalsMap = new Map();
    try {
      const result = await getOpportunityData();
      result?.data?.forEach((item) => {
        const marketCap = item.marketCap;
        const totalShares =
          item.totalShares !== undefined
            ? item.totalShares / YI
            : marketCap !== undefined && item.price > 0
              ? marketCap / item.price
              : undefined;
        map.set(item.code, { marketCap, totalShares });
      });
    } catch (error) {
      logger.error('[WeeklyKPage] 读取总市值/总股数失败:', error);
    }
    try {
      const financeRecords = await getAllStockFinanceMetrics();
      financeRecords.forEach(({ code, metrics }) => applyFinanceMetrics(map, code, metrics));
    } catch (error) {
      logger.error('[WeeklyKPage] 读取营收/净利润失败:', error);
    }
    setFundamentals(map);
    return map;
  }, []);

  useEffect(() => {
    void loadFundamentals();
  }, [loadFundamentals]);

  const hydrateFromCache = useCallback(
    async (): Promise<boolean> => {
      setHydrating(true);
      try {
        const cached = await loadCachedWeeklyKlines({ count: klineCount });
        setStaleCache(cached.stale);
        if (cached.klines.size === 0) {
          setUpdatedAt(null);
          return false;
        }
        const restoredNames = new Map(cached.names);
        allStocks.forEach((stock) => restoredNames.set(stock.code, stock.name));
        setKlines(cached.klines);
        setNameMap(restoredNames);
        setUpdatedAt(cached.updatedAt);
        return true;
      } catch (error) {
        logger.error('[WeeklyKPage] 读取周K缓存失败:', error);
        message.error(`读取周K缓存失败：${error instanceof Error ? error.message : '未知错误'}`);
        return false;
      } finally {
        setHydrating(false);
      }
    },
    [allStocks, message, klineCount]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (hydratedRef.current) return;
      const loaded = await hydrateFromCache();
      if (cancelled) return;
      if (loaded) hydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromCache]);

  const stockPool = useMemo(() => {
    if (allStocks.length === 0 || selectedMarket.length === 0) return [];
    const matchers: Array<(pureCode: string) => boolean> = [];
    selectedMarket.forEach((market) => {
      if (market === 'hs_main') {
        matchers.push((pureCode) => pureCode.startsWith('60') || pureCode.startsWith('00'));
      } else if (market === 'sz_gem') {
        matchers.push((pureCode) => pureCode.startsWith('30'));
      }
    });
    if (matchers.length === 0) return [];
    const industrySelected = new Set(industrySectors);
    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      if (!matchers.some((m) => m(pureCode))) return false;

      // 名称类型：默认非 ST
      const isST = stock.name.includes('ST');
      if (nameType === 'st' && !isST) return false;
      if (nameType !== 'st' && nameType !== 'all' && isST) return false;

      // 行业板块：可选反选（排除选中板块）
      if (industrySelected.size > 0) {
        const code = stock.industry?.code;
        const hasIndustry = code ? industrySelected.has(code) : false;
        if (industrySectorInvert ? hasIndustry : !hasIndustry) return false;
      }
      return true;
    });
  }, [allStocks, selectedMarket, nameType, industrySectors, industrySectorInvert]);

  const poolCodes = useMemo(() => new Set(stockPool.map((stock) => stock.code)), [stockPool]);

  useEffect(() => {
    if (klines.size === 0) return;
    runAnalysis(klines, nameMap, poolCodes.size > 0 ? poolCodes : null);
  }, [klines, nameMap, poolCodes, runAnalysis]);

  const patchFilters = useCallback((patch: Partial<WeeklyFilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 当前生效的档位过滤（单选；undefined = 不限） */
  const activeSetupGrade = filters.setupGrades?.[0];

  const handleAnalyze = async () => {
    if (stockPool.length === 0) {
      message.warning(selectedMarket.length === 0 ? '请至少选择一个市场' : '当前筛选条件下暂无股票');
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setFailures([]);
    // 先刷新机会分析写入的日线与基本面，保证「多周期共振」与「数据筛选」用的不是过期数据
    await Promise.all([loadDailyKlines(), loadFundamentals()]);
    setProgress({ completed: 0, total: stockPool.length, failed: 0 });
    if (forceRefresh) apiCache.clear();
    try {
      const result = await fetchWeeklyKlines(stockPool, {
        count: klineCount,
        forceRefresh,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });
      setKlines(result.klines);
      setNameMap(result.names);
      setUpdatedAt(result.updatedAt);
      setFailures(result.failures);
      setStaleCache(0);
      if (result.persistFailed) {
        message.warning('周K写入 IndexedDB 失败，下次打开将无法自动恢复（本次结果仍可查看）');
      }
      if (result.cancelled) {
        message.info(`已取消，已完成 ${result.klines.size} 只`);
      } else {
        message.success(
          `周线分析完成：${result.klines.size} 只${
            result.failures.length > 0 ? `，失败 ${result.failures.length} 只` : ''
          }`
        );
      }
    } catch (error) {
      logger.error('[WeeklyKPage] 周线分析失败:', error);
      message.error('周线分析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    message.info('正在取消…');
  };

  const runningWeek = useMemo(() => {
    if (klines.size === 0) return false;
    for (const bars of klines.values()) {
      if (bars.length === 0) continue;
      if (isRunningWeek(bars[bars.length - 1].time, Date.now())) return true;
    }
    return false;
  }, [klines]);

  /** 名称筛选面板选中的行业分组 → 行业板块代码（独立于顶部「行业」筛选） */
  const nameFilterIndustryCodes = useMemo(
    () => resolveIndustryGroupCodes(nameFilterIndustryGroups),
    [nameFilterIndustryGroups]
  );

  /** 硬过滤用的完整条件：数据筛选 + 名称筛选（与机会分析页口径一致） */
  const effectiveFilters = useMemo<WeeklyFilterOptions>(
    () => ({
      ...filters,
      completeWeeksOnly,
      enableNameKeywordFilter,
      excludedNameKeywords,
      enableShortTermNameFilter,
      excludedShortTermNames,
      nameFilterIndustryCodes,
      nameFilterIndustryInvert,
    }),
    [
      filters,
      completeWeeksOnly,
      enableNameKeywordFilter,
      excludedNameKeywords,
      enableShortTermNameFilter,
      excludedShortTermNames,
      nameFilterIndustryCodes,
      nameFilterIndustryInvert,
    ]
  );

  const filteredRows = useMemo(
    () => applyWeeklyFilters(rows, effectiveFilters),
    [rows, effectiveFilters]
  );

  /** 不做行业配额 / 总数量截断：硬门槛通过的个股全部进入名单，按综合分排序 */
  const watchlist = useMemo(
    () => filteredRows.slice().sort((a, b) => b.score - a.score),
    [filteredRows]
  );

  const displayRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const matched = kw
      ? watchlist.filter((row) => {
          const pureCode = row.code.replace(/^(sh|sz|bj)/i, '');
          return (
            row.name.toLowerCase().includes(kw) ||
            row.code.toLowerCase().includes(kw) ||
            pureCode.includes(kw)
          );
        })
      : watchlist;
    return matched.slice().sort((a, b) => b.score - a.score);
  }, [watchlist, searchKeyword]);

  // 表格高度自适应：卡片撑满剩余空间，扣掉分页器与内边距后交给 Table 内部滚动
  const updateTableHeight = useCallback(() => {
    const cardBody = tableCardRef.current?.querySelector('.ant-card-body') as HTMLElement | null;
    if (!cardBody) return;
    const bodyHeight = cardBody.clientHeight;
    if (bodyHeight <= 0) return;
    const pagination = cardBody.querySelector('.ant-pagination') as HTMLElement | null;
    const paginationHeight = pagination ? pagination.offsetHeight : 24;
    const height =
      bodyHeight -
      paginationHeight -
      OPPORTUNITY_TABLE_HEIGHT_PADDING -
      OPPORTUNITY_TABLE_HEIGHT_EXTRA_PADDING -
      OPPORTUNITY_TABLE_HEIGHT_MARGIN;
    setTableHeight(Math.max(100, height));
  }, []);

  useLayoutEffect(() => {
    updateTableHeight();
  }, [updateTableHeight, displayRows.length, tablePagination.pageSize]);

  useEffect(() => {
    const el = tableCardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateTableHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateTableHeight]);

  // 数据量变化后回到第一页，避免停留在已不存在的页码
  useEffect(() => {
    setTablePagination((prev) => (prev.current === 1 ? prev : { ...prev, current: 1 }));
  }, [displayRows.length, searchKeyword]);

  const validCount = useMemo(() => rows.filter((r) => !r.insufficientData).length, [rows]);
  const handleExportPng = async () => {
    if (displayRows.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }
    const nameLabel = nameType === 'st' ? '仅ST' : nameType === 'non_st' ? '非ST' : '不限名称';
    const industryLabel =
      industrySectors.length > 0
        ? `，行业${industrySectorInvert ? '排除' : '仅保留'}${industrySectors.length}个`
        : '';
    /** 名称筛选条件摘要（与机会分析页一致：仅显示数量，避免导出文本过长） */
    const nameFilterParts = [
      nameFilterIndustryGroups.length > 0
        ? `${nameFilterIndustryInvert ? '排除行业分组' : '仅保留行业分组'}${nameFilterIndustryGroups.join('、')}`
        : '',
      enableNameKeywordFilter && excludedNameKeywords.length > 0
        ? `排除名称包含[${excludedNameKeywords.length}个]`
        : '',
      enableShortTermNameFilter && excludedShortTermNames.length > 0
        ? `短期排除[${excludedShortTermNames.length}个]`
        : '',
    ].filter(Boolean);
    const dataFilterParts = [
      rangeLabel(filters.priceRange) ? `价格 ${rangeLabel(filters.priceRange)} 元` : '',
      rangeLabel(filters.marketCapRange) ? `总市值 ${rangeLabel(filters.marketCapRange)} 亿` : '',
      rangeLabel(filters.totalSharesRange)
        ? `总股数 ${rangeLabel(filters.totalSharesRange)} 亿`
        : '',
      rangeLabel(filters.financeRevenueRange)
        ? `总营收 ${rangeLabel(filters.financeRevenueRange)} 亿`
        : '',
      rangeLabel(filters.financeNetProfitRange)
        ? `归母净利润 ${rangeLabel(filters.financeNetProfitRange)} 亿`
        : '',
      rangeLabel(filters.financeRevenueGrowthRange)
        ? `总营收增长率 ${rangeLabel(filters.financeRevenueGrowthRange)}%`
        : '',
      rangeLabel(filters.financeNetProfitGrowthRange)
        ? `归母净利润增长率 ${rangeLabel(filters.financeNetProfitGrowthRange)}%`
        : '',
    ].filter(Boolean);
    const summaryLines = [
      `分析时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `市场：${selectedMarket.join('+')}，${nameLabel}${industryLabel}`,
      ...(dataFilterParts.length > 0 ? [`数据筛选：${dataFilterParts.join('，')}`] : []),
      ...(nameFilterParts.length > 0 ? [`名称筛选：${nameFilterParts.join('，')}`] : []),
      `趋势门槛：${filters.requireAboveMa60 ? '站上60周线' : '不要求60周线'}；${
        filters.requireSetup ? '要求至少命中1个战法' : '战法仅加分'
      }${activeSetupGrade ? `（仅${WEEKLY_SETUP_GRADE_LABELS[activeSetupGrade]}）` : ''}`,
      runningWeek
        ? completeWeeksOnly
          ? '本周未收盘，已忽略未完成的本周，按最近收盘周计算'
          : '本周未收盘，名单为预览'
        : '已按最近收盘周出正式名单',
    ];
    try {
      await exportWeeklyResultToPng(displayRows, { fileNamePrefix: '周线选股', summaryLines });
      message.success('已导出为图片');
    } catch (error) {
      logger.error('[WeeklyKPage] 导出图片失败:', error);
      message.error(error instanceof Error ? error.message : '导出图片失败');
    }
  };

  const handleAddToRecord = async () => {
    if (displayRows.length === 0) {
      message.warning('没有数据可添加');
      return;
    }
    try {
      await addStocksToTodayRecord(
        displayRows as unknown as StockOpportunityData[],
        updatedAt || undefined
      );
      const dateStr = updatedAt ? new Date(updatedAt).toLocaleDateString('zh-CN') : '今天';
      message.success(`已将 ${displayRows.length} 只股票添加到 ${dateStr} 的记录`);
    } catch (error) {
      logger.error('[WeeklyKPage] 添加到记录失败:', error);
      message.error('添加到记录失败');
    }
  };

  /**
   * 批量获取指定股票池的营业总收入 / 归母净利润及其增长率（参考机会分析页实现）。
   * 结果合并进 fundamentals，供「数据筛选」使用；已命中本地缓存的个股不会重复请求。
   */
  const fetchFinanceForStocks = async (stocks: Array<{ code: string }>, emptyHint: string) => {
    if (financeLoading) return;
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
        message.warning('未获取到营收/净利润数据');
        return;
      }
      setFundamentals((prev) => {
        const next = new Map(prev);
        map.forEach((metrics, code) => applyFinanceMetrics(next, code, metrics));
        return next;
      });
      message.success(`营收/净利润数据已就绪，共 ${map.size} 只（命中本地缓存的不重复请求）`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        message.info('已取消获取营收净利润');
      } else {
        logger.error('[WeeklyKPage] 获取营收净利润失败:', error);
        message.error('获取营收净利润失败');
      }
    } finally {
      financeAbortRef.current = null;
      setFinanceLoading(false);
      setFinanceProgress({ total: 0, completed: 0, failed: 0 });
    }
  };

  /** 获取当前股票池（与「一键分析」同口径）的营收 / 净利润 */
  const handleFetchFinance = () =>
    fetchFinanceForStocks(stockPool, '当前市场暂无股票数据');

  /** 仅获取「当前筛选后名单」的营收 / 净利润，避免全池请求触发新浪限流 */
  const handleFetchFinanceForFiltered = () =>
    fetchFinanceForStocks(
      displayRows,
      '当前名单为空，无法获取营收净利润（若由「总营收」等财务条件导致，请先清空该类条件）'
    );

  const handleCancelFetchFinance = () => {
    financeAbortRef.current?.abort();
  };

  const watchColumns = useMemo<ColumnsType<WeeklyAnalysis>>(
    () => [
      {
        title: '代码',
        dataIndex: 'code',
        width: 76,
        render: (code: string) => code.replace(/^(SH|SZ|BJ)/i, ''),
      },
      {
        title: '名称',
        dataIndex: 'name',
        width: 96,
        render: (name: string) => <span className={styles.nameCell}>{name}</span>,
      },
      {
        title: '行业',
        dataIndex: 'industryName',
        width: 96,
        render: (v: string | undefined) => v || '未知',
        // 按中文拼音排序，未归类统一落入「未知」
        sorter: (a, b) =>
          (a.industryName || '未知').localeCompare(b.industryName || '未知', 'zh-Hans-CN'),
      },
      {
        title: '最新价',
        dataIndex: 'close',
        width: 90,
        render: (v: number) => fixed(v),
        sorter: (a, b) => a.close - b.close,
        sortDirections: ['descend', 'ascend'],
      },
      {
        title: (
          <Tooltip title="勾选「只用完整周」时为最近已收盘周涨幅；未勾选则为进行中的本周实时涨幅">
            本周涨幅
          </Tooltip>
        ),
        dataIndex: 'weekChangePercent',
        width: 96,
        render: (v: number) => percentNode(v),
        sorter: (a, b) => a.weekChangePercent - b.weekChangePercent,
        sortDirections: ['descend', 'ascend'],
      },
      {
        title: (
          <Tooltip title="三段式绝对分：趋势健康度(30) + 战法(50) + 多周期共振(20) − 风险惩罚">
            综合分
          </Tooltip>
        ),
        dataIndex: 'score',
        width: 84,
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.score - b.score,
        render: (v: number) => <strong style={{ color: v >= 60 ? '#cf1322' : '#595959' }}>{v}</strong>,
      },
      {
        title: (
          <Tooltip title="趋势健康度 / 战法 / 多周期共振，各段上限 30 / 50 / 20">
            趋势/战法/共振
          </Tooltip>
        ),
        key: 'parts',
        width: 120,
        render: (_: unknown, row: WeeklyAnalysis) =>
          `${row.parts.trend}/${row.parts.setup}/${row.parts.resonance}`,
      },
      {
        title: '战法',
        dataIndex: 'setups',
        width: 260,
        render: (_: unknown, row: WeeklyAnalysis) =>
          row.setups.length === 0 ? (
            <Text type="secondary">-</Text>
          ) : (
            <Space wrap size={[2, 2]}>
              {row.setups.map((hit) => (
                <Tooltip key={hit.key} title={hit.reasons.join('；')}>
                  <Tag color="red" style={{ marginInlineEnd: 0 }}>
                    {hit.label}
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          ),
      },
      {
        title: <Tooltip title="MA20 与近 8 周结构低点取更近者">止损</Tooltip>,
        dataIndex: 'stopLoss',
        width: 78,
        render: (v: number | undefined, row: WeeklyAnalysis) =>
          v === undefined ? (
            '-'
          ) : (
            <span>
              {fixed(v)}
              {row.riskPct !== undefined && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {' '}
                  ({row.riskPct.toFixed(1)}%)
                </Text>
              )}
            </span>
          ),
      },
      {
        title: (
          <Tooltip title="多周期共振：周线站上MA5 + 日线站上MA20（15分钟层无数据源，未接入）">
            共振
          </Tooltip>
        ),
        key: 'resonance',
        width: 68,
        render: (_: unknown, row: WeeklyAnalysis) => {
          const { passed, total } = resonanceLayers({
            pxAboveMa5: row.pxAboveMa5,
            dailyAboveMa20: row.dailyAboveMa20,
          });
          return (
            <span style={{ color: passed === 2 ? '#cf1322' : '#595959' }}>
              {passed}/{total}
              {row.dailyAboveMa20 === undefined ? '*' : ''}
            </span>
          );
        },
      },
      {
        title: (
          <Tooltip title="已收盘周的周涨幅；数据不足时回退到本周涨幅">
            近1周
          </Tooltip>
        ),
        dataIndex: 'ret1w',
        width: 84,
        render: (v: number | undefined, row) => percentNode(v ?? row.weekChangePercent),
        // 与单元格展示保持一致：缺失时回退到本周涨幅，避免排序与肉眼所见不一致
        sorter: (a, b) =>
          (a.ret1w ?? a.weekChangePercent) - (b.ret1w ?? b.weekChangePercent),
        sortDirections: ['descend', 'ascend'],
      },
      {
        title: (
          <Tooltip title="文档第四章：有效跌破20周均线 / 10周线拐头向下 / 死叉 / 顶背离 / 高位放量滞涨">
            卖出信号
          </Tooltip>
        ),
        dataIndex: 'exitSignals',
        width: 220,
        // 按信号条数排序（默认先看信号最多的风险股）
        sorter: (a, b) => (a.exitSignals?.length ?? 0) - (b.exitSignals?.length ?? 0),
        sortDirections: ['descend', 'ascend'],
        render: (v: string[] | undefined) =>
          v && v.length > 0 ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {v.join('；')}
            </Text>
          ) : (
            <Text type="secondary">-</Text>
          ),
      },
    ],
    []
  );

  /**
   * 虚拟滚动要求 scroll.x / scroll.y 都是数字，且横向宽度需与列宽之和一致，
   * 否则虚拟表格会按 scrollWidth 布局，导致右侧列被裁切（与机会分析页保持一致）。
   */
  const tableScrollX = useMemo(
    () => watchColumns.reduce((sum, col) => sum + (Number(col.width) || 120), 0),
    [watchColumns]
  );

  /**
   * 图表弹窗的行导航列表：顺序与「本周名单」表格当前排序完全一致，
   * 保证 ← / → 切到的是屏幕上真正的上一行 / 下一行。
   * 用户还没点过表头时，用列声明的 defaultSortOrder（综合分降序）兜底。
   */
  const chartNavRecords = useMemo(() => {
    const sorted = sortRowsByTableSorter(
      displayRows,
      watchColumns,
      tableSorter ?? findDefaultTableSorter(watchColumns)
    );
    return sorted.map((row) => ({ code: row.code, name: row.name }));
  }, [displayRows, watchColumns, tableSorter]);

  /**
   * 弹窗内切换到表格上一行 / 下一行：
   * 同步把表格翻到该行所在页，避免「弹窗换了、表格还停在旧页」。
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

  return (
    <Layout className={styles.weeklyPage}>
      <div className={styles.toolbarRow}>
        <Space wrap size="small" align="center">
          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>市场：</span>
            <Select
              mode="multiple"
              value={selectedMarket}
              options={MARKET_OPTIONS}
              style={{ width: 200 }}
              disabled={loading}
              maxTagCount={2}
              onChange={(value: string[]) => setSelectedMarket(value)}
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>名称：</span>
            <Select
              value={nameType}
              onChange={(value: string) => setNameType(value)}
              options={NAME_TYPE_OPTIONS}
              style={{ width: 100 }}
              disabled={loading}
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact} style={{ minWidth: 320 }}>
            <span className={styles.label}>行业：</span>
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择"
              value={industrySectors}
              onChange={(values: string[]) => setIndustrySectors(values)}
              options={industrySectorOptions}
              style={{ minWidth: 220 }}
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

          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>K线：</span>
            <InputNumber
              value={klineCount}
              min={80}
              max={800}
              step={20}
              style={{ width: 100 }}
              disabled={loading}
              onChange={(v) =>
                setKlineCount(
                  typeof v === 'number' && isFinite(v) ? Math.floor(v) : WEEKLY_KLINE_DEFAULT_COUNT
                )
              }
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <Tooltip title="战法白名单：需同时勾选「命中战法」才作为硬门槛；不勾时战法只参与打分">
              <span className={styles.label}>战法：</span>
            </Tooltip>
            <Select
              mode="multiple"
              allowClear
              value={filters.allowedSetups ?? []}
              options={SETUP_OPTIONS}
              style={{ width: 220 }}
              disabled={loading}
              maxTagCount={3}
              placeholder="不限战法"
              onChange={(value: SetupKey[]) =>
                patchFilters({ allowedSetups: value.length > 0 ? value : undefined })
              }
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <Tooltip title="满分档 = 战法全部条件成立；部分档 = 形态基本成型但缺关键确认（如尚未止跌、尚未真正突破箱顶）。选中后即为硬门槛">
              <span className={styles.label}>档位：</span>
            </Tooltip>
            <Select
              allowClear
              value={activeSetupGrade}
              options={SETUP_GRADE_OPTIONS}
              style={{ width: 110 }}
              disabled={loading}
              placeholder="不限"
              onChange={(value: WeeklySetupGrade | undefined) =>
                patchFilters({ setupGrades: value ? [value] : undefined })
              }
            />
          </Space.Compact>

          <Tooltip title="勾选后要求至少命中一个战法；六大战法同时成立机会极少，默认关闭">
            <Checkbox
              checked={filters.requireSetup ?? false}
              onChange={(e) => patchFilters({ requireSetup: e.target.checked })}
              disabled={loading}
            >
              命中战法
            </Checkbox>
          </Tooltip>

          <Tooltip title="文档：直接排除股价长期在 60 周均线下方的个股">
            <Checkbox
              checked={filters.requireAboveMa60 ?? true}
              onChange={(e) => patchFilters({ requireAboveMa60: e.target.checked })}
              disabled={loading}
            >
              站上60周线
            </Checkbox>
          </Tooltip>

          <Checkbox checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} disabled={loading}>
            强制刷新
          </Checkbox>

          <Tooltip title="只按最近一个已收盘周计算名单、涨幅与价格筛选；关闭后「本周涨幅」会采用进行中的本周实时数据">
            <Checkbox
              checked={completeWeeksOnly}
              onChange={(e) => setCompleteWeeksOnly(e.target.checked)}
              disabled={loading}
            >
              只用完整周
            </Checkbox>
          </Tooltip>

          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={loading}
            disabled={loading || stockPool.length === 0}
            onClick={() => void handleAnalyze()}
          >
            一键分析
          </Button>

          {loading && (
            <Button icon={<StopOutlined />} onClick={handleCancel}>
              取消
            </Button>
          )}

          <Tooltip title={`获取当前股票池（${stockPool.length} 只）的营业总收入与归母净利润`}>
            <Button
              icon={<FundOutlined />}
              onClick={() => void handleFetchFinance()}
              loading={financeLoading}
              disabled={loading || financeLoading || stockPool.length === 0}
            >
              获取营收净利润
            </Button>
          </Tooltip>

          <Tooltip
            title={`仅获取当前筛选后名单（${displayRows.length} 只）的营业总收入、归母净利润及其增长率，避免全池请求触发新浪限流`}
          >
            <Button
              icon={<FilterOutlined />}
              onClick={() => void handleFetchFinanceForFiltered()}
              loading={financeLoading}
              disabled={loading || financeLoading || displayRows.length === 0}
            >
              获取筛选后营收净利润
            </Button>
          </Tooltip>

          {financeLoading && (
            <Button icon={<StopOutlined />} onClick={handleCancelFetchFinance}>
              取消获取
            </Button>
          )}

          <Tooltip title="用已加载的周K缓存逐周回溯六大战法的历史信号，统计胜率与收益分布">
            <Button
              icon={<ExperimentOutlined />}
              disabled={loading || klines.size === 0}
              onClick={() => setShowBacktest(true)}
            >
              历史回测
            </Button>
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'watch',
                  label: '添加到自选股',
                  icon: <DatabaseOutlined />,
                  disabled: displayRows.length === 0,
                },
                {
                  key: 'record',
                  label: '添加到记录',
                  icon: <OrderedListOutlined />,
                  disabled: displayRows.length === 0,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'watch') setShowAddToWatchList(true);
                else if (key === 'record') void handleAddToRecord();
              },
            }}
          >
            <Button icon={<OrderedListOutlined />} disabled={displayRows.length === 0}>
              添加到 <DownOutlined />
            </Button>
          </Dropdown>

          <Button icon={<ExportOutlined />} disabled={displayRows.length === 0} onClick={() => void handleExportPng()}>
            导出图片(PNG)
          </Button>

          <WeeklyFiltersPanel
            filterPanelActiveKey={filterPanelActiveKey}
            setFilterPanelActiveKey={setFilterPanelActiveKey}
            priceRange={filters.priceRange}
            setPriceRange={(range) => patchFilters({ priceRange: range })}
            marketCapRange={filters.marketCapRange}
            setMarketCapRange={(range) => patchFilters({ marketCapRange: range })}
            totalSharesRange={filters.totalSharesRange}
            setTotalSharesRange={(range) => patchFilters({ totalSharesRange: range })}
            financeRevenueRange={filters.financeRevenueRange}
            setFinanceRevenueRange={(range) => patchFilters({ financeRevenueRange: range })}
            financeNetProfitRange={filters.financeNetProfitRange}
            setFinanceNetProfitRange={(range) => patchFilters({ financeNetProfitRange: range })}
            financeRevenueGrowthRange={filters.financeRevenueGrowthRange}
            setFinanceRevenueGrowthRange={(range) =>
              patchFilters({ financeRevenueGrowthRange: range })
            }
            financeNetProfitGrowthRange={filters.financeNetProfitGrowthRange}
            setFinanceNetProfitGrowthRange={(range) =>
              patchFilters({ financeNetProfitGrowthRange: range })
            }
            nameFilterIndustryGroups={nameFilterIndustryGroups}
            setNameFilterIndustryGroups={setNameFilterIndustryGroups}
            nameFilterIndustryInvert={nameFilterIndustryInvert}
            setNameFilterIndustryInvert={setNameFilterIndustryInvert}
            enableNameKeywordFilter={enableNameKeywordFilter}
            setEnableNameKeywordFilter={setEnableNameKeywordFilter}
            excludedNameKeywords={excludedNameKeywords}
            setExcludedNameKeywords={setExcludedNameKeywords}
            enableShortTermNameFilter={enableShortTermNameFilter}
            setEnableShortTermNameFilter={setEnableShortTermNameFilter}
            excludedShortTermNames={excludedShortTermNames}
            setExcludedShortTermNames={setExcludedShortTermNames}
            disabled={loading}
            open={showFilterPanel}
            onOpenChange={setShowFilterPanel}
          />
        </Space>
      </div>

      <div className={styles.filterBar}>
        <span>
          本周名单 <strong>{watchlist.length}</strong> 只 / 硬门槛 {filteredRows.length} 只 / 评分池{' '}
          {validCount} 只
        </span>

        <span
          className={styles.filterSummary}
          title="评分＝趋势健康度(30) + 战法(50) + 多周期共振(20) − 风险惩罚（三段式绝对分）"
        >
          🔍 硬过滤：
          {nameType === 'st' ? '仅ST' : nameType === 'non_st' ? '非ST' : '不限名称'}
          {industrySectors.length > 0
            ? ` + 行业${industrySectorInvert ? '排除' : '仅保留'}选中${industrySectors.length}个`
            : ''}
          {nameFilterIndustryGroups.length > 0
            ? ` + ${nameFilterIndustryInvert ? '排除' : '仅保留'}行业分组${nameFilterIndustryGroups.length}个`
            : ''}
          {enableNameKeywordFilter && excludedNameKeywords.length > 0
            ? ` + 排除名称包含${excludedNameKeywords.length}个`
            : ''}
          {enableShortTermNameFilter && excludedShortTermNames.length > 0
            ? ` + 短期排除${excludedShortTermNames.length}个`
            : ''}
          {rangeLabel(filters.priceRange) ? ` + 价格${rangeLabel(filters.priceRange)}元` : ''}
          {rangeLabel(filters.marketCapRange) ? ` + 市值${rangeLabel(filters.marketCapRange)}亿` : ''}
          {rangeLabel(filters.totalSharesRange)
            ? ` + 总股数${rangeLabel(filters.totalSharesRange)}亿`
            : ''}
          {rangeLabel(filters.financeRevenueRange)
            ? ` + 总营收${rangeLabel(filters.financeRevenueRange)}亿`
            : ''}
          {rangeLabel(filters.financeNetProfitRange)
            ? ` + 归母净利润${rangeLabel(filters.financeNetProfitRange)}亿`
            : ''}
          {rangeLabel(filters.financeRevenueGrowthRange)
            ? ` + 总营收增长${rangeLabel(filters.financeRevenueGrowthRange)}%`
            : ''}
          {rangeLabel(filters.financeNetProfitGrowthRange)
            ? ` + 归母净利润增长${rangeLabel(filters.financeNetProfitGrowthRange)}%`
            : ''}
          {' + 剔除空头排列'}
          {filters.requireAboveMa60 ? ' + 站上60周线' : ''}
          {filters.requireSetup ? ' + 至少命中1个战法' : ''}
          {activeSetupGrade ? ` + 仅${WEEKLY_SETUP_GRADE_LABELS[activeSetupGrade]}战法` : ''}
        </span>

        {updatedAt && (
          <span className={styles.timeText}>
            🕐 数据时间：{new Date(updatedAt).toLocaleString('zh-CN')}
          </span>
        )}
      </div>

      <Content className={styles.content}>
        {loading && progress.total > 0 && (
          <Card className={styles.progressCard}>
            <Progress
              percent={Math.round((progress.completed / progress.total) * 100)}
              status="active"
              format={(percent) => `${percent}%`}
            />
            <div className={styles.progressText}>
              进度：{progress.completed} / {progress.total}（失败：{progress.failed}）
            </div>
          </Card>
        )}

        {financeLoading && financeProgress.total > 0 && (
          <Card className={styles.progressCard}>
            <Progress
              percent={Math.round((financeProgress.completed / financeProgress.total) * 100)}
              status="active"
              format={(percent) => `${percent}%`}
            />
            <div className={styles.progressText}>
              获取营收净利润进度：{financeProgress.completed} / {financeProgress.total}（失败：
              {financeProgress.failed}）
            </div>
          </Card>
        )}

        {staleCache > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`已忽略 ${staleCache} 只不兼容的旧周K缓存（结构版本或复权方式已变更），重新分析后即可更新`}
          />
        )}

        {runningWeek && rows.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ margin: '12px 16px 0' }}
            message={
              completeWeeksOnly
                ? '本周周K尚未收盘：已忽略未完成的本周，名单、「本周涨幅」与价格筛选均按最近收盘周计算。'
                : '本周周K尚未收盘：下面名单是预览分，正式成交以本周五收盘后为准。'
            }
          />
        )}

        {failures.length > 0 && (
          <Card className={styles.errorCard} size="small">
            <Text type="danger">
              失败 {failures.length} 只：{failures.slice(0, 8).map((f) => f.code).join('、')}
              {failures.length > 8 ? ' 等' : ''}
            </Text>
          </Card>
        )}

        <Card
          ref={tableCardRef}
          className={styles.tableCard}
          title="本周名单"
          extra={
            <Input
              allowClear
              size="small"
              prefix={<SearchOutlined />}
              placeholder="搜索名称/代码"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 180 }}
            />
          }
        >
          {hydrating && (
            <div className={styles.loadingMask}>
              {/* antd Spin 的 tip 仅在「嵌套 / 全屏」模式下生效，这里改为自行渲染文案 */}
              <Space direction="vertical" align="center" size={8}>
                <Spin size="large" />
                <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                  正在从 IndexedDB 恢复周K数据...
                </span>
              </Space>
            </div>
          )}
          <Table<WeeklyAnalysis>
            rowKey="code"
            size="small"
            columns={watchColumns}
            dataSource={displayRows}
            // 虚拟滚动：只渲染可视行，避免「本周名单」上百行 × 12 列的 DOM 开销
            virtual
            scroll={{ x: tableScrollX, y: tableHeight }}
            pagination={tablePagination}
            onChange={(paginationConfig, _filters, sorter) => {
              // 记录当前排序：弹窗里的 ← / → 要按排序后的顺序切换
              const current = Array.isArray(sorter) ? sorter[0] : sorter;
              setTableSorter({
                columnKey: current?.columnKey != null ? String(current.columnKey) : null,
                order: current?.order ?? null,
              });
              setTablePagination((prev) => ({
                ...prev,
                current: paginationConfig.current,
                pageSize: paginationConfig.pageSize,
              }));
            }}
            onRow={(record) => ({
              onClick: () => setChartState({ code: record.code, name: record.name }),
              className: styles.clickableRow,
            })}
            locale={{
              emptyText: rows.length === 0 ? '点击「一键分析」拉取周K数据' : '当前条件下无名单',
            }}
          />
        </Card>
      </Content>

      <AddStocksToWatchListModal
        visible={showAddToWatchList}
        stocks={displayRows.map((row) => ({ code: row.code, name: row.name }))}
        onClose={() => setShowAddToWatchList(false)}
      />

      <WeeklyBacktestDrawer
        open={showBacktest}
        klines={klines}
        names={nameMap}
        onClose={() => setShowBacktest(false)}
      />

      <WeeklyChartModal
        open={chartState !== null}
        code={chartState?.code ?? ''}
        name={chartState?.name ?? ''}
        kline={chartState ? klines.get(chartState.code) ?? [] : []}
        analysis={chartState ? rows.find((row) => row.code === chartState.code) ?? null : null}
        records={chartNavRecords}
        onNavigate={handleChartNavigate}
        onClose={() => setChartState(null)}
      />
    </Layout>
  );
}

export default WeeklyKPage;
