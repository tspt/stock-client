/**
 * 热门行情页面 - 市场概览 + 板块排行
 */

import { Layout } from 'antd';
import { useHotStore } from '@/stores/hotStore';
import { usePolling } from '@/hooks/usePolling';
import { MarketSentimentCard } from './components/MarketSentimentCard';
import { SectorRankCard } from '@/components/SectorRankCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  const {
    loadMarketOverview,
    marketOverview,
    loadSectorRanks,
    risingSectors,
    fallingSectors,
    sectorsLoading,
    loadConceptSectorRanks,
    risingConceptSectors,
    fallingConceptSectors,
    conceptSectorsLoading
  } = useHotStore();

  // 使用轮询定期刷新数据（10秒间隔）
  usePolling(async () => {
    await Promise.all([
      loadMarketOverview(),
      loadSectorRanks(),
      loadConceptSectorRanks()
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
          <SectorRankCard
            title="领涨行业板块"
            data={risingSectors}
            loading={sectorsLoading}
            type="rising"
          />
        </div>
        <div className={styles.sectorColumn}>
          <SectorRankCard
            title="领跌行业板块"
            data={fallingSectors}
            loading={sectorsLoading}
            type="falling"
          />
        </div>
      </div>

      {/* 概念板块排行区域 */}
      <div className={styles.sectorRankContainer}>
        <div className={styles.sectorColumn}>
          <SectorRankCard
            title="领涨概念板块"
            data={risingConceptSectors}
            loading={conceptSectorsLoading}
            type="rising"
          />
        </div>
        <div className={styles.sectorColumn}>
          <SectorRankCard
            title="领跌概念板块"
            data={fallingConceptSectors}
            loading={conceptSectorsLoading}
            type="falling"
          />
        </div>
      </div>
    </Layout>
  );
}
