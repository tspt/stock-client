/**
 * 市场情绪卡片组件
 */

import { Card, Row, Col, Statistic } from 'antd';
import { RiseOutlined, FallOutlined, FireOutlined } from '@ant-design/icons';
import type { MarketSentiment } from '@/types/hot';

interface MarketSentimentCardProps {
  sentiment: MarketSentiment;
}

export function MarketSentimentCard({ sentiment }: MarketSentimentCardProps) {
  const totalStocks = sentiment.riseCount + sentiment.fallCount + sentiment.flatCount;
  const riseRatio = totalStocks > 0 ? ((sentiment.riseCount / totalStocks) * 100).toFixed(1) : '0';

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={16}>
        <Col span={4}>
          <Statistic
            title="涨停"
            value={sentiment.limitUpCount}
            prefix={<FireOutlined />}
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
        <Col span={4}>
          <Statistic
            title="跌停"
            value={sentiment.limitDownCount}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col span={4}>
          <Statistic
            title="上涨"
            value={sentiment.riseCount}
            suffix={`/ ${totalStocks}`}
            prefix={<RiseOutlined />}
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
        <Col span={4}>
          <Statistic
            title="下跌"
            value={sentiment.fallCount}
            prefix={<FallOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col span={4}>
          <Statistic
            title="上涨比例"
            value={riseRatio}
            suffix="%"
            valueStyle={{ color: parseFloat(riseRatio) >= 50 ? '#ff4d4f' : '#52c41a' }}
          />
        </Col>
        <Col span={4}>
          <Statistic
            title="成交额"
            value={sentiment.totalAmount}
            suffix="亿"
            precision={2}
          />
        </Col>
      </Row>
    </Card>
  );
}
