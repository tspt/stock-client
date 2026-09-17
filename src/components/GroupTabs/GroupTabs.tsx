/**
 * 分组标签页组件
 */

import { Tabs, Button, Popconfirm } from 'antd';
import { SettingOutlined, ClearOutlined } from '@ant-design/icons';
import type { Group } from '@/types/stock';
import { BUILTIN_GROUP_SELF_COLOR, BUILTIN_GROUP_SELF_ID, BUILTIN_GROUP_SELF_NAME } from '@/utils/config/constants';
import styles from './GroupTabs.module.css';

interface GroupTabsProps {
  /** 分组列表 */
  groups: Group[];
  /** 当前选中的分组ID */
  selectedGroupId: string;
  /** 选择分组回调 */
  onSelect: (groupId: string) => void;
  /** 打开分组管理弹窗回调 */
  onManageClick: () => void;
  /** 当前分组名称（用于清空确认文案） */
  currentGroupName: string;
  /** 当前分组下的股票数量 */
  currentGroupStockCount: number;
  /** 清空当前分组回调 */
  onClearGroup: () => void;
}

export function GroupTabs({
  groups,
  selectedGroupId,
  onSelect,
  onManageClick,
  currentGroupName,
  currentGroupStockCount,
  onClearGroup,
}: GroupTabsProps) {
  // 按order排序分组
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  // 最多显示5个分组，超出显示"更多"
  const maxVisibleTabs = 5;
  const visibleGroups = sortedGroups.slice(0, maxVisibleTabs);
  const hasMore = sortedGroups.length > maxVisibleTabs;

  // 构建标签项
  const tabItems = [
    {
      key: BUILTIN_GROUP_SELF_ID,
      label: (
        <span className={styles.tabLabel}>
          <span className={styles.colorDot} style={{ backgroundColor: BUILTIN_GROUP_SELF_COLOR }} />
          {BUILTIN_GROUP_SELF_NAME}
        </span>
      ),
      children: null,
    },
    ...visibleGroups.map((group) => ({
      key: group.id,
      label: (
        <span className={styles.tabLabel}>
          <span
            className={styles.colorDot}
            style={{ backgroundColor: group.color }}
          />
          {group.name}
        </span>
      ),
      children: null,
    })),
  ];

  // 如果分组较多，添加"更多"标签
  if (hasMore) {
    tabItems.push({
      key: 'more',
      label: <span>更多</span>,
      children: null,
    });
  }

  const activeKey = selectedGroupId;

  const handleTabChange = (key: string) => {
    if (key === 'more') {
      onManageClick();
    } else {
      onSelect(key);
    }
  };

  return (
    <div className={styles.groupTabs}>
      <Tabs
        activeKey={activeKey}
        items={tabItems}
        onChange={handleTabChange}
        size="small"
        type="card"
        className={styles.tabs}
      />
      <Popconfirm
        title="确认清空"
        description={`确定要清空分组"${currentGroupName}"下的 ${currentGroupStockCount} 只股票吗？`}
        onConfirm={onClearGroup}
        okText="清空"
        okType="danger"
        cancelText="取消"
        disabled={currentGroupStockCount === 0}
      >
        <Button
          type="text"
          icon={<ClearOutlined />}
          size="small"
          disabled={currentGroupStockCount === 0}
          className={styles.clearBtn}
          title="清空当前分组"
        >
          清空
        </Button>
      </Popconfirm>
      <Button
        type="text"
        icon={<SettingOutlined />}
        size="small"
        onClick={onManageClick}
        className={styles.manageBtn}
        title="分组管理"
      />
    </div>
  );
}

