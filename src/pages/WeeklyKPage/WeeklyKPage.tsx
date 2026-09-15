/**
 * 周线选股页面（挂在「机会分析」下方）
 *
 * 流程：按市场/名称筛选股票池 → 接口拉取周K → 写入 IndexedDB → 周线分析 → 列表筛选 → 导出图片
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  analyzeWeeklyKline,
  WEEKLY_ANALYSIS_DEFAULTS,
  WEEKLY_STRUCTURE_LABELS,
  type WeeklyKlineAnalysis,
} from '@/utils/analysis/weeklyKlineAnalysis';
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
import styles from './WeeklyKPage.module.css';

const { Content } = Layout;
const { Text } = Typography;

const MARKET_OPTIONS = [
  { label: '沪深主板', value: 'hs_main' },
  { label: '创业板', value: 'sz_gem' },
];

const NAME_TYPE_OPTIONS = [
  { label: '不限', value: 'all' },
  { label: 'ST', value: 'st' },
  { label: '非ST', value: 'non_st' },
];

/** 列表最多渲染条数，避免超大表格卡顿 */
const MAX_DISPLAY_ROWS = 500;

interface WeeklyFilters {
  minScore: number;
  requireMaBullish: boolean;
  requireAboveMa10: boolean;
  requireMacdGolden: boolean;
  requireBoxBreakout: boolean;
  excludeOverheat: boolean;
  excludeDowntrend: boolean;
  maxBias20: number | undefined;
  /** 20 周涨幅上限（%），用于「低位启动」策略 */
  maxChange20w: number | undefined;
}

const DEFAULT_FILTERS: WeeklyFilters = {
  minScore: 30,
  requireMaBullish: false,
  requireAboveMa10: true,
  requireMacdGolden: false,
  requireBoxBreakout: false,
  excludeOverheat: true,
  excludeDowntrend: false,
  maxBias20: undefined,
  maxChange20w: undefined,
};

/** 预设策略：把一篮子条件打包，避免逐个勾选 */
interface WeeklyPreset {
  key: string;
  label: string;
  hint: string;
  filters: WeeklyFilters;
}

const PRESETS: WeeklyPreset[] = [
  {
    key: 'trend',
    label: '稳健趋势（推荐）',
    hint: '均线多头 + 站上周MA10 + 未过热：适合中线持有，周收盘不破周MA10 就拿着',
    filters: {
      minScore: 45,
      requireMaBullish: true,
      requireAboveMa10: true,
      requireMacdGolden: false,
      requireBoxBreakout: false,
      excludeOverheat: true,
      excludeDowntrend: true,
      maxBias20: 25,
      maxChange20w: undefined,
    },
  },
  {
    key: 'breakout',
    label: '周线突破',
    hint: '长期箱体（≥10周、振幅≤30%）放量突破：弹性最大，但不要在突破周最高价追，等回踩箱顶',
    filters: {
      minScore: 40,
      requireMaBullish: false,
      requireAboveMa10: true,
      requireMacdGolden: false,
      requireBoxBreakout: true,
      excludeOverheat: true,
      excludeDowntrend: true,
      maxBias20: 30,
      maxChange20w: undefined,
    },
  },
  {
    key: 'macd',
    label: 'MACD转强',
    hint: '周线 MACD 刚金叉（零轴上方最佳）：趋势启动早期，仓位宜小，需日线确认再动手',
    filters: {
      minScore: 35,
      requireMaBullish: false,
      requireAboveMa10: true,
      requireMacdGolden: true,
      requireBoxBreakout: false,
      excludeOverheat: true,
      excludeDowntrend: false,
      maxBias20: undefined,
      maxChange20w: undefined,
    },
  },
  {
    key: 'low',
    label: '低位启动',
    hint: '20 周涨幅≤30%、刚站上周MA10：位置低、回撤空间小，适合埋伏等轮动',
    filters: {
      minScore: 35,
      requireMaBullish: false,
      requireAboveMa10: true,
      requireMacdGolden: false,
      requireBoxBreakout: false,
      excludeOverheat: true,
      excludeDowntrend: true,
      maxBias20: 20,
      maxChange20w: 30,
    },
  },
  {
    key: 'all',
    label: '全部（按评分排序）',
    hint: '不做形态限制，只按评分排名：适合人工翻看前 30 名',
    filters: {
      minScore: 0,
      requireMaBullish: false,
      requireAboveMa10: false,
      requireMacdGolden: false,
      requireBoxBreakout: false,
      excludeOverheat: false,
      excludeDowntrend: false,
      maxBias20: undefined,
      maxChange20w: undefined,
    },
  },
];

function fixed(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '-' : value.toFixed(digits);
}

