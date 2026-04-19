/**
 * 热门行情页面 - 指数展示 + 板块排行
 */

import { Layout } from 'antd';
import { useHotStore } from '@/stores/hotStore';
import { usePolling } from '@/hooks/usePolling';
import { IndexCard } from './components/IndexCard';
import { EastMoneySectorRankCard } from '@/components/EastMoneySectorRankCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  const {
    indices,
    indicesLoading,
    loadEastMoneyIndices,
    loadEastMoneySectorRanks,
    eastMoneyRisingSectors,
    eastMoneyFallingSectors
  } = useHotStore();

  // 使用轮询定期刷新数据（10秒间隔）
  usePolling(async () => {
    await Promise.all([
      loadEastMoneyIndices(),
      loadEastMoneySectorRanks()
    ]);
  }, {
    interval: 10000, // 10秒
    immediate: true, // 立即执行一次
    enabled: true
  });

  return (
    <Layout className={styles.hotPage}>
      {/* 指数展示区域 - 固定顶部 */}
      <div className={styles.indicesContainer}>
        {indices.length > 0 ? (
          <div className={styles.indicesGrid}>
            {indices.map((index) => (
              <IndexCard key={index.code} index={index} />
            ))}
          </div>
        ) : (
          <div className={styles.loadingText}>加载中...</div>
        )}
      </div>

      {/* 板块排行区域 - 可滚动 */}
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
