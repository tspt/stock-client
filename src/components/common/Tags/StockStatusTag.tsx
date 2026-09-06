import React, { memo } from 'react';
import { Tag } from 'antd';
import styles from './Tags.module.css';

export type StatusVariant = 'positive' | 'negative' | 'processing';

export interface StockStatusTagProps {
  status?: boolean | 'passed' | 'failed' | 'processing' | 'pending' | string;
  positiveText?: string;
  negativeText?: string;
  processingText?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 状态与结论微型标签（Mini Status Tag）
 * 用于“是/否”、“已达标/未达标/验证中”等布尔及状态值展示
 */
export const StockStatusTag = memo(function StockStatusTag({
  status,
  positiveText = '是',
  negativeText = '否',
  processingText = '验证中',
  className,
  style,
}: StockStatusTagProps) {
  let variant: StatusVariant = 'negative';
  let text = negativeText;

  if (status === true || status === 'passed' || status === 'success') {
    variant = 'positive';
    text = positiveText;
  } else if (status === 'processing' || status === 'pending' || status === 'validating') {
    variant = 'processing';
    text = processingText;
  } else {
    variant = 'negative';
    text = negativeText;
  }

  const classMap: Record<StatusVariant, string> = {
    positive: styles.statusPositive,
    negative: styles.statusNegative,
    processing: styles.statusProcessing,
  };

  return (
    <Tag className={`${classMap[variant]} ${className || ''}`} bordered={false} style={style}>
      {text}
    </Tag>
  );
});
