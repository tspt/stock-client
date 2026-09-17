/**
 * 周线分析用的基础数学工具
 *
 * 与通用的 indicators.ts 分开，原因：周线需要的是「稳健统计量」
 * （分位、回归斜率、ATR 归一化），而不是金叉死叉这类离散信号。
 */

/** 数值安全取值：NaN / Infinity / null 一律视为无效 */
export function safe(arr: (number | undefined)[], index: number): number | undefined {
  if (index < 0 || index >= arr.length) return undefined;
  const v = arr[index];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 取序列最后一个有效值 */
export function lastValid(arr: (number | undefined)[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const v = safe(arr, i);
    if (v !== undefined) return v;
  }
  return undefined;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 样本标准差；不足 2 个有效值时返回 undefined */
export function stdev(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const avg = mean(values);
  if (avg === undefined) return undefined;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const d = values[i] - avg;
    sum += d * d;
  }
  return Math.sqrt(sum / (values.length - 1));
}

/** 简单移动平均，前 period-1 项为 NaN */
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** 指数移动平均（Wilder 平滑），首个值为初始值 */
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length === 0 || period <= 0) return out;
  const alpha = 2 / (period + 1);
  out[0] = values[0];
  for (let i = 1; i < values.length; i += 1) {
    out[i] = (values[i] - out[i - 1]) * alpha + out[i - 1];
  }
  return out;
}

export interface Bar {
  high: number;
  low: number;
  close: number;
}

/**
 * Wilder ATR。
 * 用真实波幅衡量「这只票一周正常波动多少钱」，
 * 后续所有乖离/止损都用它做归一化，从而让高波动股与低波动股可比。
 */
export function atrWilder(bars: Bar[], period: number): number[] {
  const out: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < period + 1 || period <= 0) return out;

  const tr: number[] = new Array(bars.length).fill(NaN);
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].close;
    tr[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prevClose),
      Math.abs(bars[i].low - prevClose)
    );
  }

  let seed = 0;
  let count = 0;
  for (let i = 1; i <= period && i < bars.length; i += 1) {
    if (Number.isFinite(tr[i])) {
      seed += tr[i];
      count += 1;
    }
  }
  if (count === 0) return out;
  out[period] = seed / count;

  for (let i = period + 1; i < bars.length; i += 1) {
    const prev = out[i - 1];
    if (!Number.isFinite(prev) || !Number.isFinite(tr[i])) continue;
    out[i] = (prev * (period - 1) + tr[i]) / period;
  }
  return out;
}

export interface RegressionResult {
  /** 每周斜率（对 ln(price) 回归） */
  slope: number;
  /** 拟合优度，衡量趋势的「干净程度」 */
  r2: number;
  /** 年化涨跌幅（%） */
  annualized: number;
}

/**
 * 对 ln(price) 做最小二乘回归。
 *
 * 相比旧的「前后各 4 周高低点比较」，回归利用了全部样本点，
 * 且 R² 能区分「平滑上升」和「剧烈震荡后恰好收高」——后者 R² 很低，不算趋势。
 */
export function regressLogPrice(closes: number[]): RegressionResult {
  const n = closes.length;
  if (n < 3) return { slope: 0, r2: 0, annualized: 0 };

  const ys = closes.map((c) => (c > 0 ? Math.log(c) : NaN));
  if (ys.some((y) => !Number.isFinite(y))) return { slope: 0, r2: 0, annualized: 0 };

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += i;
    sy += ys[i];
    sxx += i * i;
    sxy += i * ys[i];
  }

  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, r2: 0, annualized: 0 };

  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * i;
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - sy / n) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    slope,
    r2: clamp(r2, 0, 1),
    annualized: (Math.exp(slope * 52) - 1) * 100,
  };
}

/**
 * 区间最大回撤（%，返回正数）。
 * 用收盘价序列计算，衡量「过去一段时间最难受的一段」。
 */
export function maxDrawdown(closes: number[]): number {
  if (closes.length < 2) return 0;
  let peak = closes[0];
  let worst = 0;
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i] > peak) {
      peak = closes[i];
      continue;
    }
    if (peak > 0) {
      const dd = ((peak - closes[i]) / peak) * 100;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

/**
 * 滚动区间极值：out.max[i] / out.min[i] 为 [i-window+1, i] 的极值，窗口不足处为 NaN。
 * 窗口内的高/低点只影响当周及之后的判定，不含未来数据。
 */
export function rollingExtremes(
  values: number[],
  window: number
): { max: number[]; min: number[] } {
  const n = values.length;
  const max = new Array<number>(n).fill(NaN);
  const min = new Array<number>(n).fill(NaN);
  for (let i = window - 1; i < n; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - window + 1; j <= i; j += 1) {
      if (values[j] > hi) hi = values[j];
      if (values[j] < lo) lo = values[j];
    }
    max[i] = hi;
    min[i] = lo;
  }
  return { max, min };
}

