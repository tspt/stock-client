/**
 * 周线选股页面（挂在「机会分析」下方）
 *
 * 流程：构建股票池 → 拉取前复权周K → 写入 IndexedDB
 *      → 计算单票因子 → 横截面评分 → 条件筛选 → 导出 / 回测验证
 *
 * 与旧版的关键差异：
 * 1. 数据源改为前复权，除权跳空不再污染箱顶与区间涨幅。
 * 2. 评分改为横截面分位，含义是「在股票池里排第几」，不再是固定加分累加。
 * 3. 新增流动性、相对强度、ATR 归一化乖离、止损位等维度。
 * 4. 新增回测：可直接验证当前筛选条件在历史上是否有效。
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
  WEEKLY_PRESETS,
  WEEKLY_STRUCTURE_LABELS,
  YI,
  analyzeWeeklyKlines,
  applyWeeklyFilters,
  backtestWeeklySignals,
  toSignalRule,
  type WeeklyAnalysis,
  type WeeklyBacktestResult,
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
import type { KLineData } from '@/types/stock';
import { WeeklyChartModal } from './WeeklyChartModal';
import { WeeklyBacktestPanel } from './WeeklyBacktestPanel';
import styles from './WeeklyKPage.module.css';

const { Content } = Layout;
const { Text } = Typography;

const MARKET_OPTIONS = [
  { label: '全部A股（推荐）', value: 'all_a' },
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
  { label: '科创板', value: 'star' },
];

const NAME_TYPE_OPTIONS = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

/** 列表最多渲染条数，避免超大表格卡顿 */
const MAX_DISPLAY_ROWS = 500;

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function percentNode(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return <Text type="secondary">-</Text>;
  const color = value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
  return <span style={{ color }}>{value.toFixed(digits)}%</span>;
}

/** 成交额（元）转为「亿元」文本 */
function amountYi(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '-';
  return `${(value / YI).toFixed(1)}亿`;
}

