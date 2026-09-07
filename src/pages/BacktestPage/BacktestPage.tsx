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
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { DatabaseOutlined, ExportOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  getStocksHistory,
  type StockHistoryRecord,
} from '@/utils/storage/opportunityIndexedDB';
import { getAllStockRecords } from '@/services/opportunity/recordService';
import { AddStocksToWatchListModal } from '@/components/AddStocksToWatchListModal/AddStocksToWatchListModal';
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
  getTrackingStatus,
  normalizeDateKey,
  type TrackedLatestSignal,
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
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

/** 表格滚动区为表头与分页预留的高度 */
const TABLE_SCROLL_Y_RESERVE = 72;

type SectorInfo = { code: string; name: string };

function isSTStock(name: string): boolean {
  return name.includes('ST');
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

const scenarioOptions = [
  { label: '全部场景', value: 'all' },
  ...SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
];

const highLiftIds = new Set(HIGH_LIFT_SCENARIOS.map((s) => s.id));

export function BacktestPage() {
  const { message } = App.useApp();
  const [totalCount, setTotalCount] = useState(0);
  const [exportCount, setExportCount] = useState(0);
  const [excludeST, setExcludeST] = useState(true);
  const [loadingCount, setLoadingCount] = useState(false);
  const [scanningHistory, setScanningHistory] = useState(false);
  const [scanningLatest, setScanningLatest] = useState(false);
  const [industryMapping, setIndustryMapping] = useState<Map<string, SectorInfo>>(new Map());
  const [conceptMapping, setConceptMapping] = useState<Map<string, SectorInfo[]>>(new Map());
  const [historySignals, setHistorySignals] = useState<BuyPointSignal[]>([]);
  const [historyScenarioFilter, setHistoryScenarioFilter] = useState<string>('all');
  const [trackingScenarioFilter, setTrackingScenarioFilter] = useState<string>('all');
  const [trackingOnlyHighOdds, setTrackingOnlyHighOdds] = useState(true);
  const [trackingDateRange, setTrackingDateRange] = useState<string>('today');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<TrackingStatus[]>([
    'tracking',
    'passed',
  ]);
  const [trackingIntersectionFilters, setTrackingIntersectionFilters] = useState<string[]>([]);
  const [trackingIndustryGroupLabels, setTrackingIndustryGroupLabels] = useState<string[]>([]);
  const [trackingIndustryInvert, setTrackingIndustryInvert] = useState(true);
  const [trackingThreshold, setTrackingThreshold] = useState(5);
  const [trackingMinHitCount, setTrackingMinHitCount] = useState(2);
  const [trackingRows, setTrackingRows] = useState<TrackedLatestSignal[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingStatsCollapsed, setTrackingStatsCollapsed] = useState(true);
  const [showAddTrackingLatestModal, setShowAddTrackingLatestModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [latestDateSummary, setLatestDateSummary] = useState({ dominantDate: '', dominantCount: 0 });
  const [activeTab, setActiveTab] = useState<'tracking' | 'history'>('tracking');
  const [tablePageSize, setTablePageSize] = useState(100);
  const [tableScrollY, setTableScrollY] = useState(360);
  /** 扫描最新的截止日 YYYY-MM-DD；空=用各股日K最后一根 */
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);

  const normalizeStockCode = useCallback((code: string): string => {
    if (code.startsWith('SH') || code.startsWith('SZ')) {
      return code;
    }
    const prefix = code.substring(0, 2);
    if (['60', '68', '90'].includes(prefix)) {
      return `SH${code}`;
    }
    if (['00', '30'].includes(prefix)) {
      return `SZ${code}`;
    }
    return code;
  }, []);

  useEffect(() => {
    const loadSectorMapping = async () => {
      try {
        const { getIndustrySectors, getConceptSectors } = await import('@/utils/storage/sectorStocksIndexedDB');
        const mapping = new Map<string, SectorInfo>();
        const conceptMap = new Map<string, SectorInfo[]>();
        const [industrySectors, conceptSectors] = await Promise.all([
          getIndustrySectors(),
          getConceptSectors(),
        ]);
        industrySectors.forEach((sector) => {
          sector.children?.forEach((stock) => {
            const normalizedCode = normalizeStockCode(stock.code);
            if (!mapping.has(normalizedCode)) {
              mapping.set(normalizedCode, { code: sector.code, name: sector.name });
            }
          });
        });
        conceptSectors.forEach((sector) => {
          sector.children?.forEach((stock) => {
            const normalizedCode = normalizeStockCode(stock.code);
            const concepts = conceptMap.get(normalizedCode) || [];
            if (!concepts.some((item) => item.code === sector.code)) {
              concepts.push({ code: sector.code, name: sector.name });
            }
            conceptMap.set(normalizedCode, concepts);
          });
        });
        setIndustryMapping(mapping);
        setConceptMapping(conceptMap);
        logger.info(`[BacktestPage] 板块映射加载完成，行业 ${mapping.size} 只，概念 ${conceptMap.size} 只`);
      } catch (error) {
        logger.error('[BacktestPage] 加载板块映射失败:', error);
      }
    };

    loadSectorMapping();
  }, [normalizeStockCode]);

  const readFilteredHistories = useCallback(async () => {
    const allHistories = await getStocksHistory([]);
    const histories = filterHistories(allHistories, excludeST);
    setTotalCount(allHistories.length);
    setExportCount(histories.length);
    setLatestDateSummary(getLatestDateSummary(histories));
    return { allHistories, histories };
  }, [excludeST]);

  const refreshHistoryCount = useCallback(async () => {
    try {
      setLoadingCount(true);
      await readFilteredHistories();
    } catch (error) {
      logger.error('[BacktestPage] 读取 stockHistory 数量失败:', error);
      message.error('读取本地历史数据失败');
    } finally {
      setLoadingCount(false);
    }
  }, [message, readFilteredHistories]);

  useEffect(() => {
    refreshHistoryCount();
  }, [refreshHistoryCount]);

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
        industry: item.industry || industryMapping.get(normalizeStockCode(item.code)) || null,
        concepts: conceptMapping.get(normalizeStockCode(item.code)) || [],
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

  const handleLoadTrackingRows = useCallback(async (silent = false) => {
    if (!window.electronAPI?.readLatestBuyPointFiles) {
      if (!silent) {
        message.error('读取最新买点文件不可用（需在 Electron 环境中运行并重启应用）');
      }
      return;
    }

    try {
      setLoadingTracking(true);
      const result = await window.electronAPI.readLatestBuyPointFiles();
      if (!result.success) {
        if (!silent) {
          message.error('读取最新买点文件失败: ' + (result.error || '未知错误'));
        }
        return;
      }

      const files = result.files || [];
      if (files.length === 0) {
        setTrackingRows([]);
        if (!silent) {
          message.warning('暂无最新买点文件，请先扫描并导出最新买点');
        }
        return;
      }

      const todayKey = getLocalDateString();
      const signalDates = Array.from(
        new Set(
          files.flatMap((file) => {
            const fileDateKey = normalizeDateKey(file.fileBaseName);
            const items = Array.isArray(file.content?.items) ? file.content.items : [];
            return items
              .map((item: { date?: string }) => normalizeDateKey(item.date || ''))
              .filter((dateKey: string) => dateKey && dateKey === fileDateKey);
          })
        )
      );

      const hotRankCodeMap = new Map<string, Set<string>>();
      for (const dateKey of signalDates) {
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
      }

      const histories = filterHistories(await getStocksHistory([]), excludeST);
      const records = await getAllStockRecords();
      const rows = buildTrackedLatestSignals(
        files,
        histories,
        records,
        {
          threshold: trackingThreshold,
          minHitCount: trackingMinHitCount,
        },
        hotRankCodeMap
      );
      setTrackingRows(rows);
      if (!silent) {
        message.success(`买点追踪已更新，共读取 ${files.length} 个文件、${rows.length} 条信号`);
      }
    } catch (error) {
      logger.error('[BacktestPage] 更新买点追踪失败:', error);
      if (!silent) {
        message.error('更新买点追踪失败: ' + (error as Error).message);
      }
    } finally {
      setLoadingTracking(false);
    }
  }, [excludeST, message, trackingMinHitCount, trackingThreshold]);

  useEffect(() => {
    void handleLoadTrackingRows(true);
  }, [handleLoadTrackingRows]);

  const handleScanLatestSignals = async () => {
    try {
      setScanningLatest(true);
      if (asOfDate) {
        message.info(`正在按截止日 ${asOfDate} 扫描高价值场景并更新追踪...`);
      } else {
        message.info('正在扫描最新交易日高价值场景并更新追踪...');
      }
      const { histories } = await readFilteredHistories();
      const signals = scanLatestScenarioSignals(histories, {
        highLiftOnly: true,
        asOfDate: asOfDate || undefined,
      }).sort((a, b) => {
        if ((b.oddsScore || 0) !== (a.oddsScore || 0)) return (b.oddsScore || 0) - (a.oddsScore || 0);
        if ((b.lift || 0) !== (a.lift || 0)) return (b.lift || 0) - (a.lift || 0);
        return a.name.localeCompare(b.name, 'zh-CN');
      });

      if (signals.length === 0) {
        message.info(asOfDate ? `截止日 ${asOfDate} 未扫描到高价值场景信号` : '最新交易日未扫描到高价值场景信号');
        await handleLoadTrackingRows(true);
        return;
      }

      if (!window.electronAPI?.exportBacktestSignalsFile) {
        message.warning('扫描完成，但自动导出快照不可用（需在 Electron 环境中运行）');
        await handleLoadTrackingRows(true);
        return;
      }

      try {
        const data = signals.map((item) => ({
          ...item,
          industry: item.industry || industryMapping.get(normalizeStockCode(item.code)) || null,
          concepts: conceptMapping.get(normalizeStockCode(item.code)) || [],
        }));
        const fileBaseName = resolveLatestExportDate(
          signals,
          asOfDate || latestDateSummary.dominantDate
        );
        const meta = {
          tab: 'latest' as const,
          autoExport: true,
          asOfDate: asOfDate || null,
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
        // 扫描并落盘后，立即联动重新读取追踪文件更新收益
        await handleLoadTrackingRows(true);
        message.success(
          asOfDate
            ? `截止日 ${asOfDate} 扫描完成并已更新买点追踪（命中 ${signals.length} 只）`
            : `最新交易日扫描完成并已更新买点追踪（命中 ${signals.length} 只）`
        );
      } catch (exportError) {
        logger.error('[BacktestPage] 扫描最新后导出快照失败:', exportError);
        message.error('导出快照失败: ' + (exportError as Error).message);
        await handleLoadTrackingRows(true);
      }
    } catch (error) {
      logger.error('[BacktestPage] 扫描最新交易日失败:', error);
      message.error('扫描最新交易日失败: ' + (error as Error).message);
    } finally {
      setScanningLatest(false);
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
    const sortedDates = Array.from(new Set(trackedRowsWithStatus.map((item) => item.signalDateKey)))
      .sort()
      .reverse();
    const dateLimit =
      trackingDateRange === 'today'
        ? 1
        : trackingDateRange === 'recent5'
          ? 5
          : trackingDateRange === 'recent10'
            ? 10
            : sortedDates.length;
    const allowedDates = new Set(sortedDates.slice(0, dateLimit));
    const onlyOpportunity = trackingIntersectionFilters.includes('opportunity');
    const onlyHotRank = trackingIntersectionFilters.includes('hotRank');

    return trackedRowsWithStatus.filter((item) => {
      const dateMatch = trackingDateRange === 'all' || allowedDates.has(item.signalDateKey);
      const scenarioMatch =
        trackingScenarioFilter === 'all' || item.scenario === trackingScenarioFilter;
      const oddsMatch = !trackingOnlyHighOdds || item.oddsTier === 'S' || item.oddsTier === 'A';
      const opportunityMatch = !onlyOpportunity || item.opportunityRecordHit;
      const hotRankMatch = !onlyHotRank || item.hotRankHit;
      const industryCode =
        item.industry?.code || industryMapping.get(normalizeStockCode(item.code))?.code;
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
        dateMatch &&
        scenarioMatch &&
        oddsMatch &&
        opportunityMatch &&
        hotRankMatch &&
        industryMatch &&
        keywordMatch
      );
    });
  }, [
    industryMapping,
    normalizeStockCode,
    searchText,
    trackingIndustryCodes,
    trackingIndustryInvert,
    trackingIntersectionFilters,
    trackingOnlyHighOdds,
    trackedRowsWithStatus,
    trackingDateRange,
    trackingScenarioFilter,
  ]);

  const filteredTrackingRows = useMemo(() => {
    const allowedStatuses = new Set(trackingStatusFilter);
    const uniqueRows = new Map<string, TrackedLatestSignal>();

    trackingAnalysisRows.forEach((item) => {
      if (!allowedStatuses.has(item.status)) return;
      const key = `${normalizeStockCode(item.code)}-${item.signalDateKey}`;
      const current = uniqueRows.get(key);
      uniqueRows.set(key, current ? pickPreferredTrackingRow(current, item) : item);
    });

    return Array.from(uniqueRows.values());
  }, [
    normalizeStockCode,
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
      const code = normalizeStockCode(item.code);
      if (!stockMap.has(code)) {
        stockMap.set(code, { code, name: item.name });
      }
    });

    return {
      latestDateKey,
      stocks: Array.from(stockMap.values()),
    };
  }, [filteredTrackingRows, normalizeStockCode]);

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

  const trackingAnalysisStats = useMemo(() => {
    const ruleMap = new Map<
      string,
      {
        scenarioName: string;
        matchedRule: string;
        total: number;
        passed: number;
        failed: number;
        tracking: number;
      }
    >();

    trackingAnalysisRows.forEach((item) => {
      const key = `${item.scenarioName}｜${item.matchedRule}`;
      const current =
        ruleMap.get(key) || {
          scenarioName: item.scenarioName,
          matchedRule: item.matchedRule,
          total: 0,
          passed: 0,
          failed: 0,
          tracking: 0,
        };
      current.total += 1;
      current[item.status] += 1;
      ruleMap.set(key, current);
    });

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

    const thresholds = [3, 5, 8];
    const minHits = [2, 3, 4];
    const parameterStats = thresholds.flatMap((threshold) =>
      minHits.map((minHitCount) => {
        const counts = trackingAnalysisRows.reduce(
          (acc, item) => {
            const status = getTrackingStatus(item.trackedReturns, { threshold, minHitCount }).status;
            acc[status] += 1;
            return acc;
          },
          { passed: 0, failed: 0, tracking: 0 }
        );
        const verified = counts.passed + counts.failed;
        return {
          threshold,
          minHitCount,
          ...counts,
          verified,
          passRate:
            verified > 0 ? Number(((counts.passed / verified) * 100).toFixed(1)) : null,
        };
      })
    );

    return {
      ruleStats: ruleStats.slice(0, 8),
      failedRules,
      parameterStats,
    };
  }, [trackingAnalysisRows]);

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
    return record.industry || industryMapping.get(normalizeStockCode(record.code)) || null;
  };

  const compareIndustry = (
    a: { code: string; industry?: SectorInfo | null },
    b: { code: string; industry?: SectorInfo | null }
  ) => {
    const nameA = getRecordIndustry(a)?.name || '';
    const nameB = getRecordIndustry(b)?.name || '';
    return nameA.localeCompare(nameB, 'zh-CN');
  };

  const getRecordConcepts = (record: { code: string; concepts?: SectorInfo[] }) => {
    return record.concepts || conceptMapping.get(normalizeStockCode(record.code)) || [];
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
    {
      title: '所属行业',
      width: 120,
      sorter: compareIndustry,
      showSorterTooltip: { title: '按所属行业排序' },
      render: renderIndustry,
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
      width: 100,
      render: (_, record) => <StockFeatureTag text={record.scenarioName} variant="red" />,
    },
    {
      title: '所属行业',
      width: 120,
      sorter: compareIndustry,
      showSorterTooltip: { title: '按所属行业排序' },
      render: renderIndustry,
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
    {
      title: '机会记录',
      dataIndex: 'opportunityRecordHit',
      width: 90,
      render: (hit) => <StockStatusTag status={Boolean(hit)} />,
    },
    {
      title: '热门榜',
      dataIndex: 'hotRankHit',
      width: 80,
      render: (hit) => <StockStatusTag status={Boolean(hit)} />,
    },
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
          <Space wrap className={styles.headerActions}>
            <Checkbox
              checked={excludeST}
              disabled={scanningHistory || scanningLatest}
              onChange={(e) => setExcludeST(e.target.checked)}
            >
              排除ST
            </Checkbox>
            <Button onClick={refreshHistoryCount} disabled={loadingCount} loading={loadingCount}>
              刷新统计
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={scanningHistory}
              disabled={exportCount === 0}
              onClick={handleScanHistoricalBuyPoints}
            >
              扫描历史
            </Button>
            <DatePicker
              allowClear
              value={asOfDate ? dayjs(asOfDate) : null}
              disabled={scanningLatest || scanningHistory}
              disabledDate={(current: Dayjs) => !!(current && current.isAfter(dayjs(), 'day'))}
              style={{ width: 140 }}
              placeholder="截止日(最新)"
              onChange={(date: Dayjs | null) => {
                setAsOfDate(date ? date.format('YYYY-MM-DD') : null);
              }}
            />
            <Button
              icon={<SearchOutlined />}
              loading={scanningLatest}
              disabled={exportCount === 0}
              onClick={handleScanLatestSignals}
            >
              扫描最新
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        <div className={styles.pageBody}>
          <Card className={styles.summaryPanel} size="small">
            <Row gutter={[16, 8]} className={styles.metricStrip}>
              <Col>
                <Statistic title="stockHistory 总数" value={totalCount} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="参与扫描" value={exportCount} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="行业映射数" value={industryMapping.size} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="概念映射数" value={conceptMapping.size} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="历史好买点" value={historySignals.length} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="追踪总信号" value={trackingRows.length} loading={loadingTracking} />
              </Col>
              <Col>
                <div className={styles.compactInfo}>
                  <Tooltip
                    placement="right"
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
                      ? `当前 K 线众数截止日：${latestDateSummary.dominantDate}（${latestDateSummary.dominantCount} 只）`
                      : '尚未读取到 K 线截止日'}
                  </span>
                </div>
              </Col>
            </Row>
          </Card>

          <Card className={styles.resultCard} size="small">
            <Tabs
              className={styles.resultTabs}
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key as 'tracking' | 'history');
                if (key === 'tracking' && trackingRows.length === 0) {
                  void handleLoadTrackingRows();
                }
              }}
              tabBarExtraContent={
                activeTab === 'tracking' ? (
                  <Space size={8}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loadingTracking}
                      onClick={() => void handleLoadTrackingRows()}
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
                ) : null
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
                        { label: '最近5日', value: 'recent5' },
                        { label: '最近10日', value: 'recent10' },
                        { label: '全部日期', value: 'all' },
                      ]}
                      onChange={setTrackingDateRange}
                      style={{ width: 110 }}
                      size="small"
                    />
                    <Checkbox
                      checked={trackingOnlyHighOdds}
                      onChange={(e) => setTrackingOnlyHighOdds(e.target.checked)}
                    >
                      仅S/A档
                    </Checkbox>
                    <Select
                      mode="multiple"
                      value={trackingStatusFilter}
                      options={[
                        { label: '验证中', value: 'tracking' },
                        { label: '已达标', value: 'passed' },
                        { label: '未达标', value: 'failed' },
                      ]}
                      onChange={setTrackingStatusFilter}
                      style={{ width: 190 }}
                      size="small"
                    />
                    <Space.Compact size="small">
                      <Button size="small" style={{ pointerEvents: 'none' }}>阈值</Button>
                      <InputNumber
                        min={0}
                        max={50}
                        value={trackingThreshold}
                        onChange={(value) => setTrackingThreshold(Number(value ?? 5))}
                        style={{ width: 70 }}
                        size="small"
                      />
                      <Button size="small" style={{ pointerEvents: 'none' }}>%</Button>
                    </Space.Compact>
                    <Space.Compact size="small">
                      <Button size="small" style={{ pointerEvents: 'none' }}>命中</Button>
                      <InputNumber
                        min={1}
                        max={5}
                        value={trackingMinHitCount}
                        onChange={(value) => setTrackingMinHitCount(Number(value ?? 3))}
                        style={{ width: 60 }}
                        size="small"
                      />
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

            {activeTab === 'tracking' && (
              <div className={styles.trackingStatsPanel}>
                <div className={styles.trackingStatsHeader}>
                  <Text type="secondary">追踪统计</Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setTrackingStatsCollapsed((collapsed) => !collapsed)}
                  >
                    {trackingStatsCollapsed ? '展开' : '收起'}
                  </Button>
                </div>
                {!trackingStatsCollapsed && (
                  <>
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
                  </>
                )}
              </div>
            )}

            <div className={styles.tableArea} ref={tableAreaRef}>
              <Table
                rowKey={(record) => `${record.code}-${record.date}-${record.scenario}-${record.timestamp}`}
                columns={activeColumns}
                dataSource={activeDataSource}
                pagination={{
                  pageSize: tablePageSize,
                  showSizeChanger: true,
                  pageSizeOptions: ['50', '100', '200'],
                  onChange: (_, pageSize) => setTablePageSize(pageSize),
                }}
                scroll={{
                  x: activeScrollX,
                  y: activeDataLength > 0 ? tableScrollY : undefined,
                }}
                size="small"
              />
            </div>
          </Card>
        </div>
      </Content>
      <AddStocksToWatchListModal
        visible={showAddTrackingLatestModal}
        stocks={trackingLatestSignalStocks.stocks}
        onClose={() => setShowAddTrackingLatestModal(false)}
      />
    </Layout>
  );
}
