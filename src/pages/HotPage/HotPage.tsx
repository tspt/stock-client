/**
 * 热门行情页面 - 市场概览 + 板块排行
 */

import { useEffect } from 'react';
import { Layout } from 'antd';
import { useHotStore } from '@/stores/hotStore';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import { SectorRankCard } from '@/components/SectorRankCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  const { loadMarketOverview, marketOverview, loadSectorRanks, risingSectors, fallingSectors, sectorsLoading } = useHotStore();

  // 加载市场概览数据
  useEffect(() => {
    loadMarketOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载板块排行数据
  useEffect(() => {
    loadSectorRanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout className={styles.hotPage}>
      <Header className={styles.sentimentHeader}>
        <MarketSentimentCard marketOverview={marketOverview} />
      </Header>
      {/* 板块排行区域 */}
      <div className={styles.sectorRankContainer}>
        <div className={styles.sectorColumn}>
          <SectorRankCard
            title="领涨板块"
            data={risingSectors}
            loading={sectorsLoading}
            type="rising"
          />
        </div>
        <div className={styles.sectorColumn}>
          <SectorRankCard
            title="领跌板块"
            data={fallingSectors}
            loading={sectorsLoading}
            type="falling"
          />
        </div>
      </div>
    </Layout>
  );
}
