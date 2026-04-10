/**
 * 热门概念表格组件
 */

import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { formatChangePercent } from '@/utils/format';
import type { HotConcept } from '@/types/hot';

export function HotConceptTable() {
  const { concepts, loading } = useHotStore();

  const columns: ColumnsType<HotConcept> = [
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
      title: '概念名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 100,
      align: 'right',
      sorter: (a, b) => a.changePercent - b.changePercent,
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
      title: '热度指数',
      dataIndex: 'heatIndex',
      key: 'heatIndex',
      width: 100,
      align: 'right',
      render: (value?: number) => {
        if (!value) return '-';
        return (
          <Tag color={value > 80 ? 'red' : value > 60 ? 'orange' : 'blue'}>
            {value}
          </Tag>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={concepts}
      rowKey="code"
      loading={loading}
      pagination={{ pageSize: 20 }}
      size="small"
    />
  );
}
