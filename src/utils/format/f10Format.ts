/**
 * F10 资料的纯格式化工具（数值格式化全部复用 `format.ts`，这里只补语义与配色）
 *
 * 为什么单独一份：三张表都要做「null → '-'」与「红涨绿跌」判定，
 * 写在各组件里必然出现第二份实现，故收敛到这里。
 * 本文件不依赖 React，只返回字符串与颜色值，便于组件与测试复用。
 */

import { formatPrice } from './format';

/** 上涨配色（与 A 股习惯一致：红涨绿跌） */
export const F10_COLOR_UP = '#ef5350';
/** 下跌配色 */
export const F10_COLOR_DOWN = '#26a69a';

/** 通用缺失值占位 */
const EMPTY = '-';

/** 按数值正负返回红涨绿跌配色；null / 0 返回 undefined（沿用主题默认色） */
export function pickChangeColor(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return undefined;
  }
  return value > 0 ? F10_COLOR_UP : F10_COLOR_DOWN;
}

/** 整数化展示（股东户数、机构家数）：null → '-' */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return value.toLocaleString('zh-CN');
}

/** 报告期 / 日期展示：'2026-06-30' → '2026-06-30'，空值 → '-' */
export function formatReportDate(value: string | null | undefined): string {
  if (!value) {
    return EMPTY;
  }
  return value;
}

/** 股价：null → '-' */
export function formatF10Price(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return formatPrice(value);
}

/**
 * 股数（户均流通股、机构合计持股）→ 万/亿，null → '-'。
 * 刻意不用 `formatTotalShares`（它固定按亿换算）：户均流通股只有几千股，
 * 按亿显示会全部变成 0.00 亿，失去可读性。
 */
export function formatF10Shares(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  const abs = Math.abs(value);
  if (abs >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (abs >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return String(Math.round(value));
}

/**
 * 股数固定按「亿」显示，保留 3 位小数（如 3.143亿）。
 * 用于机构持仓矩阵「合计持股(股)」——该表横向对比多个报告期，
 * 单位统一成亿才能一眼比出量级差异；3 位小数是东财 F10 页面的口径。
 */
export function formatF10SharesInYi(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return `${(value / 1e8).toFixed(3)}亿`;
}

/**
 * 金额固定按「亿」显示，保留 2 位小数（如 60.64亿）。
 * 用于机构持仓矩阵「合计市值(元)」，与「合计持股」同为亿单位便于对照。
 */
export function formatF10AmountInYi(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return `${(value / 1e8).toFixed(2)}亿`;
}

/**
 * 占比（占流通股比，输入为百分数）→ 带 %，null → '-'。
 * 不用 `formatTurnoverRate`：它把 0 也显示成 '-'，而占比为 0 是有意义的数据。
 */
export function formatF10Percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return `${value.toFixed(2)}%`;
}

/**
 * 百分比数值，不带 '%' 与 '+'（矩阵表的行标签已含 (%)，数值再带符号会重复显示）：
 * 23.96 / -1.44。作为文本映射到矩阵行时，'+' 号会让整列数字宽度不齐。
 */
export function formatPlainPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return value.toFixed(2);
}

/**
 * 按「有效数字」格式化（东财 F10 表格口径）：108000 → '10.80'、5372 → '5372'。
 * 注意 `toPrecision` 在量级过大/过小时会返回科学计数法，这里换算回普通写法。
 */
export function formatSignificantDigits(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  if (value === 0) {
    return '0';
  }
  const text = value.toPrecision(digits);
  return text.includes('e') ? String(Number(text)) : text;
}

/**
 * 数量按「万」显示并使用 4 位有效数字：108000 → '10.80万'。
 * 用于股东人数与人均持股金额——横向对比多个报告期时，统一单位才比得出量级差异。
 */
export function formatF10CountInWan(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }
  return `${formatSignificantDigits(value / 1e4, 4)}万`;
}

/**
 * 十大流通股东的「变动比例」→ 百分比，保留 2 位小数。
 *
 * 接口的 `NEW_CHANGE_RATIO` 是**字符串**且有两种形态：
 * - 数值型（'0.18579686' / '-19.41166109'）：表示百分比，补上 '%' 并保留 2 位小数；
 * - 描述型（'新进' / '不变'）：原样返回，不能当数字处理。
 */
export function formatHolderChangeRatio(value: string | null | undefined): string {
  if (!value) {
    return EMPTY;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }
  return `${numeric.toFixed(2)}%`;
}

/**
 * 筹码集中度分档 → 配色。
 * 户数越集中，通常意味着浮筹越少，用红色（偏多）提示；分散（含「非常分散」）用绿色。
 */
export function pickHoldFocusColor(focus: string): string | undefined {
  if (focus === '非常集中') {
    return F10_COLOR_UP;
  }
  if (focus === '较集中') {
    return '#faad14';
  }
  if (focus === '较分散' || focus === '非常分散') {
    return F10_COLOR_DOWN;
  }
  return undefined;
}

/** 持股变动描述 → 配色：'新进' 用红色，'不变' 用默认色，其余按正负判断 */
export function pickHolderChangeColor(change: string): string | undefined {
  if (!change) {
    return undefined;
  }
  if (change === '新进') {
    return F10_COLOR_UP;
  }
  if (change === '不变') {
    return undefined;
  }
  const numeric = Number(change);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return pickChangeColor(numeric);
}

/** 缓存时间戳 → 'MM-DD HH:mm'，用于区块右上角的「缓存于」提示 */
export function formatCacheTime(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return EMPTY;
  }
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}
