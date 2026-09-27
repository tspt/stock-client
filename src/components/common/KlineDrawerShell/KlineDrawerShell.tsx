/**
 * K 线抽屉外壳：日K抽屉与周K抽屉共用的 Drawer 骨架。
 *
 * 统一了四件容易各写一遍、改一处漏一处的东西：
 * 1. 标题行：股票名 + 代码（周线可带「周线分析」后缀）+ 行业/概念标签 + 「第 x / y 只」；
 * 2. 右上角临时列表操作区（数量 + ↑ 加入 / ↓ 取消 按钮）；
 * 3. body 的 flex 布局（图表区自适应、不出现抽屉内滚动条）；
 * 4. 开合动画结束后的 resize 回调透传（不 resize 会出现空白画布）。
 */

import type { ReactNode } from 'react';
import { Button, Drawer, Tag, Typography } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { StockConceptTags } from '@/components/common/Tags';
import { DRAWER_WIDTH } from '@/utils/config/stockDrawerLayout';
import styles from './KlineDrawerShell.module.css';

const { Text } = Typography;

export interface KlineDrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** 标题文本：股票名 + 代码（周线可带「周线分析」后缀） */
  title: string;
  /** 所属行业（可选，渲染为蓝色标签） */
  industry?: string;
  /** 所属概念板块（可选，最多展示 3 个） */
  concepts?: Array<{ code?: string; name: string }>;
  /** ← / → 换股位置提示（如「第 1 / 20 只」）；不传则不渲染 */
  navigationText?: string;
  /** 临时列表总数 */
  tempListCount: number;
  /** 当前股票是否已在临时列表中 */
  inTempList: boolean;
  /** 加入临时列表（快捷键 ↑） */
  onAddToTempList: () => void;
  /** 取消加入（快捷键 ↓） */
  onRemoveFromTempList: () => void;
  /** 无股票代码等情况下禁用按钮 */
  tempListDisabled?: boolean;
  /** 抽屉开合动画结束后：两张画布据此 resize */
  onAfterOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
}

export function KlineDrawerShell({
  open,
  onClose,
  title,
  industry,
  concepts,
  navigationText,
  tempListCount,
  inTempList,
  onAddToTempList,
  onRemoveFromTempList,
  tempListDisabled,
  onAfterOpenChange,
  children,
}: KlineDrawerShellProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={DRAWER_WIDTH}
      title={
        <div className={styles.titleRow}>
          <span>{title}</span>
          {industry && (
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {industry}
            </Tag>
          )}
          {concepts && concepts.length > 0 && <StockConceptTags concepts={concepts} max={3} />}
          {navigationText && (
            <Text type="secondary" className={styles.navigationText}>
              {navigationText}
            </Text>
          )}
        </div>
      }
      extra={
        <div className={styles.extraRow}>
          <Text type="secondary" className={styles.extraHint}>
            临时列表 {tempListCount} 只（↑ 加入 / ↓ 取消）
          </Text>
          <Button
            key="toggle-temp"
            icon={inTempList ? <MinusOutlined /> : <PlusOutlined />}
            disabled={tempListDisabled}
            onClick={inTempList ? onRemoveFromTempList : onAddToTempList}
            title="快捷键：↑ 加入临时列表 / ↓ 取消加入"
          >
            {inTempList ? '取消加入' : '加入临时列表'}
          </Button>
        </div>
      }
      destroyOnHidden
      afterOpenChange={onAfterOpenChange}
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 12,
          // 图表区自适应拉伸；内容不超出抽屉时不允许 body 自身滚动
          overflow: 'hidden',
        },
      }}
    >
      {children}
    </Drawer>
  );
}

export default KlineDrawerShell;
