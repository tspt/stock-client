/**
 * K 线抽屉图表配色模式：彩色（红涨绿跌 + 获利红 / 套牢蓝）与低调（灰黑）之间一键切换。
 *
 * 初始值直接读 localStorage：配色只是渲染参数，没有主题那样的 DOM 副作用，
 * 因此不需要 themeStore 那种 load 时机约定；写入仍然收敛在 `setMode` 里。
 */

import { create } from 'zustand';
import { getStorage, setStorage } from '@/utils/storage/storage';
import { STORAGE_KEYS } from '@/utils/config/constants';
import type { ChartColorMode } from '@/utils/chart/drawerChartPalette';

/** 默认彩色：未设置过的用户看到的仍是项目原有的红绿蓝口径 */
const DEFAULT_CHART_COLOR_MODE: ChartColorMode = 'colorful';

interface ChartColorState {
  mode: ChartColorMode;
  setMode: (mode: ChartColorMode) => void;
  /** 开关切换：colorful ↔ quiet */
  toggleMode: () => void;
}

export const useChartColorStore = create<ChartColorState>((set, get) => ({
  mode: getStorage<ChartColorMode>(STORAGE_KEYS.CHART_COLOR_MODE, DEFAULT_CHART_COLOR_MODE),

  setMode: (mode) => {
    set({ mode });
    setStorage(STORAGE_KEYS.CHART_COLOR_MODE, mode);
  },

  toggleMode: () => {
    get().setMode(get().mode === 'quiet' ? 'colorful' : 'quiet');
  },
}));
