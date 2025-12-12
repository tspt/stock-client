/**
 * 股票分组选择器组件
 */

import { Checkbox, Space, Tag } from 'antd';
import type { Group } from '@/types/stock';
import styles from './StockGroupSelector.module.css';

interface StockGroupSelectorProps {
  /** 分组列表 */
  groups: Group[];
  /** 已选中的分组ID列表 */
  selectedGroupIds: string[];
  /** 选择变化回调 */
  onChange: (groupIds: string[]) => void;
}

export function StockGroupSelector({
  groups,
  selectedGroupIds,
  onChange,
}: StockGroupSelectorProps) {
  // 按order排序分组
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  const handleChange = (checkedValues: string[]) => {
    onChange(checkedValues);
  };

  return (
    <div className={styles.selector}>
      <Checkbox.Group value={selectedGroupIds} onChange={handleChange}>
        <Space direction="vertical" size="small">
          {sortedGroups.map((group) => (
            <Checkbox key={group.id} value={group.id}>
              <span className={styles.checkboxLabel}>
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: group.color }}
                />
                {group.name}
              </span>
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
    </div>
  );
}

