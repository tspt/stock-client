/**
 * 分组管理弹窗组件
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  List,
  Button,
  Input,
  Form,
  Space,
  Tag,
  Popconfirm,
  Checkbox,
  message,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
  CloseOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import type { Group, StockInfo } from '@/types/stock';
import { useStockStore } from '@/stores/stockStore';
import { PRESET_COLORS, MAX_GROUP_COUNT } from '@/utils/constants';
import styles from './GroupManager.module.css';

interface GroupManagerProps {
  /** 是否显示 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

export function GroupManager({ visible, onClose }: GroupManagerProps) {
  const {
    groups,
    watchList,
    addGroup,
    updateGroup,
    deleteGroup,
    moveGroup,
    reorderGroups,
    removeStockFromGroup,
  } = useStockStore();

  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedGroupForDetail, setSelectedGroupForDetail] = useState<Group | null>(null);
  const [form] = Form.useForm();
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[0]);

  // 按order排序分组
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => a.order - b.order);
  }, [groups]);

  // 获取分组下的股票列表
  const getStocksInGroup = (groupId: string): StockInfo[] => {
    return watchList.filter(
      (stock) => stock.groupIds && stock.groupIds.includes(groupId)
    );
  };

  // 处理创建分组
  const handleCreateGroup = () => {
    if (groups.length >= MAX_GROUP_COUNT) {
      message.warning(`最多只能创建 ${MAX_GROUP_COUNT} 个分组`);
      return;
    }
    setEditingGroup(null);
    setIsCreating(true);
    setSelectedGroupForDetail(null);
    const defaultColor = PRESET_COLORS[0];
    setSelectedColor(defaultColor);
    form.resetFields();
    form.setFieldsValue({ color: defaultColor });
  };

  // 处理编辑分组
  const handleEditGroup = (group: Group) => {
    setEditingGroup(group);
    setIsCreating(false);
    setSelectedGroupForDetail(null);
    setSelectedColor(group.color);
    form.setFieldsValue({
      name: group.name,
      color: group.color,
    });
  };

  // 处理查看分组详情
  const handleViewGroupDetail = (group: Group) => {
    setEditingGroup(null);
    setIsCreating(false);
    setSelectedGroupForDetail(group);
    setSelectedStocks([]);
  };

  // 处理保存分组
  const handleSaveGroup = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        // 更新分组
        updateGroup(editingGroup.id, values);
      } else if (isCreating) {
        // 创建分组
        addGroup(values);
      }
      setEditingGroup(null);
      setIsCreating(false);
      form.resetFields();
    } catch (error) {
      // 表单验证失败
    }
  };

  // 处理取消编辑
  const handleCancelEdit = () => {
    setEditingGroup(null);
    setIsCreating(false);
    setSelectedGroupForDetail(null);
    setSelectedColor(PRESET_COLORS[0]);
    form.resetFields();
  };

  // 处理删除分组
  const handleDeleteGroup = (groupId: string) => {
    deleteGroup(groupId);
  };

  // 处理批量删除股票
  const handleBatchDeleteStocks = () => {
    if (!selectedGroupForDetail) {
      message.warning('请先选择要操作的分组');
      return;
    }

    if (selectedStocks.length === 0) {
      message.warning('请先选择要删除的股票');
      return;
    }

    selectedStocks.forEach((stockCode) => {
      removeStockFromGroup(stockCode, selectedGroupForDetail.id);
    });

    message.success(`已从分组"${selectedGroupForDetail.name}"中移除 ${selectedStocks.length} 只股票`);
    setSelectedStocks([]);
  };

  // 处理移动分组
  const handleMoveGroup = (groupId: string, direction: 'up' | 'down') => {
    const currentIndex = sortedGroups.findIndex((g) => g.id === groupId);
    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === 'up' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < sortedGroups.length - 1) {
      newIndex = currentIndex + 1;
    } else {
      return;
    }

    // 交换位置
    const newGroups = [...sortedGroups];
    [newGroups[currentIndex], newGroups[newIndex]] = [
      newGroups[newIndex],
      newGroups[currentIndex],
    ];

    // 更新排序
    const reorderedGroups = newGroups.map((g, i) => ({ ...g, order: i }));
    reorderGroups(reorderedGroups);
  };

  // 处理拖拽排序
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽图像
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const newGroups = [...sortedGroups];
      const [removed] = newGroups.splice(draggedIndex, 1);
      newGroups.splice(dragOverIndex, 0, removed);

      // 更新排序
      const reorderedGroups = newGroups.map((g, i) => ({ ...g, order: i }));
      reorderGroups(reorderedGroups);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    setIsDragging(false);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  return (
    <Modal
      title="分组管理"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      className={styles.groupManager}
    >
      <div className={styles.content}>
        {/* 左侧：分组列表 */}
        <div className={styles.groupList}>
          <div className={styles.listHeader}>
            <span>分组列表</span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={handleCreateGroup}
              disabled={groups.length >= MAX_GROUP_COUNT}
            >
              新建分组
            </Button>
          </div>

          <List
            dataSource={sortedGroups}
            renderItem={(group, index) => {
              const stocksCount = getStocksInGroup(group.id).length;
              const isFirst = index === 0;
              const isLast = index === sortedGroups.length - 1;

              return (
                <List.Item
                  className={`${styles.groupItem} ${editingGroup?.id === group.id ? styles.editing : ''} ${
                    draggedIndex === index ? styles.dragging : ''
                  } ${dragOverIndex === index ? styles.dragOver : ''}`}
                >
                  <div
                    className={styles.groupItemContent}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={handleDragLeave}
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  >
                    <div className={styles.dragHandle} title="拖拽排序">
                      <HolderOutlined style={{ color: 'var(--ant-color-text-secondary)' }} />
                    </div>
                    <div
                      className={styles.groupInfo}
                      onClick={(e) => {
                        if (!isDragging) {
                          handleViewGroupDetail(group);
                        }
                      }}
                      style={{ cursor: isDragging ? 'grabbing' : 'pointer', flex: 1 }}
                    >
                      <span
                        className={styles.colorDot}
                        style={{ backgroundColor: group.color }}
                      />
                      <span className={styles.groupName}>{group.name}</span>
                      <span className={styles.stockCount}>({stocksCount})</span>
                    </div>
                    <Space size="small" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={isFirst}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveGroup(group.id, 'up');
                        }}
                        title="上移"
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={isLast}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveGroup(group.id, 'down');
                        }}
                        title="下移"
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditGroup(group);
                        }}
                        title="编辑"
                      />
                      <Popconfirm
                        title="确认删除"
                        description={`确定要删除分组"${group.name}"吗？该分组下的 ${stocksCount} 只股票将一起被删除。`}
                        onConfirm={() => handleDeleteGroup(group.id)}
                        okText="删除"
                        okType="danger"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          danger
                          title="删除"
                        />
                      </Popconfirm>
                    </Space>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>

        {/* 右侧：编辑表单或分组详情 */}
        <div className={styles.rightPanel}>
          {editingGroup !== null || isCreating ? (
            // 编辑/创建分组表单
            <div className={styles.editForm}>
              <div className={styles.formHeader}>
                <span>{isCreating ? '新建分组' : '编辑分组'}</span>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  size="small"
                  onClick={handleCancelEdit}
                />
              </div>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSaveGroup}
                className={styles.form}
              >
                <Form.Item
                  label="分组名称"
                  name="name"
                  rules={[
                    { required: true, message: '请输入分组名称' },
                    { max: 10, message: '分组名称最多10个字符' },
                    {
                      pattern: /^[\u4e00-\u9fa5a-zA-Z0-9]+$/,
                      message: '分组名称只能包含中文、英文、数字',
                    },
                  ]}
                >
                  <Input
                    placeholder="请输入分组名称（最多10个字符）"
                    maxLength={10}
                  />
                </Form.Item>

                <Form.Item
                  label="分组颜色"
                  name="color"
                  rules={[{ required: true, message: '请选择分组颜色' }]}
                >
                  <div className={styles.colorPicker}>
                    {PRESET_COLORS.map((color) => (
                      <div
                        key={color}
                        className={`${styles.colorOption} ${
                          selectedColor === color ? styles.selected : ''
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          setSelectedColor(color);
                          form.setFieldsValue({ color });
                        }}
                      />
                    ))}
                  </div>
                </Form.Item>

                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      {isCreating ? '创建' : '保存'}
                    </Button>
                    <Button onClick={handleCancelEdit}>取消</Button>
                  </Space>
                </Form.Item>
              </Form>
            </div>
          ) : (
            // 分组详情（显示该分组下的股票）
            <div className={styles.groupDetail}>
              <div className={styles.detailHeader}>
                <span>
                  {selectedGroupForDetail
                    ? `分组详情：${selectedGroupForDetail.name}`
                    : '分组详情'}
                </span>
                {selectedGroupForDetail && selectedStocks.length > 0 && (
                  <Popconfirm
                    title="确认删除"
                    description={`确定要从分组"${selectedGroupForDetail.name}"中移除选中的 ${selectedStocks.length} 只股票吗？`}
                    onConfirm={handleBatchDeleteStocks}
                    okText="删除"
                    okType="danger"
                    cancelText="取消"
                  >
                    <Button type="primary" danger size="small">
                      批量删除 ({selectedStocks.length})
                    </Button>
                  </Popconfirm>
                )}
              </div>
              <div className={styles.stockList}>
                {selectedGroupForDetail ? (
                  (() => {
                    const stocks = getStocksInGroup(selectedGroupForDetail.id);
                    return stocks.length > 0 ? (
                      <Checkbox.Group
                        value={selectedStocks}
                        onChange={(values) => setSelectedStocks(values as string[])}
                        className={styles.checkboxGroup}
                      >
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          {stocks.map((stock) => (
                            <Checkbox key={stock.code} value={stock.code}>
                              {stock.name} ({stock.code})
                            </Checkbox>
                          ))}
                        </Space>
                      </Checkbox.Group>
                    ) : (
                      <div className={styles.emptyStocks}>该分组暂无股票</div>
                    );
                  })()
                ) : (
                  <div className={styles.emptyStocks}>请点击左侧分组查看详情</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

