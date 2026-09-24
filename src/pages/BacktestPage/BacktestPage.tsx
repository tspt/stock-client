/**
 * 历史回测页面
 * - 基于当前 stockHistory 重新扫描历史好买点与场景
 * - 基于当前 stockHistory 扫描最新交易日高 lift 场景
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Layout,
  Card,
  Button,
  Typography,
  App,
  Space,
  Statistic,
  Row,
  Col,
  Checkbox,
  Table,
  Tag,
  Tabs,
  Select,
  Input,
  InputNumber,
  Tooltip,
  DatePicker,
  Popover,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, DatabaseOutlined, ExportOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import {
  getStocksHistory,
  invalidateStocksHistoryCache,
  type StockHistoryRecord,
} from '@/utils/storage/opportunityIndexedDB';
import { getAllStockRecords } from '@/services/opportunity/recordService';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
import { DailyChartModal } from '@/pages/OpportunityPage/DailyChartModal';
import {
  findDefaultTableSorter,
  sortRowsByTableSorter,
  type ActiveTableSorter,
} from '@/utils/sort/tableSort';
import {
  HIGH_LIFT_SCENARIOS,
  SCENARIOS,
  scanHistoricalBuyPoints,
  scanLatestScenarioSignals,
  type BuyPointSignal,
  type ReturnSnapshot,
  type ScenarioId,
} from '@/utils/analysis/buypointScenario';
import {
  buildTrackedLatestSignals,
  collectReturnValues,
  compareTrackedSignals,
  getTrackingStatus,
  normalizeDateKey,
  RETURN_HORIZON_KEYS,
  type LatestBuyPointFile,
  type TrackedLatestSignal,
  type TrackedLatestSignalBase,
  type TrackingStatus,
} from '@/utils/analysis/latestSignalTracking';
import { fetchThsHotRank } from '@/services/hot/ths-hot-rank-service';
import {
  getLocalDateString,
  readHotRankDayCodes,
} from '@/utils/storage/hotRankFiles';
import {
  exportBacktestSignalsToJson,
  resolveHistoryExportDate,
  resolveLatestExportDate,
} from '@/utils/export/backtestExportUtils';
import { exportStockNamesToPng } from '@/utils/export/stockNamesExportUtils';
import { logger } from '@/utils/business/logger';
import { OPPORTUNITY_INDUSTRY_GROUPS } from '@/utils/config/opportunityAnalysisDefaults';
import { StockConceptTags, StockFeatureTag, StockStatusTag } from '@/components/common/Tags';
import {
  getMappedConcepts,
  getMappedIndustry,
  loadSectorStockMapping,
  normalizeSectorStockCode,
  type SectorInfo,
} from '@/services/stocks/sectorMapping';
import { formatKLineDate } from '@/utils/analysis/asOfKline';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

/** 表格滚动区为表头与分页预留的高度 */
const TABLE_SCROLL_Y_RESERVE = 72;

/** 按需加载买点文件时，单批读取的日期数（避免一次性 parse 上百个 JSON 卡住主进程） */
const LOAD_DATES_CHUNK_SIZE = 20;


function isSTStock(name: string): boolean {
  return name.includes('ST');
}

function matchBcQualityFilter(
  item: {
    oddsTier?: 'S' | 'A' | 'B' | 'C';
    features?: { pullbackFromHigh20?: number | null; limitUpCount5?: number };
  },
  enabled: boolean
): boolean {
  if (!enabled) return true;
  if (item.oddsTier !== 'B' && item.oddsTier !== 'C') return true;
  const pullback = item.features?.pullbackFromHigh20;
  const boards = item.features?.limitUpCount5 ?? 0;
  if (pullback == null) return false;
  return pullback > 18 || (pullback > 12 && boards >= 1);
}

/**
 * 名称兜底比较。
 * 不用 localeCompare('zh-CN')：中文 collation 单次调用是微秒级，
 * 在几万行的排序比较器里会被调用上百万次，是明显的瓶颈；
 * 这里只是最终兜底排序，按码位比较即可保证稳定、确定。
 */