/**
 * 滚动最大回撤（%，返回正数）：对每个位置 i 计算 [i-window+1, i] 区间的最大回撤。
 * 用于回测中逐周复现「52 周最大回撤」这一风险项，窗口内只含 i 及之前的数据。
 */
export function rollingMaxDrawdown(values: number[], window: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n).fill(NaN);
  if (window < 2) return out;
  for (let i = window - 1; i < n; i += 1) {
    let peak = values[i - window + 1];
    let worst = 0;
    for (let j = i - window + 1; j <= i; j += 1) {
      const v = values[j];
      if (v > peak) {
        peak = v;
        continue;
      }
      if (peak > 0) {
        const dd = ((peak - v) / peak) * 100;
        if (dd > worst) worst = dd;
      }
    }
    out[i] = worst;
  }
  return out;
}

/**
 * 滚动对数价格回归：对每个位置 i 计算 [i-window+1, i] 区间的 slope / r2 / 年化。
 *
 * 与 regressLogPrice 结果一致（回归只依赖相对位置），但用前缀和把复杂度从
 * O(n*window) 降到 O(n)，回测里要对几百只股票逐周计算，这个优化是必要的。
 */
export function rollingLogRegression(
  values: number[],
  window: number
): { slope: number[]; r2: number[]; annualized: number[] } {
  const n = values.length;
  const slopeOut = new Array<number>(n).fill(NaN);
  const r2Out = new Array<number>(n).fill(NaN);
  const annualOut = new Array<number>(n).fill(NaN);
  if (n < 3 || window < 3) return { slope: slopeOut, r2: r2Out, annualized: annualOut };

  // 前缀和：Σy、Σy²、Σ(j*y)，j 为全局下标
  const py = new Array<number>(n + 1).fill(0);
  const pyy = new Array<number>(n + 1).fill(0);
  const pjy = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v) || v <= 0) {
      // 非正值无法取对数，直接把该窗口作废（用 NaN 污染前缀和）
      py[i + 1] = NaN;
      pyy[i + 1] = NaN;
      pjy[i + 1] = NaN;
      continue;
    }
    const y = Math.log(v);
    py[i + 1] = py[i] + y;
    pyy[i + 1] = pyy[i] + y * y;
    pjy[i + 1] = pjy[i] + i * y;
  }

  const sx = (window * (window - 1)) / 2;
  const sxx = ((window - 1) * window * (2 * window - 1)) / 6;
  const denom = window * sxx - sx * sx;
  if (denom === 0) return { slope: slopeOut, r2: r2Out, annualized: annualOut };

  for (let e = window - 1; e < n; e += 1) {
    const s = e - window + 1;
    const sy = py[e + 1] - py[s];
    const syy = pyy[e + 1] - pyy[s];
    const sjy = pjy[e + 1] - pjy[s];
    if (!Number.isFinite(sy) || !Number.isFinite(syy) || !Number.isFinite(sjy)) continue;

    const sxy = sjy - s * sy;
    const slope = (window * sxy - sx * sy) / denom;
    const ssTot = syy - (sy * sy) / window;
    const centeredSxx = sxx - (sx * sx) / window;
    const r2 = ssTot <= 0 ? 0 : clamp((slope * slope * centeredSxx) / ssTot, 0, 1);

    slopeOut[e] = slope;
    r2Out[e] = r2;
    annualOut[e] = (Math.exp(slope * 52) - 1) * 100;
  }

  return { slope: slopeOut, r2: r2Out, annualized: annualOut };
}

/**
 * 在「已升序排列」的数组中求 value 的分位（0~100）。
 * 采用线性插值，样本少时也不会退化成 0/100 两个极端值。
 */
export function percentileOfSorted(sorted: number[], value: number): number {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(value)) return 50;
  if (n === 1) return 50;

  let lo = 0;
  let hi = n - 1;
  if (value <= sorted[0]) return 0;
  if (value >= sorted[hi]) return 100;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid;
    else hi = mid;
  }
  const span = sorted[hi] - sorted[lo];
  const ratio = span === 0 ? 0 : (value - sorted[lo]) / span;
  return clamp(((lo + ratio) / (n - 1)) * 100, 0, 100);
}

/** 计算一批数值的分位查询表（升序副本） */
export function buildRankTable(values: (number | undefined)[]): number[] {
  return values
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
}

/** 周一 00:00 的时间戳 */
export function startOfWeek(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  return date.getTime() - offset * 24 * 60 * 60 * 1000;
}
