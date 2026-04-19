/**
 * 板块排行卡片组件 - 展示领涨/领跌板块
 */

import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SectorRankData, ConceptSectorRankData } from '@/types/stock';
import styles from './SectorRankCard.module.css';

const { Text } = Typography;

interface SectorRankCardProps {
  title: string;
  data: SectorRankData[] | ConceptSectorRankData[];
  loading?: boolean;
  type: 'rising' | 'falling';
}

export function SectorRankCard({ title, data, loading, type }: SectorRankCardProps) {
  const columns: ColumnsType<SectorRankData | ConceptSectorRankData> = [
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
      render: (value?: number) => {
        if (!value && value !== 0) return <span>-</span>;
        return (
          <span
            className={type === 'rising' ? styles.positiveValue : styles.negativeValue}
            style={{ fontWeight: 500 }}
          >
            {value >= 0 ? '+' : ''}
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '领涨股',
      key: 'leadingStock',
      ellipsis: true,
      render: (_, record) => {
        // 兼容两种数据结构：行业板块（对象）和概念板块（字符串）
        const sectorRecord = record as SectorRankData;
        const conceptRecord = record as ConceptSectorRankData;

        // 判断是行业板块数据还是概念板块数据
        if (sectorRecord.leadingStock && typeof sectorRecord.leadingStock === 'object') {
          // 行业板块数据
          return (
            <div className={styles.leadingStock}>
              <Text className={styles.stockName}>{sectorRecord.leadingStock.name}</Text>
              <Text
                className={
                  sectorRecord.leadingStock.changePercent >= 0
                    ? styles.positiveValue
                    : styles.negativeValue
                }
                style={{ fontSize: 12, marginLeft: 4 }}
              >
                {sectorRecord.leadingStock.changePercent >= 0 ? '+' : ''}
                {sectorRecord.leadingStock.changePercent.toFixed(2)}%
              </Text>
            </div>
          );
        } else if (conceptRecord.leadingStock) {
          // 概念板块数据
          return (
            <div className={styles.leadingStock}>
              <Text className={styles.stockName}>{conceptRecord.leadingStock}</Text>
              {conceptRecord.leadingStockCode && (
                <Text style={{ fontSize: 11, marginLeft: 4, color: 'var(--ant-color-text-secondary)' }}>
                  {conceptRecord.leadingStockCode}
                </Text>
              )}
            </div>
          );
        }
        return <span>-</span>;
      },
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
