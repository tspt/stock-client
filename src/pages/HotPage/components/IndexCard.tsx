/**
 * 指数卡片组件 - 展示单个指数的详细信息
 */

import { Card, Divider, Typography } from 'antd';
import type { EastMoneyIndexData } from '@/services/hot';
import styles from './IndexCard.module.css';

const { Text } = Typography;

interface IndexCardProps {
  index: EastMoneyIndexData;
}

export function IndexCard({ index }: IndexCardProps) {
  const isRise = index.change >= 0;
  const color = isRise ? '#ff4d4f' : '#52c41a';
  const riseClass = isRise ? styles.riseCard : styles.fallCard;

  return (
    <Card className={`${styles.indexCard} ${riseClass}`} bordered={false}>
      <div className={styles.indexHeader}>
        <Text className={styles.indexName}>
          {index.name}
        </Text>
      </div>

      <div className={styles.indexBody}>
        <div className={styles.indexPriceSection}>
          <div className={styles.priceRow}>
            <span className={styles.indexPrice} style={{ color }}>
              {index.currentPrice.toFixed(2)}
            </span>
            <span className={styles.indexChange} style={{ color }}>
              {isRise ? '+' : ''}{index.change.toFixed(2)}{' '}
              {isRise ? '▲' : '▼'}{Math.abs(index.changePercent).toFixed(2)}%
            </span>
          </div>
        </div>

        <Divider className={styles.divider} />

        <div className={styles.indexDetails}>
          <div className={styles.detailRow}>
            <Text type="secondary" className={styles.detailLabel}>
              成交量:
            </Text>
            <Text className={styles.detailValue}>
              {(index.volume / 10000).toFixed(0)}万手
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text type="secondary" className={styles.detailLabel}>
              成交额:
            </Text>
            <Text className={styles.detailValue}>
              {(index.amount / 100000000).toFixed(2)}亿
            </Text>
          </div>
        </div>

        <Divider className={styles.divider} />

        <div className={styles.rankInfo}>
          <span className={styles.rankUp}>涨{index.riseCount}</span>
          <span className={styles.rankFlat}>平{index.flatCount}</span>
          <span className={styles.rankDown}>跌{index.fallCount}</span>
        </div>
      </div>
    </Card>
  );
}