function percentNode(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return <Text type="secondary">-</Text>;
  const color = value > 0 ? '#cf1322' : value < 0 ? '#389e0d' : '#595959';
  return <span style={{ color }}>{value.toFixed(digits)}%</span>;
}

export function WeeklyKPage() {
  const { message } = App.useApp();
  const { allStocks } = useAllStocks();

  const [selectedMarket, setSelectedMarket] = useState<string[]>(['hs_main']);
  const [nameType, setNameType] = useState<string>('non_st');
  const [klineCount, setKlineCount] = useState<number>(WEEKLY_KLINE_DEFAULT_COUNT);
  const [forceRefresh, setForceRefresh] = useState(false);

  const [filters, setFilters] = useState<WeeklyFilters>(DEFAULT_FILTERS);
  const [presetKey, setPresetKey] = useState<string>('custom');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showAddToWatchList, setShowAddToWatchList] = useState(false);

  const [rows, setRows] = useState<WeeklyKlineAnalysis[]>([]);
  const [klines, setKlines] = useState<Map<string, KLineData[]>>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [progress, setProgress] = useState<WeeklyFetchProgress>({ completed: 0, total: 0, failed: 0 });
  const [failures, setFailures] = useState<Array<{ code: string; name: string; error: string }>>([]);

  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null);
  const cancelRef = useRef(false);
  const hydratedRef = useRef(false);

  const patchFilters = useCallback((patch: Partial<WeeklyFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPresetKey('custom');
  }, []);

  const applyPreset = useCallback((key: string) => {
    const preset = PRESETS.find((item) => item.key === key);
    setPresetKey(key);
    if (preset) {
      setFilters({ ...preset.filters });
    }
  }, []);

  const presetHint = useMemo(() => {
    const preset = PRESETS.find((item) => item.key === presetKey);
    return preset ? preset.hint : '自定义条件：按下方勾选自由组合';
  }, [presetKey]);

  /**
   * 从 IndexedDB 恢复周K缓存并重新计算分析结果。
   * 返回是否成功载入数据（供挂载时的防重入判断使用）。
   */
  const hydrateFromCache = useCallback(
    async (manual = false): Promise<boolean> => {
      setHydrating(true);
      try {
        const cached = await loadCachedWeeklyKlines();
        if (cached.klines.size === 0) {
          if (manual) {
            message.info('IndexedDB 中暂无周K缓存，请先点击「一键分析」');
          }
          setUpdatedAt(null);
          return false;
        }

        const nameMap = new Map(cached.names);
        allStocks.forEach((stock) => nameMap.set(stock.code, stock.name));

        const analyzed: WeeklyKlineAnalysis[] = [];
        cached.klines.forEach((kline, code) => {
          analyzed.push(analyzeWeeklyKline(code, nameMap.get(code) || '', kline));
        });
        const validRows = analyzed.filter((row) => !row.insufficientData);

        setKlines(cached.klines);
        setRows(validRows);
        setUpdatedAt(cached.updatedAt);

        if (manual) {
          message.success(`已从 IndexedDB 恢复 ${validRows.length} 只（缓存共 ${cached.klines.size} 只）`);
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
    [allStocks, message]
  );

  // 挂载时自动恢复周K缓存。
  // 注意：StrictMode 下 effect 会「挂载→卸载→再挂载」，
  // 因此不能在异步开始前就置位 hydratedRef，否则被取消的那次会把真正生效的那次挡掉。
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (hydratedRef.current) return;
      const loaded = await hydrateFromCache();
      if (cancelled) return;
      if (loaded) {
        hydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateFromCache]);

  // 股票池
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

      const analyzed: WeeklyKlineAnalysis[] = [];
      result.klines.forEach((kline, code) => {
        analyzed.push(analyzeWeeklyKline(code, result.names.get(code) || '', kline));
      });

      setKlines(result.klines);
      setRows(analyzed.filter((row) => !row.insufficientData));
      setUpdatedAt(result.updatedAt);
      setFailures(result.failures);

      if (result.persistFailed) {
        message.warning('周K写入 IndexedDB 失败，下次打开页面将无法自动恢复（结果仍可用于本次查看）');
      }

      if (result.cancelled) {
        message.info(`已取消，已完成 ${result.klines.size} 只`);
      } else {
        message.success(
          `周线分析完成：${result.klines.size} 只${result.failures.length > 0 ? `，失败 ${result.failures.length} 只` : ''}`
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

  const filteredRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.insufficientData) return false;
      if (row.score < filters.minScore) return false;
      if (filters.requireMaBullish && !row.maBullish) return false;
      if (filters.requireAboveMa10 && !row.aboveMa10) return false;
      if (filters.requireMacdGolden && !row.macdGoldenCross) return false;
      if (filters.requireBoxBreakout && !row.boxBreakout) return false;
      if (
        filters.excludeOverheat &&
        row.change20w !== undefined &&
        row.change20w > WEEKLY_ANALYSIS_DEFAULTS.overheatChange20w
      ) {
        return false;
      }
      if (filters.excludeDowntrend && row.structure === 'lower_highs') return false;
      if (
        filters.maxBias20 !== undefined &&
        row.bias20 !== undefined &&
        row.bias20 > filters.maxBias20
      ) {
        return false;
      }
      if (
        filters.maxChange20w !== undefined &&
        row.change20w !== undefined &&
        row.change20w > filters.maxChange20w
      ) {
        return false;
      }
      if (kw) {
        const pureCode = row.code.replace(/^(sh|sz|bj)/i, '');
        if (
          !row.name.toLowerCase().includes(kw) &&
          !row.code.toLowerCase().includes(kw) &&
          !pureCode.includes(kw)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filters, searchKeyword]);

  const displayRows = useMemo(
    () => filteredRows.slice().sort((a, b) => b.score - a.score).slice(0, MAX_DISPLAY_ROWS),
    [filteredRows]
  );

  const handleExportPng = async () => {
    if (displayRows.length === 0) {
      message.warning('没有可导出的数据');
      return;
    }

    const summaryLines = [
      `分析时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}`,
      `导出时间：${new Date().toLocaleString('zh-CN')}`,
      `筛选：评分≥${filters.minScore}${
        filters.requireMaBullish ? '、均线多头' : ''
      }${filters.requireAboveMa10 ? '、站上周MA10' : ''}${
        filters.requireMacdGolden ? '、MACD金叉' : ''
      }${filters.requireBoxBreakout ? '、箱体突破' : ''}${
        filters.excludeOverheat ? '、排除20周过热' : ''
      }${filters.excludeDowntrend ? '、排除下降结构' : ''}`,
      `候选 ${displayRows.length} 只（全部有效样本 ${rows.length} 只）`,
    ];

    try {
      await exportWeeklyResultToPng(displayRows, {
        fileNamePrefix: '周线选股',
        summaryLines,
      });
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
      message.success('周K缓存已清空');
    } catch (error) {
      logger.error('[WeeklyKPage] 清空周K缓存失败:', error);
      message.error('清空周K缓存失败');
    }
  };

  const columns = useMemo<ColumnsType<WeeklyKlineAnalysis>>(
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
      { title: 'MA5周', dataIndex: 'ma5', width: 84, align: 'right', render: (v: number) => fixed(v) },
      { title: 'MA10周', dataIndex: 'ma10', width: 88, align: 'right', render: (v: number) => fixed(v) },
      { title: 'MA20周', dataIndex: 'ma20', width: 88, align: 'right', render: (v: number) => fixed(v) },
      {
        title: '量比5周',
        dataIndex: 'volumeRatio5',
        width: 92,
        align: 'right',
        sorter: (a, b) => (a.volumeRatio5 ?? -1) - (b.volumeRatio5 ?? -1),
        render: (v: number) => fixed(v),
      },
      {
        title: '20周涨幅',
        dataIndex: 'change20w',
        width: 100,
        align: 'right',
        sorter: (a, b) => (a.change20w ?? -999) - (b.change20w ?? -999),
        render: (v: number) => percentNode(v, 1),
      },
      {
        title: '偏离MA20',
        dataIndex: 'bias20',
        width: 100,
        align: 'right',
        render: (v: number) => percentNode(v, 1),
      },
      {
        title: '结构',
        dataIndex: 'structure',
        width: 90,
        render: (v: WeeklyKlineAnalysis['structure']) => (
          <Tag color={v === 'higher_highs' ? 'red' : v === 'lower_highs' ? 'green' : 'default'}>
            {WEEKLY_STRUCTURE_LABELS[v]}
          </Tag>
        ),
      },
      {
        title: '评分',
        dataIndex: 'score',
        width: 80,
        align: 'right',
        defaultSortOrder: 'descend',
        sorter: (a, b) => a.score - b.score,
        render: (v: number) => <strong style={{ color: v >= 60 ? '#cf1322' : '#595959' }}>{v}</strong>,
      },
      {
        title: '周线信号',
        dataIndex: 'signals',
        render: (_: unknown, row: WeeklyKlineAnalysis) => (
          <Space size={[4, 4]} wrap>
            {row.signals.length === 0 && <Text type="secondary">-</Text>}
            {row.signals.map((signal) => (
              <Tooltip key={signal.label} title={`${signal.detail}（${signal.score > 0 ? '+' : ''}${signal.score}）`}>
                <Tag color={signal.score >= 15 ? 'red' : signal.score >= 8 ? 'volcano' : 'blue'}>
                  {signal.label}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        ),
      },
      {
        title: '风险',
        dataIndex: 'warnings',
        width: 220,
        render: (_: unknown, row: WeeklyKlineAnalysis) =>
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
              value={selectedMarket[0] ?? 'hs_main'}
              options={MARKET_OPTIONS}
              style={{ width: 120 }}
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
              min={60}
              max={800}
              step={20}
              style={{ width: 100 }}
              disabled={loading}
              onChange={(v) => setKlineCount(typeof v === 'number' && isFinite(v) ? Math.floor(v) : WEEKLY_KLINE_DEFAULT_COUNT)}
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
                if (key === 'watch') {
                  setShowAddToWatchList(true);
                } else if (key === 'record') {
                  void handleAddToRecord();
                }
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

          <Button disabled={loading} onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
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
                ...PRESETS.map((preset) => ({ value: preset.key, label: preset.label })),
              ]}
            />
          </Space>
          <Space size={4}>
            <span className={styles.label}>最小评分：</span>
            <InputNumber
              value={filters.minScore}
              min={0}
              max={100}
              style={{ width: 80 }}
              onChange={(v) => patchFilters({ minScore: typeof v === 'number' ? v : 0 })}
            />
          </Space>
          <Checkbox
            checked={filters.requireAboveMa10}
            onChange={(e) => patchFilters({ requireAboveMa10: e.target.checked })}
          >
            站上周MA10
          </Checkbox>
          <Checkbox
            checked={filters.requireMaBullish}
            onChange={(e) => patchFilters({ requireMaBullish: e.target.checked })}
          >
            均线多头排列
          </Checkbox>
          <Checkbox
            checked={filters.requireMacdGolden}
            onChange={(e) => patchFilters({ requireMacdGolden: e.target.checked })}
          >
            MACD金叉
          </Checkbox>
          <Checkbox
            checked={filters.requireBoxBreakout}
            onChange={(e) => patchFilters({ requireBoxBreakout: e.target.checked })}
          >
            箱体突破
          </Checkbox>
          <Checkbox
            checked={filters.excludeOverheat}
            onChange={(e) => patchFilters({ excludeOverheat: e.target.checked })}
          >
            排除20周涨幅&gt;{WEEKLY_ANALYSIS_DEFAULTS.overheatChange20w}%
          </Checkbox>
          <Checkbox
            checked={filters.excludeDowntrend}
            onChange={(e) => patchFilters({ excludeDowntrend: e.target.checked })}
          >
            排除下降结构
          </Checkbox>
          <Space size={4}>
            <span className={styles.label}>最大偏离MA20：</span>
            <InputNumber
              value={filters.maxBias20}
              min={0}
              max={200}
              style={{ width: 80 }}
              placeholder="不限"
              onChange={(v) => patchFilters({ maxBias20: typeof v === 'number' ? v : undefined })}
            />
          </Space>
          <Space size={4}>
            <span className={styles.label}>20周涨幅≤：</span>
            <InputNumber
              value={filters.maxChange20w}
              min={0}
              max={300}
              style={{ width: 80 }}
              placeholder="不限"
              onChange={(v) => patchFilters({ maxChange20w: typeof v === 'number' ? v : undefined })}
            />
          </Space>
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

        {failures.length > 0 && (
          <Card className={styles.errorCard} size="small">
            <Text type="danger">
              失败 {failures.length} 只：{failures.slice(0, 8).map((f) => f.code).join('、')}
              {failures.length > 8 ? ' 等' : ''}
            </Text>
          </Card>
        )}

        <div className={styles.resultBar}>
          <span>
            命中 <strong>{filteredRows.length}</strong> 只 / 有效样本 {rows.length} 只
            {filteredRows.length > MAX_DISPLAY_ROWS ? `（列表仅展示评分前 ${MAX_DISPLAY_ROWS} 只）` : ''}
          </span>
          {updatedAt && (
            <span className={styles.timeText}>数据时间：{new Date(updatedAt).toLocaleString('zh-CN')}</span>
          )}
          <span className={styles.tipText}>
            提示：所有信号基于「已收盘周」判定，进行中的本周不参与信号；点击行可查看周K图
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
          <Table<WeeklyKlineAnalysis>
            rowKey="code"
            size="small"
            columns={columns}
            dataSource={displayRows}
            scroll={{ x: 1560, y: 'calc(100vh - 400px)' }}
            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [50, 100, 200] }}
            onRow={(record) => ({
              onClick: () => setChartState({ code: record.code, name: record.name }),
              className: styles.clickableRow,
            })}
            locale={{ emptyText: rows.length === 0 ? '点击「一键分析」拉取周K数据' : '当前筛选条件下无结果' }}
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
