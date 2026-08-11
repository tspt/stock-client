/**
 * 分析记录页面
 * 展示股票上榜统计信息和趋势图
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Space, Table, Tabs, Spin, Empty, Tag, Typography, App, Switch, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, BarChartOutlined, TableOutlined } from '@ant-design/icons';
import type { StockStatistics } from '@/types/stock';
import { calculateStockStatistics, calculateTrendData } from '@/services/opportunity/recordService';
import { StockTrendChart } from '@/components/StockTrendChart/StockTrendChart';
import styles from './AnalysisRecordPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

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

  // 初始加载
  useEffect(() => {
    loadStatistics();
    loadTrendData();
  }, []);

  // 表格列定义
  const columns: ColumnsType<StockStatistics> = [
    {
      title: '股票代码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      fixed: 'left',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      fixed: 'left',
    },
    {
      title: '出现次数',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      sorter: (a, b) => a.count - b.count,
      render: (count: number) => (
        <span className={styles.countCell}>
          <Tag color={count > 5 ? 'red' : count > 2 ? 'orange' : 'blue'}>
            {count} 次
          </Tag>
        </span>
      ),
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
        return (
          <Tag color={value >= 5 ? 'red' : value >= 3 ? 'orange' : 'green'}>
            {value} 天
          </Tag>
        );
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
      title: '所属概念',
      dataIndex: 'concepts',
      key: 'concepts',
      width: 200,
      render: (concepts?: Array<{ code: string; name: string }>) => {
        if (!concepts || concepts.length === 0) {
          return <span style={{ color: '#999' }}>-</span>;
        }
        return (
          <div className={styles.conceptTags}>
            {concepts.slice(0, 3).map((concept) => (
              <Tag key={concept.code} color="purple">
                {concept.name}
              </Tag>
            ))}
            {concepts.length > 3 && (
              <Tag color="default">+{concepts.length - 3}</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '所属行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 120,
      render: (industry?: { code: string; name: string }) => industry?.name || <span style={{ color: '#999' }}>-</span>,
    },
  ];

  return (
    <Layout className={styles.analysisRecordPage}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>分析记录</Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              股票上榜统计信息和趋势分析
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { loadStatistics(); loadTrendData(); }}>
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
            ]}
          />
        </Card>
      </Content>
    </Layout>
  );
}
