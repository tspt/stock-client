/**
 * 「指标 × 报告期」转置矩阵的通用构造器
 *
 * 东财 F10 接口返回的是「一行一个报告期」的长表，而官网展示是
 * 「一列一个报告期、一行一个指标」的横向对比表。股东人数与机构持仓共用这一份转置实现，
 * 差异只在各自的指标定义（见 `holderNumMatrix.ts` / `orgHoldingMatrix.ts`）。
 */

import { F10_COLOR_DOWN, F10_COLOR_UP, pickChangeColor } from './f10Format';

/** 矩阵中的一个单元格 */
export interface MatrixCell {
  /** 展示文本（已格式化，缺失值为 '-'） */
  text: string;
  /** 配色；undefined 表示不染色 */
  color?: string;
}

/** 矩阵中的一行（一个指标） */
export interface MatrixRow {
  /** 指标标识 */
  key: string;
  /** 指标名称（行首单元格） */
  label: string;
  /** 与 `TableMatrix.periods` 一一对应 */
  cells: MatrixCell[];
}

export interface TableMatrix {
  /** 报告期（倒序），对应表格第 2 列起的列头 */
  periods: string[];
  rows: MatrixRow[];
}

/** 单元格配色模式 */
export type MatrixColorMode =
  /** 不染色 */
  | 'none'
  /** 按数值自身正负（红涨绿跌） */
  | 'sign'
  /** 与更早一期比较（红涨绿跌） */
  | 'periodTrend';

export interface MatrixSpec<T> {
  key: string;
  label: string;
  /** 单元格文本 */
  text: (item: T) => string;
  /** 原始数值：`sign` / `periodTrend` 配色与自定义配色使用 */
  value?: (item: T) => number | null;
  colorMode?: MatrixColorMode;
  /** 自定义配色，优先级高于 `colorMode`；返回 undefined 表示不染色 */
  color?: (
    item: T,
    value: number | null,
    olderValue: number | null | undefined
  ) => string | undefined;
}

/** 与更早一期比较的方向配色；任一值缺失或持平则不染色（最早一期没有可比对象） */
export function pickPeriodTrendColor(
  current: number | null,
  older: number | null | undefined
): string | undefined {
  if (current === null || older === null || older === undefined || current === older) {
    return undefined;
  }
  return current > older ? F10_COLOR_UP : F10_COLOR_DOWN;
}

/**
 * 把「一行一个报告期」的长表转成「一行一个指标」的矩阵
 *
 * @param items 长表数据（顺序无所谓，内部会按报告期倒序）
 * @param getPeriod 取报告期字符串（须可直接比较大小，如 YYYY-MM-DD）
 * @param specs 指标定义，顺序即行的展示顺序
 */
export function buildTableMatrix<T>(
  items: T[],
  getPeriod: (item: T) => string,
  specs: MatrixSpec<T>[]
): TableMatrix {
  // 内部再兜一次倒序：上游顺序变化会导致整张表列错位，代价极小
  const sorted = [...items].sort((a, b) => (getPeriod(a) < getPeriod(b) ? 1 : -1));
  const periods = sorted.map(getPeriod);

  const rows: MatrixRow[] = specs.map((spec) => {
    const values = sorted.map((item) => spec.value?.(item) ?? null);
    const cells = sorted.map((item, index) => {
      const value = values[index];
      // 下一列是更早一期
      const older = values[index + 1];
      let color: string | undefined;
      if (spec.color) {
        color = spec.color(item, value, older);
      } else if (spec.colorMode === 'sign') {
        color = pickChangeColor(value);
      } else if (spec.colorMode === 'periodTrend') {
        color = pickPeriodTrendColor(value, older);
      }
      return { text: spec.text(item), color };
    });
    return { key: spec.key, label: spec.label, cells };
  });

  return { periods, rows };
}
