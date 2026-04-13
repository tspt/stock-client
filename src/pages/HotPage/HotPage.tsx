/**
 * 热门行情页面 - 仅保留市场概览
 */

import { useEffect } from 'react';
import { Layout } from 'antd';
import { useHotStore } from '@/stores/hotStore';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  const { loadMarketOverview, marketOverview } = useHotStore();

  // 加载市场概览数据
  useEffect(() => {
    loadMarketOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout className={styles.hotPage}>
      <Header className={styles.sentimentHeader}>
        <MarketSentimentCard marketOverview={marketOverview} />
      </Header>
    </Layout>
  );
}
