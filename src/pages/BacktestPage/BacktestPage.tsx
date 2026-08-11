/**
 * 历史回测页面
 * - 导出 IndexedDB stockHistory 到 docs/回测优化/股票数据
 * - 基于当前 stockHistory 重新扫描历史好买点与场景
 * - 基于当前 stockHistory 扫描最新交易日高 lift 场景
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Layout,
  Card,
  Button,
  Progress,
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
  Dropdown,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownOutlined, ExportOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  getStocksHistory,
  type StockHistoryRecord,
} from '@/utils/storage/opportunityIndexedDB';
import { getAllStockRecords } from '@/services/opportunity/recordService';
import {
  HIGH_LIFT_SCENARIOS,
  SCENARIOS,
  scanHistoricalBuyPoints,
  scanLatestScenarioSignals,
  type BuyPointSignal,
  type LatestScenarioSignal,
  type ReturnSnapshot,
  type ScenarioId,
} from '@/utils/analysis/buypointScenario';
import {
  buildTrackedLatestSignals,
  getTrackingStatus,
  type TrackedLatestSignal,
  type TrackingStatus,
} from '@/utils/analysis/latestSignalTracking';
import {
  exportBacktestSignalsToExcel,
  exportBacktestSignalsToJson,
  resolveHistoryExportDate,
  resolveLatestExportDate,
  type BacktestExportFormat,
} from '@/utils/export/backtestExportUtils';
import { logger } from '@/utils/business/logger';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

/** 表格滚动区为表头与分页预留的高度 */
const TABLE_SCROLL_Y_RESERVE = 72;

type SectorInfo = { code: string; name: string };

