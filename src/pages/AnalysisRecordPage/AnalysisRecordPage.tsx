/**
 * 分析记录页面
 * 展示股票上榜统计信息和趋势图
 */

import { useEffect, useState } from 'react';
import { Layout, Card, Button, Space, Table, Tabs, Spin, Empty, Tag, Modal, Typography, App } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, ReloadOutlined, BarChartOutlined, TableOutlined } from '@ant-design/icons';
import type { StockStatistics } from '@/types/stock';
import { calculateStockStatistics, clearAllRecords, calculateTrendData } from '@/services/opportunity/recordService';
import { StockTrendChart } from '@/components/StockTrendChart/StockTrendChart';
import styles from './AnalysisRecordPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

export function AnalysisRecordPage() {
  const { message, modal } = App.useApp();
  const [statistics, setStatistics] = useState<StockStatistics[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [trendData, setTrendData] = useState<Array<{ date: string; count: number }>>([]);
  const [activeTab, setActiveTab] = useState('table');

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

  // 清空所有记录
  const handleClearAll = async () => {
    if (statistics.length === 0 && trendData.length === 0) {
      message.warning('暂无记录可清空');
      return;
    }

    modal.confirm({
      title: '确认清空',
      content: '确定要清空所有分析记录吗？此操作不可恢复。',
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await clearAllRecords();
          message.success('已清空所有记录');
          loadStatistics();
          loadTrendData();
        } catch (error) {
          message.error('清空记录失败');
        }
      },
    });
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
            <Button danger icon={<DeleteOutlined />} onClick={handleClearAll}>
              清空所有记录
            </Button>
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
                    {statistics.length > 0 ? (
                      <Table
                        columns={columns}
                        dataSource={statistics}
                        rowKey="code"
                        pagination={{
                          defaultPageSize: 50,
                          showSizeChanger: true,
                          showTotal: (total) => `共 ${total} 条记录`,
                          pageSizeOptions: ['50', '100', '200'],
                        }}
                        scroll={{ x: 800, y: 'calc(100vh - 280px)' }}
                        size="small"
                      />
                    ) : (
                      <Empty description="暂无记录数据" />
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
