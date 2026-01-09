/**
 * 通用列设置组件
 */

import { useState, useEffect } from 'react';
import { Modal, Switch, Button, Space, message } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { ColumnSettingsProps } from '@/types/common';
import styles from './ColumnSettings.module.css';

export function ColumnSettings({
  visible,
  columns,
  onOk,
  onCancel,
  onReset,
  title = "列设置",
}: ColumnSettingsProps) {
  const [localColumns, setLocalColumns] = useState(columns);

  useEffect(() => {
    if (visible) {
      setLocalColumns([...columns]);
    }
  }, [visible, columns]);

  const handleToggleVisible = (key: string) => {
    setLocalColumns((prev) =>
      prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newColumns = [...localColumns];
    [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
    // 更新order
    newColumns.forEach((col, i) => {
      col.order = i;
    });
    setLocalColumns(newColumns);
  };

  const handleMoveDown = (index: number) => {
    if (index === localColumns.length - 1) return;
    const newColumns = [...localColumns];
    [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
    // 更新order
    newColumns.forEach((col, i) => {
      col.order = i;
    });
    setLocalColumns(newColumns);
  };

  const handleOk = () => {
    onOk(localColumns);
    message.success('列设置已保存');
  };

  const handleReset = () => {
    onReset();
    message.success('已重置为默认设置');
    onCancel();
  };

  return (
    <Modal
      title={title}
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      width={600}
      footer={[
        <Button key="reset" onClick={handleReset}>
          重置默认
        </Button>,
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="ok" type="primary" onClick={handleOk}>
          确定
        </Button>,
      ]}
    >
      <div className={styles.columnList}>
        {localColumns.map((col, index) => (
          <div key={col.key} className={styles.columnItem}>
            <Space>
              <Button
                type="text"
                icon={<ArrowUpOutlined />}
                size="small"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                title="上移"
              />
              <Button
                type="text"
                icon={<ArrowDownOutlined />}
                size="small"
                onClick={() => handleMoveDown(index)}
                disabled={index === localColumns.length - 1}
                title="下移"
              />
              <span className={styles.columnTitle}>{col.title}</span>
            </Space>
            <Switch
              checked={col.visible}
              onChange={() => handleToggleVisible(col.key)}
              size="small"
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}