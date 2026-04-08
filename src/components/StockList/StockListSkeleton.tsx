/**
 * 股票列表骨架屏
 */

import { Skeleton } from 'antd';
import styles from './StockListSkeleton.module.css';

export function StockListSkeleton() {
  return (
    <div className={styles.skeletonContainer}>
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className={styles.skeletonItem}>
          <Skeleton.Avatar active size="small" shape="square" style={{ marginRight: 12 }} />
          <div className={styles.skeletonContent}>
            <Skeleton.Input active size="small" style={{ width: 80, marginBottom: 4 }} />
            <Skeleton.Input active size="small" style={{ width: 120 }} />
          </div>
          <div className={styles.skeletonActions}>
            <Skeleton.Button active size="small" style={{ width: 24, marginRight: 4 }} />
            <Skeleton.Button active size="small" style={{ width: 24 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
