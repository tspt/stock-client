/**
 * 概念板块股票弹窗 - 展示概念板块下的股票列表
 */

import { useState, useEffect, useCallback } from 'react';
import { Drawer, Table, Space, message, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getConceptSectorStocks } from '@/services/hot/concept-sectors';
import type { ConceptSectorStockData } from '@/types/stock';
import styles from './ConceptSectorStocksModal.module.css';

const { Text } = Typography;

interface ConceptSectorStocksModalProps {
  open: boolean;
  sectorCode: string;
  sectorName: string;
  onClose: () => void;
}

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
  if (!value) return <span>-</span>;
  const formatted = formatAmount(value);
  const color = value >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{formatted}</span>;
};

// 格式化净占比显示（带颜色）
const formatRatio = (value?: number): JSX.Element => {
  if (value === undefined || value === null || isNaN(value)) return <span>-</span>;
  const color = value >= 0 ? 'var(--ant-color-success)' : 'var(--ant-color-error)';
  return <span style={{ color }}>{Number(value).toFixed(2)}%</span>;
};

export function ConceptSectorStocksModal({
  open,
  sectorCode,
  sectorName,
  onClose,
}: ConceptSectorStocksModalProps) {
  const [data, setData] = useState<ConceptSectorStockData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // 加载数据
  const loadData = useCallback(async (page: number = 1) => {
    if (!sectorCode) return;

    setLoading(true);
    try {
      const result = await getConceptSectorStocks(sectorCode, 'f3', 1, pageSize, page);
      setData(result.data);
      setTotal(result.total);
      setCurrentPage(page);
    } catch (error) {
      console.error('加载概念板块股票数据失败:', error);
      message.error('加载股票数据失败');
    } finally {
      setLoading(false);
    }
  }, [sectorCode]);

  // 当弹窗打开时加载第一页数据
  useEffect(() => {
    if (open && sectorCode) {
      loadData(1);
    }
  }, [open, sectorCode, loadData]);

  // 处理分页变化
  const handlePageChange = (page: number) => {
    loadData(page);
  };

  // 表格列定义
  const columns: ColumnsType<ConceptSectorStockData> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (value?: number) => {
        if (value === undefined || value === null || isNaN(Number(value))) return <span>-</span>;
        return <span>{Number(value).toFixed(2)}</span>;
      },
    },
    {
      title: '涨跌幅',
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
      title: '主力净流入',
      key: 'mainNetInflow',
      width: 120,
      children: [
        {
          title: '净额',
          dataIndex: 'mainNetInflow',
          key: 'mainNetInflow',
          width: 80,
          sorter: (a, b) => (a.mainNetInflow || 0) - (b.mainNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mainNetInflowRatio',
          key: 'mainNetInflowRatio',
          width: 60,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: '超大单净流入',
      key: 'superLargeNetInflow',
      width: 120,
      children: [
        {
          title: '净额',
          dataIndex: 'superLargeNetInflow',
          key: 'superLargeNetInflow',
          width: 80,
          sorter: (a, b) => (a.superLargeNetInflow || 0) - (b.superLargeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'superLargeNetInflowRatio',
          key: 'superLargeNetInflowRatio',
          width: 60,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: '大单净流入',
      key: 'largeNetInflow',
      width: 120,
      children: [
        {
          title: '净额',
          dataIndex: 'largeNetInflow',
          key: 'largeNetInflow',
          width: 80,
          sorter: (a, b) => (a.largeNetInflow || 0) - (b.largeNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'largeNetInflowRatio',
          key: 'largeNetInflowRatio',
          width: 60,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: '中单净流入',
      key: 'mediumNetInflow',
      width: 120,
      children: [
        {
          title: '净额',
          dataIndex: 'mediumNetInflow',
          key: 'mediumNetInflow',
          width: 80,
          sorter: (a, b) => (a.mediumNetInflow || 0) - (b.mediumNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'mediumNetInflowRatio',
          key: 'mediumNetInflowRatio',
          width: 60,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
    {
      title: '小单净流入',
      key: 'smallNetInflow',
      width: 120,
      children: [
        {
          title: '净额',
          dataIndex: 'smallNetInflow',
          key: 'smallNetInflow',
          width: 80,
          sorter: (a, b) => (a.smallNetInflow || 0) - (b.smallNetInflow || 0),
          render: (value?: number) => formatNetInflow(value),
        },
        {
          title: '净占比',
          dataIndex: 'smallNetInflowRatio',
          key: 'smallNetInflowRatio',
          width: 60,
          render: (value?: number) => formatRatio(value),
        },
      ],
    },
  ];

  return (
    <Drawer
      open={open}
      title={`${sectorName} - 成分股`}
      onClose={onClose}
      placement="right"
      width="min(1200px, calc(100vw - 48px))"
      destroyOnHidden
    >
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
        scroll={{ y: 'calc(100vh - 160px)', x: 900 }}
        className={styles.stockTable}
      />
    </Drawer>
  );
}
