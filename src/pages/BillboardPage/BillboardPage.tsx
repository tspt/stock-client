/**
 * 龙虎榜页面 - 个股统计
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Select, Button, Table, Empty, Spin, App, Space, Typography, Tag } from 'antd';
import { ReloadOutlined, TrophyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchBillboardData, formatAmount, formatPercent, formatDate } from '@/services/hot/billboard-service';
import { clearBillboardCacheByCycle } from '@/utils/storage/billboardIndexedDB';
import type { BillboardStockData, StatisticsCycle } from '@/types/billboard';
import { STATISTICS_CYCLE_OPTIONS } from '@/types/billboard';
import { logger } from '@/utils/business/logger';
import styles from './BillboardPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

const PAGE_SIZE = 50;

export function BillboardPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BillboardStockData[]>([]);
  const [statisticsCycle, setStatisticsCycle] = useState<StatisticsCycle>('02'); // 默认近三个月
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const hasLoadedRef = React.useRef(false);

  // 加载数据
  const loadData = useCallback(async (page: number = 1, forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      // 如果是强制刷新且是第一页，先清除缓存
      if (forceRefresh && page === 1) {
        await clearBillboardCacheByCycle(statisticsCycle);
      }

      const result = await fetchBillboardData({
        statisticsCycle,
        pageNumber: page,
        pageSize: PAGE_SIZE,
      }, forceRefresh);

      setData(result.data);
      setPagination((prev) => ({
        ...prev,
        current: page,
        total: result.total,
      }));

      if (result.data.length > 0) {
        message.success(`已加载 ${result.data.length} 条数据`);
      } else {
        message.info('暂无数据');
      }
    } catch (error: any) {
      logger.error('[BillboardPage] 加载数据失败:', error);
      message.error(error.message || '加载数据失败，请检查Cookie配置');
    } finally {
      setLoading(false);
    }
  }, [statisticsCycle, message]);

  // 初始加载（防止 React.StrictMode 下重复执行）
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData(1);
    }
  }, [loadData]);

  // 切换时间周期
  const handleCycleChange = (value: StatisticsCycle) => {
    setStatisticsCycle(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
    // 切换周期时不强制刷新，优先使用缓存
    // loadData 会通过 useEffect 自动触发
  };

  // 刷新数据（强制重新请求）
  const handleRefresh = () => {
    loadData(pagination.current, true);
  };

  // 分页变化
  const handleTableChange = (newPagination: any) => {
    if (newPagination.current !== pagination.current) {
      loadData(newPagination.current);
    }
  };

  // 表格列定义
  const columns: ColumnsType<BillboardStockData> = [
    {
      title: '股票代码',
      dataIndex: 'SECURITY_CODE',
      key: 'code',
      width: 100,
      fixed: 'left',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '股票简称',
      dataIndex: 'SECURITY_NAME_ABBR',
      key: 'name',
      width: 120,
      fixed: 'left',
      render: (text: string) => <Text strong style={{ color: '#667eea' }}>{text}</Text>,
    },
    {
      title: '最新上榜',
      dataIndex: 'LATEST_TDATE',
      key: 'latestDate',
      width: 110,
      render: (text: string) => <Text>{formatDate(text)}</Text>,
    },
    {
      title: '上榜次数',
      dataIndex: 'BILLBOARD_TIMES',
      key: 'billboardTimes',
      width: 100,
      sorter: (a, b) => a.BILLBOARD_TIMES - b.BILLBOARD_TIMES,
      defaultSortOrder: 'descend',
      render: (value: number) => (
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {value}次
        </Tag>
      ),
    },
    {
      title: '龙虎榜成交额',
      dataIndex: 'BILLBOARD_DEAL_AMT',
      key: 'billboardDealAmt',
      width: 130,
      render: (value: number) => <Text>{formatAmount(value)}</Text>,
    },
    {
      title: '龙虎榜净买入',
      dataIndex: 'BILLBOARD_NET_BUY',
      key: 'billboardNetBuy',
      width: 130,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatAmount(value)}
        </Text>
      ),
    },
    {
      title: '机构次数',
      dataIndex: 'ORG_TIMES',
      key: 'orgTimes',
      width: 100,
      render: (value: number) => (
        <Tag color="blue">{value}次</Tag>
      ),
    },
    {
      title: '机构成交额',
      dataIndex: 'ORG_DEAL_AMT',
      key: 'orgDealAmt',
      width: 130,
      render: (value: number) => <Text>{formatAmount(value)}</Text>,
    },
    {
      title: '机构净买入',
      dataIndex: 'ORG_NET_BUY',
      key: 'orgNetBuy',
      width: 130,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatAmount(value)}
        </Text>
      ),
    },
    {
      title: '涨跌幅',
      dataIndex: 'CHANGE_RATE',
      key: 'changeRate',
      width: 100,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
    {
      title: '收盘价',
      dataIndex: 'CLOSE_PRICE',
      key: 'closePrice',
      width: 100,
      render: (value: number) => <Text>{value.toFixed(2)}</Text>,
    },
    {
      title: '近1月',
      dataIndex: 'IPCT1M',
      key: 'ipct1m',
      width: 100,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
    {
      title: '近3月',
      dataIndex: 'IPCT3M',
      key: 'ipct3m',
      width: 100,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
    {
      title: '近6月',
      dataIndex: 'IPCT6M',
      key: 'ipct6m',
      width: 100,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
    {
      title: '近1年',
      dataIndex: 'IPCT1Y',
      key: 'ipct1y',
      width: 100,
      render: (value: number) => (
        <Text className={value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
  ];

  return (
    <Layout className={styles.pageContainer}>
      {/* 顶部控制区 */}
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>
              龙虎榜
            </Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              个股龙虎榜统计数据，洞察资金动向
            </Text>
          </div>
          <div className={styles.controls}>
            <Select
              value={statisticsCycle}
              onChange={handleCycleChange}
              options={STATISTICS_CYCLE_OPTIONS}
              style={{ width: 120 }}
              disabled={loading}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
              disabled={loading}
            >
              刷新
            </Button>
          </div>
        </div>
      </Header>

      {/* 主体内容区 */}
      <Content className={styles.contentArea}>
        <div className={styles.card}>
          <div className={styles.tableWrapper}>
            {loading && data.length === 0 ? (
              <div className={styles.loadingState}>
                <Spin size="large" tip="加载中..." />
              </div>
            ) : data.length === 0 ? (
              <div className={styles.emptyState}>
                <Empty description="暂无数据，请检查Cookie配置" />
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={data}
                rowKey="SECUCODE"
                pagination={{
                  ...pagination,
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                  pageSizeOptions: [PAGE_SIZE],
                }}
                onChange={handleTableChange}
                scroll={{ x: 1600, y: 'calc(100vh - 280px)' }}
                size="small"
                bordered={false}
              />
            )}
          </div>
        </div>
      </Content>
    </Layout>
  );
}
