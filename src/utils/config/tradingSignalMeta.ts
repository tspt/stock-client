/**
 * 交易信号展示元数据（文案 + 颜色）单一数据源。
 *
 * 机会分析表格与 K 线抽屉顶部都要展示同一个 `TradingSignal`，
 * 文案与配色必须一致，故集中在此，两处只引用不重复定义。
 *
 * 颜色语义与涨跌一致：买入用绿、卖出用红，
 * 与全项目 `TEXT_* / STRONG_* / *_SOFT_COLOR` 口径同源，见 `config/chartColors.ts`。
 */

import type { TradingSignal, TradingSignalType } from '@/types/stock';
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

/** 观望（HOLD）的展示 */
export const TRADING_SIGNAL_HOLD_META: TradingSignalMeta = {
  label: '观望',
  color: '#666666',
};

/**
 * 「无明显信号」的展示。
 *
 * ⚠️ 必须与「观望」分开：`detectTradingSignal` 在没有任何理由命中时会返回
 * `{ type: 'HOLD', reason: '无明显信号' }`（见 `utils/analysis/signalDetector`），
 * 早年这里让 HOLD 与「无信号」共用同一份兜底元数据，导致两者在表格里同名、
 * 在筛选里也无法单独过滤掉「无明显信号」的个股。
 */
export const TRADING_SIGNAL_NONE_META: TradingSignalMeta = {
  label: '无明显信号',
  color: '#999999',
};

/** 信号类型 → 展示元数据 */
export const TRADING_SIGNAL_META: Record<TradingSignalType, TradingSignalMeta> = {
  STRONG_BUY: { label: '🟢 强烈买入', color: TEXT_FALL_COLOR },
  BUY: { label: '🟢 建议买入', color: FALL_SOFT_COLOR },
  HOLD: TRADING_SIGNAL_HOLD_META,
  SELL: { label: '🔴 建议卖出', color: RISE_SOFT_COLOR },
  STRONG_SELL: { label: '🔴 强烈卖出', color: STRONG_RISE_COLOR },
};

/** `detectTradingSignal` 在无任何命中理由时写入 reason 的文案 */
export const NO_SIGNAL_REASON = '无明显信号';

/**
 * 是否属于「无明显信号」。
 *
 * 两种情形都算：
 * 1. 压根没有信号对象（K 线不足 60 根，`detectTradingSignal` 返回 null）；
 * 2. 有信号，但是 HOLD 且无任何命中理由（reason 为 NO_SIGNAL_REASON）。
 *
 * 筛选与展示共用这一个判定，保证「表格里叫无明显信号的，筛选里就归为 NO_SIGNAL」。
 */
export function isNoSignalTradingSignal(signal?: TradingSignal | null): boolean {
  if (!signal) return true;
  return signal.type === 'HOLD' && signal.reason === NO_SIGNAL_REASON;
}

/**
 * 解析信号展示元数据。
 *
 * 「无明显信号」优先于 HOLD 判定；类型未知时也按无明显信号兜底，
 * 避免出现「既不是观望又说不出是什么」的第三种文案。
 */
export function resolveTradingSignalMeta(signal?: TradingSignal | null): TradingSignalMeta {
  if (!signal || isNoSignalTradingSignal(signal)) return TRADING_SIGNAL_NONE_META;
  return TRADING_SIGNAL_META[signal.type] ?? TRADING_SIGNAL_NONE_META;
}
