/**
 * 交易信号展示元数据（文案 + 颜色）单一数据源。
 *
 * 机会分析表格与 K 线抽屉顶部都要展示同一个 `TradingSignal`，
 * 文案与配色必须一致，故集中在此，两处只引用不重复定义。
 *
 * 颜色语义与涨跌一致：买入用绿、卖出用红，
 * 与全项目 `TEXT_* / STRONG_* / *_SOFT_COLOR` 口径同源，见 `config/chartColors.ts`。
 */

import type { TradingSignalType } from '@/types/stock';
import {
  FALL_SOFT_COLOR,
  RISE_SOFT_COLOR,
  STRONG_RISE_COLOR,
  TEXT_FALL_COLOR,
} from '@/utils/config/chartColors';

/** 单个信号的展示文案与文字颜色 */
export interface TradingSignalMeta {
  /** 展示文案（含方向色点） */
  label: string;
  /** 文字颜色 */
  color: string;
}

/** 无信号 / 观望（HOLD）的兜底展示 */
export const TRADING_SIGNAL_FALLBACK: TradingSignalMeta = {
  label: '观望',
  color: '#666666',
};

/** 信号类型 → 展示元数据 */
export const TRADING_SIGNAL_META: Record<TradingSignalType, TradingSignalMeta> = {
  STRONG_BUY: { label: '🟢 强烈买入', color: TEXT_FALL_COLOR },
  BUY: { label: '🟢 建议买入', color: FALL_SOFT_COLOR },
  HOLD: TRADING_SIGNAL_FALLBACK,
  SELL: { label: '🔴 建议卖出', color: RISE_SOFT_COLOR },
  STRONG_SELL: { label: '🔴 强烈卖出', color: STRONG_RISE_COLOR },
};

/** 解析信号展示元数据；缺省或未知类型一律退回兜底 */
export function resolveTradingSignalMeta(type?: TradingSignalType): TradingSignalMeta {
  if (!type) return TRADING_SIGNAL_FALLBACK;
  return TRADING_SIGNAL_META[type] ?? TRADING_SIGNAL_FALLBACK;
}
