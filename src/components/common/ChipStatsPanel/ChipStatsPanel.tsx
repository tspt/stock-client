/**
 * 筹码统计面板：获利比例 / 平均成本 / 90%成本 + 集中度 / 70%成本。
 *
 * 与左侧 K 线主图绘图区顶部对齐（顶部留白取自共享布局常量），
 * 日K抽屉与周K抽屉共用；组件只负责展示，不持有任何状态。
 */

import { Typography } from 'antd';
import type { ChipDistribution } from '@/types/chipDistribution';
import { CHIP_STATS_WIDTH, MAIN_GRID_TOP_PX } from '@/utils/config/stockDrawerLayout';
import styles from './ChipStatsPanel.module.css';

const { Text } = Typography;

interface ChipStatItemProps {
  label: string;
  value: string;
  valueColor?: string;
}

function ChipStatItem({ label, value, valueColor }: ChipStatItemProps) {
  return (
    <div className={styles.item}>
      <Text type="secondary" className={styles.label}>
        {label}
      </Text>
      <Text strong className={styles.value} style={{ color: valueColor }}>
        {value}
      </Text>
    </div>
  );
}

export interface ChipStatsPanelProps {
  /** 当前展示的筹码（null 表示暂无数据） */
  chip: ChipDistribution | null;
  /** 是否仍在计算中：决定空态文案是否显示 */
  loading: boolean;
}

export function ChipStatsPanel({ chip, loading }: ChipStatsPanelProps) {
  return (
    <div
      className={styles.panel}
      style={{ width: CHIP_STATS_WIDTH, paddingTop: MAIN_GRID_TOP_PX }}
    >
      {chip ? (
        <>
          <ChipStatItem
            label="获利比例"
            value={`${(chip.benefitRatio * 100).toFixed(1)}%`}
            valueColor={chip.benefitRatio >= 0.5 ? '#ef5350' : '#26a69a'}
          />
          <ChipStatItem label="平均成本" value={chip.avgCost.toFixed(2)} />
          <ChipStatItem
            label="90%成本"
            value={`${chip.range90.low.toFixed(2)} ~ ${chip.range90.high.toFixed(2)}`}
          />
          <Text type="secondary" className={styles.concentration}>
            集中度 {chip.range90.concentration.toFixed(3)}
          </Text>
          <ChipStatItem
            label="70%成本"
            value={`${chip.range70.low.toFixed(2)} ~ ${chip.range70.high.toFixed(2)}`}
          />
        </>
      ) : (
        !loading && (
          <Text type="secondary" className={styles.empty}>
            暂无筹码数据
          </Text>
        )
      )}
    </div>
  );
}

export default ChipStatsPanel;
