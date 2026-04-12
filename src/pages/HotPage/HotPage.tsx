/**
 * 热门行情页面
 */

import { useEffect } from 'react';
import { Layout, Tabs, Card } from 'antd';
import {
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons';
import { useHotStore } from '@/stores/hotStore';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import { LeadingSectorTable } from './components/LeadingSectorTable';
import { LaggingSectorTable } from './components/LaggingSectorTable';
import styles from './HotPage.module.css';

const { Header, Content } = Layout;

export function HotPage() {
  const {
    currentCategory,
    setCurrentCategory,
    loadLeadingSectors,
    loadLaggingSectors,
    loadMarketOverview,
    marketOverview
  } = useHotStore();

  // 加载市场概览数据
  useEffect(() => {
    loadMarketOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 根据当前分类加载对应数据
  useEffect(() => {
    switch (currentCategory) {
      case 'leading-sectors':
        loadLeadingSectors();
        break;
      case 'lagging-sectors':
        loadLaggingSectors();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCategory]);

  return (
    <Layout className={styles.hotPage}>
      {/* 市场概览 */}
      <Header className={styles.sentimentHeader}>
        <MarketSentimentCard marketOverview={marketOverview} />
      </Header>

      <Content className={styles.content}>
        <Tabs
          activeKey={currentCategory}
          onChange={(key) => setCurrentCategory(key as any)}
          items={[
            {
              key: 'leading-sectors',
              label: (
                <span>
                  <RiseOutlined />
                  领涨板块
                </span>
              ),
              children: (
                <Card title="今日领涨板块">
                  <LeadingSectorTable />
                </Card>
              ),
            },
            {
              key: 'lagging-sectors',
              label: (
                <span>
                  <FallOutlined />
                  领跌板块
                </span>
              ),
              children: (
                <Card title="今日领跌板块">
                  <LaggingSectorTable />
                </Card>
              ),
            },
          ]}
        />
      </Content>
    </Layout>
  );
}