function compareName(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function matchIndustryGroupFilter(
  industryCode: string | undefined,
  selectedCodes: Set<string>,
  invert: boolean
): boolean {
  if (selectedCodes.size === 0) return true;
  const hasIndustry = !!industryCode && selectedCodes.has(industryCode);
  if (invert) return !hasIndustry;
  return hasIndustry;
}

function filterHistories(histories: StockHistoryRecord[], excludeST: boolean): StockHistoryRecord[] {
  if (!excludeST) return histories;
  return histories.filter((h) => !isSTStock(h.name || ''));
}

function returnText(value: number | null): string {
  return value == null ? '' : `${value.toFixed(2)}%`;
}

function returnColor(value: number | null): string | undefined {
  if (value == null) return undefined;
  if (value > 5) return '#cf1322';
  if (value > 0) return '#d46b08';
  return '#389e0d';
}

function getLatestDateSummary(histories: StockHistoryRecord[]): {
  dominantDate: string;
  dominantCount: number;
} {
  const counts = new Map<string, number>();
  histories.forEach((history) => {
    const latest = history.dailyLines?.[history.dailyLines.length - 1];
    if (!latest) return;
    const date = new Date(latest.time);
    const key = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  let dominantDate = '';
  let dominantCount = 0;
  counts.forEach((count, date) => {
    if (count > dominantCount) {
      dominantDate = date;
      dominantCount = count;
    }
  });

  return { dominantDate, dominantCount };
}

/** 买点追踪日期筛选：最近 N 个信号日；all 表示不限 */
const TRACKING_DATE_RANGE_LIMIT: Record<string, number | 'all'> = {
  today: 1,
  recent2: 2,
  recent3: 3,
  recent5: 5,
  recent6: 6,
  recent12: 12,
  recent18: 18,
  recent24: 24,
  recent30: 30,
  recent36: 36,
  recent42: 42,
  recent48: 48,
  recent54: 54,
  all: 'all',
};

/** 所选自然月内，K 线出现过的全部交易日 YYYY-MM-DD（升序） */
function resolveTradingDaysInMonth(
  histories: StockHistoryRecord[],
  yearMonth: string
): string[] {
  const dates = new Set<string>();
  const monthStart = `${yearMonth}-01`;
  histories.forEach((history) => {
    const lines = history.dailyLines || [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const d = formatKLineDate(lines[i].time);
      if (d.startsWith(yearMonth)) {
        dates.add(d);
        continue;
      }
      if (d < monthStart) break;
    }
  });
  return Array.from(dates).sort();
}

const scenarioOptions = [
  { label: '全部场景', value: 'all' },
  ...SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
];

const highLiftIds = new Set(HIGH_LIFT_SCENARIOS.map((s) => s.id));

export function BacktestPage() {
  const { message } = App.useApp();
  /** 全量股票历史（含 dailyLines）：页面内只从 IndexedDB 读一次，所有消费者共用 */
  const [allHistories, setAllHistories] = useState<StockHistoryRecord[]>([]);
  const historiesPromiseRef = useRef<Promise<StockHistoryRecord[]> | null>(null);
  const [excludeST, setExcludeST] = useState(true);
  const [loadingCount, setLoadingCount] = useState(false);
  const [scanningHistory, setScanningHistory] = useState(false);
  const [scanningLatest, setScanningLatest] = useState(false);
  const [syncingAllLatest, setSyncingAllLatest] = useState(false);
  const [industryMapping, setIndustryMapping] = useState<Map<string, SectorInfo>>(new Map());
  const [conceptMapping, setConceptMapping] = useState<Map<string, SectorInfo[]>>(new Map());
  const [historySignals, setHistorySignals] = useState<BuyPointSignal[]>([]);
  const [historyScenarioFilter, setHistoryScenarioFilter] = useState<string>('all');
  const [trackingScenarioFilter, setTrackingScenarioFilter] = useState<string>('all');
  const [trackingOddsTiers, setTrackingOddsTiers] = useState<Array<'S' | 'A' | 'B' | 'C'>>(['S', 'A', 'B', 'C']);
  const [trackingBcQualityFilter, setTrackingBcQualityFilter] = useState(true);
  const [trackingDateRange, setTrackingDateRange] = useState<string>('today');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<TrackingStatus[]>([
    'tracking',
    'passed',
  ]);
  const [trackingIntersectionFilters, setTrackingIntersectionFilters] = useState<string[]>([]);
  const [trackingIndustryGroupLabels, setTrackingIndustryGroupLabels] = useState<string[]>([]);
  const [trackingIndustryInvert, setTrackingIndustryInvert] = useState(true);
  /** 输入值（立即回显）与生效值（防抖，避免每次按键都重算全表） */
  const [trackingThresholdInput, setTrackingThresholdInput] = useState(5);
  const [trackingThreshold, setTrackingThreshold] = useState(5);
  const [trackingMinHitCount, setTrackingMinHitCount] = useState(2);
  /** 目录下可用的买点日期（YYYY-MM-DD，降序）——只列目录，不解析内容 */
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  /** 已加载信号行，按信号日分组；key 存在即视为已加载（空数组同样代表已加载） */
  const [rowsByDate, setRowsByDate] = useState<Map<string, TrackedLatestSignalBase[]>>(new Map());
  const [loadingTracking, setLoadingTracking] = useState(false);
  /** 「追踪统计」浮层是否展开：归因统计较重，只在展开时才算 */
  const [statsPopoverOpen, setStatsPopoverOpen] = useState(false);
  const [showAddTrackingLatestModal, setShowAddTrackingLatestModal] = useState(false);
  /** 点击表格行：展示该股日K与筹码分布弹窗 */
  const [chartState, setChartState] = useState<{ code: string; name: string } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<'tracking' | 'history'>('tracking');
  const [tablePageSize, setTablePageSize] = useState(100);
  /** 表格当前页（受控）：弹窗内 ← / → 切换股票时同步翻页 */
  const [tablePage, setTablePage] = useState(1);
  /** 表格当前排序状态（点表头后由 onChange 写入）；null = 还没点过，用列的 defaultSortOrder 兜底 */
  const [tableSorter, setTableSorter] = useState<ActiveTableSorter | null>(null);
  const [tableScrollY, setTableScrollY] = useState(360);
  /** 扫描最新的截止月 YYYY-MM；空=用各股日K最后一根 */
  const [asOfMonth, setAsOfMonth] = useState<string | null>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  // 切换 Tab 后列定义不同，旧的排序状态失效：回到「未点过表头」，由列的 defaultSortOrder 兜底
  useEffect(() => {
    setTableSorter(null);
    setTablePage(1);
  }, [activeTab]);

  useEffect(() => {
    const loadSectorMapping = async () => {
      const { industryByCode, conceptsByCode } = await loadSectorStockMapping();
      setIndustryMapping(industryByCode);
      setConceptMapping(conceptsByCode);
    };

    loadSectorMapping();
  }, []);

  /**
   * 全量行情只从 IndexedDB 读一次，页面内所有消费者共用同一个 Promise。
   * 原先「刷新统计」与「加载买点追踪」各调一次 getAll()，首屏会有两份全量日线并存，
   * 内存峰值翻倍且重复付出结构化克隆的代价。
   */
  const loadAllHistories = useCallback((force = false) => {
    // force 时要真正重读：先失效 IndexedDB 层的跨页面缓存
    if (force) {
      invalidateStocksHistoryCache();
      historiesPromiseRef.current = null;
    }
    if (!force && historiesPromiseRef.current) {
      return historiesPromiseRef.current;
    }
    const promise = getStocksHistory([]);
    promise.catch(() => {
      // 失败则丢弃缓存，下次可重试
      if (historiesPromiseRef.current === promise) {
        historiesPromiseRef.current = null;
      }
    });
    historiesPromiseRef.current = promise;
    return promise;
  }, []);

  const readFilteredHistories = useCallback(async () => {
    const all = await loadAllHistories();
    setAllHistories(all);
    const histories = filterHistories(all, excludeST);
    return { allHistories: all, histories };
  }, [excludeST, loadAllHistories]);

  const refreshHistoryCount = useCallback(
    async (force = false) => {
      try {
        setLoadingCount(true);
        const list = await loadAllHistories(force);
        setAllHistories(list);
      } catch (error) {
        logger.error('[BacktestPage] 读取 stockHistory 数量失败:', error);
        message.error('读取本地历史数据失败');
      } finally {
        setLoadingCount(false);
      }
    },
    [loadAllHistories, message]
  );

  useEffect(() => {
    void refreshHistoryCount();
  }, [refreshHistoryCount]);

  /** 顶部统计：由已加载的全量数据派生，切换「排除ST」不再触发重新读库 */
  const filteredHistories = useMemo(
    () => filterHistories(allHistories, excludeST),
    [allHistories, excludeST]
  );
  const latestDateSummary = useMemo(
    () => getLatestDateSummary(filteredHistories),
    [filteredHistories]
  );
  const totalCount = allHistories.length;
  const exportCount = filteredHistories.length;

  useEffect(() => {
    if (trackingThresholdInput === trackingThreshold) return;
    const timer = setTimeout(() => setTrackingThreshold(trackingThresholdInput), 300);
    return () => clearTimeout(timer);
  }, [trackingThreshold, trackingThresholdInput]);

  const handleScanHistoricalBuyPoints = async () => {
    try {
      setScanningHistory(true);
      message.info('正在基于当前 stockHistory 扫描历史好买点...');
      const { histories } = await readFilteredHistories();
      const signals = scanHistoricalBuyPoints(histories, {
        minHitCount: 2,
        threshold: 5,
        includeOther: true,
      }).sort((a, b) => b.timestamp - a.timestamp);

      const data = signals.map((item) => ({
        ...item,
        industry: item.industry || getMappedIndustry(item.code, industryMapping) || null,
        concepts: getMappedConcepts(item.code, conceptMapping),
      }));

      setHistorySignals(data);
      setActiveTab('history');

      if (data.length === 0) {
        message.info('当前未扫描到符合条件的历史好买点');
        return;
      }

      if (!window.electronAPI?.exportBacktestSignalsFile) {
        message.warning(`扫描完成，共 ${data.length} 条，但自动导出快照不可用（需在 Electron 环境中运行）`);
        return;
      }

      try {
        const fileBaseName = resolveHistoryExportDate(latestDateSummary.dominantDate);
        const meta = {
          tab: 'history' as const,
          autoExport: true,
          minHitCount: 2,
          threshold: 5,
          horizons: 'd1-d6',
          excludeST,
          latestDate: latestDateSummary.dominantDate || null,
          fileBaseName,
        };
        const filePath = await exportBacktestSignalsToJson({
          kind: 'history',
          data,
          fileBaseName,
          meta,
        });
        message.success(`已保存历史好买点快照 ${data.length} 条到 ${filePath}`);
      } catch (exportError) {
        logger.error('[BacktestPage] 扫描历史后导出快照失败:', exportError);
        message.error('导出快照失败: ' + (exportError as Error).message);
      }
    } catch (error) {
      logger.error('[BacktestPage] 扫描历史好买点失败:', error);
      message.error('扫描历史好买点失败: ' + (error as Error).message);
    } finally {
      setScanningHistory(false);
    }
  };

  /** 把若干买点文件转成追踪行：共用已缓存的行情，热门榜并发读取（原来是一次次串行 await） */
  const buildRowsForFiles = useCallback(
    async (files: LatestBuyPointFile[], silent: boolean) => {
      const [histories, records] = await Promise.all([
        loadAllHistories(),
        getAllStockRecords(),
      ]);

      const todayKey = getLocalDateString();
      const hotRankCodeMap = new Map<string, Set<string>>();
      await Promise.all(
        files.map(async (file) => {
          const dateKey = normalizeDateKey(file.fileBaseName);
          try {
            let codes = await readHotRankDayCodes(dateKey);
            if (codes == null && dateKey === todayKey) {
              try {
                await fetchThsHotRank('day');
                codes = await readHotRankDayCodes(dateKey);
              } catch (fetchError) {
                logger.warn('[BacktestPage] 当天热门榜补数失败:', fetchError);
                if (!silent) {
                  message.warning('当天热门榜拉取失败，热门榜标记可能为空');
                }
                codes = new Set();
              }
            }
            hotRankCodeMap.set(dateKey, codes ?? new Set());
          } catch (readError) {
            logger.warn('[BacktestPage] 读取热门榜失败:', { dateKey, readError });
            hotRankCodeMap.set(dateKey, new Set());
          }
        })
      );

      return buildTrackedLatestSignals(files, histories, records, hotRankCodeMap);
    },
    [loadAllHistories, message]
  );

  /** 只加载指定日期的买点文件（按需加载：默认只有今天/最近一个交易日） */
  const loadTrackingDates = useCallback(
    async (dates: string[], silent = true) => {
      if (dates.length === 0) return;
      if (!window.electronAPI?.readLatestBuyPointFiles) {
        if (!silent) {
          message.error('读取最新买点文件不可用（需在 Electron 环境中运行并重启应用）');
        }
        return;
      }

      const showProgress = dates.length > LOAD_DATES_CHUNK_SIZE;

      try {
        setLoadingTracking(true);
        let totalRows = 0;

        // 分批读取：切到「全部日期」时一次性 parse 上百个 JSON 会长时间阻塞主进程
        for (let i = 0; i < dates.length; i += LOAD_DATES_CHUNK_SIZE) {
          const chunk = dates.slice(i, i + LOAD_DATES_CHUNK_SIZE);
          if (showProgress) {
            message.loading({
              key: 'load_buy_point_dates',
              content: `正在加载买点文件 [${Math.min(i + chunk.length, dates.length)}/${dates.length}]...`,
            });
          }
          const result = await window.electronAPI.readLatestBuyPointFiles({ dates: chunk });
          if (!result.success) {
            if (!silent) {
              message.error('读取最新买点文件失败: ' + (result.error || '未知错误'));
            }
            return;
          }

          const files = (result.files || []) as unknown as LatestBuyPointFile[];
          if (files.length === 0 && !silent) {
            message.warning('暂无最新买点文件，请先扫描并导出最新买点');
          }

          const rows = await buildRowsForFiles(files, silent);
          totalRows += rows.length;

          const grouped = new Map<string, TrackedLatestSignalBase[]>();
          // 先占位：即使某天没有文件也记为已加载，避免重复请求
          chunk.forEach((dateKey) => grouped.set(dateKey, []));
          rows.forEach((row) => {
            const list = grouped.get(row.signalDateKey);
            if (list) {
              list.push(row);
            } else {
              grouped.set(row.signalDateKey, [row]);
            }
          });

          setRowsByDate((prev) => {
            const next = new Map(prev);
            grouped.forEach((list, dateKey) => next.set(dateKey, list));
            return next;
          });
        }

        if (showProgress) {
          message.destroy('load_buy_point_dates');
        }
        if (!silent) {
          message.success(`买点追踪已更新，共读取 ${dates.length} 个日期、${totalRows} 条信号`);
        }
      } catch (error) {
        logger.error('[BacktestPage] 更新买点追踪失败:', error);
        if (showProgress) {
          message.destroy('load_buy_point_dates');
        }
        if (!silent) {
          message.error('更新买点追踪失败: ' + (error as Error).message);
        }
      } finally {
        setLoadingTracking(false);
      }
    },
    [buildRowsForFiles, message]
  );

  /** 刷新可选日期列表：只列目录，不解析 JSON，代价极低 */
  const refreshAvailableDates = useCallback(async () => {
    if (!window.electronAPI?.listLatestBuyPointDates) return [];
    try {
      const result = await window.electronAPI.listLatestBuyPointDates();
      if (!result.success) return [];
      const dates = result.dates || [];
      setAvailableDates(dates);
      return dates;
    } catch (error) {
      logger.warn('[BacktestPage] 列出买点日期失败:', error);
      return [];
    }
  }, []);

  /** 重新计算已加载日期（扫描 / 同步 / 手动刷新后调用） */
  const reloadLoadedDates = useCallback(
    async (silent = false, forceHistories = false) => {
      if (forceHistories) {
        loadAllHistories(true);
      }
      await refreshAvailableDates();
      const dates = Array.from(rowsByDate.keys());
      if (dates.length === 0) return;
      await loadTrackingDates(dates, silent);
    },
    [loadAllHistories, loadTrackingDates, refreshAvailableDates, rowsByDate]
  );

  useEffect(() => {
    void refreshAvailableDates();
  }, [refreshAvailableDates]);

  /**
   * 当前日期范围需要的日期。必须来自目录列表而不是已加载的行，
   * 否则「按需加载」会让 sortedDates 只剩已加载的那几天，范围筛选直接失效。
   */
  const requiredDates = useMemo(() => {
    if (availableDates.length === 0) return [];
    const limit = TRACKING_DATE_RANGE_LIMIT[trackingDateRange] ?? 'all';
    return limit === 'all' ? availableDates : availableDates.slice(0, limit);
  }, [availableDates, trackingDateRange]);

  /** 需要但尚未加载的日期 —— 切换日期范围时才触发加载 */
  const missingDates = useMemo(
    () => requiredDates.filter((dateKey) => !rowsByDate.has(dateKey)),
    [requiredDates, rowsByDate]
  );

  useEffect(() => {
    if (missingDates.length === 0) return;
    void loadTrackingDates(missingDates, true);
  }, [loadTrackingDates, missingDates]);

  const trackingRows = useMemo(() => {
    const rows: TrackedLatestSignalBase[] = [];
    rowsByDate.forEach((list) => {
      for (let i = 0; i < list.length; i++) {
        rows.push(list[i]);
      }
    });
    return rows.sort(compareTrackedSignals);
  }, [rowsByDate]);

  /** code → 日线历史（同时登记带/不带市场前缀两种 key，兼容列表里的两种写法） */
  const historyByCode = useMemo(() => {
    const map = new Map<string, StockHistoryRecord>();
    allHistories.forEach((history) => {
      map.set(history.code, history);
      map.set(history.code.replace(/^(SH|SZ)/i, ''), history);
    });
    return map;
  }, [allHistories]);

  /** 点击行：打开该股的日K + 筹码弹窗 */
  const handleOpenChart = useCallback((record: { code: string; name: string }) => {
    setChartState({ code: normalizeSectorStockCode(record.code), name: record.name });
  }, []);

  /** 弹窗 K 线：直接复用页面已缓存的日线历史，不再单独请求 */
  const chartKline = useMemo(() => {
    if (!chartState) return [];
    const history =
      historyByCode.get(chartState.code) ||
      historyByCode.get(chartState.code.replace(/^(SH|SZ)/i, ''));
    return history?.dailyLines ?? [];
  }, [chartState, historyByCode]);

  const handleScanLatestSignals = async () => {
    const sortSignals = (signals: ReturnType<typeof scanLatestScenarioSignals>) =>
      signals.sort((a, b) => {
        if ((b.oddsScore || 0) !== (a.oddsScore || 0)) return (b.oddsScore || 0) - (a.oddsScore || 0);
        if ((b.lift || 0) !== (a.lift || 0)) return (b.lift || 0) - (a.lift || 0);
        return compareName(a.name, b.name);
      });

    const mapSignals = (signals: ReturnType<typeof scanLatestScenarioSignals>) =>
      signals.map((item) => ({
        ...item,
        industry: item.industry || getMappedIndustry(item.code, industryMapping) || null,
        concepts: getMappedConcepts(item.code, conceptMapping),
      }));

    try {
      setScanningLatest(true);
      const { histories } = await readFilteredHistories();

      if (asOfMonth) {
        const dateKeys = resolveTradingDaysInMonth(histories, asOfMonth);
        if (dateKeys.length === 0) {
          message.info(`截止月 ${asOfMonth} 未找到可用交易日`);
          return;
        }
        if (!window.electronAPI?.exportBacktestSignalsFile) {
          message.warning('按月扫描完成，但自动导出快照不可用（需在 Electron 环境中运行）');
          return;
        }

        let successCount = 0;
        let totalSignals = 0;
        message.loading({
          content: `正在扫描截止月 ${asOfMonth} 共 ${dateKeys.length} 个交易日...`,
          key: 'scan_month',
        });

        for (let i = 0; i < dateKeys.length; i++) {
          const dateKey = dateKeys[i];
          message.loading({
            content: `正在扫描并导出 [${i + 1}/${dateKeys.length}] ${dateKey}...`,
            key: 'scan_month',
          });
          const signals = sortSignals(
            scanLatestScenarioSignals(histories, {
              highLiftOnly: true,
              asOfDate: dateKey,
            })
          );
          const data = mapSignals(signals);
          await exportBacktestSignalsToJson({
            kind: 'latest',
            data,
            fileBaseName: dateKey,
            meta: {
              tab: 'latest' as const,
              autoExport: true,
              asOfDate: dateKey,
              asOfMonth,
              searchText: '',
              scenarioFilter: 'all',
              excludeST,
              latestDate: dateKey,
              fileBaseName: dateKey,
            },
          });
          successCount++;
          totalSignals += data.length;
        }

        message.loading({ content: '按月导出完成，正在重新加载买点追踪...', key: 'scan_month' });
        await reloadLoadedDates(true);
        message.success({
          content: `截止月 ${asOfMonth} 已导出 ${successCount} 个交易日 JSON（累计信号 ${totalSignals} 只）`,
          key: 'scan_month',
          duration: 4,
        });
        return;
      }

      message.info('正在扫描最新交易日高价值场景并更新追踪...');
      const signals = sortSignals(
        scanLatestScenarioSignals(histories, {
          highLiftOnly: true,
        })
      );

      if (signals.length === 0) {
        message.info('最新交易日未扫描到高价值场景信号');
        await reloadLoadedDates(true);
        return;
      }

      if (!window.electronAPI?.exportBacktestSignalsFile) {
        message.warning('扫描完成，但自动导出快照不可用（需在 Electron 环境中运行）');
        await reloadLoadedDates(true);
        return;
      }

      try {
        const data = mapSignals(signals);
        const fileBaseName = resolveLatestExportDate(
          signals,
          latestDateSummary.dominantDate
        );
        const meta = {
          tab: 'latest' as const,
          autoExport: true,
          asOfDate: null,
          searchText: '',
          scenarioFilter: 'all',
          excludeST,
          latestDate: latestDateSummary.dominantDate || null,
          fileBaseName,
        };
        const filePath = await exportBacktestSignalsToJson({
          kind: 'latest',
          data,
          fileBaseName,
          meta,
        });
        message.success(`已保存最新买点快照 ${data.length} 条到 ${filePath}`);
        await reloadLoadedDates(true);
        message.success(`最新交易日扫描完成并已更新买点追踪（命中 ${signals.length} 只）`);
      } catch (exportError) {
        logger.error('[BacktestPage] 扫描最新后导出快照失败:', exportError);
        message.error('导出快照失败: ' + (exportError as Error).message);
        await reloadLoadedDates(true);
      }
    } catch (error) {
      logger.error('[BacktestPage] 扫描最新交易日失败:', error);
      message.error({ content: '扫描失败: ' + (error as Error).message, key: 'scan_month' });
    } finally {
      setScanningLatest(false);
    }
  };

  const handleSyncExistingBuyPoints = async () => {
    if (!window.electronAPI?.readLatestBuyPointFiles || !window.electronAPI?.exportBacktestSignalsFile) {
      message.warning('同步功能不可用（需在 Electron 环境中运行）');
      return;
    }

    try {
      setSyncingAllLatest(true);
      message.loading({ content: '正在读取已有买点文件列表...', key: 'sync_existing' });

      const filesResult = await window.electronAPI.readLatestBuyPointFiles();
      if (!filesResult.success) {
        message.error({ content: '读取已有买点文件失败: ' + (filesResult.error || '未知错误'), key: 'sync_existing' });
        return;
      }

      const files = filesResult.files || [];
      if (files.length === 0) {
        message.warning({ content: '未找到任何已有买点文件，请先执行“扫描最新”', key: 'sync_existing' });
        return;
      }

      // 提取所有已有文件的日期并排序
      const dateKeys = Array.from(
        new Set(
          files
            .map((f) => normalizeDateKey(f.fileBaseName))
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        )
      ).sort();

      if (dateKeys.length === 0) {
        message.warning({ content: '未匹配到合法的日期快照文件', key: 'sync_existing' });
        return;
      }

      message.loading({ content: `正在加载股票行情并同步 ${dateKeys.length} 个历史日期...`, key: 'sync_existing' });

      // 一次性加载全量股票历史数据，杜绝重复从 IndexedDB 读取
      const { histories } = await readFilteredHistories();

      let successCount = 0;
      let totalSignals = 0;

      for (let i = 0; i < dateKeys.length; i++) {
        const dateKey = dateKeys[i];
        message.loading({
          content: `正在同步第 [${i + 1}/${dateKeys.length}] 个日期 (${dateKey})...`,
          key: 'sync_existing',
        });

        const signals = scanLatestScenarioSignals(histories, {
          highLiftOnly: true,
          asOfDate: dateKey,
        }).sort((a, b) => {
          if ((b.oddsScore || 0) !== (a.oddsScore || 0)) return (b.oddsScore || 0) - (a.oddsScore || 0);
          if ((b.lift || 0) !== (a.lift || 0)) return (b.lift || 0) - (a.lift || 0);
          return compareName(a.name, b.name);
        });

        // 即使 signals 为空也保留为空快照，确保文件与算法逻辑真实同步
        const data = signals.map((item) => ({
          ...item,
          industry: item.industry || getMappedIndustry(item.code, industryMapping) || null,
          concepts: getMappedConcepts(item.code, conceptMapping),
        }));

        const fileBaseName = dateKey;
        const meta = {
          tab: 'latest' as const,
          autoExport: true,
          asOfDate: dateKey,
          searchText: '',
          scenarioFilter: 'all',
          excludeST,
          latestDate: dateKey,
          fileBaseName,
        };

        await exportBacktestSignalsToJson({
          kind: 'latest',
          data,
          fileBaseName,
          meta,
        });

        successCount++;
        totalSignals += data.length;
      }

      message.loading({ content: '文件同步完成，正在重新加载买点追踪...', key: 'sync_existing' });
      await reloadLoadedDates(true);
      message.success({
        content: `成功更新 ${successCount} 个已有买点文件（累计信号 ${totalSignals} 只），追踪数据已同步！`,
        key: 'sync_existing',
        duration: 4,
      });
    } catch (error) {
      logger.error('[BacktestPage] 批量同步已有买点失败:', error);
      message.error({ content: '批量同步失败: ' + (error as Error).message, key: 'sync_existing' });
      await reloadLoadedDates(true);
    } finally {
      setSyncingAllLatest(false);
    }
  };

  const filteredHistorySignals = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return historySignals.filter((item) => {
      const scenarioMatch =
        historyScenarioFilter === 'all' || item.scenario === historyScenarioFilter;
      const keywordMatch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword);
      return scenarioMatch && keywordMatch;
    });
  }, [historyScenarioFilter, historySignals, searchText]);

  const trackedRowsWithStatus = useMemo(() => {
    return trackingRows.map((row) => ({
      ...row,
      ...getTrackingStatus(row.trackedReturns, {
        threshold: trackingThreshold,
        minHitCount: trackingMinHitCount,
      }),
    }));
  }, [trackingMinHitCount, trackingRows, trackingThreshold]);

  const trackingIndustryCodes = useMemo(() => {
    const labels = new Set(trackingIndustryGroupLabels);
    return new Set(
      OPPORTUNITY_INDUSTRY_GROUPS.filter((group) => labels.has(group.label)).flatMap((group) => [
        ...group.codes,
      ])
    );
  }, [trackingIndustryGroupLabels]);

  const trackingAnalysisRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    // 用目录里已知的全部日期做范围裁剪，而不是已加载行里的日期
    const dateRangeLimit = TRACKING_DATE_RANGE_LIMIT[trackingDateRange] ?? 'all';
    const dateLimit = dateRangeLimit === 'all' ? availableDates.length : dateRangeLimit;
    const allowedDates = new Set(availableDates.slice(0, dateLimit));
    const onlyOpportunity = trackingIntersectionFilters.includes('opportunity');
    const onlyHotRank = trackingIntersectionFilters.includes('hotRank');

    return trackedRowsWithStatus.filter((item) => {
      const stMatch = !excludeST || !isSTStock(item.name || '');
      const dateMatch = trackingDateRange === 'all' || allowedDates.has(item.signalDateKey);
      const scenarioMatch =
        trackingScenarioFilter === 'all' || item.scenario === trackingScenarioFilter;
      const oddsMatch =
        trackingOddsTiers.length === 0 ||
        (item.oddsTier != null && trackingOddsTiers.includes(item.oddsTier));
      const bcQualityMatch = matchBcQualityFilter(item, trackingBcQualityFilter);
      const opportunityMatch = !onlyOpportunity || item.opportunityRecordHit;
      const hotRankMatch = !onlyHotRank || item.hotRankHit;
      const industryCode =
        item.industry?.code || getMappedIndustry(item.code, industryMapping)?.code;
      const industryMatch = matchIndustryGroupFilter(
        industryCode,
        trackingIndustryCodes,
        trackingIndustryInvert
      );
      const keywordMatch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword);
      return (
        stMatch &&
        dateMatch &&
        scenarioMatch &&
        oddsMatch &&
        bcQualityMatch &&
        opportunityMatch &&
        hotRankMatch &&
        industryMatch &&
        keywordMatch
      );
    });
  }, [
    availableDates,
    excludeST,
    industryMapping,
    searchText,
    trackingIndustryCodes,
    trackingIndustryInvert,
    trackingIntersectionFilters,
    trackingOddsTiers,
    trackingBcQualityFilter,
    trackedRowsWithStatus,
    trackingDateRange,
    trackingScenarioFilter,
  ]);

  const filteredTrackingRows = useMemo(() => {
    const allowedStatuses = new Set(trackingStatusFilter);
    const uniqueRows = new Map<string, TrackedLatestSignal>();

    trackingAnalysisRows.forEach((item) => {
      if (!allowedStatuses.has(item.status)) return;
      const key = `${normalizeSectorStockCode(item.code)}-${item.signalDateKey}`;
      const current = uniqueRows.get(key);
      uniqueRows.set(key, current ? pickPreferredTrackingRow(current, item) : item);
    });

    return Array.from(uniqueRows.values());
  }, [
    trackingAnalysisRows,
    trackingStatusFilter,
  ]);

  const trackingLatestSignalStocks = useMemo(() => {
    let latestDateKey = '';
    filteredTrackingRows.forEach((item) => {
      if (item.signalDateKey > latestDateKey) {
        latestDateKey = item.signalDateKey;
      }
    });

    const stockMap = new Map<string, { code: string; name: string }>();
    filteredTrackingRows.forEach((item) => {
      if (item.signalDateKey !== latestDateKey) return;
      const code = normalizeSectorStockCode(item.code);
      if (!stockMap.has(code)) {
        stockMap.set(code, { code, name: item.name });
      }
    });

    return {
      latestDateKey,
      stocks: Array.from(stockMap.values()),
    };
  }, [filteredTrackingRows]);

  const trackingStats = useMemo(() => {
    const total = filteredTrackingRows.length;
    const passed = filteredTrackingRows.filter((item) => item.status === 'passed').length;
    const failed = filteredTrackingRows.filter((item) => item.status === 'failed').length;
    const tracking = filteredTrackingRows.filter((item) => item.status === 'tracking').length;
    const verified = passed + failed;
    const passRate = verified > 0 ? Number(((passed / verified) * 100).toFixed(1)) : null;
    const maxReturns = filteredTrackingRows
      .map((item) => item.maxReturn)
      .filter((value): value is number => value != null);
    const avgMaxReturn =
      maxReturns.length > 0
        ? Number((maxReturns.reduce((sum, value) => sum + value, 0) / maxReturns.length).toFixed(2))
        : null;
    const scenarioMap = new Map<
      string,
      { name: string; total: number; passed: number; failed: number; tracking: number }
    >();

    filteredTrackingRows.forEach((item) => {
      const current =
        scenarioMap.get(item.scenario) ||
        { name: item.scenarioName, total: 0, passed: 0, failed: 0, tracking: 0 };
      current.total += 1;
      current[item.status] += 1;
      scenarioMap.set(item.scenario, current);
    });

    const scenarios = Array.from(scenarioMap.values())
      .map((item) => {
        const scenarioVerified = item.passed + item.failed;
        return {
          ...item,
          passRate:
            scenarioVerified > 0 ? Number(((item.passed / scenarioVerified) * 100).toFixed(1)) : null,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    return { total, passed, failed, tracking, verified, passRate, avgMaxReturn, scenarios };
  }, [filteredTrackingRows]);

  /**
   * 归因统计：只在「追踪统计」Popover 打开时才计算。
   * 之前它在每次 searchText / 筛选变化时都会跑 9 遍全量 getTrackingStatus，
   * 而结果只有展开浮层时才被看到。
   */
  const trackingAnalysisStats = useMemo(() => {
    const empty: {
      ruleStats: Array<{
        scenarioName: string;
        matchedRule: string;
        total: number;
        passed: number;
        failed: number;
        tracking: number;
        verified: number;
        passRate: number | null;
      }>;
      failedRules: Array<{
        scenarioName: string;
        matchedRule: string;
        total: number;
        passed: number;
        failed: number;
        tracking: number;
        verified: number;
        passRate: number | null;
      }>;
      parameterStats: Array<{
        threshold: number;
        minHitCount: number;
        passed: number;
        failed: number;
        tracking: number;
        verified: number;
        passRate: number | null;
      }>;
    } = { ruleStats: [], failedRules: [], parameterStats: [] };

    if (!statsPopoverOpen || trackingAnalysisRows.length === 0) return empty;

    type RuleStat = {
      scenarioName: string;
      matchedRule: string;
      total: number;
      passed: number;
      failed: number;
      tracking: number;
    };
    const ruleMap = new Map<string, RuleStat>();

    const thresholds = [3, 5, 8];
    const minHits = [1, 2, 3];
    const parameterAcc = thresholds.flatMap((threshold) =>
      minHits.map((minHitCount) => ({
        threshold,
        minHitCount,
        passed: 0,
        failed: 0,
        tracking: 0,
      }))
    );
    const horizonCount = RETURN_HORIZON_KEYS.length;

    // 单遍遍历：规则维度与 9 种参数组合一次算完（原来参数回测要 reduce 9 遍全量）
    for (const item of trackingAnalysisRows) {
      const key = `${item.scenarioName}｜${item.matchedRule}`;
      let rule = ruleMap.get(key);
      if (!rule) {
        rule = {
          scenarioName: item.scenarioName,
          matchedRule: item.matchedRule,
          total: 0,
          passed: 0,
          failed: 0,
          tracking: 0,
        };
        ruleMap.set(key, rule);
      }
      rule.total += 1;
      rule[item.status] += 1;

      const values = collectReturnValues(item.trackedReturns);
      const remainingCount = horizonCount - values.length;
      for (let i = 0; i < parameterAcc.length; i++) {
        const entry = parameterAcc[i];
        let hitCount = 0;
        for (let v = 0; v < values.length; v++) {
          if (values[v] >= entry.threshold) hitCount++;
        }
        if (hitCount >= entry.minHitCount) entry.passed++;
        else if (hitCount + remainingCount < entry.minHitCount) entry.failed++;
        else entry.tracking++;
      }
    }

    const ruleStats = Array.from(ruleMap.values())
      .map((item) => {
        const verified = item.passed + item.failed;
        return {
          ...item,
          verified,
          passRate: verified > 0 ? Number(((item.passed / verified) * 100).toFixed(1)) : null,
        };
      })
      .sort((a, b) => {
        if (b.verified !== a.verified) return b.verified - a.verified;
        return b.total - a.total;
      });

    const failedRules = ruleStats
      .filter((item) => item.failed > 0)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 6);

    const parameterStats = parameterAcc.map((item) => {
      const verified = item.passed + item.failed;
      return {
        ...item,
        verified,
        passRate: verified > 0 ? Number(((item.passed / verified) * 100).toFixed(1)) : null,
      };
    });

    return {
      ruleStats: ruleStats.slice(0, 8),
      failedRules,
      parameterStats,
    };
  }, [statsPopoverOpen, trackingAnalysisRows]);

  const handleExportTrackingLatestNames = async () => {
    const { latestDateKey, stocks } = trackingLatestSignalStocks;
    if (stocks.length === 0) {
      message.warning('没有可导出的最新信号日期股票');
      return;
    }

    const names = stocks.map((stock) => stock.name || stock.code).filter(Boolean);
    if (names.length === 0) {
      message.warning('没有可用的股票名称');
      return;
    }

    try {
      const exportTime = new Date().toLocaleString('zh-CN');
      const signalDate = normalizeDateKey(latestDateKey);
      const filterSummary = `最新信号日期: ${signalDate}\n导出时间: ${exportTime}\n当前筛选后最新信号股票: ${stocks.length} 只`;
      await exportStockNamesToPng(names, {
        fileNamePrefix: '买点追踪_最新信号股票',
        filterSummary,
        dateStamp: signalDate,
      });
      message.success(`最新信号日期股票已导出为图片（${signalDate}）`);
    } catch (error) {
      logger.error('[BacktestPage] 导出买点追踪最新信号股票失败:', error);
      message.error('导出最新信号股票失败: ' + (error as Error).message);
    }
  };

  const handleAddTrackingLatestStocks = () => {
    if (trackingLatestSignalStocks.stocks.length === 0) {
      message.warning('没有可添加的最新信号日期股票');
      return;
    }
    setShowAddTrackingLatestModal(true);
  };

  useLayoutEffect(() => {
    const el = tableAreaRef.current;
    if (!el) return;

    const updateScrollY = () => {
      const next = Math.floor(el.clientHeight - TABLE_SCROLL_Y_RESERVE);
      const value = Math.max(200, next);
      setTableScrollY((prev) => (prev === value ? prev : value));
    };

    updateScrollY();
    const frame = requestAnimationFrame(updateScrollY);
    const resizeObserver = new ResizeObserver(updateScrollY);
    resizeObserver.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  const scenarioStats = useMemo(() => {
    const map = new Map<ScenarioId, number>();
    historySignals.forEach((signal) => {
      map.set(signal.scenario, (map.get(signal.scenario) || 0) + 1);
    });
    return SCENARIOS.map((scenario) => ({
      ...scenario,
      count: map.get(scenario.id) || 0,
    })).filter((item) => item.count > 0);
  }, [historySignals]);

  const renderReturn = (returns: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    const value = returns[key] ?? null;
    return <Text style={{ color: returnColor(value) }}>{returnText(value)}</Text>;
  };

  const compareReturn = (a: ReturnSnapshot, b: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    return (a[key] ?? Number.NEGATIVE_INFINITY) - (b[key] ?? Number.NEGATIVE_INFINITY);
  };

  function pickPreferredTrackingRow(current: TrackedLatestSignal, next: TrackedLatestSignal) {
    if ((next.oddsScore || 0) !== (current.oddsScore || 0)) {
      return (next.oddsScore || 0) > (current.oddsScore || 0) ? next : current;
    }
    if ((next.lift || 0) !== (current.lift || 0)) {
      return (next.lift || 0) > (current.lift || 0) ? next : current;
    }
    if ((next.maxReturn ?? Number.NEGATIVE_INFINITY) !== (current.maxReturn ?? Number.NEGATIVE_INFINITY)) {
      return (next.maxReturn ?? Number.NEGATIVE_INFINITY) > (current.maxReturn ?? Number.NEGATIVE_INFINITY) ? next : current;
    }
    if (next.hitCount !== current.hitCount) {
      return next.hitCount > current.hitCount ? next : current;
    }
    return current;
  }

  const renderTrackingStatus = (status: TrackingStatus) => {
    return <StockStatusTag status={status} positiveText="已达标" negativeText="未达标" processingText="验证中" />;
  };

  const renderOddsTier = (tier?: TrackedLatestSignal['oddsTier']) => {
    if (!tier) return <StockFeatureTag text="未知" variant="red" />;
    return <StockFeatureTag text={tier} variant="red" />;
  };

  const getRuleShortLabel = (rule: string): string => {
    const limitUpMatch = rule.match(/近5日近似涨停根数=(\d+)/);
    if (limitUpMatch) return `涨停≥${limitUpMatch[1]}`;
    if (rule.includes('近3日累计涨幅') && rule.includes('≥20')) return '3日涨≥20%';
    if (rule.includes('量比') && rule.includes('≥1.5')) return '量比≥1.5';
    if (rule.includes('量比') && rule.includes('[1.0,1.5)')) return '量比1-1.5';
    if (rule.includes('近3日累计') && rule.includes('[5,20)')) return '3日涨5-20%';
    if (rule.includes('回撤') && rule.includes('量比≤0.9')) return '缩量回踩';
    if (rule.includes('回撤') && rule.includes('放量收涨')) return '放量企稳';
    return rule.length > 12 ? `${rule.slice(0, 12)}...` : rule;
  };

  const getRecordIndustry = (record: { code: string; industry?: SectorInfo | null }) => {
    return record.industry || getMappedIndustry(record.code, industryMapping);
  };

  const compareIndustry = (
    a: { code: string; industry?: SectorInfo | null },
    b: { code: string; industry?: SectorInfo | null }
  ) => {
    const nameA = getRecordIndustry(a)?.name || '';
    const nameB = getRecordIndustry(b)?.name || '';
    return compareName(nameA, nameB);
  };

  const getRecordConcepts = (record: { code: string; concepts?: SectorInfo[] }) => {
    return (record.concepts && record.concepts.length > 0)
      ? record.concepts
      : getMappedConcepts(record.code, conceptMapping);
  };

  const renderIndustry = (_: unknown, record: { code: string; industry?: SectorInfo | null }) => {
    const industry = getRecordIndustry(record);
    return industry ? <span style={{ fontSize: '13px' }}>{industry.name}</span> : <Text type="secondary">-</Text>;
  };

  const renderConcepts = (_: unknown, record: { code: string; concepts?: SectorInfo[] }) => {
    const concepts = getRecordConcepts(record);
    return <StockConceptTags concepts={concepts} max={3} />;
  };

  const historicalColumns: ColumnsType<BuyPointSignal> = [
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
      render: (text: string) => <Text style={{ color: '#1890ff', textShadow: '0 0 0.25px currentcolor' }}>{text}</Text>,
    },
    {
      title: '所属行业',
      width: 120,
      sorter: compareIndustry,
      showSorterTooltip: { title: '按所属行业排序' },
      render: renderIndustry,
    },
    {
      title: '买点日期',
      dataIndex: 'date',
      width: 110,
      sorter: (a, b) => a.timestamp - b.timestamp,
      defaultSortOrder: 'descend',
      showSorterTooltip: { title: '按买点日期排序' },
    },
    {
      title: '场景',
      dataIndex: 'scenarioName',
      width: 150,
      render: (_, record) => <StockFeatureTag text={record.scenarioName} variant="red" />,
    },
    { title: '买入价', dataIndex: 'entryPrice', width: 90 },
    { title: '命中项', dataIndex: 'hitCount', width: 80 },
    { title: '1日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd1'), render: (_, record) => renderReturn(record.returns, 'd1') },
    { title: '2日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd2'), render: (_, record) => renderReturn(record.returns, 'd2') },
    { title: '3日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd3'), render: (_, record) => renderReturn(record.returns, 'd3') },
    { title: '4日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd4'), render: (_, record) => renderReturn(record.returns, 'd4') },
    { title: '5日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd5'), render: (_, record) => renderReturn(record.returns, 'd5') },
    { title: '6日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd6'), render: (_, record) => renderReturn(record.returns, 'd6') },
    { title: '所属概念', width: 360, render: renderConcepts },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 260,
    },
  ];

  const trackingColumns: ColumnsType<TrackedLatestSignal> = [
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 80,
      fixed: 'left',
      render: (text: string) => <Text style={{ color: '#1890ff', textShadow: '0 0 0.25px currentcolor' }}>{text}</Text>,
    },
    {
      title: '所属行业',
      width: 120,
      sorter: compareIndustry,
      showSorterTooltip: { title: '按所属行业排序' },
      render: renderIndustry,
    },
    { title: '信号日期', dataIndex: 'signalDate', width: 110, sorter: (a, b) => a.timestamp - b.timestamp },
    { title: '收盘价', dataIndex: 'close', width: 90 },
    {
      title: '赔率档',
      dataIndex: 'oddsTier',
      width: 80,
      sorter: (a, b) => (a.oddsScore || 0) - (b.oddsScore || 0),
      render: (tier) => renderOddsTier(tier),
    },
    {
      title: '赔率分',
      dataIndex: 'oddsScore',
      width: 80,
      sorter: (a, b) => (a.oddsScore || 0) - (b.oddsScore || 0),
      render: (score) => (score !== undefined && score !== null ? <StockFeatureTag text={score} variant="red" /> : '-'),
    },
    {
      title: '赔率说明',
      dataIndex: 'oddsReason',
      ellipsis: true,
      width: 180,
    },
    { title: 'lift', dataIndex: 'lift', width: 80, render: (v) => v?.toFixed(2) },
    {
      title: '场景',
      dataIndex: 'scenarioName',
      width: 150,
      render: (_, record) => <StockFeatureTag text={record.scenarioName} variant="red" />,
    },
    {
      title: '机会记录',
      dataIndex: 'opportunityRecordHit',
      width: 90,
      sorter: (a, b) => Number(Boolean(a.opportunityRecordHit)) - Number(Boolean(b.opportunityRecordHit)),
      render: (hit) => <StockStatusTag status={Boolean(hit)} />,
    },
    {
      title: '热门榜',
      dataIndex: 'hotRankHit',
      width: 80,
      sorter: (a, b) => Number(Boolean(a.hotRankHit)) - Number(Boolean(b.hotRankHit)),
      render: (hit) => <StockStatusTag status={Boolean(hit)} />,
    },
    { title: '1日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd1'), render: (_, record) => renderReturn(record.trackedReturns, 'd1') },
    { title: '2日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd2'), render: (_, record) => renderReturn(record.trackedReturns, 'd2') },
    { title: '3日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd3'), render: (_, record) => renderReturn(record.trackedReturns, 'd3') },
    { title: '4日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd4'), render: (_, record) => renderReturn(record.trackedReturns, 'd4') },
    { title: '5日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd5'), render: (_, record) => renderReturn(record.trackedReturns, 'd5') },
    { title: '6日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd6'), render: (_, record) => renderReturn(record.trackedReturns, 'd6') },
    { title: '已发生', dataIndex: 'occurredCount', width: 80 },
    { title: '命中', dataIndex: 'hitCount', width: 80 },
    { title: '状态', dataIndex: 'status', width: 90, render: renderTrackingStatus },
    { title: '所属概念', width: 360, render: renderConcepts },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 280,
    },
  ];

  const renderSearchInput = () => (
    <Input
      allowClear
      placeholder="搜索股票名称/代码"
      prefix={<SearchOutlined />}
      value={searchText}
      onChange={(e) => setSearchText(e.target.value)}
      style={{ width: 180 }}
      size="small"
    />
  );

  const renderTrackingStatsPopoverContent = () => (
    <div className={styles.trackingPopoverContent}>
      <Row gutter={[16, 8]} className={styles.trackingStatsRow}>
        <Col>
          <Statistic title="当前展示" value={trackingStats.total} />
        </Col>
        <Col>
          <Statistic title="已达标" value={trackingStats.passed} />
        </Col>
        <Col>
          <Statistic title="验证中" value={trackingStats.tracking} />
        </Col>
        <Col>
          <Statistic title="未达标" value={trackingStats.failed} />
        </Col>
        <Col>
          <Statistic
            title="已验证达标率"
            value={trackingStats.passRate == null ? '-' : `${trackingStats.passRate}%`}
            valueStyle={{ color: trackingStats.passRate != null && trackingStats.passRate >= 50 ? '#cf1322' : undefined }}
          />
        </Col>
        <Col>
          <Statistic
            title="平均最大收益"
            value={
              trackingStats.avgMaxReturn == null ? '-' : `${trackingStats.avgMaxReturn}%`
            }
          />
        </Col>
      </Row>
      {trackingStats.scenarios.length > 0 && (
        <div className={styles.trackingAnalysisBlock}>
          <Text type="secondary">场景统计：</Text>
          <Space wrap size={[4, 4]} className={styles.trackingScenarioStats}>
            {trackingStats.scenarios.map((item) => (
              <Tag key={item.name} color="blue">
                {item.name}: {item.total} / 达标 {item.passed}
                {item.passRate != null ? ` / ${item.passRate}%` : ''}
              </Tag>
            ))}
          </Space>
        </div>
      )}
      {trackingAnalysisStats.failedRules.length > 0 && (
        <div className={styles.trackingAnalysisBlock}>
          <Text type="secondary">失败样本 Top：</Text>
          <Space wrap size={[4, 4]}>
            {trackingAnalysisStats.failedRules.map((item) => (
              <Tag
                key={`${item.scenarioName}-${item.matchedRule}`}
                bordered={false}
                title={item.matchedRule}
              >
                {item.scenarioName}｜{getRuleShortLabel(item.matchedRule)}: 失败 {item.failed} / {item.total}
              </Tag>
            ))}
          </Space>
        </div>
      )}
      {trackingAnalysisStats.ruleStats.length > 0 && (
        <div className={styles.trackingAnalysisBlock}>
          <Text type="secondary">规则胜率 Top：</Text>
          <Space wrap size={[4, 4]}>
            {trackingAnalysisStats.ruleStats.map((item) => (
              <Tag
                key={`${item.scenarioName}-${item.matchedRule}`}
                bordered={false}
                title={item.matchedRule}
              >
                {item.scenarioName}｜{getRuleShortLabel(item.matchedRule)}:{' '}
                {item.passRate == null ? '待验证' : `${item.passRate}%`}
                （{item.passed}/{item.verified}）
              </Tag>
            ))}
          </Space>
        </div>
      )}
      {trackingAnalysisStats.parameterStats.length > 0 && (
        <div className={styles.trackingAnalysisBlock}>
          <Text type="secondary">参数回测：</Text>
          <Space wrap size={[4, 4]}>
            {trackingAnalysisStats.parameterStats.map((item) => (
              <Tag key={`${item.threshold}-${item.minHitCount}`} bordered={false}>
                {item.threshold}% / {item.minHitCount}中：
                {item.passRate == null ? '待验证' : `${item.passRate}%`}
                （{item.passed}/{item.verified}）
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </div>
  );

  const activeDataLength =
    activeTab === 'tracking'
      ? filteredTrackingRows.length
      : filteredHistorySignals.length;
  const activeColumns: ColumnsType<any> =
    activeTab === 'tracking'
      ? trackingColumns
      : historicalColumns;
  const activeDataSource =
    activeTab === 'tracking'
      ? filteredTrackingRows
      : filteredHistorySignals;
  const activeScrollX = activeTab === 'tracking' ? 2680 : 1800;

  /** 表格当前生效的排序：优先用户点选的，其次列上声明的 defaultSortOrder */
  const activeTableSorter = useMemo(
    () => tableSorter ?? findDefaultTableSorter(activeColumns),
    [tableSorter, activeColumns]
  );

  /** 与表格展示顺序一致的当前 Tab 数据（按 antd 同口径复现排序） */
  const sortedActiveRows = useMemo(
    () =>
      sortRowsByTableSorter(
        activeDataSource as Array<{ code: string; name: string }>,
        activeColumns,
        activeTableSorter
      ),
    [activeDataSource, activeColumns, activeTableSorter]
  );

  /**
   * 图表弹窗的行导航列表：顺序与表格当前排序一致。
   * 同一只票可能出现多行（不同信号日），按代码去重，
   * 让「上一只 / 下一只」切的是另一只票，而不是同一只票的另一行。
   */
  const chartNavRecords = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ code: string; name: string }> = [];
    sortedActiveRows.forEach((row) => {
      const code = normalizeSectorStockCode(row.code);
      if (seen.has(code)) return;
      seen.add(code);
      list.push({ code, name: row.name });
    });
    return list;
  }, [sortedActiveRows]);

  /** 弹窗标题展示的所属行业：跟随当前弹窗个股（行内行业优先，缺失时回退板块映射） */
  const chartIndustry = useMemo(() => {
    if (!chartState) return undefined;
    const row = (activeDataSource as Array<{ code: string; industry?: SectorInfo | null }>).find(
      (item) => normalizeSectorStockCode(item.code) === chartState.code
    );
    if (!row) return undefined;
    return (row.industry || getMappedIndustry(row.code, industryMapping))?.name;
  }, [chartState, activeDataSource, industryMapping]);

  /** 弹窗内切换上一只 / 下一只：同步把表格翻到该股票所在页 */
  const handleChartNavigate = useCallback(
    (record: { code: string; name: string }) => {
      const rowIndex = sortedActiveRows.findIndex(
        (row) => normalizeSectorStockCode(row.code) === record.code
      );
      const pageSize = tablePageSize || 100;
      if (rowIndex >= 0) {
        const targetPage = Math.floor(rowIndex / pageSize) + 1;
        setTablePage((prev) => (prev === targetPage ? prev : targetPage));
      }
      setChartState({ code: record.code, name: record.name });
    },
    [sortedActiveRows, tablePageSize]
  );

  return (
    <Layout className={styles.backtestPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>历史回测</h1>
            <span className={styles.pageSubtitle}>
              买点追踪收益验证、历史好买点归类
            </span>
          </div>

          <div className={styles.headerStatsStrip}>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>总数</span>
              <span className={styles.statBadgeValue}>{loadingCount ? '-' : totalCount.toLocaleString()}</span>
            </div>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>参与</span>
              <span className={styles.statBadgeValue}>{loadingCount ? '-' : exportCount.toLocaleString()}</span>
            </div>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>行业</span>
              <span className={styles.statBadgeValue}>{loadingCount ? '-' : industryMapping.size.toLocaleString()}</span>
            </div>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>概念</span>
              <span className={styles.statBadgeValue}>{loadingCount ? '-' : conceptMapping.size.toLocaleString()}</span>
            </div>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>历史好买点</span>
              <span className={styles.statBadgeValue}>{loadingCount ? '-' : historySignals.length.toLocaleString()}</span>
            </div>
            <div className={styles.statBadge}>
              <span className={styles.statBadgeLabel}>追踪总信号</span>
              <span className={styles.statBadgeValue}>{loadingTracking ? '-' : trackingRows.length.toLocaleString()}</span>
            </div>
            <div className={styles.headerDateBadge}>
              <Tooltip
                placement="bottom"
                title={
                  <div className={styles.compactInfoTooltip}>
                    <div>历史好买点与买点追踪均基于 IndexedDB stockHistory；最新交易日扫描会自动保存快照并联动更新追踪收益。</div>
                    <div>历史好买点规则：买入收盘后 1-6 日累计收益中至少 2 项 &gt;= 5%。</div>
                    <div>最新交易日只扫描 lift&gt;1 的高价值场景，未来收益尚未发生时处于“验证中”状态。</div>
                    <div>赔率分会综合场景、当日强弱、量价结构和位置关系，对买点信号做“赔率优先”排序。</div>
                  </div>
                }
              >
                <InfoCircleOutlined className={styles.compactInfoIcon} />
              </Tooltip>
              <span>
                {latestDateSummary.dominantDate
                  ? `${latestDateSummary.dominantDate} (${latestDateSummary.dominantCount}只)`
                  : '未读取到截止日'}
              </span>
            </div>
          </div>

          <Space wrap className={styles.headerActions}>
            <Popover
              open={statsPopoverOpen}
              onOpenChange={setStatsPopoverOpen}
              content={renderTrackingStatsPopoverContent}
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>买点追踪统计与多维归因</span>
                  <Tag color={trackingStats.passRate != null && trackingStats.passRate >= 50 ? 'red' : 'blue'}>
                    达标率: {trackingStats.passRate == null ? '-' : `${trackingStats.passRate}%`}
                  </Tag>
                </div>
              }
              trigger={['hover', 'click']}
              placement="bottomRight"
              overlayClassName={styles.trackingPopoverOverlay}
            >
              <Button
                icon={<BarChartOutlined />}
                style={{
                  borderColor: trackingStats.passRate != null && trackingStats.passRate >= 50 ? '#ff7875' : undefined,
                  color: trackingStats.passRate != null && trackingStats.passRate >= 50 ? '#cf1322' : undefined,
                }}
              >
                追踪统计 {trackingStats.passRate != null ? `(${trackingStats.passRate}%)` : ''}
              </Button>
            </Popover>
            <Checkbox
              checked={excludeST}
              disabled={scanningHistory || scanningLatest || syncingAllLatest}
              onChange={(e) => setExcludeST(e.target.checked)}
            >
              排除ST
            </Checkbox>
            <Button onClick={() => void refreshHistoryCount(true)} disabled={loadingCount} loading={loadingCount}>
              刷新统计
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        <div className={styles.pageBody}>
          <Card className={styles.resultCard} size="small">
            <Tabs
              className={styles.resultTabs}
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key as 'tracking' | 'history');
                if (key === 'tracking' && trackingRows.length === 0) {
                  void reloadLoadedDates();
                }
              }}
              tabBarExtraContent={
                activeTab === 'tracking' ? (
                  <Space size={8}>
                    <DatePicker
                      picker="month"
                      allowClear
                      size="small"
                      value={asOfMonth ? dayjs(asOfMonth) : null}
                      disabled={scanningLatest || scanningHistory || syncingAllLatest}
                      disabledDate={(current: Dayjs) => !!(current && current.isAfter(dayjs(), 'month'))}
                      style={{ width: 120 }}
                      placeholder="截止月(最新)"
                      onChange={(date: Dayjs | null) => {
                        setAsOfMonth(date ? date.format('YYYY-MM') : null);
                      }}
                    />
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      loading={scanningLatest}
                      disabled={exportCount === 0 || syncingAllLatest || scanningHistory}
                      onClick={handleScanLatestSignals}
                    >
                      扫描最新
                    </Button>
                    <Button
                      size="small"
                      icon={<SyncOutlined />}
                      loading={syncingAllLatest}
                      disabled={exportCount === 0 || scanningLatest || scanningHistory}
                      onClick={handleSyncExistingBuyPoints}
                    >
                      更新已有买点
                    </Button>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loadingTracking}
                      disabled={syncingAllLatest || scanningLatest}
                      onClick={() => void reloadLoadedDates(false, true)}
                    >
                      更新收益
                    </Button>
                    <Button
                      size="small"
                      icon={<ExportOutlined />}
                      disabled={loadingTracking || trackingLatestSignalStocks.stocks.length === 0}
                      onClick={() => void handleExportTrackingLatestNames()}
                    >
                      导出名称(PNG)
                    </Button>
                    <Button
                      size="small"
                      icon={<DatabaseOutlined />}
                      disabled={loadingTracking || trackingLatestSignalStocks.stocks.length === 0}
                      onClick={handleAddTrackingLatestStocks}
                    >
                      添加最新信号
                    </Button>
                  </Space>
                ) : (
                  <Space size={8}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={scanningHistory}
                      disabled={exportCount === 0 || syncingAllLatest || scanningLatest}
                      onClick={handleScanHistoricalBuyPoints}
                    >
                      扫描历史
                    </Button>
                  </Space>
                )
              }
              items={[
                {
                  key: 'tracking',
                  label: `买点追踪 (${filteredTrackingRows.length})`,
                },
                {
                  key: 'history',
                  label: `历史好买点 (${filteredHistorySignals.length})`,
                },
              ]}
            />

            <div className={styles.tabToolbar}>
              <div className={styles.tabToolbarLeft}>
                {activeTab === 'tracking' ? (
                  <>
                    <Select
                      value={trackingScenarioFilter}
                      options={[
                        { label: '全部高价值场景', value: 'all' },
                        ...HIGH_LIFT_SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
                      ]}
                      onChange={setTrackingScenarioFilter}
                      style={{ width: 160 }}
                      size="small"
                    />
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="行业分组"
                      value={trackingIndustryGroupLabels}
                      options={OPPORTUNITY_INDUSTRY_GROUPS.map((group) => ({
                        label: group.label,
                        value: group.label,
                      }))}
                      onChange={setTrackingIndustryGroupLabels}
                      style={{ minWidth: 180, maxWidth: 280 }}
                      maxTagCount="responsive"
                      size="small"
                    />
                    <Checkbox
                      checked={trackingIndustryInvert}
                      onChange={(e) => setTrackingIndustryInvert(e.target.checked)}
                      disabled={trackingIndustryGroupLabels.length === 0}
                    >
                      排除选中
                    </Checkbox>
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="交集筛选"
                      value={trackingIntersectionFilters}
                      options={[
                        { label: '机会交集', value: 'opportunity' },
                        { label: '热门榜', value: 'hotRank' },
                      ]}
                      onChange={setTrackingIntersectionFilters}
                      style={{ minWidth: 200, maxWidth: 260 }}
                      maxTagCount="responsive"
                      size="small"
                    />
                    <Select
                      value={trackingDateRange}
                      options={[
                        { label: '今天', value: 'today' },
                        { label: '最近2日', value: 'recent2' },
                        { label: '最近3日', value: 'recent3' },
                        { label: '最近5日', value: 'recent5' },
                        { label: '最近6日', value: 'recent6' },
                        { label: '最近12日', value: 'recent12' },
                        { label: '最近18日', value: 'recent18' },
                        { label: '最近24日', value: 'recent24' },
                        { label: '最近30日', value: 'recent30' },
                        { label: '最近36日', value: 'recent36' },
                        { label: '最近42日', value: 'recent42' },
                        { label: '最近48日', value: 'recent48' },
                        { label: '最近54日', value: 'recent54' },
                        { label: '全部日期', value: 'all' },
                      ]}
                      onChange={setTrackingDateRange}
                      style={{ width: 110 }}
                      size="small"
                    />
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="赔率档"
                      value={trackingOddsTiers}
                      options={[
                        { label: 'S档', value: 'S' },
                        { label: 'A档', value: 'A' },
                        { label: 'B档', value: 'B' },
                        { label: 'C档', value: 'C' },
                      ]}
                      onChange={setTrackingOddsTiers}
                      style={{ width: 160 }}
                      maxTagCount="responsive"
                      size="small"
                    />
                    <Tooltip title="开启后只保留回撤>18%，或回撤>12%且近5日有板的B/C，达标率约24%→45%，召回约20%。S/A不受影响。">
                      <Checkbox
                        checked={trackingBcQualityFilter}
                        onChange={(e) => setTrackingBcQualityFilter(e.target.checked)}
                      >
                        B/C位置增强
                      </Checkbox>
                    </Tooltip>
                    <Select
                      mode="multiple"
                      value={trackingStatusFilter}
                      options={[
                        { label: '验证中', value: 'tracking' },
                        { label: '已达标', value: 'passed' },
                        { label: '未达标', value: 'failed' },
                      ]}
                      onChange={setTrackingStatusFilter}
                      maxTagCount="responsive"
                      style={{ width: 190 }}
                      size="small"
                    />
                    <Select
                      value={trackingMinHitCount}
                      options={[
                        { label: '短线冲高(1天≥5%)', value: 1 },
                        { label: '稳健持股(2天≥5%)', value: 2 },
                        { label: '强连涨(3天≥5%)', value: 3 },
                      ]}
                      onChange={(val) => setTrackingMinHitCount(Number(val))}
                      style={{ width: 145 }}
                      size="small"
                    />
                    <Space.Compact size="small">
                      <Button size="small" style={{ pointerEvents: 'none' }}>阈值</Button>
                      <InputNumber
                        min={0}
                        max={50}
                        value={trackingThresholdInput}
                        onChange={(value) => setTrackingThresholdInput(Number(value ?? 5))}
                        style={{ width: 65 }}
                        size="small"
                      />
                      <Button size="small" style={{ pointerEvents: 'none' }}>%</Button>
                    </Space.Compact>
                  </>
                ) : (
                  <>
                    <Select
                      value={historyScenarioFilter}
                      options={scenarioOptions}
                      onChange={setHistoryScenarioFilter}
                      style={{ width: 160 }}
                      size="small"
                    />
                    {scenarioStats.map((item) => (
                      <StockFeatureTag key={item.id} text={`${item.name}: ${item.count}`} />
                    ))}
                  </>
                )}
              </div>
              {renderSearchInput()}
            </div>

            <div className={styles.tableArea} ref={tableAreaRef}>
              <Table
                rowKey={(record) => `${record.code}-${record.date}-${record.scenario}-${record.timestamp}`}
                columns={activeColumns}
                dataSource={activeDataSource}
                onRow={(record) => ({
                  onClick: () => handleOpenChart(record),
                  className: styles.clickableRow,
                })}
                onChange={(_pagination, _filters, sorter) => {
                  // 记录当前排序：弹窗里的 ← / → 要按排序后的顺序切换
                  const current = Array.isArray(sorter) ? sorter[0] : sorter;
                  setTableSorter({
                    columnKey: current?.columnKey != null ? String(current.columnKey) : null,
                    order: current?.order ?? null,
                  });
                }}
                pagination={{
                  current: tablePage,
                  pageSize: tablePageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['50', '100', '200'],
                  onChange: (page, pageSize) => {
                    setTablePage(page);
                    setTablePageSize(pageSize);
                  },
                }}
                scroll={{
                  x: activeScrollX,
                  y: activeDataLength > 0 ? tableScrollY : undefined,
                }}
                // 虚拟滚动：列多（22 列）时只渲染可视行，避免每页上百行 × 多列的 DOM 开销
                virtual={activeDataLength > 0}
                size="small"
              />
            </div>
          </Card>
        </div>
      </Content>
      <DailyChartModal
        open={chartState !== null}
        code={chartState?.code ?? ''}
        name={chartState?.name ?? ''}
        kline={chartKline}
        period="day"
        industry={chartIndustry}
        records={chartNavRecords}
        onNavigate={handleChartNavigate}
        onClose={() => setChartState(null)}
      />
      <AddStocksToWatchListModal
        visible={showAddTrackingLatestModal}
        stocks={trackingLatestSignalStocks.stocks}
        onClose={() => setShowAddTrackingLatestModal(false)}
      />
    </Layout>
  );
}
