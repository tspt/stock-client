/**
 * 风险控制与卖出信号
 *
 * 对应文档第四章：
 * - 止损：有效跌破 20 周均线，或 10 周线拐头向下
 * - 卖出：累计涨幅超 40% 后放量长上影 / MACD 顶背离；死叉；高位放量滞涨
 *
 * stopLoss 之前只在 types 里声明、UI 里消费，却从未被赋值（永远 undefined），
 * 这里补上真正的实现。
 */

import { isLongUpperShadow, isSmallBody } from './patterns';
import { crossUnder, safe } from './math';
import type { WeeklyPanel } from './panel';
import type { WeeklyConfig } from './types';

/** 止损回看的周数 */
const STRUCTURE_LOOKBACK = 8;

/**
 * 建议止损位：MA20 与近期结构低点取「离现价更近」的那个（即更高的那个）。
 *
 * 取更近者的含义是让止损随上涨趋势上移（跟踪止损），
 * 而不是永远钉在某一个远期低点上——这才有「让利润奔跑」的效果。
 */
export function computeStopLoss(
  p: WeeklyPanel,
  i: number
): { stopLoss?: number; riskPct?: number } {
  const close = p.close[i];
  if (!Number.isFinite(close) || close <= 0) return {};

  const m20 = safe(p.ma20, i);
  if (m20 === undefined) return {};

  let structureLow = Infinity;
  const from = Math.max(0, i - STRUCTURE_LOOKBACK + 1);
  for (let j = from; j <= i; j += 1) {
    if (p.low[j] < structureLow) structureLow = p.low[j];
  }
  if (!Number.isFinite(structureLow)) return {};

  const stopLoss = Math.max(m20, structureLow);
  // 止损位必须低于现价才有意义；否则说明价格已跌破结构，交给「有效跌破」信号处理
  if (stopLoss >= close) return { stopLoss };

  return { stopLoss, riskPct: ((close - stopLoss) / close) * 100 };
}

export interface ExitContext {
  /** 自入场以来的累计涨幅（%），回测可提供；实时分析缺省用 26 周涨幅近似 */
  gainPctSinceEntry?: number;
}

/**
 * 检测卖出信号。
 * 返回人类可读的信号列表，实时展示与回测卖出共用同一套判定。
 */
export function detectExitSignals(
  p: WeeklyPanel,
  i: number,
  config: WeeklyConfig,
  ctx: ExitContext = {}
): string[] {
  const signals: string[] = [];
  const close = p.close[i];
  if (!Number.isFinite(close)) return signals;

  // 1. 有效跌破 20 周均线：跌破 2% 以上，或连续两周收在均线下方
  const m20 = safe(p.ma20, i);
  const m20Prev = safe(p.ma20, i - 1);
  if (m20 !== undefined && m20 > 0) {
    const deepBreak = close < m20 * 0.98;
    const twoWeeksBelow =
      m20Prev !== undefined && close < m20 && i > 0 && p.close[i - 1] < m20Prev;
    if (deepBreak || twoWeeksBelow) signals.push('有效跌破20周均线');
  }

  // 2. 10 周线拐头向下
  if (p.ma10TurnDown[i]) signals.push('10周线拐头向下');

  // 3. 死叉：文档「短期均线下穿长期均线」指均线死叉，MACD 死叉单独列出
  if (crossUnder(p.ma5, p.ma10, i)) signals.push('均线死叉(MA5下穿MA10)');
  if (p.macdDeathCross[i]) signals.push('MACD死叉');

  // 4. 顶背离（文档语境：累计涨幅超阈值之后的见顶信号）
  if (p.macdTopDivergence[i] && (p.ret26w[i] ?? 0) >= config.exitGainPct) {
    signals.push('MACD顶背离');
  }

  // 5. 累计涨幅超阈值后，放量长上影
  const gain = ctx.gainPctSinceEntry ?? p.ret26w[i];
  if (gain !== undefined && gain >= config.exitGainPct) {
    const volRatio = p.volRatio5[i];
    const heavyVolume = volRatio !== undefined && volRatio >= config.breakoutVolumeRatio;
    if (isLongUpperShadow(p.bars[i]) && heavyVolume) {
      signals.push(`累计涨${gain.toFixed(0)}%后放量长上影`);
    }
  }

  // 6. 高位放量滞涨：天量成交但 K 线实体极小，主力出货特征
  const volRatio = p.volRatio5[i];
  if (
    volRatio !== undefined &&
    volRatio >= 2 &&
    isSmallBody(p.bars[i]) &&
    (p.pos52w[i] ?? 0) >= 70
  ) {
    signals.push('高位放量滞涨');
  }

  return signals;
}
