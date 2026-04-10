/**
 * 资金流向表格组件
 */

import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { formatPrice, formatChangePercent } from '@/utils/format';
import type { FundFlow } from '@/types/hot';

export function FundFlowTable() {
  const { funds, loading } = useHotStore();

  const columns: ColumnsType<FundFlow> = [
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
      render: (value: number) => (
        <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
          {value >= 0 ? <RiseOutlined /> : <FallOutlined />}
          {formatChangePercent(value)}
        </span>
      ),
    },
    {
      title: '主力净流入',
      dataIndex: 'mainNetInflow',
      key: 'mainNetInflow',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.mainNetInflow - b.mainNetInflow,
      render: (value: number) => {
        const formatted = (value / 100000000).toFixed(2) + '亿';
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a', fontWeight: 'bold' }}>
            {value >= 0 ? '+' : ''}{formatted}
          </span>
        );
      },
    },
    {
      title: '超大单',
      dataIndex: 'superLargeNetInflow',
      key: 'superLargeNetInflow',
      width: 100,
      align: 'right',
      render: (value?: number) => {
        if (value === undefined) return '-';
        const formatted = (value / 100000000).toFixed(2) + '亿';
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            {value >= 0 ? '+' : ''}{formatted}
          </span>
        );
      },
    },
    {
      title: '大单',
      dataIndex: 'largeNetInflow',
      key: 'largeNetInflow',
      width: 100,
      align: 'right',
      render: (value?: number) => {
        if (value === undefined) return '-';
        const formatted = (value / 100000000).toFixed(2) + '亿';
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            {value >= 0 ? '+' : ''}{formatted}
          </span>
        );
      },
    },
    {
      title: '中单',
      dataIndex: 'mediumNetInflow',
      key: 'mediumNetInflow',
      width: 100,
      align: 'right',
      render: (value?: number) => {
        if (value === undefined) return '-';
        const formatted = (value / 100000000).toFixed(2) + '亿';
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            {value >= 0 ? '+' : ''}{formatted}
          </span>
        );
      },
    },
    {
      title: '小单',
      dataIndex: 'smallNetInflow',
      key: 'smallNetInflow',
      width: 100,
      align: 'right',
      render: (value?: number) => {
        if (value === undefined) return '-';
        const formatted = (value / 100000000).toFixed(2) + '亿';
        return (
          <span style={{ color: value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            {value >= 0 ? '+' : ''}{formatted}
          </span>
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={funds}
      rowKey="code"
      loading={loading}
      pagination={{ pageSize: 20 }}
      size="small"
    />
  );
}
