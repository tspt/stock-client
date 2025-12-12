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
import type { StockInfo, SortType } from '@/types/stock';
import styles from './SearchBar.module.css';

export function SearchBar() {
  const [options, setOptions] = useState<{ value: string; stock: StockInfo }[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [groupSelectorVisible, setGroupSelectorVisible] = useState(false);
  const [pendingStock, setPendingStock] = useState<StockInfo | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const { addStock, allStocks, groups } = useStockStore();
  const { sortType, setSortType } = useStockList();

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
    // 如果没有分组，直接添加（不添加到任何分组）
    if (groups.length === 0) {
      addStock(option.stock);
      message.success(`已添加 ${option.stock.name}`);
      setOptions([]);
      setSearchValue('');
      return;
    }

    // 有分组时，弹出选择器
    setPendingStock(option.stock);
    setSelectedGroupIds([]);
    setGroupSelectorVisible(true);
  };

  const handleGroupSelectConfirm = () => {
    if (!pendingStock) return;

    // 如果未选择分组，不添加到任何分组（groupIds为undefined）
    const finalGroupIds = selectedGroupIds.length > 0 ? selectedGroupIds : undefined;

    addStock(pendingStock, finalGroupIds);
    message.success(`已添加 ${pendingStock.name}`);
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
            size="default"
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
          <Button type="text" icon={<MoreOutlined />} size="default" className={styles.sortBtn}>
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
        {pendingStock && (
          <div style={{ marginBottom: 16 }}>
            <span>将股票 "{pendingStock.name}" 添加到以下分组：</span>
          </div>
        )}
        <StockGroupSelector
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          onChange={setSelectedGroupIds}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
          提示：未选择分组时，股票将显示在"全部"列表中
        </div>
      </Modal>
    </div>
  );
}

