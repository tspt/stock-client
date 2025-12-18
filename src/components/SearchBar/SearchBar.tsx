/**
 * 搜索栏组件
 */

import { useState } from 'react';
import { Input, AutoComplete, message, Button, Dropdown, Modal } from 'antd';
import { SearchOutlined, MoreOutlined } from '@ant-design/icons';
import { searchStockLocal } from '@/services/stockApi';
import { useStockStore } from '@/stores/stockStore';
import { useStockList } from '@/hooks/useStockList';
import { StockGroupSelector } from '@/components/StockGroupSelector/StockGroupSelector';
import type { StockInfo, SortType, Group } from '@/types/stock';
import { BUILTIN_GROUP_SELF_COLOR, BUILTIN_GROUP_SELF_ID, BUILTIN_GROUP_SELF_NAME } from '@/utils/constants';
import styles from './SearchBar.module.css';

export function SearchBar() {
  const [options, setOptions] = useState<{ value: string; stock: StockInfo }[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [groupSelectorVisible, setGroupSelectorVisible] = useState(false);
  const [pendingStock, setPendingStock] = useState<StockInfo | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const { addStock, allStocks, groups } = useStockStore();
  const { sortType, setSortType } = useStockList();

  // 分组选择列表：内置“自选” + 用户分组（自选不出现在分组管理，但可用于选择）
  const groupOptions: Group[] = [
    { id: BUILTIN_GROUP_SELF_ID, name: BUILTIN_GROUP_SELF_NAME, color: BUILTIN_GROUP_SELF_COLOR, order: -999 },
    ...groups,
  ];

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (!value.trim()) {
      setOptions([]);
      return;
    }

    // 本地搜索
    const stocks = searchStockLocal(value, allStocks);
    setOptions(
      stocks.map((stock) => ({
        value: `${stock.name} (${stock.code})`,
        stock,
      }))
    );
  };

  const handleSelect = (_value: string, option: { value: string; stock: StockInfo }) => {
    // 添加股票：必须选择至少一个分组
    setPendingStock(option.stock);
    setSelectedGroupIds([]);
    setGroupSelectorVisible(true);
  };

  const handleGroupSelectConfirm = () => {
    if (!pendingStock) return;

    // 必须至少选择一个分组
    if (selectedGroupIds.length === 0) {
      message.warning('请至少选择一个分组');
      return;
    }

    addStock(pendingStock, selectedGroupIds);
    message.success(`已添加：${pendingStock.name}`);
    setOptions([]);
    setSearchValue('');
    setGroupSelectorVisible(false);
    setPendingStock(null);
    setSelectedGroupIds([]);
  };

  const handleGroupSelectCancel = () => {
    setGroupSelectorVisible(false);
    setPendingStock(null);
    setSelectedGroupIds([]);
  };

  const sortMenuItems = [
    { key: 'default', label: '默认排序' },
    { key: 'rise', label: '按涨幅排序' },
    { key: 'fall', label: '按跌幅排序' },
  ];

  const handleSortChange = ({ key }: { key: string }) => {
    setSortType(key as SortType);
  };

  return (
    <div className={styles.searchBar}>
      <div className={styles.searchBarContent}>
        <AutoComplete
          value={searchValue}
          options={options}
          onSearch={handleSearch}
          onSelect={handleSelect}
          placeholder=""
          className={styles.searchInput}
          filterOption={false}
        >
          <Input
            prefix={<SearchOutlined style={{ marginRight: 8 }} />}
            size="middle"
            allowClear
            value={searchValue}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </AutoComplete>
        <Dropdown
          menu={{
            items: sortMenuItems,
            selectedKeys: [sortType],
            onClick: handleSortChange,
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} size="middle" className={styles.sortBtn}>
            排序
          </Button>
        </Dropdown>
      </div>
      <Modal
        title="选择分组"
        open={groupSelectorVisible}
        onOk={handleGroupSelectConfirm}
        onCancel={handleGroupSelectCancel}
        okText="确定"
        cancelText="取消"
        width={400}
      >
        <StockGroupSelector
          groups={groupOptions}
          selectedGroupIds={selectedGroupIds}
          onChange={setSelectedGroupIds}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
          提示：必须至少选择一个分组（可多选）
        </div>
      </Modal>
    </div>
  );
}

