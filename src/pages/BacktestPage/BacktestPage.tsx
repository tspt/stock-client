/**
 * 历史回测页面
 * - 导出 IndexedDB stockHistory 到 docs/回测优化/股票数据
 * - 基于当前 stockHistory 重新扫描历史好买点与场景
 * - 基于当前 stockHistory 扫描最新交易日高 lift 场景
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { getStocksHistory, type StockHistoryRecord } from '@/utils/storage/opportunityIndexedDB';
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
import { logger } from '@/utils/business/logger';
import styles from './BacktestPage.module.css';

const { Header, Content } = Layout;
const { Text, Paragraph } = Typography;

type IndustryInfo = { code: string; name: string };

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
  const [scanningHistory, setScanningHistory] = useState(false);
  const [scanningLatest, setScanningLatest] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [industryMapping, setIndustryMapping] = useState<Map<string, IndustryInfo>>(new Map());
  const [historySignals, setHistorySignals] = useState<BuyPointSignal[]>([]);
  const [latestSignals, setLatestSignals] = useState<LatestScenarioSignal[]>([]);
  const [historyScenarioFilter, setHistoryScenarioFilter] = useState<string>('all');
  const [latestScenarioFilter, setLatestScenarioFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [latestDateSummary, setLatestDateSummary] = useState({ dominantDate: '', dominantCount: 0 });

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
    const loadIndustryMapping = async () => {
      try {
        const { getIndustrySectors } = await import('@/utils/storage/sectorStocksIndexedDB');
        const mapping = new Map<string, IndustryInfo>();
        const industrySectors = await getIndustrySectors();
        industrySectors.forEach((sector) => {
          sector.children?.forEach((stock) => {
            const normalizedCode = normalizeStockCode(stock.code);
            if (!mapping.has(normalizedCode)) {
              mapping.set(normalizedCode, { code: sector.code, name: sector.name });
            }
          });
        });
        setIndustryMapping(mapping);
        logger.info(`[BacktestPage] 行业映射加载完成，共 ${mapping.size} 只股票`);
      } catch (error) {
        logger.error('[BacktestPage] 加载行业映射失败:', error);
      }
    };

    loadIndustryMapping();
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

  const historicalColumns: ColumnsType<BuyPointSignal> = [
    {
      title: '股票',
      dataIndex: 'name',
      width: 160,
      fixed: 'left',
      render: (_, record) => (
        <div>
          <div>{record.name}</div>
          <Text type="secondary">{record.code}</Text>
        </div>
      ),
    },
    { title: '买点日期', dataIndex: 'date', width: 110 },
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
    { title: '1日', width: 80, render: (_, record) => renderReturn(record.returns, 'd1') },
    { title: '2日', width: 80, render: (_, record) => renderReturn(record.returns, 'd2') },
    { title: '3日', width: 80, render: (_, record) => renderReturn(record.returns, 'd3') },
    { title: '5日', width: 80, render: (_, record) => renderReturn(record.returns, 'd5') },
    { title: '两周', width: 80, render: (_, record) => renderReturn(record.returns, 'd10') },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 260,
    },
  ];

  const latestColumns: ColumnsType<LatestScenarioSignal> = [
    {
      title: '股票',
      dataIndex: 'name',
      width: 160,
      fixed: 'left',
      render: (_, record) => (
        <div>
          <div>{record.name}</div>
          <Text type="secondary">{record.code}</Text>
        </div>
      ),
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
    { title: '1日', width: 80, render: (_, record) => renderReturn(record.returns, 'd1') },
    { title: '2日', width: 80, render: (_, record) => renderReturn(record.returns, 'd2') },
    { title: '3日', width: 80, render: (_, record) => renderReturn(record.returns, 'd3') },
    { title: '5日', width: 80, render: (_, record) => renderReturn(record.returns, 'd5') },
    { title: '两周', width: 80, render: (_, record) => renderReturn(record.returns, 'd10') },
    {
      title: '命中规则',
      dataIndex: 'matchedRule',
      ellipsis: true,
      width: 280,
    },
  ];

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
        </div>
      </Header>

      <Content className={styles.content}>
        <div className={styles.pageBody}>
          <Card>
            <Row gutter={[24, 16]} style={{ marginBottom: 20 }}>
              <Col>
                <Statistic title="stockHistory 总数" value={totalCount} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="参与扫描/导出" value={exportCount} loading={loadingCount} />
              </Col>
              <Col>
                <Statistic title="行业映射数" value={industryMapping.size} />
              </Col>
              <Col>
                <Statistic title="历史好买点" value={historySignals.length} />
              </Col>
              <Col>
                <Statistic title="最新日命中" value={latestSignals.length} />
              </Col>
            </Row>

            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                latestDateSummary.dominantDate
                  ? `当前 K 线众数截止日：${latestDateSummary.dominantDate}（${latestDateSummary.dominantCount} 只）`
                  : '尚未读取到 K 线截止日'
              }
              description="历史好买点和最新日场景都直接读取 IndexedDB stockHistory；如果机会分析更新了 K 线，点击下方扫描按钮即可用最新数据重算。"
            />

            <Paragraph type="secondary">
              历史好买点规则：买入收盘后 1/2/3/5/10 日累计收益中至少 3 项 &gt; 5%。
              最新交易日只展示 lift&gt;1 的高价值场景，未来收益尚未发生时对应列为空。
            </Paragraph>

            <Space wrap>
              <Checkbox
                checked={excludeST}
                disabled={exporting || scanningHistory || scanningLatest}
                onChange={(e) => setExcludeST(e.target.checked)}
              >
                排除 ST 股票
              </Checkbox>
              <Button onClick={refreshHistoryCount} disabled={loadingCount}>
                刷新数量
              </Button>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                loading={exporting}
                disabled={exportCount === 0 && !exporting}
                onClick={handleExportAllKlineData}
              >
                导出 K 线数据
              </Button>
              <Button
                icon={<ReloadOutlined />}
                loading={scanningHistory}
                disabled={exportCount === 0}
                onClick={handleScanHistoricalBuyPoints}
              >
                重新扫描历史买点
              </Button>
              <Button
                icon={<SearchOutlined />}
                loading={scanningLatest}
                disabled={exportCount === 0}
                onClick={handleScanLatestSignals}
              >
                扫描最新交易日
              </Button>
            </Space>

            {exporting && exportProgress.total > 0 && (
              <div className={styles.exportProgress}>
                <Progress
                  percent={progressPercent}
                  status="active"
                  format={() => `${exportProgress.current}/${exportProgress.total}`}
                />
              </div>
            )}
          </Card>

          <Card>
            <Space wrap style={{ marginBottom: 16 }}>
              <Input
                allowClear
                placeholder="搜索股票名称/代码"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 220 }}
              />
            </Space>

            <Tabs
              items={[
                {
                  key: 'latest',
                  label: `最新交易日命中 (${filteredLatestSignals.length})`,
                  children: (
                    <>
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Select
                          value={latestScenarioFilter}
                          options={[
                            { label: '全部高价值场景', value: 'all' },
                            ...HIGH_LIFT_SCENARIOS.map((s) => ({ label: s.name, value: s.id })),
                          ]}
                          onChange={setLatestScenarioFilter}
                          style={{ width: 200 }}
                        />
                      </Space>
                      <Table
                        rowKey={(record) => `${record.code}-${record.date}-${record.scenario}`}
                        columns={latestColumns}
                        dataSource={filteredLatestSignals}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        scroll={{ x: 1200 }}
                        size="small"
                      />
                    </>
                  ),
                },
                {
                  key: 'history',
                  label: `历史好买点 (${filteredHistorySignals.length})`,
                  children: (
                    <>
                      <Space wrap style={{ marginBottom: 12 }}>
                        <Select
                          value={historyScenarioFilter}
                          options={scenarioOptions}
                          onChange={setHistoryScenarioFilter}
                          style={{ width: 220 }}
                        />
                        {scenarioStats.map((item) => (
                          <Tag key={item.id} color={highLiftIds.has(item.id) ? 'red' : 'blue'}>
                            {item.name}: {item.count}
                          </Tag>
                        ))}
                      </Space>
                      <Table
                        rowKey={(record) => `${record.code}-${record.date}-${record.scenario}`}
                        columns={historicalColumns}
                        dataSource={filteredHistorySignals}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        scroll={{ x: 1300 }}
                        size="small"
                      />
                    </>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
}
