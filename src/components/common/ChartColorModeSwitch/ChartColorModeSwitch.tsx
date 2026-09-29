/**
 * 「低调配色」开关：全局顶栏上的一键切换（开启 / 关闭灰黑配色），与 ThemeToggle 并排。
 *
 * 开启后 K 线抽屉里的蜡烛、成交量柱与筹码分布图改用灰黑配色（深色主题自动提亮），
 * 关闭即恢复红涨绿跌 / 获利红套牢蓝。组件自持状态（读写 chartColorStore 并持久化），
 * 调用方只需渲染 `<ChartColorModeSwitch />`，无需关心配色如何下发。
 */

import { Switch, Tooltip, Typography } from 'antd';
import { useChartColorStore } from '@/stores/chartColorStore';
import styles from './ChartColorModeSwitch.module.css';

const { Text } = Typography;

export function ChartColorModeSwitch() {
  const quiet = useChartColorStore((state) => state.mode === 'quiet');
  const toggleMode = useChartColorStore((state) => state.toggleMode);

  return (
    <Tooltip title="开启后 K 线、成交量柱与筹码图改用灰黑配色，降低视觉干扰；设置会被记住">
      <span className={styles.wrapper}>
        <Text type="secondary" className={styles.label}>
          低调配色
        </Text>
        <Switch size="small" checked={quiet} onChange={toggleMode} />
      </span>
    </Tooltip>
  );
}

export default ChartColorModeSwitch;
