/**
 * 市场概览卡片组件
 */

import { Card, Row, Col, Typography, Divider } from 'antd';
import type { MarketSentiment } from '@/types/hot';
import type { MarketOverview } from '@/services/tencentApi';
import { formatChangePercent } from '@/utils/format';
import styles from '../HotPage.module.css';

const { Text } = Typography;

interface MarketSentimentCardProps {
  sentiment?: MarketSentiment;
  marketOverview?: MarketOverview | null;
}

export function MarketSentimentCard({ sentiment, marketOverview }: MarketSentimentCardProps) {
  // 如果有市场概览数据，使用新数据；否则使用旧的情绪数据
  if (marketOverview) {
    const { shanghaiIndex, shenzhenIndex, shanghaiRank, shenzhenRank } = marketOverview;

    return (
      <div className={styles.marketOverviewContainer}>
        {/* 左列：上证指数 + 上海涨跌 */}
        <div className={styles.marketColumn}>
          <div className={styles.indexInfo}>
            <Text strong className={styles.indexName}>上证指数</Text>
            <div className={styles.indexPrice} style={{ color: shanghaiIndex.change >= 0 ? '#ff4d4f' : '#52c41a' }}>
              {shanghaiIndex.currentPrice.toFixed(2)}
            </div>
            <div className={styles.indexChange} style={{ color: shanghaiIndex.change >= 0 ? '#ff4d4f' : '#52c41a' }}>
              {shanghaiIndex.change >= 0 ? '+' : ''}{shanghaiIndex.change.toFixed(2)} {formatChangePercent(shanghaiIndex.changePercent)}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div className={styles.indexDetail}>
              <Text type="secondary">成交量：{(shanghaiIndex.volume / 10000).toFixed(0)}万手</Text>
            </div>
            <div className={styles.indexDetail}>
              <Text type="secondary">成交额：{(shanghaiIndex.amount / 10000).toFixed(0)}亿</Text>
            </div>
          </div>
          <div className={styles.rankInfo}>
            <span className={styles.rankUp}>涨:{shanghaiRank.riseCount}</span>
            <span className={styles.rankFlat}>平:{shanghaiRank.flatCount}</span>
            <span className={styles.rankDown}>跌:{shanghaiRank.fallCount}</span>
          </div>
        </div>

        {/* 右列：深证成指 + 深圳涨跌 */}
        <div className={styles.marketColumn}>
          <div className={styles.indexInfo}>
            <Text strong className={styles.indexName}>深证成指</Text>
            <div className={styles.indexPrice} style={{ color: shenzhenIndex.change >= 0 ? '#ff4d4f' : '#52c41a' }}>
              {shenzhenIndex.currentPrice.toFixed(2)}
            </div>
            <div className={styles.indexChange} style={{ color: shenzhenIndex.change >= 0 ? '#ff4d4f' : '#52c41a' }}>
              {shenzhenIndex.change >= 0 ? '+' : ''}{shenzhenIndex.change.toFixed(2)} {formatChangePercent(shenzhenIndex.changePercent)}
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div className={styles.indexDetail}>
              <Text type="secondary">成交量：{(shenzhenIndex.volume / 10000).toFixed(0)}万手</Text>
            </div>
            <div className={styles.indexDetail}>
              <Text type="secondary">成交额：{(shenzhenIndex.amount / 10000).toFixed(0)}亿</Text>
            </div>
          </div>
          <div className={styles.rankInfo}>
            <span className={styles.rankUp}>涨:{shenzhenRank.riseCount}</span>
            <span className={styles.rankFlat}>平:{shenzhenRank.flatCount}</span>
            <span className={styles.rankDown}>跌:{shenzhenRank.fallCount}</span>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有市场概览数据，使用旧的情绪数据（兼容模式）
  if (!sentiment) {
    return null;
  }

  return (
    <Card className={styles.marketOverviewCard} size="small">
      <Row gutter={[24, 16]}>
        <Col span={24}>
          <Text type="secondary">市场情绪数据加载中...</Text>
        </Col>
      </Row>
    </Card>
  );
}
