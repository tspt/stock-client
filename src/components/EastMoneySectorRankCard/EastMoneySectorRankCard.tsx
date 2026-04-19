/**
 * 东方财富板块排行卡片组件 - 展示领涨/领跌板块
 */

import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EastMoneySectorData } from '@/types/stock';
import styles from './EastMoneySectorRankCard.module.css';

const { Text } = Typography;

interface EastMoneySectorRankCardProps {
  title: string;
  data: EastMoneySectorData[];
  type: 'rising' | 'falling';
}

export function EastMoneySectorRankCard({ title, data, type }: EastMoneySectorRankCardProps) {
  const columns: ColumnsType<EastMoneySectorData> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, index: number) => (
        <span className={styles.rankNumber}>{index + 1}</span>
      ),
    },
    {
      title: '板块名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 80,
      render: (value?: number) => {
        if (!value && value !== 0) return <span>-</span>;
        const isPositive = value >= 0;
        const colorClass = isPositive ? styles.positive : styles.negative;
        return (
          <span className={`${colorClass} ${styles.changePercentBold}`}>
            {isPositive ? '+' : ''}
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '上涨家数',
      dataIndex: 'riseCount',
      key: 'riseCount',
      width: 70,
      render: (value?: number) => {
        if (!value && value !== 0) return <span>-</span>;
        return <span className={styles.riseCount}>{value}</span>;
      },
    },
    {
      title: '下跌家数',
      dataIndex: 'fallCount',
      key: 'fallCount',
      width: 70,
      render: (value?: number) => {
        if (!value && value !== 0) return <span>-</span>;
        return <span className={styles.fallCount}>{value}</span>;
      },
    },
    {
      title: '领涨股票',
      key: 'leadingStock',
      ellipsis: true,
      render: (_, record) => {
        const isPositive = record.leadingStockChangePercent >= 0;
        const colorClass = isPositive ? styles.positive : styles.negative;

        return (
          <div className={styles.leadingStock}>
            <Text className={styles.stockName} ellipsis={{ tooltip: record.leadingStockName }}>
              {record.leadingStockName}
            </Text>
            <Text className={colorClass} style={{ fontSize: 13 }}>
              {isPositive ? '+' : ''}
              {record.leadingStockChangePercent.toFixed(2)}%
            </Text>
          </div>
        );
      },
    },
  ];

  return (
    <Card className={styles.sectorCard} title={title} size="small">
      <Table
        columns={columns}
        dataSource={data}
        pagination={false}
        size="small"
        rowKey={(record) => record.code}
        className={styles.sectorTable}
      />
    </Card>
  );
}
