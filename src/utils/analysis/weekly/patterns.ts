/**
 * 周K形态原子
 *
 * 存在的意义：文档里的「回踩低吸」「高位放量滞涨」都依赖 K 线形态
 * （锤子线、十字星、阳包阴、长上影），而项目原有的 indicators.ts 只有
 * 均线/MACD/RSI 这类数值指标，没有形态识别。
 *
 * 全部是纯函数，只依赖单根（或相邻两根）K 线的 OHLC，
 * 因此既可用于「最后一周」，也可用于回测里的任意一周，天然无未来函数。
 */

export interface CandleLike {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 实体长度（绝对值） */
function bodyOf(bar: CandleLike): number {
  return Math.abs(bar.close - bar.open);
}

/** 全幅（最高-最低） */
function rangeOf(bar: CandleLike): number {
  return bar.high - bar.low;
}

/** 上影线长度 */
function upperShadow(bar: CandleLike): number {
  return bar.high - Math.max(bar.open, bar.close);
}

/** 下影线长度 */
function lowerShadow(bar: CandleLike): number {
  return Math.min(bar.open, bar.close) - bar.low;
}

function valid(bar: CandleLike | undefined): bar is CandleLike {
  if (!bar) return false;
  const { open, high, low, close } = bar;
  return [open, high, low, close].every((v) => typeof v === 'number' && Number.isFinite(v));
}

/** 阳线 */
export function isYang(bar: CandleLike | undefined): boolean {
  return valid(bar) && bar.close > bar.open;
}

/** 阴线 */
export function isYin(bar: CandleLike | undefined): boolean {
  return valid(bar) && bar.close < bar.open;
}

/**
 * 锤子线（止跌 K 线之一）。
 * 判定：下影线 ≥ 2 倍实体，上影线 ≤ 1 倍实体——下方被买盘接住并收回。
 * 要求实体 > 0，否则会与十字星重复计数。
 */
export function isHammer(bar: CandleLike | undefined): boolean {
  if (!valid(bar)) return false;
  const body = bodyOf(bar);
  if (body <= 0) return false;
  return lowerShadow(bar) >= 2 * body && upperShadow(bar) <= body;
}

/**
 * 十字星（止跌 K 线之一）：实体极小，多空力量均衡，常出现在回调末端。
 */
export function isDoji(bar: CandleLike | undefined, maxBodyRatio = 0.1): boolean {
  if (!valid(bar)) return false;
  const range = rangeOf(bar);
  if (range <= 0) return false;
  return bodyOf(bar) <= maxBodyRatio * range;
}

/**
 * 阳包阴（止跌 K 线之一）：前一周阴线，本周阳线且完全吞没前一周实体。
 */
export function isBullishEngulf(
  prev: CandleLike | undefined,
  cur: CandleLike | undefined
): boolean {
  if (!valid(prev) || !valid(cur)) return false;
  if (!isYin(prev) || !isYang(cur)) return false;
  return cur.close >= prev.open && cur.open <= prev.close;
}

/** 止跌 K 线：锤子线 / 十字星 / 阳包阴 任一 */
export function isStoppingCandle(
  prev: CandleLike | undefined,
  cur: CandleLike | undefined
): { hit: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (isHammer(cur)) reasons.push('锤子线');
  if (isDoji(cur)) reasons.push('十字星');
  if (isBullishEngulf(prev, cur)) reasons.push('阳包阴');
  return { hit: reasons.length > 0, reasons };
}

/**
 * 长上影线（见顶/出货信号之一）：
 * 上影线 ≥ 2 倍实体且占全幅 ≥ 50%，说明冲高被砸回来。
 */
export function isLongUpperShadow(bar: CandleLike | undefined): boolean {
  if (!valid(bar)) return false;
  const range = rangeOf(bar);
  if (range <= 0) return false;
  const upper = upperShadow(bar);
  // 实体极小时（十字星）也按长上影处理：max 项保证不会因实体为 0 而失效
  return upper >= 2 * Math.max(bodyOf(bar), range * 0.05) && upper / range >= 0.5;
}

/**
 * 滞涨：K 线实体极小（「天量成交但 K 线实体极小」的主力出货特征）。
 * 只描述形态，是否放量由调用方判断。
 */
export function isSmallBody(bar: CandleLike | undefined, maxBodyRatio = 0.2): boolean {
  if (!valid(bar)) return false;
  const range = rangeOf(bar);
  if (range <= 0) return false;
  return bodyOf(bar) <= maxBodyRatio * range;
}
