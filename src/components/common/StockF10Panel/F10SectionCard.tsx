/**
 * F10 区块外壳：标题 / 说明 / 缓存时间 / 「加载数据 · 刷新」按钮 / 空态 / 错误态。
 *
 * 三个区块共用；组件本身不持有状态——是否已加载、是否加载中全部由 `useF10Section` 决定，
 * 这里只负责把状态翻译成界面（未加载时不展示表格，提示用户手动触发请求）。
 */

import type { ReactNode } from 'react';
import { Alert, Button, Card, Empty, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { formatCacheTime } from '@/utils/format/f10Format';
import styles from './StockF10Panel.module.css';

const { Text } = Typography;

export interface F10SectionCardProps {
  /** 区块标题 */
  title: string;
  /** 区块说明（可省略） */
  hint?: string;
  /** 是否已有数据：决定按钮是「加载数据」还是「刷新」 */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** 缓存写入时间（毫秒），未加载时为 null */
  updatedAt: number | null;
  /** 加载 / 刷新回调 */
  onLoad: () => void;
  children: ReactNode;
}

export function F10SectionCard({
  title,
  hint,
  loaded,
  loading,
  error,
  updatedAt,
  onLoad,
  children,
}: F10SectionCardProps) {
  return (
    <Card
      size="small"
      title={<span className={styles.cardTitle}>{title}</span>}
      extra={
        <Space size={8}>
          {updatedAt !== null && (
            <Text type="secondary" className={styles.cacheTime}>
              缓存于 {formatCacheTime(updatedAt)}
            </Text>
          )}
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={onLoad}>
            {loaded ? '刷新' : '加载数据'}
          </Button>
        </Space>
      }
    >
      {hint && (
        <Text type="secondary" className={styles.hint}>
          {hint}
        </Text>
      )}
      {error ? (
        <Alert type="error" showIcon message={error} className={styles.alert} />
      ) : loaded ? (
        children
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无缓存数据，点击右上角「加载数据」从东财获取"
          className={styles.empty}
        />
      )}
    </Card>
  );
}

export default F10SectionCard;
