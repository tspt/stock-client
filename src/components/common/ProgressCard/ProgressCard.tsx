/**
 * 通用进度卡片：进度条 + 说明文本。
 * 用于机会分析页的「一键分析」「导出K线」「获取财务指标」三处相同结构。
 */

import type { ReactNode } from 'react';
import { Card, Progress } from 'antd';
import styles from './ProgressCard.module.css';

export interface ProgressCardProps {
  /** 进度百分比（0-100） */
  percent: number;
  /** 进度条下方说明文本 */
  text: ReactNode;
  /** 进度条状态，默认 active */
  status?: 'active' | 'success' | 'exception' | 'normal';
  /** 百分比格式化，默认取整加 %（与 antd Progress.format 签名一致，percent 可能为空） */
  formatPercent?: (percent?: number) => string;
}

export function ProgressCard({
  percent,
  text,
  status = 'active',
  formatPercent,
}: ProgressCardProps) {
  const format = formatPercent ?? ((value?: number) => `${value ?? 0}%`);

  return (
    <Card className={styles.progressCard}>
      <div className={styles.progressInfo}>
        <Progress percent={percent} status={status} format={format} />
        <div className={styles.progressText}>{text}</div>
      </div>
    </Card>
  );
}
