/**
 * K 线抽屉图表配色 Hook：订阅「低调配色」开关并按当前主题解析出具体色值。
 *
 * 日K抽屉与周K抽屉共用同一份实现，避免两处各写一遍「读 store + 判断主题 + 取调色板」。
 * 返回值在 mode / isDark 不变时保持同一引用，可直接作为 useMemo 的依赖。
 */

import { useMemo } from 'react';
import { useChartColorStore } from '@/stores/chartColorStore';
import {
  resolveDrawerChartColors,
  type ChartColorMode,
  type DrawerChartColors,
} from '@/utils/chart/drawerChartPalette';

export function useDrawerChartColors(isDark: boolean): DrawerChartColors {
  const mode: ChartColorMode = useChartColorStore((state) => state.mode);
  return useMemo(() => resolveDrawerChartColors(mode, isDark), [mode, isDark]);
}
