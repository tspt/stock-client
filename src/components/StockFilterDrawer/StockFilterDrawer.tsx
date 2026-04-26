/**
 * 股票筛选抽屉组件 - 用于成分股全局筛选
 */

import { useState, useEffect } from 'react';
import { Drawer, Form, Input, Select, Button, Space, Checkbox } from 'antd';
import { SearchOutlined, ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import type { StockSimpleInfo } from '@/services/hot/sector-stocks-service';
import type { SectorFilterPrefs } from '@/utils/config/sectorFilterPrefs';
import styles from './StockFilterDrawer.module.css';

const { Option } = Select;

interface StockFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  stocks: StockSimpleInfo[];
  filterPrefs: SectorFilterPrefs;
  onFilterChange: (prefs: SectorFilterPrefs) => void;
  onClearFilters: () => void;
}

interface FilterState {
  searchKeyword: string;
  codeStart: string;
  codeEnd: string;
  marketTypes: string[];
  sortOrder: 'code-asc' | 'code-desc' | 'name-asc';
}

const INITIAL_FILTER_STATE: FilterState = {
  searchKeyword: '',
  codeStart: '',
  codeEnd: '',
  marketTypes: [],
  sortOrder: 'code-asc',
};

export function StockFilterDrawer({
  open,
  onClose,
  stocks,
  filterPrefs,
  onFilterChange,
  onClearFilters,
}: StockFilterDrawerProps) {
  const [form] = Form.useForm();

  // 当抽屉打开时，同步表单值
  useEffect(() => {
    if (open) {
      form.setFieldsValue(filterPrefs);
    }
  }, [open, filterPrefs, form]);

  // 应用筛选逻辑
  const applyFilter = (prefs: SectorFilterPrefs) => {
    let filtered = [...stocks];

    // 1. 关键词搜索（代码或名称）
    if (prefs.searchKeyword) {
      const keyword = prefs.searchKeyword.toLowerCase();
      filtered = filtered.filter(
        (stock) =>
          stock.code.toLowerCase().includes(keyword) ||
          stock.name.toLowerCase().includes(keyword)
      );
    }

    // 2. 代码范围筛选
    if (prefs.codeStart) {
      filtered = filtered.filter((stock) => stock.code >= prefs.codeStart);
    }
    if (prefs.codeEnd) {
      filtered = filtered.filter((stock) => stock.code <= prefs.codeEnd);
    }

    // 3. 市场类型筛选
    if (prefs.marketTypes.length > 0) {
      filtered = filtered.filter((stock) => {
        const codePrefix = stock.code.substring(0, 2);
        return prefs.marketTypes.some((type) => {
          switch (type) {
            case 'shanghai':
              return codePrefix === '60';
            case 'shenzhen-main':
              return codePrefix === '00';
            case 'shenzhen-chinext':
              return codePrefix === '30';
            case 'beijing':
              return codePrefix === '83' || codePrefix === '87' || codePrefix === '43';
            default:
              return false;
          }
        });
      });
    }

    // 4. 排序
    filtered.sort((a, b) => {
      switch (prefs.sortOrder) {
        case 'code-asc':
          return a.code.localeCompare(b.code);
        case 'code-desc':
          return b.code.localeCompare(a.code);
        case 'name-asc':
          return a.name.localeCompare(b.name, 'zh-CN');
        default:
          return 0;
      }
    });

    return filtered;
  };

  // 处理表单值变化
  const handleValuesChange = (changedValues: any, allValues: any) => {
    onFilterChange(allValues);
  };

  // 重置筛选
  const handleReset = () => {
    form.resetFields();
    onClearFilters();
  };

  // 获取当前筛选后的股票数量
  const getFilteredCount = () => {
    return applyFilter(filterPrefs).length;
  };

  return (
    <Drawer
      title="成分股筛选"
      placement="right"
      width={400}
      open={open}
      onClose={onClose}
      destroyOnHidden
      className={styles.filterDrawer}
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        initialValues={INITIAL_FILTER_STATE}
      >
        {/* 关键词搜索 */}
        <Form.Item label="关键词搜索" name="searchKeyword">
          <Input
            prefix={<SearchOutlined />}
            placeholder="输入股票代码或名称"
            allowClear
          />
        </Form.Item>

        {/* 代码范围 */}
        <Form.Item label="代码范围">
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="codeStart" noStyle>
              <Input placeholder="起始代码" style={{ width: '50%' }} />
            </Form.Item>
            <Form.Item name="codeEnd" noStyle>
              <Input placeholder="结束代码" style={{ width: '50%' }} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>

        {/* 市场类型 */}
        <Form.Item label="市场类型" name="marketTypes">
          <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Checkbox value="shanghai">沪市 (60xxxx)</Checkbox>
            <Checkbox value="shenzhen-main">深市主板 (00xxxx)</Checkbox>
            <Checkbox value="shenzhen-chinext">创业板 (30xxxx)</Checkbox>
            <Checkbox value="beijing">北交所 (83/87/43xxxx)</Checkbox>
          </Checkbox.Group>
        </Form.Item>

        {/* 排序方式 */}
        <Form.Item label="排序方式" name="sortOrder">
          <Select>
            <Option value="code-asc">代码升序</Option>
            <Option value="code-desc">代码降序</Option>
            <Option value="name-asc">名称拼音升序</Option>
          </Select>
        </Form.Item>

        {/* 操作按钮 */}
        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button icon={<ClearOutlined />} onClick={handleReset}>
              清除筛选
            </Button>
            <Button type="primary" onClick={onClose}>
              确定
            </Button>
          </Space>
        </Form.Item>

        {/* 筛选结果统计 */}
        <div className={styles.filterStats}>
          当前显示: <strong>{getFilteredCount()}</strong> / {stocks.length} 只股票
        </div>
      </Form>
    </Drawer>
  );
}
