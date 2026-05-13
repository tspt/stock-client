/**
 * 添加到自选股弹窗组件
 * 参考历史回测的"导出指定股票"弹窗样式
 */

import { useState, useMemo } from 'react';
import { Modal, Checkbox, Space, Button, message } from 'antd';
import type { StockInfo, Group, StockOpportunityData } from '@/types/stock';
import { StockGroupSelector } from '../StockGroupSelector/StockGroupSelector';
import { useStockStore } from '@/stores/stockStore';
import {
  BUILTIN_GROUP_SELF_ID,
  BUILTIN_GROUP_SELF_NAME,
  BUILTIN_GROUP_SELF_COLOR,
} from '@/utils/config/constants';
import styles from './AddStocksToWatchListModal.module.css';

// 通用股票项类型，支持 StockInfo 和 StockOpportunityData
interface StockItem {
  code: string;
  name: string;
}

interface AddStocksToWatchListModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 待添加的股票列表（支持 StockInfo 或 StockOpportunityData） */
  stocks: StockItem[];
  /** 关闭回调 */
  onClose: () => void;
}

export function AddStocksToWatchListModal({
  visible,
  stocks,
  onClose,
}: AddStocksToWatchListModalProps) {
  const { addStock, groups } = useStockStore();
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // 分组选择列表：内置"自选" + 用户分组
  const groupOptions: Group[] = useMemo(
    () => [
      { id: BUILTIN_GROUP_SELF_ID, name: BUILTIN_GROUP_SELF_NAME, color: BUILTIN_GROUP_SELF_COLOR, order: -999 },
      ...groups,
    ],
    [groups]
  );

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedCodes.size === stocks.length) {
      // 已全选，取消全选
      setSelectedCodes(new Set());
    } else {
      // 全选
      setSelectedCodes(new Set(stocks.map(s => s.code)));
    }
  };

  // 单个股票选择切换
  const handleToggleStock = (code: string) => {
    const newSelected = new Set(selectedCodes);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCodes(newSelected);
  };

  // 确认添加
  const handleConfirm = () => {
    if (selectedCodes.size === 0) {
      message.warning('请至少选择一只股票');
      return;
    }

    if (selectedGroupIds.length === 0) {
      message.warning('请至少选择一个分组');
      return;
    }

    // 批量添加股票
    const selectedStocks = stocks.filter(s => selectedCodes.has(s.code));
    selectedStocks.forEach(stock => {
      // 根据代码前缀判断市场
      const market = stock.code.startsWith('SH') ? 'SH' : 'SZ';
      const stockInfo: StockInfo = {
        code: stock.code,
        name: stock.name,
        market,
      };
      addStock(stockInfo, selectedGroupIds);
    });

    message.success(`成功添加 ${selectedStocks.length} 只股票到自选股`);

    // 重置状态并关闭弹窗
    setSelectedCodes(new Set());
    setSelectedGroupIds([]);
    onClose();
  };

  // 取消操作
  const handleCancel = () => {
    setSelectedCodes(new Set());
    setSelectedGroupIds([]);
    onClose();
  };

  return (
    <Modal
      title={`添加到自选股 (${selectedCodes.size}/${stocks.length})`}
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={handleConfirm}>
          添加
        </Button>,
      ]}
      width={800}
      className={styles.modal}
    >
      <div className={styles.content}>
        {/* 全选按钮 */}
        <div className={styles.header}>
          <span>选择股票：</span>
          <Button
            type="link"
            size="small"
            onClick={handleSelectAll}
            className={styles.selectAllBtn}
          >
            {selectedCodes.size === stocks.length ? '取消全选' : '全选'}
          </Button>
        </div>

        {/* 股票网格列表 */}
        <div className={styles.stockGrid}>
          {stocks.map(stock => {
            const isSelected = selectedCodes.has(stock.code);
            return (
              <div
                key={stock.code}
                className={`${styles.stockCard} ${isSelected ? styles.selected : ''}`}
                onClick={() => handleToggleStock(stock.code)}
              >
                <Checkbox
                  checked={isSelected}
                  onChange={() => handleToggleStock(stock.code)}
                  className={styles.checkbox}
                />
                <div className={styles.stockInfo}>
                  <div className={styles.stockName}>{stock.name}</div>
                  <div className={styles.stockCode}>{stock.code}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 分组选择 */}
        <div className={styles.groupSelector}>
          <div className={styles.groupLabel}>添加到分组：</div>
          <StockGroupSelector
            groups={groupOptions}
            selectedGroupIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
          />
        </div>

        {/* 提示信息 */}
        <div className={styles.tips}>
          提示：默认添加到"自选"分组，可手动调整选择。数据将保存到本地存储。
        </div>
      </div>
    </Modal>
  );
}
