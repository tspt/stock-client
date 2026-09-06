/**
 * 热门榜页面 - 同花顺热股榜
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Layout, Button, Table, Empty, Spin, Typography, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchThsHotRank } from '@/services/hot/ths-hot-rank-service';
import type { ThsHotRankItem, ThsHotRankPeriod } from '@/types/thsHotRank';
import { logger } from '@/utils/business/logger';
import { StockConceptTags, StockFeatureTag } from '@/components/common/Tags';
import styles from './HotRankPage.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;

const PAGE_SIZE = 100;

const PERIOD_OPTIONS = [
  { value: 'hour', label: '1小时' },
  { value: 'day', label: '24小时' },
];

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  return `${value.toFixed(2)}%`;
}

function formatHotValue(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  return Math.round(value).toLocaleString('zh-CN');
}

function formatRankChange(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  if (value > 0) {
    return `+${value}`;
  }
  return String(value);
}

export function HotRankPage() {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<ThsHotRankPeriod>('hour');
  const [data, setData] = useState<ThsHotRankItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const hasLoadedRef = React.useRef(false);

  const loadData = useCallback(async (activePeriod?: ThsHotRankPeriod) => {
    const nextPeriod = activePeriod ?? period;
    setLoading(true);
    setErrorText(null);
    try {
      const result = await fetchThsHotRank(nextPeriod);
      setData(result);
      setPagination((prev) => ({
        ...prev,
        current: 1,
        total: result.length,
      }));
    } catch (error: any) {
      logger.error('[HotRankPage] 加载数据失败:', error);
      setData([]);
      setPagination((prev) => ({
        ...prev,
        current: 1,
        total: 0,
      }));
      setErrorText('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadData();
    }
  }, [loadData]);

  const columns: ColumnsType<ThsHotRankItem> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 72,
      fixed: 'left',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      fixed: 'left',
      render: (text: string) => <Text style={{ color: '#1890ff', textShadow: '0 0 0.25px currentcolor' }}>{text}</Text>,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      render: (value: number | null) => (
        <Text className={value == null ? undefined : value >= 0 ? styles.positive : styles.negative}>
          {formatPercent(value)}
        </Text>
      ),
    },
    {
      title: '热度',
      dataIndex: 'hotValue',
      key: 'hotValue',
      width: 110,
      render: (value: number | null) => <Text>{formatHotValue(value)}</Text>,
    },
    {
      title: '排名变化',
      dataIndex: 'rankChange',
      key: 'rankChange',
      width: 100,
      render: (value: number | null) => (
        <Text className={value != null && value > 0 ? styles.positive : value != null && value < 0 ? styles.negative : undefined}>
          {formatRankChange(value)}
        </Text>
      ),
    },
    {
      title: '人气标签',
      dataIndex: 'popularityTag',
      key: 'popularityTag',
      width: 120,
      render: (text: string) => (text ? <StockFeatureTag text={text} variant="red" /> : '-'),
    },
    {
      title: '概念标签',
      dataIndex: 'conceptTags',
      key: 'conceptTags',
      render: (tags: string[]) => <StockConceptTags concepts={tags} max={3} />,
    },
  ];

  const emptyDescription = errorText || '暂无数据';

  return (
    <Layout className={styles.pageContainer}>
      <Header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Text className={styles.pageTitle}>
              热门榜
            </Text>
            <Text type="secondary" className={styles.pageSubtitle}>
              同花顺热股榜，进入页面时加载
            </Text>
          </div>
          <div className={styles.controls}>
            <Select
              value={period}
              onChange={(value: ThsHotRankPeriod) => {
                setPeriod(value);
                loadData(value);
              }}
              options={PERIOD_OPTIONS}
              style={{ width: 120 }}
              disabled={loading}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData()}
              loading={loading}
              disabled={loading}
            >
              刷新
            </Button>
          </div>
        </div>
      </Header>

      <Content className={styles.contentArea}>
        <div className={styles.card}>
          <div className={styles.tableWrapper}>
            {loading && data.length === 0 ? (
              <div className={styles.loadingState}>
                <Spin size="large" />
              </div>
            ) : data.length === 0 ? (
              <div className={styles.emptyState}>
                <Empty description={emptyDescription} />
              </div>
            ) : (
              <Table
                columns={columns}
                dataSource={data}
                rowKey={(row) => `${row.code}-${row.rank}`}
                pagination={{
                  ...pagination,
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                  pageSizeOptions: [PAGE_SIZE],
                  onChange: (page) => {
                    setPagination((prev) => ({ ...prev, current: page }));
                  },
                }}
                scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
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
