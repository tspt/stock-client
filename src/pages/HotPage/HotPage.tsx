/**
 * 热门行情页面 - 市场概览 + 板块排行
 */

import { Layout } from 'antd';
import { useHotStore } from '@/stores/hotStore';
import { usePolling } from '@/hooks/usePolling';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import { EastMoneySectorRankCard } from '@/components/EastMoneySectorRankCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  const {
    loadMarketOverview,
    marketOverview,
    loadEastMoneySectorRanks,
    eastMoneyRisingSectors,
    eastMoneyFallingSectors
  } = useHotStore();

  // 使用轮询定期刷新数据（10秒间隔）
  usePolling(async () => {
    await Promise.all([
      loadMarketOverview(),
      loadEastMoneySectorRanks()
    ]);
  }, {
    interval: 10000, // 10秒
    immediate: true, // 立即执行一次
    enabled: true
  });

  return (
    <Layout className={styles.hotPage}>
      <Header className={styles.sentimentHeader}>
        <MarketSentimentCard marketOverview={marketOverview} />
      </Header>
      {/* 板块排行区域 */}
      <div className={styles.sectorRankContainer}>
        <div className={styles.sectorColumn}>
          <EastMoneySectorRankCard
            title="领涨概念"
            data={eastMoneyRisingSectors}
            type="rising"
          />
        </div>
        <div className={styles.sectorColumn}>
          <EastMoneySectorRankCard
            title="领跌概念"
            data={eastMoneyFallingSectors}
            type="falling"
          />
        </div>
      </div>
    </Layout>
  );
}
