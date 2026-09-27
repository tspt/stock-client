/**
 * 筹码分布画布：只画筹码条 + 右侧价格刻度，与左侧 K 线主图逐像素对齐。
 *
 * 对齐的前提是「画布高度 + 内部网格位置」都由共享布局常量给出
 * （CHIP_CANVAS_HEIGHT / CHIP_PANEL_WIDTH），调用方不要再自行设置尺寸；
 * 画布实例通过 chartRef 传入，好让 useKlineChipSync 在抽屉开合后统一 resize。
 */

import type { RefObject } from 'react';
import { Spin, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { CHIP_CANVAS_HEIGHT, CHIP_PANEL_WIDTH } from '@/utils/config/stockDrawerLayout';
import styles from './ChipDistributionPanel.module.css';

const { Text } = Typography;

export interface ChipDistributionPanelProps {
  /** 筹码图配置；null 表示暂无筹码，显示空态 */
  option: EChartsOption | null;
  /** 是否仍在计算中：决定空态显示 loading 还是文案 */
  loading: boolean;
  /** 画布实例（由 useKlineChipSync 持有，用于抽屉开合后的 resize） */
  chartRef: RefObject<ReactECharts>;
}

export function ChipDistributionPanel({
  option,
  loading,
  chartRef,
}: ChipDistributionPanelProps) {
  return (
    <div className={styles.panel} style={{ width: CHIP_PANEL_WIDTH }}>
      {option ? (
        <ReactECharts
          ref={chartRef}
          option={option}
          lazyUpdate
          style={{ height: CHIP_CANVAS_HEIGHT, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      ) : (
        <div className={styles.placeholder} style={{ height: CHIP_CANVAS_HEIGHT }}>
          {loading ? (
            <Spin size="small" />
          ) : (
            <Text type="secondary" className={styles.empty}>
              暂无筹码数据
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

export default ChipDistributionPanel;
