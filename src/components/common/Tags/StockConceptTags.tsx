import React, { memo } from 'react';
import { Tag, Tooltip } from 'antd';
import styles from './Tags.module.css';

export interface ConceptItem {
  code?: string;
  name: string;
}

export interface StockConceptTagsProps {
  concepts?: Array<string | ConceptItem>;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 股票所属概念标签组件
 * 统一采用柔和蓝无边框微圆角风格，超出 max 项后以 +N 折叠，Hover 浮层显示全部
 */
export const StockConceptTags = memo(function StockConceptTags({
  concepts,
  max = 3,
  className,
  style,
}: StockConceptTagsProps) {
  if (!concepts || concepts.length === 0) {
    return <span style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }}>-</span>;
  }

  // 标准化为对象列表
  const normalized = concepts.map((item) => (typeof item === 'string' ? { name: item } : item));
  const visibleItems = normalized.slice(0, max);
  const remainingCount = normalized.length - max;

  const fullContent = (
    <div className={styles.tooltipConceptList}>
      {normalized.map((item, idx) => (
        <Tag key={item.code || `${item.name}-${idx}`} className={styles.conceptTag} bordered={false}>
          {item.name}
        </Tag>
      ))}
    </div>
  );

  return (
    <div className={`${styles.conceptContainer} ${className || ''}`} style={style}>
      {visibleItems.map((item, idx) => (
        <Tag key={item.code || `${item.name}-${idx}`} className={styles.conceptTag} bordered={false}>
          {item.name}
        </Tag>
      ))}
      {remainingCount > 0 && (
        <Tooltip title={fullContent} placement="top">
          <Tag className={styles.conceptMoreTag} bordered={false}>
            +{remainingCount}
          </Tag>
        </Tooltip>
      )}
    </div>
  );
});
