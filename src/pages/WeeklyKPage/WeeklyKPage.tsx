/**
 * 周线选股：市场池 → 周K → 动量/低波/过热/拥挤评分 → 行业配额名单 → 2–6 周持仓回测
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
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
import type { ColumnsType } from 'antd/es/table';
import {
  ClearOutlined,
  DatabaseOutlined,
  DownOutlined,
  ExportOutlined,
  ExperimentOutlined,
  OrderedListOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
import { addStocksToTodayRecord } from '@/services/opportunity/recordService';
import type { StockOpportunityData } from '@/types/stock';
import { useAllStocks } from '@/hooks/useAllStocks';
import { getPureCode } from '@/utils/format/format';
import { apiCache } from '@/utils/storage/apiCache';
import {
  DEFAULT_WEEKLY_FILTERS,
  WEEKLY_HOLD_DEFAULTS,
  YI,
  analyzeWeeklyKlines,
  applyWeeklyFilters,
  backtestHoldStrategy,
  isRunningWeek,
  pickByIndustryCap,
  type HoldPositionView,
  type HoldStrategyResult,
  type WeeklyAnalysis,
  type WeeklyFilterOptions,
} from '@/utils/analysis/weekly';
import {
  clearWeeklyKlineCache,
  fetchWeeklyKlines,
  loadCachedWeeklyKlines,
  type WeeklyFetchProgress,
} from '@/services/stocks/weeklyKlineService';
import { exportWeeklyResultToPng } from '@/utils/export/weeklyKlineExportUtils';
import { logger } from '@/utils/business/logger';
import { WEEKLY_KLINE_DEFAULT_COUNT } from '@/utils/config/constants';
import { OPPORTUNITY_DEFAULT_BASIC_FILTERS } from '@/utils/config/opportunityAnalysisDefaults';
import type { KLineData } from '@/types/stock';
import { WeeklyChartModal } from './WeeklyChartModal';
import { WeeklyBacktestPanel } from './WeeklyBacktestPanel';
import styles from './WeeklyKPage.module.css';

const { Content } = Layout;
const { Text } = Typography;

const MARKET_OPTIONS = [
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function percentNode(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return <Text type="secondary">-</Text>;
  const color = value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
  return <span style={{ color }}>{value.toFixed(digits)}%</span>;
}

function amountYi(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${(value / YI).toFixed(1)}亿`;
}

function actionColor(action: HoldPositionView['action']): string {
  if (action === '新开') return 'red';
  if (action === '到期退出') return 'gold';
  if (action === '可卖') return 'orange';
  return 'blue';
}

export function WeeklyKPage() {
  const { message } = App.useApp();
  const { allStocks } = useAllStocks();

  const [selectedMarket, setSelectedMarket] = useState<string[]>([
    ...OPPORTUNITY_DEFAULT_BASIC_FILTERS.selectedMarket,
  ]);
  const [klineCount, setKlineCount] = useState<number>(WEEKLY_KLINE_DEFAULT_COUNT);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [filters, setFilters] = useState<WeeklyFilterOptions>({ ...DEFAULT_WEEKLY_FILTERS });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showAddToWatchList, setShowAddToWatchList] = useState(false);

  const [rows, setRows] = useState<WeeklyAnalysis[]>([]);
  const [klines, setKlines] = useState<Map<string, KLineData[]>>(new Map());
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [progress, setProgress] = useState<WeeklyFetchProgress>({ completed: 0, total: 0, failed: 0 });
  const [failures, setFailures] = useState<Array<{ code: string; name: string; error: string }>>([]);
  const [staleCache, setStaleCache] = useState(0);

  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null);
  const [backtest, setBacktest] = useState<HoldStrategyResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);

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

  const runAnalysis = useCallback(
    (
      klineMap: Map<string, KLineData[]>,
      names: Map<string, string>,
      poolCodes: Set<string> | null
    ) => {
      const analyzed = analyzeWeeklyKlines(klineMap, names, {
        poolCodes,
        industries: industryMap,
        minLiquidity: filters.minAvgAmount,
      });
      setRows(analyzed);
    },
    [industryMap, filters.minAvgAmount]
  );

  const hydrateFromCache = useCallback(
    async (manual = false): Promise<boolean> => {
      setHydrating(true);
      try {
        const cached = await loadCachedWeeklyKlines();
        setStaleCache(cached.stale);
        if (cached.klines.size === 0) {
          if (manual) message.info('IndexedDB 中暂无可用周K缓存，请点击「一键分析」');
          setUpdatedAt(null);
          return false;
        }
        const restoredNames = new Map(cached.names);
        allStocks.forEach((stock) => restoredNames.set(stock.code, stock.name));
        setKlines(cached.klines);
        setNameMap(restoredNames);
        setUpdatedAt(cached.updatedAt);
        setBacktest(null);
        if (manual) message.success(`已恢复 ${cached.klines.size} 只周K数据`);
        return true;
      } catch (error) {
        logger.error('[WeeklyKPage] 读取周K缓存失败:', error);
        message.error(`读取周K缓存失败：${error instanceof Error ? error.message : '未知错误'}`);
        return false;
      } finally {
        setHydrating(false);
      }
    },
    [allStocks, message]
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
    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      if (!matchers.some((m) => m(pureCode))) return false;
      if (stock.name.includes('ST')) return false;
      return true;
    });
  }, [allStocks, selectedMarket]);

  const poolCodes = useMemo(() => new Set(stockPool.map((stock) => stock.code)), [stockPool]);

  useEffect(() => {
    if (klines.size === 0) return;
    runAnalysis(klines, nameMap, poolCodes.size > 0 ? poolCodes : null);
  }, [klines, nameMap, poolCodes, runAnalysis]);

  const patchFilters = useCallback((patch: Partial<WeeklyFilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setBacktest(null);
  }, []);

  const handleAnalyze = async () => {
    if (stockPool.length === 0) {
      message.warning(selectedMarket.length === 0 ? '请至少选择一个市场' : '当前筛选条件下暂无股票');
      return;
    }
    cancelRef.current = false;
    setLoading(true);
    setFailures([]);
    setBacktest(null);
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

  const handleBacktest = async () => {
    if (klines.size === 0) {
      message.warning('暂无周K数据，请先执行分析');
      return;
    }
    setBacktesting(true);
    setBacktest(null);
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const result = backtestHoldStrategy(klines, nameMap, poolCodes.size > 0 ? poolCodes : null, {
        industries: industryMap,
        minLiquidity: filters.minAvgAmount,
        filters,
        runningWeek,
      });
      setBacktest(result);
    } catch (error) {
      logger.error('[WeeklyKPage] 回测失败:', error);
      message.error('回测失败');
    } finally {
      setBacktesting(false);
    }
  };

  const filteredRows = useMemo(
    () => applyWeeklyFilters(rows, filters),
    [rows, filters]
  );

  const watchlist = useMemo(() => pickByIndustryCap(filteredRows), [filteredRows]);

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

  const validCount = useMemo(() => rows.filter((r) => !r.insufficientData).length, [rows]);
  const marketBreadth = useMemo(() => {
    const valid = rows.filter((r) => !r.insufficientData && r.passed);
    if (valid.length === 0) return undefined;
    const above = valid.filter((r) => r.pxAboveMa20).length;
    return (above / valid.length) * 100;
  }, [rows]);
  const defenseMode =
    backtest?.defenseMode ??
    (marketBreadth !== undefined && marketBreadth < WEEKLY_HOLD_DEFAULTS.defenseBreadth);

  const handleExportPng = async () => {
    if (displayRows.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }
    const summaryLines = [
      `分析时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `市场：${selectedMarket.join('+')}，非ST，近8周成交额中位数≥${(filters.minAvgAmount / YI).toFixed(0)}亿`,
      `硬门槛：13周动量≥${filters.minRet13wSkip1 ?? '-'}%、26周≥${filters.minRet26w ?? '-'}%、52周位置${filters.minPos52w ?? '-'}~${filters.maxPos52w ?? '-'}、量能趋势≥${filters.minVolTrend4_26 ?? '-'}`,
      `规则：行业最多2只，目标10只；持有2–6周；这周收盘买`,
      runningWeek ? '本周未收盘，名单为预览' : '已按最近收盘周出正式名单',
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

  const handleClearCache = async () => {
    try {
      await clearWeeklyKlineCache();
      setRows([]);
      setKlines(new Map());
      setNameMap(new Map());
      setUpdatedAt(null);
      setBacktest(null);
      setStaleCache(0);
      message.success('周K缓存已清空');
    } catch (error) {
      logger.error('[WeeklyKPage] 清空周K缓存失败:', error);
      message.error('清空周K缓存失败');
    }
  };

  const watchColumns = useMemo<ColumnsType<WeeklyAnalysis>>(
    () => [
      {
        title: '代码',
        dataIndex: 'code',
        width: 76,
        fixed: 'left',
        render: (code: string) => code.replace(/^(SH|SZ|BJ)/i, ''),
      },
      {
        title: '名称',
        dataIndex: 'name',
        width: 96,
        fixed: 'left',
        render: (name: string) => <span className={styles.nameCell}>{name}</span>,
      },
      {
        title: '行业',
        dataIndex: 'industryName',
        width: 96,
        render: (v: string | undefined) => v || '未知',
      },
      { title: '最新价', dataIndex: 'close', width: 84, align: 'right', render: (v: number) => fixed(v) },
      {
        title: '本周涨幅',
        dataIndex: 'weekChangePercent',
        width: 96,
        align: 'right',
        render: (v: number) => percentNode(v),
      },
      {
        title: <Tooltip title="13周动量(跳过最近1周)×0.5 + 低波动×0.25 + 近1周过热反向×0.15 + 拥挤反向×0.10">综合分</Tooltip>,
        dataIndex: 'score',
        width: 84,
        align: 'right',
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.score - b.score,
        render: (v: number) => <strong style={{ color: v >= 60 ? '#cf1322' : '#595959' }}>{v}</strong>,
      },
      {
        title: '分位',
        dataIndex: 'scoreRank',
        width: 72,
        align: 'right',
        render: (v: number | undefined) => (v === undefined ? '-' : v.toFixed(0)),
      },
      {
        title: '13周动量',
        dataIndex: 'ret13wSkip1',
        width: 96,
        align: 'right',
        render: (v: number | undefined) => percentNode(v),
      },
      {
        title: '26周涨幅',
        dataIndex: 'ret26w',
        width: 96,
        align: 'right',
        render: (v: number | undefined) => percentNode(v),
      },
      {
        title: (
          <Tooltip title="当前价在 52 周高低区间中的位置：0=最低，100=最高">52周位置</Tooltip>
        ),
        dataIndex: 'pos52w',
        width: 92,
        align: 'right',
        render: (v: number | undefined) => (v === undefined ? '-' : v.toFixed(0)),
      },
      {
        title: (
          <Tooltip title="近 4 周均量 / 近 26 周均量。>1.2 表示近期放量">量能趋势</Tooltip>
        ),
        dataIndex: 'volTrend4_26',
        width: 88,
        align: 'right',
        render: (v: number | undefined) =>
          v === undefined ? '-' : v.toFixed(2),
      },
      {
        title: '近1周',
        dataIndex: 'ret1w',
        width: 84,
        align: 'right',
        render: (v: number | undefined, row) => percentNode(v ?? row.weekChangePercent),
      },
      {
        title: '波动',
        dataIndex: 'vol13w',
        width: 80,
        align: 'right',
        render: (v: number | undefined) => (v === undefined ? '-' : `${v.toFixed(1)}%`),
      },
      {
        title: '拥挤',
        dataIndex: 'amountCrowd8w',
        width: 72,
        align: 'right',
        render: (v: number | undefined) =>
          v === undefined ? '-' : <span style={{ color: v >= 2 ? '#d46b08' : '#595959' }}>{v.toFixed(2)}</span>,
      },
      {
        title: '成交额中位数',
        dataIndex: 'amount8wMedian',
        width: 108,
        align: 'right',
        render: (_: unknown, row: WeeklyAnalysis) => amountYi(row.amount8wMedian ?? row.avgAmount20w),
      },
      {
        title: '建议',
        width: 88,
        render: (_: unknown, row: WeeklyAnalysis) => {
          const pos = backtest?.currentPositions.find((p) => p.code === row.code);
          const action = pos?.action ?? (defenseMode ? '持有' : '新开');
          const label = defenseMode && action === '新开' ? '观望' : action;
          return <Tag color={actionColor(pos?.action ?? '新开')}>{label}</Tag>;
        },
      },
      {
        title: '过热',
        width: 72,
        render: (_: unknown, row: WeeklyAnalysis) =>
          (row.ret1w ?? 0) >= 10 ? <Tag color="gold">是</Tag> : <Text type="secondary">否</Text>,
      },
    ],
    [backtest, defenseMode]
  );

  const holdColumns = useMemo<ColumnsType<HoldPositionView>>(
    () => [
      { title: '代码', dataIndex: 'code', width: 76, render: (code: string) => code.replace(/^(SH|SZ|BJ)/i, '') },
      { title: '名称', dataIndex: 'name', width: 96 },
      { title: '行业', dataIndex: 'industryName', width: 96 },
      { title: '综合分', dataIndex: 'score', width: 80, align: 'right' },
      { title: '已持周数', dataIndex: 'heldWeeks', width: 88, align: 'right' },
      {
        title: '最早可卖',
        width: 88,
        align: 'right',
        render: (_: unknown, row) => Math.max(0, row.minHoldWeeks - row.heldWeeks),
      },
      {
        title: '最迟必须卖',
        width: 100,
        align: 'right',
        render: (_: unknown, row) => Math.max(0, row.maxHoldWeeks - row.heldWeeks),
      },
      {
        title: '状态',
        dataIndex: 'action',
        width: 88,
        render: (v: HoldPositionView['action']) => <Tag color={actionColor(v)}>{v}</Tag>,
      },
    ],
    []
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
            <span className={styles.label}>周K根数：</span>
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
            <span className={styles.label}>近8周成交额中位数≥</span>
            <InputNumber
              value={Number((filters.minAvgAmount / YI).toFixed(1))}
              min={0}
              max={50}
              step={1}
              style={{ width: 84 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ minAvgAmount: typeof v === 'number' && isFinite(v) ? v * YI : 3 * YI })
              }
            />
            <span className={styles.label}>亿</span>
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <Tooltip title="13 周动量跳过最近 1 周，要求已经在涨">
              <span className={styles.label}>13周动量≥</span>
            </Tooltip>
            <InputNumber
              value={filters.minRet13wSkip1}
              min={0}
              max={80}
              step={1}
              style={{ width: 72 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ minRet13wSkip1: typeof v === 'number' && isFinite(v) ? v : 5 })
              }
            />
            <span className={styles.label}>%</span>
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>26周涨幅≥</span>
            <InputNumber
              value={filters.minRet26w}
              min={0}
              max={120}
              step={1}
              style={{ width: 72 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ minRet26w: typeof v === 'number' && isFinite(v) ? v : 10 })
              }
            />
            <span className={styles.label}>%</span>
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <Tooltip title="52 周位置过低是长期弱势，过高容易是权重慢牛顶">
              <span className={styles.label}>52周位置</span>
            </Tooltip>
            <InputNumber
              value={filters.minPos52w}
              min={0}
              max={100}
              style={{ width: 64 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ minPos52w: typeof v === 'number' && isFinite(v) ? v : 30 })
              }
            />
            <span className={styles.label}>~</span>
            <InputNumber
              value={filters.maxPos52w}
              min={0}
              max={100}
              style={{ width: 64 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ maxPos52w: typeof v === 'number' && isFinite(v) ? v : 85 })
              }
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <Tooltip title="近 4 周均量 / 近 26 周均量，过滤不活跃的权重股">
              <span className={styles.label}>量能趋势≥</span>
            </Tooltip>
            <InputNumber
              value={filters.minVolTrend4_26}
              min={0}
              max={5}
              step={0.1}
              style={{ width: 72 }}
              disabled={loading}
              onChange={(v) =>
                patchFilters({ minVolTrend4_26: typeof v === 'number' && isFinite(v) ? v : 1.2 })
              }
            />
          </Space.Compact>

          <Checkbox checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} disabled={loading}>
            强制刷新
          </Checkbox>

          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={loading}
            disabled={loading || stockPool.length === 0}
            onClick={() => void handleAnalyze()}
          >
            一键分析（{stockPool.length}）
          </Button>

          {loading && (
            <Button icon={<StopOutlined />} onClick={handleCancel}>
              取消
            </Button>
          )}

          <Button
            icon={<ExperimentOutlined />}
            loading={backtesting}
            disabled={loading || backtesting || klines.size === 0}
            onClick={() => void handleBacktest()}
          >
            验证策略（回测）
          </Button>

          <Button icon={<ExportOutlined />} disabled={displayRows.length === 0} onClick={() => void handleExportPng()}>
            导出图片(PNG)
          </Button>

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

          <Button icon={<ClearOutlined />} disabled={loading} onClick={() => void handleClearCache()}>
            清空周K缓存
          </Button>

          <Button
            icon={<ReloadOutlined />}
            loading={hydrating}
            disabled={loading || hydrating}
            onClick={() => void hydrateFromCache(true)}
          >
            加载缓存
          </Button>
        </Space>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.presetHint}>
          硬过滤：非ST + 流动性 + 13周动量≥{filters.minRet13wSkip1}% + 26周涨幅≥{filters.minRet26w}% + 52周位置 {filters.minPos52w}~{filters.maxPos52w} + 量能趋势≥{filters.minVolTrend4_26}。
          评分仍按原权重排序。同一行业最多 2 只，目标 10 只。周五收盘买，锁仓 2 周、最长 6 周。
        </div>
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

        {staleCache > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={`已忽略 ${staleCache} 只不兼容的旧周K缓存，重新分析后即可更新`}
          />
        )}

        {runningWeek && rows.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ margin: '12px 16px 0' }}
            message="本周周K尚未收盘：下面名单是预览分，正式成交以本周五收盘后为准。"
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

        <div style={{ padding: '0 16px' }}>
          <WeeklyBacktestPanel result={backtest} loading={backtesting} />
        </div>

        <div className={styles.resultBar}>
          <span>
            本周名单 <strong>{watchlist.length}</strong> 只 / 硬门槛 {filteredRows.length} 只 / 评分池 {validCount} 只
          </span>
          {marketBreadth !== undefined && (
            <span className={styles.timeText}>
              市场宽度{' '}
              <strong style={{ color: marketBreadth >= 50 ? '#cf1322' : '#389e0d' }}>
                {marketBreadth.toFixed(0)}%
              </strong>
              （{defenseMode ? '防御' : '正常'}）
            </span>
          )}
          {updatedAt && (
            <span className={styles.timeText}>数据时间：{new Date(updatedAt).toLocaleString('zh-CN')}</span>
          )}
        </div>

        <Card
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
              <Spin tip="正在从 IndexedDB 恢复周K数据..." size="large" />
            </div>
          )}
          <Table<WeeklyAnalysis>
            rowKey="code"
            size="small"
            columns={watchColumns}
            dataSource={displayRows}
            scroll={{ x: 1400 }}
            pagination={false}
            onRow={(record) => ({
              onClick: () => setChartState({ code: record.code, name: record.name }),
              className: styles.clickableRow,
            })}
            locale={{
              emptyText: rows.length === 0 ? '点击「一键分析」拉取周K数据' : '当前条件下无名单',
            }}
          />
        </Card>

        <Card className={styles.tableCard} title="持仓时钟（需先点回测）" style={{ marginTop: 12 }}>
          <Table<HoldPositionView>
            rowKey="code"
            size="small"
            columns={holdColumns}
            dataSource={backtest?.currentPositions ?? []}
            pagination={false}
            locale={{ emptyText: '点击「验证策略（回测）」后，这里显示模拟持仓的已持周数与卖出窗口' }}
            onRow={(record) => ({
              onClick: () => setChartState({ code: record.code, name: record.name }),
              className: styles.clickableRow,
            })}
          />
        </Card>
      </Content>

      <AddStocksToWatchListModal
        visible={showAddToWatchList}
        stocks={displayRows.map((row) => ({ code: row.code, name: row.name }))}
        onClose={() => setShowAddToWatchList(false)}
      />

      <WeeklyChartModal
        open={chartState !== null}
        code={chartState?.code ?? ''}
        name={chartState?.name ?? ''}
        kline={chartState ? klines.get(chartState.code) ?? [] : []}
        analysis={chartState ? rows.find((row) => row.code === chartState.code) ?? null : null}
        onClose={() => setChartState(null)}
      />
    </Layout>
  );
}

export default WeeklyKPage;
