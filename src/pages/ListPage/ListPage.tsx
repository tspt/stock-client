/**
 * 列表页
 */

import { useEffect } from 'react';
import { Layout, Spin } from 'antd';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { StockList } from '@/components/StockList/StockList';
import { StockListSkeleton } from '@/components/StockList/StockListSkeleton';
import { GroupTabs } from '@/components/GroupTabs/GroupTabs';
import { GroupManager } from '@/components/GroupManager/GroupManager';
import { useAllStocks } from '@/hooks/useAllStocks';
import { useStockStore } from '@/stores/stockStore';
import styles from './ListPage.module.css';

const { Content } = Layout;

export function ListPage() {
  // 加载所有股票列表
  const { loadingAllStocks } = useAllStocks();

  const {
    groups,
    selectedGroupId,
    groupManagerVisible,
    setSelectedGroupId,
    setGroupManagerVisible,
    loadGroups,
  } = useStockStore();

  // 加载分组数据
  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout className={styles.listPage}>
      <Content className={styles.content}>
        <SearchBar />
        <GroupTabs
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelect={setSelectedGroupId}
          onManageClick={() => setGroupManagerVisible(true)}
        />
        {loadingAllStocks ? (
          <StockListSkeleton />
        ) : (
          <StockList />
        )}
      </Content>
      <GroupManager
        visible={groupManagerVisible}
        onClose={() => setGroupManagerVisible(false)}
      />
    </Layout>
  );
}

