/**
 * 股票列表组件（垂直布局）
 */

import { useState } from 'react';
import { List, Button, Empty, Tooltip, Menu } from 'antd';
import {
  UpOutlined,
  DownOutlined,
  DoubleLeftOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useStockList } from '@/hooks/useStockList';
import { useStockStore } from '@/stores/stockStore';
import { formatPrice, formatChangePercent, formatVolume } from '@/utils/format';
import styles from './StockList.module.css';

export function StockList() {
  const { watchList, quotes } = useStockList();
  const {
    removeStock,
    setSelectedStock,
    selectedStock,
    moveStockUp,
    moveStockDown,
    moveStockToTop,
    moveStockToBottom,
  } = useStockStore();
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    code: string;
  } | null>(null);

  const handleItemClick = (code: string) => {
    setSelectedStock(code);
  };

  const handleRemove = (code: string) => {
    removeStock(code);
  };

  const handleMoveUp = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    moveStockUp(code);
  };

  const handleMoveDown = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    moveStockDown(code);
  };

  const handleMoveToTop = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    moveStockToTop(code);
  };

  const handleMoveToBottom = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    moveStockToBottom(code);
  };

  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  if (watchList.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <Empty description="暂无自选股，请搜索添加" />
      </div>
    );
  }

  return (
    <div className={styles.stockList}>
      <div className={styles.listContainer}>
        <List
          dataSource={watchList}
          renderItem={(stock, index) => {
            const quote = quotes[stock.code];
            const isSelected = selectedStock === stock.code;
            const changePercent = quote ? quote.changePercent : 0;
            const isRise = changePercent >= 0;
            const absChangePercent = Math.abs(changePercent);
            const isFirst = index === 0;
            const isLast = index === watchList.length - 1;

            // 根据涨跌幅范围选择图标
            const getChangeIcon = () => {
              if (isRise) {
                // 上涨
                if (absChangePercent <= 2) {
                  return <UpOutlined />; // 0-2%
                } else if (absChangePercent <= 5) {
                  // 2-5%，使用DoubleLeftOutlined并旋转-90度（向上）
                  return (
                    <DoubleLeftOutlined
                      style={{ transform: 'rotate(-90deg)', display: 'inline-block' }}
                    />
                  );
                } else {
                  return <CaretUpOutlined />; // >5%
                }
              } else {
                // 下跌
                if (absChangePercent <= 2) {
                  return <DownOutlined />; // 0-2%
                } else if (absChangePercent <= 5) {
                  // 2-5%，使用DoubleLeftOutlined并旋转90度（向下）
                  return (
                    <DoubleLeftOutlined
                      style={{ transform: 'rotate(90deg)', display: 'inline-block' }}
                    />
                  );
                } else {
                  return <CaretDownOutlined />; // >5%
                }
              }
            };

            // 处理右键菜单
            const handleContextMenu = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                code: stock.code,
              });
            };

            // Tooltip 内容（显示代码和交易量）
            const tooltipContent = quote ? (
              <div>
                <div>代码: {stock.code}</div>
                <div>交易量: {formatVolume(quote.volume)}</div>
              </div>
            ) : (
              <div>代码: {stock.code}</div>
            );

            return (
              <List.Item
                className={`${styles.listItem} ${isSelected ? styles.selected : ''}`}
                onClick={() => handleItemClick(stock.code)}
                onContextMenu={handleContextMenu}
              >
                <div className={styles.stockInfo}>
                  <Tooltip title={tooltipContent} placement="right">
                    <div className={styles.stockName}>
                      <span className={styles.name}>{stock.name}</span>
                    </div>
                  </Tooltip>
                  {quote ? (
                    <div className={styles.quote}>
                      <div
                        className={`${styles.change} ${isRise ? styles.rise : styles.fall}`}
                      >
                        {getChangeIcon()}
                        {formatChangePercent(quote.changePercent)}
                      </div>
                      <div
                        className={`${styles.price} ${isRise ? styles.rise : styles.fall}`}
                      >
                        {formatPrice(quote.price)}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.loading}>加载中...</div>
                  )}
                </div>
                <div className={styles.actionButtons}>
                  <Tooltip title="上移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined />}
                      disabled={isFirst}
                      onClick={(e) => handleMoveUp(stock.code, e)}
                      className={styles.actionBtn}
                    />
                  </Tooltip>
                  <Tooltip title="下移">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined />}
                      disabled={isLast}
                      onClick={(e) => handleMoveDown(stock.code, e)}
                      className={styles.actionBtn}
                    />
                  </Tooltip>
                  <Tooltip title="置顶">
                    <Button
                      type="text"
                      size="small"
                      icon={<VerticalAlignTopOutlined />}
                      disabled={isFirst}
                      onClick={(e) => handleMoveToTop(stock.code, e)}
                      className={styles.actionBtn}
                    />
                  </Tooltip>
                  <Tooltip title="置尾">
                    <Button
                      type="text"
                      size="small"
                      icon={<VerticalAlignBottomOutlined />}
                      disabled={isLast}
                      onClick={(e) => handleMoveToBottom(stock.code, e)}
                      className={styles.actionBtn}
                    />
                  </Tooltip>
                </div>
              </List.Item>
            );
          }}
        />
      </div>
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
          onClick={handleContextMenuClose}
        >
          <Menu
            items={[
              {
                key: 'delete',
                label: '删除',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                  handleRemove(contextMenu.code);
                  handleContextMenuClose();
                },
              },
            ]}
          />
        </div>
      )}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={handleContextMenuClose}
        />
      )}
    </div>
  );
}

