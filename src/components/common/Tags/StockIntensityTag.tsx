import React, { memo } from 'react';
import { Tag } from 'antd';
import styles from './Tags.module.css';

export interface StockIntensityTagProps {
  value: number;
  suffix?: string;
  threshold?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 频次与热度标签组件
 * 用于龙虎榜上榜次数、机构次数、分析记录出现频次、连续天数等
 * 阶梯收敛为两阶：常规值采用中性微蓝灰，达到阈值（默认 >= 3）时采用柔和暖橙
 */
export const StockIntensityTag = memo(function StockIntensityTag({
  value,
  suffix = '',
  threshold = 3,
  className,
  style,
}: StockIntensityTagProps) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--ant-color-text-quaternary, #bfbfbf)' }}>-</span>;
  }

  const isHigh = value >= threshold;
  const tagClass = isHigh ? styles.intensityHigh : styles.intensityNormal;

  return (
    <Tag className={`${tagClass} ${className || ''}`} bordered={false} style={style}>
      {value}
      {suffix}
    </Tag>
  );
});
