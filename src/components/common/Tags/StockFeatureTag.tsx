import React, { memo } from 'react';
import { Tag } from 'antd';
import styles from './Tags.module.css';

export interface StockFeatureTagProps {
  children?: React.ReactNode;
  text?: React.ReactNode;
  variant?: 'default' | 'red';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 特征/形态标签组件
 * 用于盘整形态（箱体震荡、收敛三角等）、急跌急涨特征、热门榜人气标签、回测场景名等
 * 统一采用低饱和扁平风格，支持中性冷灰（default）与红色（red）风格
 */
export const StockFeatureTag = memo(function StockFeatureTag({
  children,
  text,
  variant = 'default',
  className,
  style,
}: StockFeatureTagProps) {
  const content = children ?? text;
  if (!content) return null;

  const tagClass = variant === 'red' ? styles.tagRed : styles.featureTag;

  return (
    <Tag className={`${tagClass} ${className || ''}`} bordered={false} style={style}>
      {content}
    </Tag>
  );
});
