/**
 * 热门行情页面 - 指数展示 + 板块排行
 */

import { Layout, Skeleton } from 'antd';
import { POLLING_INTERVAL } from '@/utils/constants';
import {
  useIndices,
  useIndicesLoading,
  useEastMoneyRisingSectors,
  useEastMoneyFallingSectors,
  useHotStore,
} from '@/stores/hotStore';
import { usePolling } from '@/hooks/usePolling';
import { IndexCard } from './components/IndexCard';
import { EastMoneySectorRankCard } from '@/components/EastMoneySectorRankCard';
import styles from './HotPage.module.css';

const { Header } = Layout;

export function HotPage() {
  // 使用选择器函数，避免不必要的重渲染
  const indices = useIndices();
  const indicesLoading = useIndicesLoading();
  const eastMoneyRisingSectors = useEastMoneyRisingSectors();
  const eastMoneyFallingSectors = useEastMoneyFallingSectors();

  // 获取 actions
  const { loadEastMoneyIndices, loadEastMoneySectorRanks } = useHotStore();

  // 使用轮询定期刷新数据（10秒间隔）
  usePolling(
    async () => {
      await Promise.all([
        loadEastMoneyIndices(),
        loadEastMoneySectorRanks(),
      ]);
    },
    {
      interval: POLLING_INTERVAL, // 10秒
      immediate: true, // 立即执行一次
      enabled: true,
    }
  );

  return (
    <Layout className={styles.hotPage}>
      {/* 指数展示区域 - 固定顶部 */}
      <div className={styles.indicesContainer}>
        {indicesLoading ? (
          <div className={styles.skeletonContainer}>
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        ) : indices.length > 0 ? (
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