function isSTStock(name: string): boolean {
  return name.includes('ST');
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
  const [exporting, setExporting] = useState(false);
  const [exportingResults, setExportingResults] = useState(false);
  const [scanningHistory, setScanningHistory] = useState(false);
  const [scanningLatest, setScanningLatest] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [industryMapping, setIndustryMapping] = useState<Map<string, SectorInfo>>(new Map());
  const [conceptMapping, setConceptMapping] = useState<Map<string, SectorInfo[]>>(new Map());
  const [historySignals, setHistorySignals] = useState<BuyPointSignal[]>([]);
  const [latestSignals, setLatestSignals] = useState<LatestScenarioSignal[]>([]);
  const [historyScenarioFilter, setHistoryScenarioFilter] = useState<string>('all');
  const [latestScenarioFilter, setLatestScenarioFilter] = useState<string>('all');
  const [trackingScenarioFilter, setTrackingScenarioFilter] = useState<string>('all');
  const [trackingDateRange, setTrackingDateRange] = useState<string>('recent5');
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<TrackingStatus[]>([
    'tracking',
    'passed',
  ]);
  const [trackingOnlyOpportunity, setTrackingOnlyOpportunity] = useState(true);
  const [trackingThreshold, setTrackingThreshold] = useState(5);
  const [trackingMinHitCount, setTrackingMinHitCount] = useState(3);
  const [trackingRows, setTrackingRows] = useState<TrackedLatestSignal[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [latestDateSummary, setLatestDateSummary] = useState({ dominantDate: '', dominantCount: 0 });
  const [activeTab, setActiveTab] = useState('latest');
  const [tablePageSize, setTablePageSize] = useState(100);
  const [tableScrollY, setTableScrollY] = useState(360);
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

  const handleExportAllKlineData = async () => {
    if (!window.electronAPI?.batchExportKlineData) {
      message.error('批量导出功能不可用（需在 Electron 环境中运行）');
      return;
    }

    try {
      setExporting(true);
      setExportProgress({ current: 0, total: 0 });
      message.info('正在读取 IndexedDB stockHistory...');

      const { allHistories, histories } = await readFilteredHistories();
      const skippedST = allHistories.length - histories.length;

      if (allHistories.length === 0) {
        message.warning('IndexedDB 中没有 stockHistory 数据');
        return;
      }

      if (histories.length === 0) {
        message.warning('筛选后没有可导出的股票');
        return;
      }

      setExportProgress({ current: 0, total: histories.length });

      const stocksData = histories.map((history, index) => {
        const stockCode = normalizeStockCode(history.code);
        const industry = history.industry || industryMapping.get(stockCode) || null;
        if ((index + 1) % 50 === 0 || index + 1 === histories.length) {
          setExportProgress({ current: index + 1, total: histories.length });
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

      const skipTip = excludeST && skippedST > 0 ? `（已排除 ${skippedST} 只 ST）` : '';
      message.info(`正在导出 ${stocksData.length} 只股票的 K 线数据${skipTip}...`);
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
      logger.error('[BacktestPage] 导出失败:', error);
      message.error('导出失败: ' + (error as Error).message);
    } finally {
      setExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  const handleScanHistoricalBuyPoints = async () => {
    try {
      setScanningHistory(true);
      message.info('正在基于当前 stockHistory 扫描历史好买点...');
      const { histories } = await readFilteredHistories();
      const signals = scanHistoricalBuyPoints(histories, {
        minHitCount: 3,
        threshold: 5,
        includeOther: true,
      }).sort((a, b) => b.timestamp - a.timestamp);
      setHistorySignals(signals);
      message.success(`历史好买点扫描完成，共 ${signals.length} 条`);
    } catch (error) {
      logger.error('[BacktestPage] 扫描历史好买点失败:', error);
      message.error('扫描历史好买点失败: ' + (error as Error).message);
    } finally {
      setScanningHistory(false);
    }
  };

  const handleScanLatestSignals = async () => {
    try {
      setScanningLatest(true);
      message.info('正在扫描最新交易日高价值场景...');
      const { histories } = await readFilteredHistories();
      const signals = scanLatestScenarioSignals(histories, { highLiftOnly: true }).sort((a, b) => {
        if ((b.lift || 0) !== (a.lift || 0)) return (b.lift || 0) - (a.lift || 0);
        return a.name.localeCompare(b.name, 'zh-CN');
      });
      setLatestSignals(signals);
      message.success(`最新交易日扫描完成，命中 ${signals.length} 只`);
    } catch (error) {
      logger.error('[BacktestPage] 扫描最新交易日失败:', error);
      message.error('扫描最新交易日失败: ' + (error as Error).message);
    } finally {
      setScanningLatest(false);
    }
  };

  const handleLoadTrackingRows = async () => {
    if (!window.electronAPI?.readLatestBuyPointFiles) {
      message.error('读取最新买点文件不可用（需在 Electron 环境中运行并重启应用）');
      return;
    }

    try {
      setLoadingTracking(true);
      const result = await window.electronAPI.readLatestBuyPointFiles();
      if (!result.success) {
        message.error('读取最新买点文件失败: ' + (result.error || '未知错误'));
        return;
      }

      const files = result.files || [];
      if (files.length === 0) {
        setTrackingRows([]);
        message.warning('暂无最新买点文件，请先扫描并导出最新交易日命中');
        return;
      }

      const histories = filterHistories(await getStocksHistory([]), excludeST);
      const records = await getAllStockRecords();
      const rows = buildTrackedLatestSignals(files, histories, records, {
        threshold: trackingThreshold,
        minHitCount: trackingMinHitCount,
      });
      setTrackingRows(rows);
      message.success(`买点追踪已更新，共读取 ${files.length} 个文件、${rows.length} 条信号`);
    } catch (error) {
      logger.error('[BacktestPage] 更新买点追踪失败:', error);
      message.error('更新买点追踪失败: ' + (error as Error).message);
    } finally {
      setLoadingTracking(false);
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

  const filteredLatestSignals = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return latestSignals.filter((item) => {
      const scenarioMatch =
        latestScenarioFilter === 'all' || item.scenario === latestScenarioFilter;
      const keywordMatch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword);
      return scenarioMatch && keywordMatch;
    });
  }, [latestScenarioFilter, latestSignals, searchText]);

  const trackedRowsWithStatus = useMemo(() => {
    return trackingRows.map((row) => ({
      ...row,
      ...getTrackingStatus(row.trackedReturns, {
        threshold: trackingThreshold,
        minHitCount: trackingMinHitCount,
      }),
    }));
  }, [trackingMinHitCount, trackingRows, trackingThreshold]);

  const trackingAnalysisRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const sortedDates = Array.from(new Set(trackedRowsWithStatus.map((item) => item.signalDateKey)))
      .sort()
      .reverse();
    const dateLimit =
      trackingDateRange === 'recent5' ? 5 : trackingDateRange === 'recent10' ? 10 : sortedDates.length;
    const allowedDates = new Set(sortedDates.slice(0, dateLimit));

    return trackedRowsWithStatus.filter((item) => {
      const dateMatch = trackingDateRange === 'all' || allowedDates.has(item.signalDateKey);
      const scenarioMatch =
        trackingScenarioFilter === 'all' || item.scenario === trackingScenarioFilter;
      const opportunityMatch = !trackingOnlyOpportunity || item.opportunityRecordHit;
      const keywordMatch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword);
      return dateMatch && scenarioMatch && opportunityMatch && keywordMatch;
    });
  }, [
    searchText,
    trackedRowsWithStatus,
    trackingDateRange,
    trackingOnlyOpportunity,
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

  const handleExportResults = async (format: BacktestExportFormat) => {
    if (activeTab === 'tracking') {
      message.info('买点追踪导出稍后补充，当前可先在表格筛选查看');
      return;
    }

    const kind = activeTab === 'latest' ? 'latest' : 'history';
    const sourceData = kind === 'latest' ? filteredLatestSignals : filteredHistorySignals;
    const data = sourceData.map((item) => ({
      ...item,
      industry: getRecordIndustry(item),
      concepts: getRecordConcepts(item),
    }));

    if (data.length === 0) {
      message.warning('请先扫描');
      return;
    }

    if (!window.electronAPI?.exportBacktestSignalsFile) {
      message.error('导出到项目目录不可用（需在 Electron 环境中运行）');
      return;
    }

    try {
      setExportingResults(true);
      const fileBaseName =
        kind === 'latest'
          ? resolveLatestExportDate(filteredLatestSignals, latestDateSummary.dominantDate)
          : resolveHistoryExportDate(latestDateSummary.dominantDate);

      const meta = {
        tab: kind,
        searchText: searchText.trim(),
        scenarioFilter: kind === 'latest' ? latestScenarioFilter : historyScenarioFilter,
        excludeST,
        latestDate: latestDateSummary.dominantDate || null,
        fileBaseName,
      };

      const filePath =
        format === 'json'
          ? await exportBacktestSignalsToJson({ kind, data, fileBaseName, meta })
          : await exportBacktestSignalsToExcel({ kind, data, fileBaseName });

      message.success(
        `已导出${kind === 'latest' ? '最新交易日命中' : '历史好买点'} ${data.length} 条到 ${filePath}`
      );
    } catch (error) {
      logger.error('[BacktestPage] 导出结果失败:', error);
      message.error('导出结果失败: ' + (error as Error).message);
    } finally {
      setExportingResults(false);
    }
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

  const progressPercent =
    exportProgress.total > 0
      ? Math.round((exportProgress.current / exportProgress.total) * 100)
      : 0;

  const renderReturn = (returns: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    const value = returns[key];
    return <Text style={{ color: returnColor(value) }}>{returnText(value)}</Text>;
  };

  const compareReturn = (a: ReturnSnapshot, b: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    return (a[key] ?? Number.NEGATIVE_INFINITY) - (b[key] ?? Number.NEGATIVE_INFINITY);
  };

  function pickPreferredTrackingRow(current: TrackedLatestSignal, next: TrackedLatestSignal) {
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
    if (status === 'passed') return <Tag color="red">已达标</Tag>;
    if (status === 'failed') return <Tag>未达标</Tag>;
    return <Tag color="blue">验证中</Tag>;
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

  const getRecordConcepts = (record: { code: string; concepts?: SectorInfo[] }) => {
    return record.concepts || conceptMapping.get(normalizeStockCode(record.code)) || [];
  };

  const renderIndustry = (_: unknown, record: { code: string; industry?: SectorInfo | null }) => {
    const industry = getRecordIndustry(record);
    return industry ? industry.name : <Text type="secondary">-</Text>;
  };

  const renderConcepts = (_: unknown, record: { code: string; concepts?: SectorInfo[] }) => {
    const concepts = getRecordConcepts(record);
    if (concepts.length === 0) return <Text type="secondary">-</Text>;
    return (
      <div className={styles.conceptTags}>
        {concepts.slice(0, 3).map((concept) => (
          <Tag key={concept.code}>{concept.name}</Tag>
        ))}
        {concepts.length > 3 && <Tag color="default">+{concepts.length - 3}</Tag>}
      </div>
    );
  };

  const historicalColumns: ColumnsType<BuyPointSignal> = [
    {
      title: '股票号码',
      dataIndex: 'code',
      width: 100,
      fixed: 'left',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
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
      render: (_, record) => (
        <Tag color={highLiftIds.has(record.scenario) ? 'red' : 'blue'}>
          {record.scenarioName}
        </Tag>
      ),
    },
    { title: '买入价', dataIndex: 'entryPrice', width: 90 },
    { title: '命中项', dataIndex: 'hitCount', width: 80 },
    { title: '1日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd1'), render: (_, record) => renderReturn(record.returns, 'd1') },
    { title: '2日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd2'), render: (_, record) => renderReturn(record.returns, 'd2') },
    { title: '3日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd3'), render: (_, record) => renderReturn(record.returns, 'd3') },
    { title: '5日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd5'), render: (_, record) => renderReturn(record.returns, 'd5') },
    { title: '两周', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd10'), render: (_, record) => renderReturn(record.returns, 'd10') },
    { title: '所属行业', width: 120, render: renderIndustry },
    { title: '所属概念', width: 360, render: renderConcepts },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 260,
    },
  ];

  const latestColumns: ColumnsType<LatestScenarioSignal> = [
    {
      title: '股票号码',
      dataIndex: 'code',
      width: 100,
      fixed: 'left',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
    },
    { title: '数据日期', dataIndex: 'date', width: 110 },
    {
      title: '场景',
      dataIndex: 'scenarioName',
      width: 150,
      render: (_, record) => <Tag color="red">{record.scenarioName}</Tag>,
    },
    { title: '收盘价', dataIndex: 'close', width: 90 },
    { title: 'lift', dataIndex: 'lift', width: 80, render: (v) => v?.toFixed(2) },
    { title: '1日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd1'), render: (_, record) => renderReturn(record.returns, 'd1') },
    { title: '2日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd2'), render: (_, record) => renderReturn(record.returns, 'd2') },
    { title: '3日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd3'), render: (_, record) => renderReturn(record.returns, 'd3') },
    { title: '5日', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd5'), render: (_, record) => renderReturn(record.returns, 'd5') },
    { title: '两周', width: 80, sorter: (a, b) => compareReturn(a.returns, b.returns, 'd10'), render: (_, record) => renderReturn(record.returns, 'd10') },
    { title: '所属行业', width: 120, render: renderIndustry },
    { title: '所属概念', width: 360, render: renderConcepts },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 280,
    },
  ];

  const trackingColumns: ColumnsType<TrackedLatestSignal> = [
    {
      title: '股票号码',
      dataIndex: 'code',
      width: 100,
      fixed: 'left',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
    },
    { title: '信号日期', dataIndex: 'signalDate', width: 110, sorter: (a, b) => a.timestamp - b.timestamp },
    {
      title: '场景',
      dataIndex: 'scenarioName',
      width: 150,
      render: (_, record) => <Tag color={highLiftIds.has(record.scenario) ? 'red' : 'blue'}>{record.scenarioName}</Tag>,
    },
    { title: '收盘价', dataIndex: 'close', width: 90 },
    { title: 'lift', dataIndex: 'lift', width: 80, render: (v) => v?.toFixed(2) },
    { title: '1日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd1'), render: (_, record) => renderReturn(record.trackedReturns, 'd1') },
    { title: '2日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd2'), render: (_, record) => renderReturn(record.trackedReturns, 'd2') },
    { title: '3日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd3'), render: (_, record) => renderReturn(record.trackedReturns, 'd3') },
    { title: '5日', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd5'), render: (_, record) => renderReturn(record.trackedReturns, 'd5') },
    { title: '两周', width: 80, sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd10'), render: (_, record) => renderReturn(record.trackedReturns, 'd10') },
    { title: '已发生', dataIndex: 'occurredCount', width: 80 },
    { title: '命中', dataIndex: 'hitCount', width: 80 },
    { title: '状态', dataIndex: 'status', width: 90, render: renderTrackingStatus },
    {
      title: '机会记录',
      dataIndex: 'opportunityRecordHit',
      width: 90,
      render: (hit) => <Tag color={hit ? 'green' : 'default'}>{hit ? '是' : '否'}</Tag>,
    },
    { title: '所属行业', width: 120, render: renderIndustry },
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
      style={{ width: 220 }}
      size="small"
    />
  );

  const activeDataLength =
    activeTab === 'latest'
      ? filteredLatestSignals.length
      : activeTab === 'tracking'
        ? filteredTrackingRows.length
        : filteredHistorySignals.length;
  const activeColumns: ColumnsType<any> =
    activeTab === 'latest'
      ? latestColumns
      : activeTab === 'tracking'
        ? trackingColumns
        : historicalColumns;
  const activeDataSource =
    activeTab === 'latest'
      ? filteredLatestSignals
      : activeTab === 'tracking'
        ? filteredTrackingRows
        : filteredHistorySignals;
  const activeScrollX = activeTab === 'latest' ? 1800 : activeTab === 'tracking' ? 2140 : 1800;

  return (
    <Layout className={styles.backtestPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <h1 className={styles.pageTitle}>历史回测</h1>
            <span className={styles.pageSubtitle}>
              K 线导出、历史好买点归类、最新交易日场景扫描
            </span>
          </div>
          <Space wrap className={styles.headerActions}>
            <Checkbox
              checked={excludeST}
              disabled={exporting || scanningHistory || scanningLatest}
              onChange={(e) => setExcludeST(e.target.checked)}
            >
              排除ST
            </Checkbox>
            <Button onClick={refreshHistoryCount} disabled={loadingCount} loading={loadingCount}>
              刷新统计
            </Button>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              loading={exporting}
              disabled={exportCount === 0 && !exporting}
              onClick={handleExportAllKlineData}
            >
              导出K线
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: 'xlsx', label: '导出 Excel (.xlsx)' },
                  { key: 'json', label: '导出 JSON (.json)' },
                ],
                onClick: ({ key }) => {
                  void handleExportResults(key as BacktestExportFormat);
                },
              }}
            >
              <Button icon={<ExportOutlined />} loading={exportingResults}>
                导出结果 <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              icon={<ReloadOutlined />}
              loading={scanningHistory}
              disabled={exportCount === 0}
              onClick={handleScanHistoricalBuyPoints}
            >
              扫描历史
            </Button>
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
                <Statistic title="参与扫描/导出" value={exportCount} loading={loadingCount} />
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
                <Statistic title="最新日命中" value={latestSignals.length} loading={loadingCount} />
              </Col>
              <Col>
                <div className={styles.compactInfo}>
                  <Tooltip
                    placement="right"
                    title={
                      <div className={styles.compactInfoTooltip}>
                        <div>历史好买点和最新日场景都直接读取 IndexedDB stockHistory；如果机会分析更新了 K 线，点击顶部扫描按钮即可用最新数据重算。</div>
                        <div>历史好买点规则：买入收盘后 1/2/3/5/10 日累计收益中至少 3 项 &gt; 5%。</div>
                        <div>最新交易日只展示 lift&gt;1 的高价值场景，未来收益尚未发生时对应列为空。</div>
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

            {exporting && exportProgress.total > 0 && (
              <div className={styles.exportProgress}>
                <Progress
                  percent={progressPercent}
                  status="active"
                  size="small"
                  format={() => `${exportProgress.current}/${exportProgress.total}`}
                />
              </div>
            )}
          </Card>

          <Card className={styles.resultCard} size="small">
            <Tabs
              className={styles.resultTabs}
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key);
                if (key === 'tracking' && trackingRows.length === 0) {
                  void handleLoadTrackingRows();
                }
              }}
              items={[
                {
                  key: 'latest',
                  label: `最新交易日命中 (${filteredLatestSignals.length})`,
                },
                {
                  key: 'history',
                  label: `历史好买点 (${filteredHistorySignals.length})`,
                },
                {
                  key: 'tracking',
                  label: `买点追踪 (${filteredTrackingRows.length})`,
                },
              ]}
            />

            <div className={styles.tabToolbar}>
              <div className={styles.tabToolbarLeft}>
                {activeTab === 'latest' ? (
                  <Select
                    value={latestScenarioFilter}
                    options={[
                      { label: '全部高价值场景', value: 'all' },
                      ...HIGH_LIFT_SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
                    ]}
                    onChange={setLatestScenarioFilter}
                    style={{ width: 200 }}
                    size="small"
                  />
                ) : activeTab === 'tracking' ? (
                  <>
                    <Checkbox
                      checked={trackingOnlyOpportunity}
                      onChange={(e) => setTrackingOnlyOpportunity(e.target.checked)}
                    >
                      仅机会交集
                    </Checkbox>
                    <Select
                      value={trackingDateRange}
                      options={[
                        { label: '最近5日', value: 'recent5' },
                        { label: '最近10日', value: 'recent10' },
                        { label: '全部日期', value: 'all' },
                      ]}
                      onChange={setTrackingDateRange}
                      style={{ width: 110 }}
                      size="small"
                    />
                    <Select
                      value={trackingScenarioFilter}
                      options={[
                        { label: '全部场景', value: 'all' },
                        ...HIGH_LIFT_SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
                      ]}
                      onChange={setTrackingScenarioFilter}
                      style={{ width: 160 }}
                      size="small"
                    />
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
                    <InputNumber
                      addonBefore="阈值"
                      addonAfter="%"
                      min={0}
                      max={50}
                      value={trackingThreshold}
                      onChange={(value) => setTrackingThreshold(Number(value ?? 5))}
                      style={{ width: 120 }}
                      size="small"
                    />
                    <InputNumber
                      addonBefore="命中"
                      min={1}
                      max={5}
                      value={trackingMinHitCount}
                      onChange={(value) => setTrackingMinHitCount(Number(value ?? 3))}
                      style={{ width: 100 }}
                      size="small"
                    />
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loadingTracking}
                      onClick={handleLoadTrackingRows}
                    >
                      更新收益
                    </Button>
                  </>
                ) : (
                  <>
                    <Select
                      value={historyScenarioFilter}
                      options={scenarioOptions}
                      onChange={setHistoryScenarioFilter}
                      style={{ width: 220 }}
                      size="small"
                    />
                    {scenarioStats.map((item) => (
                      <Tag key={item.id} color={highLiftIds.has(item.id) ? 'red' : 'blue'}>
                        {item.name}: {item.count}
                      </Tag>
                    ))}
                  </>
                )}
              </div>
              {renderSearchInput()}
            </div>

            {activeTab === 'tracking' && (
              <div className={styles.trackingStatsPanel}>
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
                          color="default"
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
                          color={item.passRate != null && item.passRate >= 50 ? 'red' : 'blue'}
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
                        <Tag key={`${item.threshold}-${item.minHitCount}`} color="purple">
                          {item.threshold}% / {item.minHitCount}中：
                          {item.passRate == null ? '待验证' : `${item.passRate}%`}
                          （{item.passed}/{item.verified}）
                        </Tag>
                      ))}
                    </Space>
                  </div>
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
    </Layout>
  );
}
