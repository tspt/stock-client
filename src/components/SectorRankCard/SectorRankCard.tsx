/**
 * 板块排行卡片组件 - 展示领涨/领跌板块
 */

import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SectorRankData } from '@/types/stock';
import styles from './SectorRankCard.module.css';

const { Text } = Typography;

interface SectorRankCardProps {
  title: string;
  data: SectorRankData[];
  loading?: boolean;
  type: 'rising' | 'falling';
}

export function SectorRankCard({ title, data, loading, type }: SectorRankCardProps) {
  const columns: ColumnsType<SectorRankData> = [
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
      width: 120,
      ellipsis: true,
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 90,
      render: (value: number) => (
        <span
          className={type === 'rising' ? styles.positiveValue : styles.negativeValue}
          style={{ fontWeight: 500 }}
        >
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '领涨股',
      key: 'leadingStock',
      ellipsis: true,
      render: (_, record) => (
        <div className={styles.leadingStock}>
          <Text className={styles.stockName}>{record.leadingStock.name}</Text>
          <Text
            className={
              record.leadingStock.changePercent >= 0
                ? styles.positiveValue
                : styles.negativeValue
            }
            style={{ fontSize: 12, marginLeft: 4 }}
          >
            {record.leadingStock.changePercent >= 0 ? '+' : ''}
            {record.leadingStock.changePercent.toFixed(2)}%
          </Text>
        </div>
      ),
    },
  ];

  return (
    <Card className={styles.sectorCard} title={title} size="small">
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        size="small"
        rowKey={(record) => record.code}
        className={styles.sectorTable}
      />
    </Card>
  );
}
