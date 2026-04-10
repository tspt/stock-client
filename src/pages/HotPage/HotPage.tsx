/**
 * 热门行情页面
 */

import { useEffect, useState } from 'react';
import { Layout, Tabs, Card, Statistic, Row, Col, Space, Tag } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  DollarOutlined,
  BarChartOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { HotSectorTable } from './components/HotSectorTable';
import { HotStockTable } from './components/HotStockTable';
import { HotConceptTable } from './components/HotConceptTable';
import { FundFlowTable } from './components/FundFlowTable';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import styles from './HotPage.module.css';

const { Header, Content } = Layout;

export function HotPage() {
  const {
    currentCategory,
    setCurrentCategory,
    loadSectors,
    loadStocks,
    loadConcepts,
    loadFunds,
    loadSentiment,
    sentiment
  } = useHotStore();

  const [sectorSortBy, setSectorSortBy] = useState<'changePercent' | 'volume' | 'amount'>('changePercent');

  // 加载市场情绪数据
  useEffect(() => {
    loadSentiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 根据当前分类加载对应数据
  useEffect(() => {
    switch (currentCategory) {
      case 'sectors':
        loadSectors(sectorSortBy);
        break;
      case 'stocks':
        loadStocks();
        break;
      case 'concepts':
        loadConcepts();
        break;
      case 'funds':
        loadFunds();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCategory, sectorSortBy]);

  return (
    <Layout className={styles.hotPage}>
      {/* 市场情绪概览 */}
      {sentiment && (
        <Header className={styles.sentimentHeader}>
          <MarketSentimentCard sentiment={sentiment} />
        </Header>
      )}

      <Content className={styles.content}>
        <Tabs
          activeKey={currentCategory}
          onChange={(key) => setCurrentCategory(key as any)}
          items={[
            {
              key: 'sectors',
              label: (
                <span>
                  <BarChartOutlined />
                  热门板块
                </span>
              ),
              children: (
                <Card title="热门板块排行" extra={
                  <Space>
                    <Tag
                      color={sectorSortBy === 'changePercent' ? 'blue' : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSectorSortBy('changePercent')}
                    >
                      涨跌幅
                    </Tag>
                    <Tag
                      color={sectorSortBy === 'volume' ? 'blue' : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSectorSortBy('volume')}
                    >
                      成交量
                    </Tag>
                    <Tag
                      color={sectorSortBy === 'amount' ? 'blue' : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSectorSortBy('amount')}
                    >
                      成交额
                    </Tag>
                  </Space>
                }>
                  <HotSectorTable sortBy={sectorSortBy} />
                </Card>
              ),
            },
            {
              key: 'stocks',
              label: (
                <span>
                  <FireOutlined />
                  热门股票
                </span>
              ),
              children: (
                <Card title="热门股票排行">
                  <HotStockTable />
                </Card>
              ),
            },
            {
              key: 'concepts',
              label: (
                <span>
                  <ThunderboltOutlined />
                  热门概念
                </span>
              ),
              children: (
                <Card title="热门概念排行">
                  <HotConceptTable />
                </Card>
              ),
            },
            {
              key: 'funds',
              label: (
                <span>
                  <DollarOutlined />
                  资金动向
                </span>
              ),
              children: (
                <Card title="主力资金流向">
                  <FundFlowTable />
                </Card>
              ),
            },
          ]}
        />
      </Content>
    </Layout>
  );
}
