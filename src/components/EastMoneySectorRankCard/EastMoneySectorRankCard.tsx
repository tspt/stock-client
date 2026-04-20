/**
 * 东方财富板块排行卡片组件 - 展示领涨/领跌板块
 */

import { memo, useMemo } from 'react';
import { Card, Typography } from 'antd';
import type { EastMoneySectorData } from '@/types/stock';
import styles from './EastMoneySectorRankCard.module.css';

const { Text } = Typography;

interface EastMoneySectorRankCardProps {
  title: string;
  data: EastMoneySectorData[];
  type: 'rising' | 'falling';
}

export const EastMoneySectorRankCard = memo(function EastMoneySectorRankCard({
  title,
  data,
  type,
}: EastMoneySectorRankCardProps) {
  // 使用 useMemo 缓存列表项，避免不必要的重新渲染
  const listItems = useMemo(() => {
    return data.map((item, index) => {
      const rank = index + 1;
      const isPositive = item.changePercent >= 0;
      const changeColor = isPositive ? styles.positive : styles.negative;
      const leadingStockPositive = item.leadingStockChangePercent >= 0;
      const leadingStockColor = leadingStockPositive ? styles.positive : styles.negative;

      // 格式化涨跌幅
      const formattedChangePercent = `${isPositive ? '+' : ''}${item.changePercent.toFixed(2)}%`;
      const formattedLeadingStockChange = `${leadingStockPositive ? '+' : ''}${item.leadingStockChangePercent.toFixed(2)}%`;

      return (
        <div key={item.code} className={styles.listItem}>
          <span className={styles.rankNumber}>{rank}</span>
          <Text
            className={styles.sectorName}
            ellipsis={{ tooltip: item.name }}
            style={{ width: 140 }}
          >
            {item.name}
          </Text>
          <span
            className={`${changeColor} ${styles.changePercentBold}`}
            style={{ width: 80, textAlign: 'right' }}
          >
            {formattedChangePercent}
          </span>
          <span className={styles.riseCount} style={{ width: 60, textAlign: 'center' }}>
            {item.riseCount ?? '-'}
          </span>
          <span className={styles.fallCount} style={{ width: 60, textAlign: 'center' }}>
            {item.fallCount ?? '-'}
          </span>
          <div className={styles.leadingStock} style={{ flex: 1 }}>
            <Text className={styles.stockName} ellipsis={{ tooltip: item.leadingStockName }}>
              {item.leadingStockName}
            </Text>
            <Text className={leadingStockColor} style={{ fontSize: 12, flexShrink: 0 }}>
              {formattedLeadingStockChange}
            </Text>
          </div>
        </div>
      );
    });
  }, [data]);

  return (
    <Card className={styles.sectorCard} title={title} size="small" bordered={false}>
      {/* 表头 */}
      <div className={styles.listHeader}>
        <span className={styles.headerCell} style={{ width: 34 }}>
          排名
        </span>
        <span className={styles.headerCell} style={{ width: 140 }}>
          概念名称
        </span>
        <span className={styles.headerCell} style={{ width: 80, textAlign: 'right' }}>
          涨跌幅
        </span>
        <span className={styles.headerCell} style={{ width: 60, textAlign: 'center' }}>
          上涨
        </span>
        <span className={styles.headerCell} style={{ width: 60, textAlign: 'center' }}>
          下跌
        </span>
        <span className={styles.headerCell} style={{ flex: 1 }}>
          领涨股
        </span>
      </div>

      {/* 列表内容 - 可滚动 */}
      <div className={styles.listContainer}>{listItems}</div>
    </Card>
  );
});
