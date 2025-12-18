/**
 * 股票列表组件（垂直布局）
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { List, Button, Empty, Tooltip, Menu, Modal } from 'antd';
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
  BellOutlined,
  FolderAddOutlined,
} from '@ant-design/icons';
import { useStockList } from '@/hooks/useStockList';
import { useStockStore } from '@/stores/stockStore';
import { StockGroupSelector } from '@/components/StockGroupSelector/StockGroupSelector';
import { formatPrice, formatChangePercent, formatVolume } from '@/utils/format';
import { AlertSettingModal } from '@/components/PriceAlert/AlertSettingModal';
import { message } from 'antd';
import { BUILTIN_GROUP_SELF_COLOR, BUILTIN_GROUP_SELF_ID, BUILTIN_GROUP_SELF_NAME } from '@/utils/constants';
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
    groups,
    addStockToGroups,
  } = useStockStore();

  const groupOptions = useMemo(
    () => [
      { id: BUILTIN_GROUP_SELF_ID, name: BUILTIN_GROUP_SELF_NAME, color: BUILTIN_GROUP_SELF_COLOR, order: -999 },
      ...groups,
    ],
    [groups]
  );
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    code: string;
  } | null>(null);
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertModalCode, setAlertModalCode] = useState<string | null>(null);
  const [groupSelectorVisible, setGroupSelectorVisible] = useState(false);
  const [pendingStockCode, setPendingStockCode] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  // 点击外部区域关闭右键菜单，并动态调整菜单位置
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu && contextMenuRef.current) {
        const target = event.target as HTMLElement;
        // 检查是否点击在菜单容器内或菜单项上
        const isClickInsideMenu = contextMenuRef.current.contains(target) ||
          target.closest('.ant-dropdown-menu') ||
          target.closest('.ant-dropdown-menu-item');

        if (!isClickInsideMenu) {
          handleContextMenuClose();
        }
      }
    };

    // 监听右键事件，在其他地方右键时关闭当前菜单并打开新的
    const handleContextMenu = (event: MouseEvent) => {
      if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        handleContextMenuClose();
      }
    };


    if (contextMenu) {
      // 使用setTimeout确保菜单渲染完成后再绑定事件
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('contextmenu', handleContextMenu);
      }, 0);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('contextmenu', handleContextMenu);
      };
    }
  }, [contextMenu]);

  // 处理添加到分组
  const handleAddToGroups = (code: string) => {
    const stock = watchList.find((s) => s.code === code);
    if (!stock) return;

    // 设置当前股票已有的分组（用于显示已选中的分组）
    setSelectedGroupIds(stock.groupIds || []);
    setPendingStockCode(code);
    setGroupSelectorVisible(true);
    handleContextMenuClose();
  };

  // 确认添加到分组
  const handleGroupSelectConfirm = () => {
    if (!pendingStockCode) return;

    // 直接使用用户选择的分组（用户可以选择添加或移除分组）
    addStockToGroups(pendingStockCode, selectedGroupIds);
    const stockName = watchList.find((s) => s.code === pendingStockCode)?.name || '';

    if (selectedGroupIds.length === 0) {
      message.success(`已将 ${stockName} 从所有分组中移除`);
    } else {
      message.success(`已更新 ${stockName} 的分组`);
    }

    setGroupSelectorVisible(false);
    setPendingStockCode(null);
    setSelectedGroupIds([]);
  };

  // 取消添加到分组
  const handleGroupSelectCancel = () => {
    setGroupSelectorVisible(false);
    setPendingStockCode(null);
    setSelectedGroupIds([]);
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
                      style={{ transform: 'rotate(90deg)', display: 'inline-block' }}
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
                      style={{ transform: 'rotate(-90deg)', display: 'inline-block' }}
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

              // 估算菜单尺寸（菜单项高度30px，大约4-5个菜单项，加上padding）
              const menuWidth = 160; // 菜单宽度
              const menuHeight = 150; // 菜单高度（估算：4个菜单项 + 分隔线 + padding）

              // 获取窗口尺寸
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const padding = 10; // 边距

              // 计算菜单位置，确保不超出屏幕
              let menuX = e.clientX;
              let menuY = e.clientY;

              // 检查右边界：如果超出，向左移动
              if (menuX + menuWidth > windowWidth - padding) {
                menuX = menuX - menuWidth + 30;
              }

              // // 检查左边界：如果超出，移动到左边
              if (menuX < padding) {
                menuX = padding;
              }

              if (menuY + menuHeight > windowHeight - padding) {
                menuY = menuY - menuHeight + 30;
              }

              // 检查上边界：如果超出，调整到顶部
              if (menuY < padding) {
                menuY = padding;
              }

              setContextMenu({
                visible: true,
                x: menuX,
                y: menuY,
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
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <Menu
            items={[
              {
                key: 'addToGroup',
                label: '添加到分组',
                icon: <FolderAddOutlined />,
                disabled: false,
                onClick: () => {
                  handleAddToGroups(contextMenu.code);
                },
              },
              {
                type: 'divider',
              },
              {
                key: 'alert',
                label: '设置提醒',
                icon: <BellOutlined />,
                onClick: () => {
                  setAlertModalCode(contextMenu.code);
                  setAlertModalVisible(true);
                  handleContextMenuClose();
                },
              },
              {
                type: 'divider',
              },
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
      {alertModalCode && (
        <AlertSettingModal
          visible={alertModalVisible}
          code={alertModalCode}
          name={watchList.find((s) => s.code === alertModalCode)?.name || ''}
          basePrice={quotes[alertModalCode]?.prevClose || quotes[alertModalCode]?.price || 0}
          onCancel={() => {
            setAlertModalVisible(false);
            setAlertModalCode(null);
          }}
        />
      )}
      <Modal
        title="添加到分组"
        open={groupSelectorVisible}
        onOk={handleGroupSelectConfirm}
        onCancel={handleGroupSelectCancel}
        okText="确定"
        cancelText="取消"
        width={400}
      >
        {pendingStockCode && (
          <div style={{ marginBottom: 16 }}>
            <span>
              将股票 "{watchList.find((s) => s.code === pendingStockCode)?.name}" 添加到以下分组：
            </span>
          </div>
        )}
        <StockGroupSelector
          groups={groupOptions}
          selectedGroupIds={selectedGroupIds}
          onChange={setSelectedGroupIds}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
          提示：可以同时选择多个分组，取消选择会从该分组中移除
        </div>
      </Modal>
    </div>
  );
}

