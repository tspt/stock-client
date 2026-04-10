/**
 * 热门股票表格组件
 */

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { formatPrice, formatChangePercent, formatVolume, formatAmount, formatTurnoverRate, formatMarketCap } from '@/utils/format';
import type { HotStock } from '@/types/hot';

export function HotStockTable() {
  const { stocks, loading, stockSortType, setStockSortType } = useHotStore();

  const columns: ColumnsType<HotStock> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_, __, index) => (
        <span style={{ fontWeight: 'bold', color: index < 3 ? '#ff4d4f' : 'inherit' }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: '股票代码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      align: 'right',
      render: (value: number) => formatPrice(value),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.changePercent - b.changePercent,
      sortOrder: stockSortType === 'changePercent' ? 'descend' : null,
      onHeaderCell: () => ({
        onClick: () => setStockSortType('changePercent'),
        style: { cursor: 'pointer' }
      }),
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
          {value >= 0 ? <RiseOutlined /> : <FallOutlined />}
          {formatChangePercent(value)}
        </span>
      ),
    },
    {
      title: '涨跌额',
      dataIndex: 'change',
      key: 'change',
      width: 90,
      align: 'right',
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {value >= 0 ? '+' : ''}{formatPrice(value)}
        </span>
      ),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.volume - b.volume,
      sortOrder: stockSortType === 'volume' ? 'descend' : null,
      onHeaderCell: () => ({
        onClick: () => setStockSortType('volume'),
        style: { cursor: 'pointer' }
      }),
      render: (value: number) => formatVolume(value),
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      sorter: (a, b) => a.amount - b.amount,
      sortOrder: stockSortType === 'amount' ? 'descend' : null,
      onHeaderCell: () => ({
        onClick: () => setStockSortType('amount'),
        style: { cursor: 'pointer' }
      }),
      render: (value: number) => formatAmount(value),
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.turnoverRate || 0) - (b.turnoverRate || 0),
      sortOrder: stockSortType === 'turnoverRate' ? 'descend' : null,
      onHeaderCell: () => ({
        onClick: () => setStockSortType('turnoverRate'),
        style: { cursor: 'pointer' }
      }),
      render: (value?: number) => formatTurnoverRate(value || 0),
    },
    {
      title: '总市值',
      dataIndex: 'marketCap',
      key: 'marketCap',
      width: 110,
      align: 'right',
      render: (value?: number) => {
        if (!value) return '-';
        return formatMarketCap(value / 100000000);
      },
    },
    {
      title: '所属板块',
      dataIndex: 'sector',
      key: 'sector',
      width: 100,
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_, record) => {
        if (record.isLimitUp) {
          return <Tag color="red">涨停</Tag>;
        }
        if (record.isLimitDown) {
          return <Tag color="green">跌停</Tag>;
        }
        return '-';
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={stocks}
      rowKey="code"
      loading={loading}
      pagination={{ pageSize: 20 }}
      size="small"
    />
  );
}
