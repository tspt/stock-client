/**
 * 概念板块页面 - 展示概念板块列表（包含主力资金流向）
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Layout, Input, Table, Card, Space, Select, Button, Typography } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getConceptSectors } from '@/services/hot';
import type { ConceptSectorRankData } from '@/types/stock';
import { ConceptSectorStocksModal } from '@/components/ConceptSectorStocksModal/ConceptSectorStocksModal';
import styles from './ConceptSectorPage.module.css';

const { Header, Content } = Layout;
const { Option } = Select;
const { Text } = Typography;

// 格式化金额显示（万元转亿或保持万元）
const formatAmount = (value?: number): string => {
  if (!value) return '-';
  const absValue = Math.abs(value);
  if (absValue >= 10000) {
    const yiValue = value / 10000;
    return `${yiValue.toFixed(2)}亿`;
  }
  return `${value.toFixed(2)}万`;
};

// 格式化净额显示（带颜色）
const formatNetInflow = (value?: number): JSX.Element => {
  if (value === undefined || value === null || isNaN(Number(value))) return <span>-</span>;
  const numValue = Number(value);
  const formatted = formatAmount(numValue);
  const color = numValue >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{formatted}</span>;
};

// 格式化净占比显示（带颜色）
const formatRatio = (value?: number): JSX.Element => {
  if (value === undefined || value === null || isNaN(Number(value))) return <span>-</span>;
  const numValue = Number(value);
  const color = numValue >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{numValue.toFixed(2)}%</span>;
};



export function ConceptSectorPage() {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(1); // 1: 降序, 0: 升序
  const [data, setData] = useState<ConceptSectorRankData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<{ code: string; name: string } | null>(null);

  // 加载数据
  const loadData = useCallback(async (page: number = 1, silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const result = await getConceptSectors('f3', sortOrder, pageSize, page);
      setData(result.data);
      setTotal(result.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('加载概念板块数据失败:', error);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [sortOrder]);

  // 初始加载和参数变化时重新加载
  useEffect(() => {
    loadData(1);
  }, [loadData]);

  // 自动刷新 - 每10秒静默刷新当前页
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getConceptSectors('f3', sortOrder, pageSize, currentPage);
        setData(result.data);
        setTotal(result.total);
      } catch (error) {
        console.error('自动刷新失败:', error);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentPage, sortOrder]);

  // 处理分页变化
  const handlePageChange = (page: number) => {
    loadData(page);
  };

  // 处理搜索 - 重置到第一页
  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    if (value) {
      // 有搜索时回到第一页
      setCurrentPage(1);
      loadData(1);
    }
  };

  // 处理排序变化 - 重置到第一页
  const handleSortChange = (value: number) => {
    setSortOrder(value);
    setCurrentPage(1);
    loadData(1);
  };

  // 过滤数据
  const filteredData = useMemo(() => {
    if (!searchKeyword) return data;
    const keyword = searchKeyword.toLowerCase();
    return data.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword) ||
        (item.leadingStock && item.leadingStock.toLowerCase().includes(keyword))
    );
  }, [searchKeyword, data]);

  // 点击概念板块名称
  const handleSectorClick = (record: ConceptSectorRankData) => {
    setSelectedSector({ code: record.code, name: record.name });
    setModalOpen(true);
  };

  // 表格列定义 - 使用 useMemo 避免重复创建
  const columns = useMemo<ColumnsType<ConceptSectorRankData>>(() => [
    {
      title: (
        <Space size={4}>
          <span>名称</span>
          <Text type="secondary" style={{ fontSize: 12 }}>(点击查看成分股)</Text>
        </Space>
      ),
      dataIndex: 'name',
      key: 'name',
      width: 160,
      fixed: 'left',
      ellipsis: true,
      render: (text: string, record: ConceptSectorRankData) => (
        <Text
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => handleSectorClick(record)}
          title={`点击查看 ${text} 的成分股`}
        >
          {text}
        </Text>
      ),
    },
    {
      title: (
        <div>
          今日涨跌幅
        </div>
      ),
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 90,
      sorter: (a, b) => (a.changePercent || 0) - (b.changePercent || 0),
      render: (value?: number) => {
        if (value === undefined || value === null || isNaN(Number(value))) return <span>-</span>;
        const numValue = Number(value);
        const isPositive = numValue >= 0;
        const colorClass = isPositive ? styles.positive : styles.negative;
        return (
          <span className={colorClass} style={{ fontWeight: 600 }}>
            {isPositive ? '+' : ''}{numValue.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: (
        <div>
          今日主力净流入
        </div>
      ),
      key: 'mainNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'mainNetInflow',
          key: 'mainNetInflow',
          width: 90,
          sorter: (a, b) => (a.mainNetInflow || 0) - (b.mainNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mainNetInflowRatio',
          key: 'mainNetInflowRatio',
          width: 70,
          render: (value?: number) => {
            if (value === undefined || value === null || isNaN(Number(value))) return <span>-</span>;
            const numValue = Number(value);
            const color = numValue >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
            return <span style={{ color }}>{numValue.toFixed(2)}%</span>;
          },
        },
      ],
    },
    {
      title: (
        <div>
          今日超大单净流入
        </div>
      ),
      key: 'superLargeNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'superLargeNetInflow',
          key: 'superLargeNetInflow',
          width: 90,
          sorter: (a, b) => (a.superLargeNetInflow || 0) - (b.superLargeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'superLargeNetInflowRatio',
          key: 'superLargeNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日大单净流入
        </div>
      ),
      key: 'largeNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'largeNetInflow',
          key: 'largeNetInflow',
          width: 90,
          sorter: (a, b) => (a.largeNetInflow || 0) - (b.largeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'largeNetInflowRatio',
          key: 'largeNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日中单净流入
        </div>
      ),
      key: 'mediumNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'mediumNetInflow',
          key: 'mediumNetInflow',
          width: 90,
          sorter: (a, b) => (a.mediumNetInflow || 0) - (b.mediumNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mediumNetInflowRatio',
          key: 'mediumNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: (
        <div>
          今日小单净流入
        </div>
      ),
      key: 'smallNetInflow',
      width: 140,
      children: [
        {
          title: '净额',
          dataIndex: 'smallNetInflow',
          key: 'smallNetInflow',
          width: 90,
          sorter: (a, b) => (a.smallNetInflow || 0) - (b.smallNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'smallNetInflowRatio',
          key: 'smallNetInflowRatio',
          width: 70,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
  ], []);

  return (
    <Layout className={styles.conceptSectorPage}>
      <Header className={styles.header}>
        <div className={styles.toolbar}>
          <Space size="middle">
            <Input
              className={styles.searchBar}
              placeholder="搜索概念板块"
              prefix={<SearchOutlined style={{ color: 'var(--ant-color-text-quaternary)' }} />}
              value={searchKeyword}
              onChange={(e) => handleSearch(e.target.value)}
              allowClear
              size="small"
              bordered={false}
              style={{ width: 200 }}
            />

            <Select
              value={sortOrder}
              onChange={handleSortChange}
              style={{ width: 100 }}
            >
              <Option value={1}>降序</Option>
              <Option value={0}>升序</Option>
            </Select>

            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadData(1)}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.content}>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: total,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: handlePageChange,
          }}
          rowKey={(record) => record.code}
          size="small"
          scroll={{ x: 1400, y: 'calc(100vh - 260px)' }}
          className={styles.sectorTable}
        />
      </Content>

      {/* 概念板块股票弹窗 */}
      {selectedSector && (
        <ConceptSectorStocksModal
          open={modalOpen}
          sectorCode={selectedSector.code}
          sectorName={selectedSector.name}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Layout>
  );
}
