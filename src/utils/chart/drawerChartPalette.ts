/**
 * 抽屉图表配色方案：把 K 线抽屉里用到的两套配色（彩色 / 低调灰黑）收敛到一处，
 * 由抽屉右上角的「低调配色」开关一键切换，开关状态持久化在 `chartColorStore`。
 *
 * 设计要点：
 * 1. 彩色模式直接返回空对象 —— 各 builder 的默认值仍是各自文件里的唯一定义，
 *    这里不重复写一份红绿蓝，避免「改了 builder 默认值但这里没跟着改」；
 * 2. 灰黑配色按主题分档：深色底上黑色会消失，故深色主题换成浅灰 / 近白；
 * 3. 本模块只依赖两个 builder 的**类型**（不依赖其实现），因此不存在循环依赖。
 */

import type { UpDownColors, BollColors } from '@/utils/chart/stockKlineOption';
import type { ChipBarColors } from '@/utils/chart/chipChartOption';

/**
 * 图表配色模式：
 * - `colorful`：红涨绿跌 + 获利红 / 套牢蓝（默认）
 * - `quiet`：灰黑低调，降低图表存在感
 */
export type ChartColorMode = 'colorful' | 'quiet';

/** 灰黑涨跌配色：上涨灰、下跌黑（深色主题下整体提亮） */
const QUIET_UP_DOWN_COLORS = {
  light: { up: '#9e9e9e', down: '#000000' },
  dark: { up: '#b0b0b0', down: '#e8e8e8' },
} as const;

/** 灰黑筹码条配色：获利筹码灰、套牢筹码黑（深色主题下整体提亮） */
const QUIET_CHIP_COLORS = {
  light: { profit: 'rgba(158, 158, 158, 0.6)', trapped: 'rgba(0, 0, 0, 0.5)' },
  dark: { profit: 'rgba(176, 176, 176, 0.6)', trapped: 'rgba(232, 232, 232, 0.45)' },
} as const;

/** 灰黑布林带配色：线条与填充带同灰（深色主题下整体提亮） */
const QUIET_BOLL_COLORS = {
  light: { line: '#9e9e9e', fill: 'rgba(158, 158, 158, 0.12)' },
  dark: { line: '#b0b0b0', fill: 'rgba(176, 176, 176, 0.14)' },
} as const;

/** 一次解析出两个 builder 所需的配色参数；字段为 undefined 表示沿用 builder 默认配色 */
export interface DrawerChartColors {
  /** 蜡烛 + 成交量柱的涨跌配色 */
  upDown?: UpDownColors;
  /** 筹码条配色 */
  chip?: ChipBarColors;
  /** 布林带配色 */
  boll?: BollColors;
}

/**
 * 按当前开关与主题解析配色参数。
 * 彩色模式返回空对象（`{ }`），调用方把 undefined 传下去即可走 builder 默认值。
 */
export function resolveDrawerChartColors(mode: ChartColorMode, isDark: boolean): DrawerChartColors {
  if (mode !== 'quiet') {
    return {};
  }
  return {
    upDown: isDark ? QUIET_UP_DOWN_COLORS.dark : QUIET_UP_DOWN_COLORS.light,
    chip: isDark ? QUIET_CHIP_COLORS.dark : QUIET_CHIP_COLORS.light,
    boll: isDark ? QUIET_BOLL_COLORS.dark : QUIET_BOLL_COLORS.light,
  };
}
