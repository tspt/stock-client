/**
 * 列表页
 */

import { useEffect, useMemo } from 'react';
import { Layout, App } from 'antd';
import { BUILTIN_GROUP_SELF_ID, BUILTIN_GROUP_SELF_NAME } from '@/utils/config/constants';
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
  const { message } = App.useApp();
  // 加载所有股票列表
  const { loadingAllStocks } = useAllStocks();

  const {
    groups,
    watchList,
    selectedGroupId,
    groupManagerVisible,
    setSelectedGroupId,
    setGroupManagerVisible,
    loadGroups,
    clearGroup,
  } = useStockStore();

  // 加载分组数据
  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前分组名称
  const currentGroupName =
    selectedGroupId === BUILTIN_GROUP_SELF_ID
      ? BUILTIN_GROUP_SELF_NAME
      : groups.find((g) => g.id === selectedGroupId)?.name || BUILTIN_GROUP_SELF_NAME;

  // 当前分组下的股票数量
  const currentGroupStockCount = useMemo(
    () => watchList.filter((s) => s.groupIds && s.groupIds.includes(selectedGroupId)).length,
    [watchList, selectedGroupId]
  );

  // 清空当前分组
  const handleClearGroup = () => {
    const count = clearGroup(selectedGroupId);
    if (count > 0) {
      message.success(`已清空分组"${currentGroupName}"下的 ${count} 只股票`);
    }
  };

  return (
    <Layout className={styles.listPage}>
      <Content className={styles.content}>
        <SearchBar />
        <GroupTabs
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelect={setSelectedGroupId}
          onManageClick={() => setGroupManagerVisible(true)}
          currentGroupName={currentGroupName}
          currentGroupStockCount={currentGroupStockCount}
          onClearGroup={handleClearGroup}
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

