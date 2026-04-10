/**
 * 热门板块表格组件
 */

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { formatAmount, formatVolume, formatChangePercent } from '@/utils/format';
import type { HotSector } from '@/types/hot';

interface HotSectorTableProps {
  sortBy: 'changePercent' | 'volume' | 'amount';
}

export function HotSectorTable({ sortBy }: HotSectorTableProps) {
  const { sectors, loading } = useHotStore();

  const columns: ColumnsType<HotSector> = [
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
      title: '板块名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      sorter: (a, b) => a.changePercent - b.changePercent,
      sortOrder: sortBy === 'changePercent' ? 'descend' : null,
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
          {value >= 0 ? <RiseOutlined /> : <FallOutlined />}
          {formatChangePercent(value)}
        </span>
      ),
    },
    {
      title: '领涨股',
      key: 'leaderStock',
      width: 150,
      render: (_, record) => {
        if (!record.leaderStock) return '-';
        return (
          <div>
            <div>{record.leaderStock.name}</div>
            <Tag color={record.leaderStock.changePercent >= 0 ? 'red' : 'green'}>
              {formatChangePercent(record.leaderStock.changePercent)}
            </Tag>
          </div>
        );
      },
    },
    {
      title: '股票数量',
      dataIndex: 'stockCount',
      key: 'stockCount',
      width: 90,
      align: 'right',
    },
    {
      title: '资金净流入',
      dataIndex: 'netInflow',
      key: 'netInflow',
      width: 120,
      align: 'right',
      render: (value?: number) => {
        if (value === undefined) return '-';
        const formatted = formatAmount(value);
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            {formatted}
          </span>
        );
      },
    },
    {
      title: '成交量(万手)',
      dataIndex: 'volume',
      key: 'volume',
      width: 110,
      align: 'right',
      sorter: (a, b) => (a.volume || 0) - (b.volume || 0),
      sortOrder: sortBy === 'volume' ? 'descend' : null,
      render: (value?: number) => {
        if (value === undefined) return '-';
        return formatVolume(value);
      },
    },
    {
      title: '成交额(亿)',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      align: 'right',
      sorter: (a, b) => (a.amount || 0) - (b.amount || 0),
      sortOrder: sortBy === 'amount' ? 'descend' : null,
      render: (value?: number) => {
        if (value === undefined) return '-';
        return formatAmount(value);
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={sectors}
      rowKey="code"
      loading={loading}
      pagination={{ pageSize: 20 }}
      size="small"
    />
  );
}
