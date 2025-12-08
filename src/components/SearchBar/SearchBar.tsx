/**
 * 搜索栏组件
 */

import { useState } from 'react';
import { Input, AutoComplete, message, Button, Dropdown } from 'antd';
import { SearchOutlined, MoreOutlined } from '@ant-design/icons';
import { searchStockLocal } from '@/services/stockApi';
import { useStockStore } from '@/stores/stockStore';
import { useStockList } from '@/hooks/useStockList';
import type { StockInfo, SortType } from '@/types/stock';
import styles from './SearchBar.module.css';

export function SearchBar() {
  const [options, setOptions] = useState<{ value: string; stock: StockInfo }[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const { addStock, allStocks } = useStockStore();
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
    addStock(option.stock);
    message.success(`已添加 ${option.stock.name}`);
    setOptions([]);
    setSearchValue(''); // 清空输入框
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
    </div>
  );
}

