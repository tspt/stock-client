/**
 * 领涨板块表格组件
 */

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined } from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { formatChangePercent } from '@/utils/format';
import type { HotSector } from '@/types/hot';

export function LeadingSectorTable() {
  const { leadingSectors, loading } = useHotStore();

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
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
          <RiseOutlined />
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
      title: '板块指数',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => code || '-',
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={leadingSectors}
      rowKey="code"
      loading={loading}
      pagination={false}
      size="small"
    />
  );
}