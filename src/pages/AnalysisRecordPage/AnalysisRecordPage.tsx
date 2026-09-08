/**
 * 分析记录页面
 * 展示股票上榜统计信息、趋势图，以及机会名单收益追踪
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Layout,
  Card,
  Button,
  Space,
  Table,
  Tabs,
  Spin,
  Empty,
  Typography,
  App,
  Switch,
  Select,
  Input,
  InputNumber,
  Statistic,
  Row,
  Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  BarChartOutlined,
  TableOutlined,
  LineChartOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { StockStatistics } from '@/types/stock';
import type { ReturnSnapshot } from '@/utils/analysis/buypointScenario';
import {
  calculateStockStatistics,
  calculateTrendData,
  getAllStockRecords,
} from '@/services/opportunity/recordService';
import { StockTrendChart } from '@/components/StockTrendChart/StockTrendChart';
import { StockConceptTags, StockIntensityTag, StockStatusTag } from '@/components/common/Tags';
import { getStocksHistory } from '@/utils/storage/opportunityIndexedDB';
import {
  getTrackingStatus,
  type TrackingStatus,
} from '@/utils/analysis/latestSignalTracking';
import {
  buildTrackedOpportunityRecords,
  type TrackedOpportunityRecord,
} from '@/utils/analysis/opportunityRecordTracking';
import { logger } from '@/utils/business/logger';
import styles from './AnalysisRecordPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

function returnText(value: number | null): string {
  return value == null ? '-' : `${value.toFixed(2)}%`;
}

function returnColor(value: number | null): string | undefined {
  if (value == null) return undefined;
  if (value > 5) return '#cf1322';
  if (value > 0) return '#d46b08';
  return '#389e0d';
}

export function AnalysisRecordPage() {
  const { message } = App.useApp();
  const [statistics, setStatistics] = useState<StockStatistics[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [trendData, setTrendData] = useState<Array<{ date: string; count: number }>>([]);
  const [activeTab, setActiveTab] = useState('table');
  const [consecutiveFilterEnabled, setConsecutiveFilterEnabled] = useState(false);
  const [minConsecutiveDays, setMinConsecutiveDays] = useState(2);
  const [tablePageSize, setTablePageSize] = useState(100);

  const [trackingRows, setTrackingRows] = useState<TrackedOpportunityRecord[]>([]);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [trackingLoaded, setTrackingLoaded] = useState(false);
  const [trackingDateRange, setTrackingDateRange] = useState('all');
  const [trackingMinHitCount, setTrackingMinHitCount] = useState(2);
  const [trackingThreshold, setTrackingThreshold] = useState(5);
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<TrackingStatus[]>([
    'passed',
    'failed',
    'tracking',
  ]);
  const [trackingSearchText, setTrackingSearchText] = useState('');
  const [trackingPageSize, setTrackingPageSize] = useState(100);

  const filteredStatistics = useMemo(() => {
    if (!consecutiveFilterEnabled) {
      return statistics;
    }
    return statistics
      .filter((item) => (item.consecutiveDays ?? 0) >= minConsecutiveDays)
      .sort((a, b) => (b.consecutiveDays ?? 0) - (a.consecutiveDays ?? 0) || b.count - a.count);
  }, [statistics, consecutiveFilterEnabled, minConsecutiveDays]);

  // 加载统计数据
  const loadStatistics = async () => {
    setLoading(true);
    try {
      const data = await calculateStockStatistics(dateRange ? { startDate: dateRange[0], endDate: dateRange[1] } : undefined);
      setStatistics(data);
    } catch (error) {
      message.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载趋势数据
  const loadTrendData = async () => {
    try {
      const data = await calculateTrendData(dateRange ? { startDate: dateRange[0], endDate: dateRange[1] } : undefined);
      setTrendData(data);
    } catch (error) {
      message.error('加载趋势数据失败');
    }
  };

  // 当日期范围改变时重新加载
  const handleDateRangeChange = (dates: [string, string] | null) => {
    setDateRange(dates);
    loadStatistics();
    loadTrendData();
  };

  const loadTrackingRows = useCallback(
    async (silent = false) => {
      try {
        setLoadingTracking(true);
        const [records, histories] = await Promise.all([
          getAllStockRecords(),
          getStocksHistory([]),
        ]);
        const rows = buildTrackedOpportunityRecords(records, histories, {
          threshold: trackingThreshold,
          minHitCount: trackingMinHitCount,
        });
        setTrackingRows(rows);
        setTrackingLoaded(true);
        if (!silent) {
          message.success(`机会收益已更新，共 ${rows.length} 条`);
        }
      } catch (error) {
        logger.error('[AnalysisRecordPage] 更新机会收益失败:', error);
        if (!silent) {
          message.error('更新机会收益失败: ' + (error as Error).message);
        }
      } finally {
        setLoadingTracking(false);
      }
    },
    [message, trackingMinHitCount, trackingThreshold]
  );

  // 初始加载
  useEffect(() => {
    loadStatistics();
    loadTrendData();
  }, []);

  useEffect(() => {
    if (activeTab === 'returns' && !trackingLoaded && !loadingTracking) {
      void loadTrackingRows(true);
    }
  }, [activeTab, trackingLoaded, loadingTracking, loadTrackingRows]);

  const trackedRowsWithStatus = useMemo(() => {
    return trackingRows.map((row) => ({
      ...row,
      ...getTrackingStatus(row.trackedReturns, {
        threshold: trackingThreshold,
        minHitCount: trackingMinHitCount,
      }),
    }));
  }, [trackingMinHitCount, trackingRows, trackingThreshold]);

  const filteredTrackingRows = useMemo(() => {
    const keyword = trackingSearchText.trim().toLowerCase();
    const sortedDates = Array.from(new Set(trackedRowsWithStatus.map((item) => item.signalDateKey)))
      .sort()
      .reverse();
    const dateLimit =
      trackingDateRange === 'today'
        ? 1
        : trackingDateRange === 'recent2'
          ? 2
          : trackingDateRange === 'recent3'
            ? 3
            : trackingDateRange === 'recent5'
              ? 5
              : trackingDateRange === 'recent6'
                ? 6
                : trackingDateRange === 'recent12'
                  ? 12
                  : sortedDates.length;
    const allowedDates = new Set(sortedDates.slice(0, dateLimit));
    const allowedStatuses = new Set(trackingStatusFilter);

    return trackedRowsWithStatus
      .filter((item) => {
        const dateMatch = trackingDateRange === 'all' || allowedDates.has(item.signalDateKey);
        const statusMatch = allowedStatuses.has(item.status);
        const keywordMatch =
          !keyword ||
          item.name.toLowerCase().includes(keyword) ||
          item.code.toLowerCase().includes(keyword);
        return dateMatch && statusMatch && keywordMatch;
      })
      .sort((a, b) => {
        // 优先展示已有未来收益的行，避免最新交易日（收益尚未发生）占满首屏
        if (b.occurredCount !== a.occurredCount) return b.occurredCount - a.occurredCount;
        const aMax = a.maxReturn ?? Number.NEGATIVE_INFINITY;
        const bMax = b.maxReturn ?? Number.NEGATIVE_INFINITY;
        if (bMax !== aMax) return bMax - aMax;
        if (a.signalDateKey !== b.signalDateKey) {
          return b.signalDateKey.localeCompare(a.signalDateKey);
        }
        return a.code.localeCompare(b.code);
      });
  }, [
    trackedRowsWithStatus,
    trackingDateRange,
    trackingSearchText,
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
    return { total, passed, failed, tracking, verified, passRate, avgMaxReturn };
  }, [filteredTrackingRows]);

  const renderReturn = (returns: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    const value = returns[key] ?? null;
    return <Text style={{ color: returnColor(value) }}>{returnText(value)}</Text>;
  };

  const compareReturn = (a: ReturnSnapshot, b: ReturnSnapshot, key: keyof ReturnSnapshot) => {
    return (a[key] ?? Number.NEGATIVE_INFINITY) - (b[key] ?? Number.NEGATIVE_INFINITY);
  };

  // 表格列定义
  const columns: ColumnsType<StockStatistics> = [
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      fixed: 'left',
      render: (text: string) => <Text style={{ color: '#1890ff', textShadow: '0 0 0.25px currentcolor' }}>{text}</Text>,
    },
    {
      title: '出现次数',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      sorter: (a, b) => a.count - b.count,
      render: (count: number) => <StockIntensityTag value={count} threshold={3} />,
    },
    {
      title: '连续天数',
      dataIndex: 'consecutiveDays',
      key: 'consecutiveDays',
      width: 100,
      sorter: (a, b) => (a.consecutiveDays ?? 0) - (b.consecutiveDays ?? 0),
      render: (days?: number) => {
        const value = days ?? 0;
        if (value === 0) {
          return <span style={{ color: '#999' }}>-</span>;
        }
        return <StockIntensityTag value={value} threshold={3} />;
      },
    },
    {
      title: '最新上榜日期',
      dataIndex: 'latestDate',
      key: 'latestDate',
      width: 120,
      sorter: (a, b) => a.latestDate.localeCompare(b.latestDate),
    },
    {
      title: '所属行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 120,
      render: (industry?: { code: string; name: string }) =>
        industry?.name ? <span style={{ fontSize: '13px' }}>{industry.name}</span> : <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '所属概念',
      dataIndex: 'concepts',
      key: 'concepts',
      ellipsis: true,
      render: (concepts?: Array<{ code: string; name: string }>) => (
        <StockConceptTags concepts={concepts} max={3} />
      ),
    },
  ];

  const trackingColumns: ColumnsType<TrackedOpportunityRecord> = [
    {
      title: '股票名称',
      dataIndex: 'name',
      width: 120,
      fixed: 'left',
      render: (text: string) => <Text style={{ color: '#1890ff', textShadow: '0 0 0.25px currentcolor' }}>{text}</Text>,
    },
    {
      title: '代码',
      dataIndex: 'code',
      width: 110,
    },
    {
      title: '信号日',
      dataIndex: 'signalDateKey',
      width: 110,
      sorter: (a, b) => a.signalDateKey.localeCompare(b.signalDateKey),
    },
    {
      title: '所属行业',
      dataIndex: 'industry',
      width: 120,
      render: (industry?: { code: string; name: string }) =>
        industry?.name ? <span style={{ fontSize: '13px' }}>{industry.name}</span> : <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '1日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd1'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd1'),
    },
    {
      title: '2日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd2'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd2'),
    },
    {
      title: '3日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd3'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd3'),
    },
    {
      title: '4日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd4'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd4'),
    },
    {
      title: '5日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd5'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd5'),
    },
    {
      title: '6日',
      width: 80,
      sorter: (a, b) => compareReturn(a.trackedReturns, b.trackedReturns, 'd6'),
      render: (_, record) => renderReturn(record.trackedReturns, 'd6'),
    },
    {
      title: '已发生',
      dataIndex: 'occurredCount',
      width: 80,
    },
    {
      title: '命中',
      dataIndex: 'hitCount',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: TrackingStatus) => (
        <StockStatusTag
          status={status === 'tracking' ? 'processing' : status}
          positiveText="已达标"
          negativeText="未达标"
          processingText="验证中"
        />
      ),
    },
    {
      title: '所属概念',
      width: 280,
      render: (_, record) => <StockConceptTags concepts={record.concepts} max={3} />,
    },
  ];

  return (
    <Layout className={styles.analysisRecordPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>分析记录</Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              股票上榜统计、趋势分析，以及机会名单按收盘买点的 1-6 日收益与达标率
            </Text>
          </div>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadStatistics();
                loadTrendData();
                if (activeTab === 'returns' || trackingLoaded) {
                  void loadTrackingRows();
                }
              }}
            >
              刷新
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        <Card className={styles.mainCard}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            destroyOnHidden
            items={[
              {
                key: 'table',
                label: (
                  <span>
                    <TableOutlined /> 统计表
                  </span>
                ),
                children: (
                  <Spin spinning={loading}>
                    <div className={styles.tableToolbar}>
                      <Space wrap>
                        <Switch
                          checked={consecutiveFilterEnabled}
                          onChange={setConsecutiveFilterEnabled}
                          checkedChildren="连续出现"
                          unCheckedChildren="全部"
                        />
                        {consecutiveFilterEnabled && (
                          <>
                            <span className={styles.filterLabel}>最少连续</span>
                            <Select
                              value={minConsecutiveDays}
                              onChange={setMinConsecutiveDays}
                              style={{ width: 88 }}
                              options={[
                                { value: 2, label: '2 天' },
                                { value: 3, label: '3 天' },
                                { value: 4, label: '4 天' },
                                { value: 5, label: '5 天' },
                              ]}
                            />
                            <Text type="secondary" className={styles.filterHint}>
                              仅显示最新记录日仍上榜、且连续出现 ≥ {minConsecutiveDays} 天的股票
                            </Text>
                          </>
                        )}
                      </Space>
                    </div>
                    {filteredStatistics.length > 0 ? (
                      <Table
                        columns={columns}
                        dataSource={filteredStatistics}
                        rowKey="code"
                        pagination={{
                          pageSize: tablePageSize,
                          showSizeChanger: true,
                          showTotal: (total) => `共 ${total} 条记录`,
                          pageSizeOptions: ['50', '100', '200'],
                          onChange: (_, pageSize) => setTablePageSize(pageSize),
                        }}
                        scroll={{ x: 800, y: 'calc(100vh - 330px)' }}
                        size="small"
                      />
                    ) : (
                      <Empty
                        description={
                          consecutiveFilterEnabled
                            ? `暂无连续 ${minConsecutiveDays} 天及以上上榜的股票`
                            : '暂无记录数据'
                        }
                      />
                    )}
                  </Spin>
                ),
              },
              {
                key: 'chart',
                label: (
                  <span>
                    <BarChartOutlined /> 趋势图
                  </span>
                ),
                children: (
                  <Spin spinning={loading}>
                    {trendData.length > 0 ? (
                      <StockTrendChart
                        data={trendData}
                        onDateRangeChange={handleDateRangeChange}
                      />
                    ) : (
                      <Empty description="暂无趋势数据" />
                    )}
                  </Spin>
                ),
              },
              {
                key: 'returns',
                label: (
                  <span>
                    <LineChartOutlined /> 收益追踪
                  </span>
                ),
                children: (
                  <Spin spinning={loadingTracking}>
                    <div className={styles.trackingStatsRow}>
                      <Row gutter={[16, 8]}>
                        <Col>
                          <Statistic title="当前展示" value={trackingStats.total} />
                        </Col>
                        <Col>
                          <Statistic title="已达标" value={trackingStats.passed} />
                        </Col>
                        <Col>
                          <Statistic title="未达标" value={trackingStats.failed} />
                        </Col>
                        <Col>
                          <Statistic title="验证中" value={trackingStats.tracking} />
                        </Col>
                        <Col>
                          <Statistic
                            title="已验证达标率"
                            value={trackingStats.passRate == null ? '-' : `${trackingStats.passRate}%`}
                            valueStyle={{
                              color:
                                trackingStats.passRate != null && trackingStats.passRate >= 50
                                  ? '#cf1322'
                                  : undefined,
                            }}
                          />
                        </Col>
                        <Col>
                          <Statistic
                            title="平均最大收益"
                            value={
                              trackingStats.avgMaxReturn == null
                                ? '-'
                                : `${trackingStats.avgMaxReturn.toFixed(2)}%`
                            }
                          />
                        </Col>
                      </Row>
                    </div>
                    <div className={styles.tableToolbar}>
                      <Space wrap size={[8, 8]} style={{ marginTop: 8 }}>
                        <Select
                          value={trackingDateRange}
                          options={[
                            { label: '今天', value: 'today' },
                            { label: '最近2日', value: 'recent2' },
                            { label: '最近3日', value: 'recent3' },
                            { label: '最近5日', value: 'recent5' },
                            { label: '最近6日', value: 'recent6' },
                            { label: '最近12日', value: 'recent12' },
                            { label: '全部日期', value: 'all' },
                          ]}
                          onChange={setTrackingDateRange}
                          style={{ width: 110 }}
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
                          <Button size="small" style={{ pointerEvents: 'none' }}>
                            阈值
                          </Button>
                          <InputNumber
                            min={0}
                            max={50}
                            value={trackingThreshold}
                            onChange={(value) => setTrackingThreshold(Number(value ?? 5))}
                            style={{ width: 65 }}
                            size="small"
                          />
                          <Button size="small" style={{ pointerEvents: 'none' }}>
                            %
                          </Button>
                        </Space.Compact>
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="状态"
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
                        <Input
                          allowClear
                          placeholder="搜索股票名称/代码"
                          prefix={<SearchOutlined />}
                          value={trackingSearchText}
                          onChange={(e) => setTrackingSearchText(e.target.value)}
                          style={{ width: 180 }}
                          size="small"
                        />
                        <Button
                          size="small"
                          icon={<ReloadOutlined />}
                          loading={loadingTracking}
                          onClick={() => void loadTrackingRows()}
                        >
                          更新收益
                        </Button>
                      </Space>
                    </div>
                    {filteredTrackingRows.length > 0 ? (
                      <Table
                        columns={trackingColumns}
                        dataSource={filteredTrackingRows}
                        rowKey="key"
                        pagination={{
                          pageSize: trackingPageSize,
                          showSizeChanger: true,
                          showTotal: (total) => `共 ${total} 条记录`,
                          pageSizeOptions: ['50', '100', '200'],
                          onChange: (_, pageSize) => setTrackingPageSize(pageSize),
                        }}
                        scroll={{ x: 1400, y: 'calc(100vh - 420px)' }}
                        size="small"
                      />
                    ) : (
                      <Empty
                        description={
                          !trackingLoaded
                            ? '正在加载机会收益…'
                            : trackingRows.length === 0
                              ? '暂无机会记录数据'
                              : '当前筛选条件下暂无数据'
                        }
                      />
                    )}
                  </Spin>
                ),
              },
            ]}
          />
        </Card>
      </Content>
    </Layout>
  );
}