export function WeeklyKPage() {
  const { message } = App.useApp();
  const { allStocks } = useAllStocks();

  const [selectedMarket, setSelectedMarket] = useState<string[]>(['all_a']);
  const [nameType, setNameType] = useState<string>('non_st');
  const [klineCount, setKlineCount] = useState<number>(WEEKLY_KLINE_DEFAULT_COUNT);
  const [forceRefresh, setForceRefresh] = useState(false);

  const [presetKey, setPresetKey] = useState<string>(WEEKLY_PRESETS[0].key);
  const [filters, setFilters] = useState<WeeklyFilterOptions>({ ...WEEKLY_PRESETS[0].filters });
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showAddToWatchList, setShowAddToWatchList] = useState(false);

  const [rows, setRows] = useState<WeeklyAnalysis[]>([]);
  const [klines, setKlines] = useState<Map<string, KLineData[]>>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [progress, setProgress] = useState<WeeklyFetchProgress>({ completed: 0, total: 0, failed: 0 });
  const [failures, setFailures] = useState<Array<{ code: string; name: string; error: string }>>([]);
  const [staleCache, setStaleCache] = useState(0);

  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null);
  const [backtest, setBacktest] = useState<WeeklyBacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);

  const cancelRef = useRef(false);
  const hydratedRef = useRef(false);

  const patchFilters = useCallback((patch: Partial<WeeklyFilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    // 手动改动后不再是任何预设，提示文案同步切换
    setPresetKey('custom');
    setBacktest(null);
  }, []);

  const applyPreset = useCallback((key: string) => {
    const preset = WEEKLY_PRESETS.find((item) => item.key === key);
    setPresetKey(key);
    if (preset) {
      setFilters({ ...preset.filters });
      setBacktest(null);
    }
  }, []);

  const presetHint = useMemo(() => {
    const preset = WEEKLY_PRESETS.find((item) => item.key === presetKey);
    return preset ? preset.hint : '自定义条件：按下方自由组合';
  }, [presetKey]);

  /** 统一的「数据 → 分析」流程 */
  const runAnalysis = useCallback(
    (klineMap: Map<string, KLineData[]>, nameMap: Map<string, string>) => {
      const analyzed = analyzeWeeklyKlines(klineMap, nameMap);
      setRows(analyzed);
    },
    []
  );

  const hydrateFromCache = useCallback(
    async (manual = false): Promise<boolean> => {
      setHydrating(true);
      try {
        const cached = await loadCachedWeeklyKlines();
        setStaleCache(cached.stale);
        if (cached.klines.size === 0) {
          if (manual) {
            message.info('IndexedDB 中暂无可用周K缓存，请点击「一键分析」');
          }
          setUpdatedAt(null);
          return false;
        }

        const nameMap = new Map(cached.names);
        allStocks.forEach((stock) => nameMap.set(stock.code, stock.name));

        setKlines(cached.klines);
        runAnalysis(cached.klines, nameMap);
        setUpdatedAt(cached.updatedAt);
        setBacktest(null);

        if (manual) {
          message.success(`已恢复 ${cached.klines.size} 只周K数据`);
        }
        return true;
      } catch (error) {
        logger.error('[WeeklyKPage] 读取周K缓存失败:', error);
        message.error(`读取周K缓存失败：${error instanceof Error ? error.message : '未知错误'}`);
        return false;
      } finally {
        setHydrating(false);
      }
    },
    [allStocks, message, runAnalysis]
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

  // 股票池：横截面评分要求样本足够大，默认用全部A股
  const stockPool = useMemo(() => {
    if (allStocks.length === 0 || selectedMarket.length === 0) return [];
    const matchers: Array<(pureCode: string) => boolean> = [];
    selectedMarket.forEach((market) => {
      if (market === 'all_a') {
        matchers.push((pureCode) => /^(60|00|30|688)/.test(pureCode));
      } else if (market === 'hs_main') {
        matchers.push((pureCode) => pureCode.startsWith('60') || pureCode.startsWith('00'));
      } else if (market === 'sz_gem') {
        matchers.push((pureCode) => pureCode.startsWith('30'));
      } else if (market === 'star') {
        matchers.push((pureCode) => pureCode.startsWith('688'));
      }
    });
    if (matchers.length === 0) return [];

    return allStocks.filter((stock) => {
      const pureCode = getPureCode(stock.code);
      if (!matchers.some((m) => m(pureCode))) return false;
      const isST = stock.name.includes('ST');
      if (nameType === 'st' && !isST) return false;
      if (nameType === 'non_st' && isST) return false;
      return true;
    });
  }, [allStocks, selectedMarket, nameType]);

  const handleAnalyze = async () => {
    if (stockPool.length === 0) {
      message.warning('当前筛选条件下暂无股票');
      return;
    }

    cancelRef.current = false;
    setLoading(true);
    setFailures([]);
    setBacktest(null);
    setProgress({ completed: 0, total: stockPool.length, failed: 0 });

    if (forceRefresh) {
      apiCache.clear();
    }

    try {
      const result = await fetchWeeklyKlines(stockPool, {
        count: klineCount,
        forceRefresh,
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });

      setKlines(result.klines);
      runAnalysis(result.klines, result.names);
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

  const handleBacktest = async () => {
    if (klines.size === 0) {
      message.warning('暂无周K数据，请先执行分析');
      return;
    }
    setBacktesting(true);
    setBacktest(null);
    // 让出一帧，保证 loading 状态能渲染出来（回测为同步密集计算）
    await new Promise((resolve) => setTimeout(resolve, 30));
    try {
      const result = backtestWeeklySignals(klines, toSignalRule(filters), { sampleSize: 400 });
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

  const displayRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const matched = kw
      ? filteredRows.filter((row) => {
          const pureCode = row.code.replace(/^(sh|sz|bj)/i, '');
          return (
            row.name.toLowerCase().includes(kw) ||
            row.code.toLowerCase().includes(kw) ||
            pureCode.includes(kw)
          );
        })
      : filteredRows;
    return matched.slice().sort((a, b) => b.score - a.score).slice(0, MAX_DISPLAY_ROWS);
  }, [filteredRows, searchKeyword]);

  const validCount = useMemo(() => rows.filter((r) => !r.insufficientData).length, [rows]);

  const handleExportPng = async () => {
    if (displayRows.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const summaryLines = [
      `分析时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `筛选：评分≥${filters.minScore}、周均成交额≥${(filters.minAvgAmount / YI).toFixed(0)}亿${
        filters.minRsRank > 0 ? `、RS分位≥${filters.minRsRank}` : ''
      }${filters.maxPos52w < 100 ? `、52周分位≤${filters.maxPos52w}` : ''}${
        filters.requireUptrend ? '、中期趋势向上' : ''
      }${filters.requireAboveMa20 ? '、站上周MA20' : ''}${
        filters.requirePattern ? '、箱体突破' : ''
      }`,
      `候选 ${displayRows.length} 只（有效样本 ${validCount} 只）`,
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
      setUpdatedAt(null);
      setBacktest(null);
      setStaleCache(0);
      message.success('周K缓存已清空');
    } catch (error) {
      logger.error('[WeeklyKPage] 清空周K缓存失败:', error);
      message.error('清空周K缓存失败');
    }
  };

  const columns = useMemo<ColumnsType<WeeklyAnalysis>>(
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
      { title: '最新价', dataIndex: 'close', width: 84, align: 'right', render: (v: number) => fixed(v) },
      {
        title: '本周涨幅',
        dataIndex: 'weekChangePercent',
        width: 96,
        align: 'right',
        sorter: (a, b) => a.weekChangePercent - b.weekChangePercent,
        render: (v: number) => percentNode(v),
      },
      {
        title: '评分',
        dataIndex: 'score',
        width: 76,
        align: 'right',
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.score - b.score,
        render: (v: number) => <strong style={{ color: v >= 70 ? '#cf1322' : '#595959' }}>{v}</strong>,
      },
      {
        title: (
          <Tooltip title="相对强度分位：个股在股票池中跑赢了多少对手，>50 表示跑赢市场中位数">
            RS分位
          </Tooltip>
        ),
        dataIndex: 'rsRank',
        width: 88,
        align: 'right',
        sorter: (a, b) => (a.rsRank ?? -1) - (b.rsRank ?? -1),
        render: (v: number | undefined) =>
          v === undefined ? (
            '-'
          ) : (
            <span style={{ color: v >= 70 ? '#cf1322' : v <= 30 ? '#389e0d' : '#595959' }}>
              {v.toFixed(0)}
            </span>
          ),
      },
      {
        title: (
          <Tooltip title="当前价在 52 周高低区间中的位置：0=区间最低，100=区间最高">52周位置</Tooltip>
        ),
        dataIndex: 'pos52w',
        width: 96,
        align: 'right',
        sorter: (a, b) => (a.pos52w ?? -1) - (b.pos52w ?? -1),
        render: (v: number | undefined) => (v === undefined ? '-' : v.toFixed(0)),
      },
      {
        title: (
          <Tooltip title="相对周MA20 的乖离，以 ATR 为单位。>2 开始有追高风险，>3.5 通常已透支">
            乖离(ATR)
          </Tooltip>
        ),
        dataIndex: 'extBias',
        width: 100,
        align: 'right',
        sorter: (a, b) => (a.extBias ?? -99) - (b.extBias ?? -99),
        render: (v: number | undefined) =>
          v === undefined ? (
            '-'
          ) : (
            <span style={{ color: v > 2 ? '#cf1322' : '#595959' }}>{v.toFixed(1)}</span>
          ),
      },
      {
        title: (
          <Tooltip title="近 20 周平均周成交额。低于 3 亿时突破信号多为噪音">周均成交额</Tooltip>
        ),
        dataIndex: 'avgAmount20w',
        width: 108,
        align: 'right',
        sorter: (a, b) => (a.avgAmount20w ?? -1) - (b.avgAmount20w ?? -1),
        render: (v: number | undefined) => amountYi(v),
      },
      {
        title: (
          <Tooltip title="ATR20 / 价格，衡量周波动率。数值越大越投机">周波动</Tooltip>
        ),
        dataIndex: 'atrPct',
        width: 88,
        align: 'right',
        sorter: (a, b) => (a.atrPct ?? -1) - (b.atrPct ?? -1),
        render: (v: number | undefined) => (v === undefined ? '-' : `${v.toFixed(1)}%`),
      },
      {
        title: (
          <Tooltip title="参考止损：突破看箱顶，趋势看周MA20，其余看周MA10">止损位</Tooltip>
        ),
        dataIndex: 'stopLoss',
        width: 84,
        align: 'right',
        render: (v: number | undefined) => fixed(v),
      },
      {
        title: (
          <Tooltip title="从当前价到止损位的距离，即这笔交易的风险敞口">风险</Tooltip>
        ),
        dataIndex: 'riskPct',
        width: 80,
        align: 'right',
        render: (v: number | undefined) =>
          v === undefined ? '-' : <span style={{ color: v > 20 ? '#d46b08' : '#595959' }}>{v.toFixed(1)}%</span>,
      },
      {
        title: 'MA20周',
        dataIndex: 'ma20',
        width: 88,
        align: 'right',
        render: (v: number) => fixed(v),
      },
      {
        title: '结构',
        dataIndex: 'structure',
        width: 92,
        render: (v: WeeklyAnalysis['structure']) => (
          <Tag color={v === 'up' ? 'red' : v === 'down' ? 'green' : 'default'}>
            {WEEKLY_STRUCTURE_LABELS[v]}
          </Tag>
        ),
      },
      {
        title: '信号',
        dataIndex: 'signals',
        width: 200,
        render: (_: unknown, row: WeeklyAnalysis) => (
          <Space size={[4, 4]} wrap>
            {row.signals.length === 0 && <Text type="secondary">-</Text>}
            {row.signals.map((label) => (
              <Tag
                key={label}
                color={
                  label.includes('首次') || label.includes('相对强度') ? 'red' : 'blue'
                }
              >
                {label}
              </Tag>
            ))}
          </Space>
        ),
      },
      {
        title: '风险',
        dataIndex: 'warnings',
        width: 220,
        render: (_: unknown, row: WeeklyAnalysis) =>
          row.warnings.length === 0 ? (
            <Text type="secondary">-</Text>
          ) : (
            <Tooltip title={row.warnings.join('；')}>
              <Text type="danger" ellipsis style={{ maxWidth: 200 }}>
                {row.warnings.join('；')}
              </Text>
            </Tooltip>
          ),
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
              value={selectedMarket[0] ?? 'all_a'}
              options={MARKET_OPTIONS}
              style={{ width: 140 }}
              disabled={loading}
              onChange={(value: string) => setSelectedMarket([value])}
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>名称：</span>
            <Select
              value={nameType}
              options={NAME_TYPE_OPTIONS}
              style={{ width: 100 }}
              disabled={loading}
              onChange={(value: string) => setNameType(value)}
            />
          </Space.Compact>

          <Space.Compact className={styles.spaceCompact}>
            <span className={styles.label}>周K根数：</span>
            <InputNumber
              value={klineCount}
              min={120}
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

          <Button
            disabled={loading}
            onClick={() => {
              setFilters({ ...DEFAULT_WEEKLY_FILTERS });
              setPresetKey('custom');
              setBacktest(null);
            }}
          >
            重置筛选
          </Button>
        </Space>
      </div>

      <div className={styles.filterBar}>
        <Space wrap size="middle" align="center">
          <Space size={4}>
            <span className={styles.label}>预设策略：</span>
            <Select
              value={presetKey}
              style={{ width: 170 }}
              onChange={(value: string) => applyPreset(value)}
              options={[
                { value: 'custom', label: '自定义' },
                ...WEEKLY_PRESETS.map((preset) => ({ value: preset.key, label: preset.label })),
              ]}
            />
          </Space>

          <Space size={4}>
            <span className={styles.label}>最小评分：</span>
            <InputNumber
              value={filters.minScore}
              min={0}
              max={100}
              style={{ width: 76 }}
              onChange={(v) => patchFilters({ minScore: typeof v === 'number' ? v : 0 })}
            />
          </Space>

          <Space size={4}>
            <span className={styles.label}>周均成交额≥：</span>
            <InputNumber
              value={Number((filters.minAvgAmount / YI).toFixed(1))}
              min={0}
              max={200}
              step={1}
              style={{ width: 84 }}
              onChange={(v) =>
                patchFilters({ minAvgAmount: typeof v === 'number' ? v * YI : 0 })
              }
            />
            <span className={styles.label}>亿</span>
          </Space>

          <Space size={4}>
            <span className={styles.label}>RS分位≥：</span>
            <InputNumber
              value={filters.minRsRank}
              min={0}
              max={100}
              style={{ width: 76 }}
              onChange={(v) => patchFilters({ minRsRank: typeof v === 'number' ? v : 0 })}
            />
          </Space>

          <Space size={4}>
            <span className={styles.label}>52周位置≤：</span>
            <InputNumber
              value={filters.maxPos52w}
              min={0}
              max={100}
              style={{ width: 76 }}
              onChange={(v) => patchFilters({ maxPos52w: typeof v === 'number' ? v : 100 })}
            />
          </Space>

          <Space size={4}>
            <span className={styles.label}>乖离≤：</span>
            <InputNumber
              value={filters.maxExtBias}
              min={0}
              max={20}
              step={0.5}
              style={{ width: 76 }}
              onChange={(v) => patchFilters({ maxExtBias: typeof v === 'number' ? v : 99 })}
            />
          </Space>

          <Space size={4}>
            <span className={styles.label}>周波动≤：</span>
            <InputNumber
              value={filters.maxAtrPct}
              min={0}
              max={50}
              step={1}
              style={{ width: 76 }}
              onChange={(v) => patchFilters({ maxAtrPct: typeof v === 'number' ? v : 99 })}
            />
            <span className={styles.label}>%</span>
          </Space>

          <Checkbox
            checked={filters.requireUptrend}
            onChange={(e) => patchFilters({ requireUptrend: e.target.checked })}
          >
            中期趋势向上
          </Checkbox>
          <Checkbox
            checked={filters.requireAboveMa20}
            onChange={(e) => patchFilters({ requireAboveMa20: e.target.checked })}
          >
            站上周MA20
          </Checkbox>
          <Checkbox
            checked={filters.requirePattern}
            onChange={(e) => patchFilters({ requirePattern: e.target.checked })}
          >
            箱体突破
          </Checkbox>
        </Space>
        <div className={styles.presetHint}>💡 {presetHint}</div>
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
            message={`已忽略 ${staleCache} 只不兼容的旧周K缓存（非前复权或历史过短），重新分析后即可更新`}
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

        <WeeklyBacktestPanel result={backtest} loading={backtesting} />

        <div className={styles.resultBar}>
          <span>
            命中 <strong>{filteredRows.length}</strong> 只 / 有效样本 {validCount} 只
            {filteredRows.length > MAX_DISPLAY_ROWS ? `（列表仅展示评分前 ${MAX_DISPLAY_ROWS} 只）` : ''}
          </span>
          {updatedAt && (
            <span className={styles.timeText}>数据时间：{new Date(updatedAt).toLocaleString('zh-CN')}</span>
          )}
          <span className={styles.tipText}>
            信号基于「已收盘周」判定，进行中的本周不参与；评分与RS为股票池内横截面分位
          </span>
        </div>

        <Card
          className={styles.tableCard}
          title="周线选股结果"
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
            columns={columns}
            dataSource={displayRows}
            scroll={{ x: 1880, y: 'calc(100vh - 400px)' }}
            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [50, 100, 200] }}
            onRow={(record) => ({
              onClick: () => setChartState({ code: record.code, name: record.name }),
              className: styles.clickableRow,
            })}
            locale={{
              emptyText: rows.length === 0 ? '点击「一键分析」拉取周K数据' : '当前筛选条件下无结果',
            }}
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
