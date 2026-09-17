/**
 * 周线因子计算
 *
 * 设计原则：
 * 1. 所有信号一律基于「已收盘周」判定，未完成周只用于展示，杜绝未来函数。
 * 2. 因子分层且尽量正交：趋势、动量、位置、量能、波动、形态各自独立计分，
 *    不再出现「同一个事实既当门槛又当加分项」的重复计数。
 * 3. 涉及「偏离」的量一律用 ATR 归一化，让高波动股与低波动股可横向比较。
 */

import type { KLineData } from '@/types/stock';
import {
  atrWilder,
  clamp,
  ema,
  lastValid,
  maxDrawdown,
  mean,
  median,
  regressLogPrice,
  safe,
  sma,
  startOfWeek,
  stdev,
} from './math';
import type { WeeklyConfig, WeeklyDataQuality, WeeklyFactors, WeeklyStructure } from './types';

export const DEFAULT_WEEKLY_CONFIG: WeeklyConfig = {
  /** 至少 26 根已收盘周K，才能算 13 周动量、MA20 与波动 */
  minConfirmedBars: 26,
  boxLookback: 10,
  /** 振幅下限：极窄箱体往往是「织布机」，突破质量差 */
  boxAmplitudeMin: 8,
  boxAmplitudeMax: 30,
  breakoutVolumeRatio: 1.5,
  /**
   * 乖离阈值（相对周MA20 的 ATR 倍数）。
   * 注意不能设太紧：健康的上升趋势本身就会让价格持续高于 MA20，
   * 实测中强势股常年处于 2~3 个 ATR，设成 2 会系统性惩罚我们要找的票。
   */
  extBiasWarn: 2.5,
  extBiasSevere: 4,
  pos52wOverheat: 95,
  atrPctMax: 15,
  macdCrossLookback: 4,
  trendLookback: 26,
  trendR2Min: 0.3,
  trendSlopeMin: 15,
  gapThreshold: 40,
  maxSuspectedGaps: 2,
  /**
   * 权重（v2 回踩低吸）。
   * 依据：docs/回测优化/周线因子IC 的检验结果——剔除成交额后动量/趋势/MACD 的 IC 归零，
   * 只有乖离、量能、距支点距离、位置具备独立信息，且均为负向。
   */
  weights: {
    momentum: 0.5,
    lowVol: 0.25,
    reversal: 0.15,
    crowding: 0.1,
  },
};

/**
 * 判断最后一根周K是否为「进行中的本周」。
 *
 * 相比旧实现补充了两处：
 * - 周五 15:05 之后视为已收盘（A 股收盘后数据定格，旧实现会白白丢弃一周数据）
 * - 周六周日自然视为已收盘
 */
export function isRunningWeek(lastBarTime: number, now: number): boolean {
  const nowDate = new Date(now);
  const day = nowDate.getDay();
  if (day === 0 || day === 6) return false;

  if (day === 5) {
    const hour = nowDate.getHours();
    const minute = nowDate.getMinutes();
    const minutesOfDay = hour * 60 + minute;
    // 15:00 收盘，留 5 分钟数据落库缓冲
    if (minutesOfDay >= 15 * 60 + 5) return false;
  }

  return startOfWeek(lastBarTime) >= startOfWeek(now);
}

/** 拆分出「已收盘」的周K序列 */
export function splitConfirmedWeeklyKlines(
  kline: KLineData[],
  now: number = Date.now()
): { confirmed: KLineData[]; runningWeekIncluded: boolean } {
  if (kline.length === 0) return { confirmed: [], runningWeekIncluded: false };
  const running = isRunningWeek(kline[kline.length - 1].time, now);
  return {
    confirmed: running ? kline.slice(0, -1) : kline,
    runningWeekIncluded: running,
  };
}

/**
 * 估算成交额（元）。
 * 腾讯接口 volume 单位为「手」，1 手 = 100 股；
 * 直接用收盘价近似均价，误差通常在 5% 以内，对流动性分层足够。
 */
export function estimateAmount(bar: KLineData): number {
  if (typeof bar.amount === 'number' && bar.amount > 0) return bar.amount;
  return bar.volume * bar.close * 100;
}

/** 数据质量检查：根数、停牌、异常跳空 */
function checkQuality(confirmed: KLineData[], config: WeeklyConfig): WeeklyDataQuality {
  const reasons: string[] = [];

  if (confirmed.length < config.minConfirmedBars) {
    reasons.push(
      `已收盘周K仅 ${confirmed.length} 根，不足 ${config.minConfirmedBars} 根，无法完成判定`
    );
  }

  const recent52 = confirmed.slice(-52);
  const pausedWeeks = recent52.filter((bar) => !bar.volume || bar.volume <= 0).length;
  if (pausedWeeks > 4) {
    reasons.push(`近 52 周有 ${pausedWeeks} 周零成交（长期停牌），形态连续性不可靠`);
  }
  const recent8 = confirmed.slice(-8);
  const paused8 = recent8.filter((bar) => !bar.volume || bar.volume <= 0).length;
  if (paused8 > 0) {
    reasons.push(`近 8 周有 ${paused8} 周零成交，流动性不连续`);
  }

  // 前复权数据不应出现单周 40% 以上的跳空，出现则说明复权缺失或数据异常
  const scanFrom = Math.max(1, confirmed.length - 104);
  let suspectedGaps = 0;
  for (let i = scanFrom; i < confirmed.length; i += 1) {
    const prev = confirmed[i - 1].close;
    if (prev <= 0) continue;
    const change = Math.abs((confirmed[i].close - prev) / prev) * 100;
    if (change > config.gapThreshold) suspectedGaps += 1;
  }
  if (suspectedGaps > config.maxSuspectedGaps) {
    reasons.push(
      `近两年检测到 ${suspectedGaps} 次单周跳空超过 ${config.gapThreshold}%，数据可能未复权`
    );
  }

  return {
    ok: confirmed.length >= config.minConfirmedBars && pausedWeeks <= 4 && paused8 === 0,
    reasons,
    suspectedGaps,
    pausedWeeks,
  };
}

/** 计算区间收益率（%） */
function retOver(confirmed: KLineData[], weeks: number): number | undefined {
  const last = confirmed.length - 1;
  const ref = last - weeks;
  const end = safe(confirmed.map((d) => d.close), last);
  const start = safe(confirmed.map((d) => d.close), ref);
  if (end === undefined || start === undefined || start <= 0) return undefined;
  return ((end - start) / start) * 100;
}

/**
 * MACD 最近一次交叉状态。
 *
 * 旧实现在窗口内同时判定金叉与死叉，震荡市里会同时为真（又加分又扣分）。
 * 这里从最近一周倒序查找，只取「最近一次」交叉，语义唯一。
 */
export function resolveMacdState(
  dif: number[],
  dea: number[],
  last: number,
  lookback: number
): { golden: boolean; goldenAboveZero: boolean; death: boolean } {
  const start = Math.max(1, last - lookback + 1);
  for (let i = last; i >= start; i -= 1) {
    const prevDif = safe(dif, i - 1);
    const prevDea = safe(dea, i - 1);
    const curDif = safe(dif, i);
    const curDea = safe(dea, i);
    if (
      prevDif === undefined ||
      prevDea === undefined ||
      curDif === undefined ||
      curDea === undefined
    ) {
      continue;
    }
    if (prevDif <= prevDea && curDif > curDea) {
      return { golden: true, goldenAboveZero: curDif > 0 && curDea > 0, death: false };
    }
    if (prevDif >= prevDea && curDif < curDea) {
      return { golden: false, goldenAboveZero: false, death: true };
    }
  }
  return { golden: false, goldenAboveZero: false, death: false };
}

/**
 * 计算单只股票的周线因子
 * @param kline 周K数据（时间从旧到新）
 */
export function computeWeeklyFactors(
  code: string,
  name: string,
  kline: KLineData[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG,
  now: number = Date.now()
): WeeklyFactors {
  const base: WeeklyFactors = {
    code,
    name,
    bars: kline.length,
    confirmedBars: 0,
    runningWeekIncluded: false,
    lastWeekTime: kline.length > 0 ? kline[kline.length - 1].time : 0,
    close: kline.length > 0 ? kline[kline.length - 1].close : 0,
    weekChangePercent: 0,
    maStack: false,
    pxAboveMa8: false,
    pxAboveMa10: false,
    pxAboveMa20: false,
    boxBreakout: false,
    boxBreakoutFirst: false,
    structure: 'sideways',
    macdGoldenCross: false,
    macdGoldenAboveZero: false,
    macdDeathCross: false,
    macdBullish: false,
    quality: { ok: false, reasons: ['无周K数据'], suspectedGaps: 0, pausedWeeks: 0 },
  };

  if (kline.length === 0) return base;

  const { confirmed, runningWeekIncluded } = splitConfirmedWeeklyKlines(kline, now);
  const lastBar = kline[kline.length - 1];
  const prevBar = kline.length >= 2 ? kline[kline.length - 2] : undefined;
  const weekChangePercent =
    prevBar && prevBar.close > 0
      ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
      : 0;

  const quality = checkQuality(confirmed, config);
  if (!quality.ok) {
    return {
      ...base,
      confirmedBars: confirmed.length,
      runningWeekIncluded,
      weekChangePercent,
      quality,
    };
  }

  const last = confirmed.length - 1;
  const closes = confirmed.map((d) => d.close);

  const ma5Arr = sma(closes, 5);
  const ma8Arr = sma(closes, 8);
  const ma10Arr = sma(closes, 10);
  const ma20Arr = sma(closes, 20);
  const ma30Arr = sma(closes, 30);

  const ma5 = safe(ma5Arr, last);
  const ma8 = safe(ma8Arr, last);
  const ma10 = safe(ma10Arr, last);
  const ma20 = safe(ma20Arr, last);
  const ma30 = safe(ma30Arr, last);

  // ===== 趋势 =====
  const ma20Prev = safe(ma20Arr, last - 4);
  const ma20Slope =
    ma20 !== undefined && ma20Prev !== undefined && ma20Prev > 0
      ? ((ma20 - ma20Prev) / ma20Prev) * 100
      : undefined;
  const maStack =
    ma5 !== undefined &&
    ma10 !== undefined &&
    ma20 !== undefined &&
    ma5 > ma10 &&
    ma10 > ma20 &&
    (ma20Slope ?? 0) > 0;
  const lastClose = safe(closes, last);
  const pxAboveMa8 = lastClose !== undefined && ma8 !== undefined && lastClose >= ma8;
  const pxAboveMa10 = lastClose !== undefined && ma10 !== undefined && lastClose >= ma10;
  const pxAboveMa20 = lastClose !== undefined && ma20 !== undefined && lastClose >= ma20;

  // ===== 动量 =====
  const ret13w = retOver(confirmed, 13);
  const ret1w = retOver(confirmed, 1);
  const ret13wSkip1 = (() => {
    const end = last - 1;
    const start = last - 13;
    if (start < 0 || end < 0) return undefined;
    const a = safe(closes, start);
    const b = safe(closes, end);
    if (a === undefined || b === undefined || a <= 0) return undefined;
    return ((b - a) / a) * 100;
  })();
  const ret26w = retOver(confirmed, 26);
  const ret52w = retOver(confirmed, 52);
  const weeklyRets: number[] = [];
  for (let i = Math.max(1, last - 12); i <= last; i += 1) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && Number.isFinite(cur)) weeklyRets.push((cur / prev - 1) * 100);
  }
  const vol13w = stdev(weeklyRets);

  // ===== 位置 =====
  const window52 = confirmed.slice(-52);
  const high52w = window52.length > 0 ? Math.max(...window52.map((d) => d.high)) : undefined;
  const low52w = window52.length > 0 ? Math.min(...window52.map((d) => d.low)) : undefined;
  const pos52w =
    lastClose !== undefined && high52w !== undefined && low52w !== undefined && high52w > low52w
      ? clamp(((lastClose - low52w) / (high52w - low52w)) * 100, 0, 100)
      : undefined;

  // ===== 波动（ATR 归一化） =====
  const atrArr = atrWilder(confirmed, 20);
  const atr20 = safe(atrArr, last);
  const atrPct =
    atr20 !== undefined && lastClose !== undefined && lastClose > 0
      ? (atr20 / lastClose) * 100
      : undefined;
  const bias20 =
    lastClose !== undefined && ma20 !== undefined && ma20 > 0
      ? ((lastClose - ma20) / ma20) * 100
      : undefined;
  const extBias =
    lastClose !== undefined && ma20 !== undefined && atr20 !== undefined && atr20 > 0
      ? (lastClose - ma20) / atr20
      : undefined;

  const maxDD52w = window52.length > 1 ? maxDrawdown(window52.map((d) => d.close)) : undefined;

  // ===== 量能 =====
  const amounts = confirmed.map(estimateAmount);
  const recent20Amounts = amounts.slice(-20);
  const avgAmount20w = mean(recent20Amounts);
  const recent8Amounts = amounts.slice(-8);
  const amount8wMedian = median(recent8Amounts);
  const lastAmount = amounts[last];
  const amountCrowd8w =
    amount8wMedian !== undefined && amount8wMedian > 0 && Number.isFinite(lastAmount)
      ? lastAmount / amount8wMedian
      : undefined;

  const volBase = mean(confirmed.slice(Math.max(0, last - 5), last).map((d) => d.volume));
  const volRatio5 =
    volBase !== undefined && volBase > 0 ? confirmed[last].volume / volBase : undefined;
  // 量能趋势：近 4 周均量 / 近 26 周均量。单周脉冲与持续放量在周线级别含义不同
  const volRecent4 = mean(confirmed.slice(Math.max(0, last - 3), last + 1).map((d) => d.volume));
  const volBase26 = mean(confirmed.slice(Math.max(0, last - 25), last + 1).map((d) => d.volume));
  const volTrend4_26 =
    volRecent4 !== undefined && volBase26 !== undefined && volBase26 > 0
      ? volRecent4 / volBase26
      : undefined;

  // ===== 形态：箱体突破（要求首次） =====
  const boxSource = confirmed.slice(Math.max(0, last - config.boxLookback), last);
  const boxHigh = boxSource.length > 0 ? Math.max(...boxSource.map((d) => d.high)) : undefined;
  const boxLow = boxSource.length > 0 ? Math.min(...boxSource.map((d) => d.low)) : undefined;
  const boxAmplitude =
    boxHigh !== undefined && boxLow !== undefined && boxLow > 0
      ? ((boxHigh - boxLow) / boxLow) * 100
      : undefined;

  const amplitudeOk =
    boxAmplitude !== undefined &&
    boxAmplitude >= config.boxAmplitudeMin &&
    boxAmplitude <= config.boxAmplitudeMax;
  const volumeOk = volRatio5 !== undefined && volRatio5 >= config.breakoutVolumeRatio;
  const prevClose = safe(closes, last - 1);

  const boxBreakout =
    lastClose !== undefined &&
    boxHigh !== undefined &&
    lastClose > boxHigh &&
    amplitudeOk &&
    volumeOk;
  const boxBreakoutFirst =
    boxBreakout && prevClose !== undefined && boxHigh !== undefined && prevClose <= boxHigh;
  const distToBoxHigh =
    boxHigh !== undefined && boxHigh > 0 && lastClose !== undefined
      ? ((lastClose - boxHigh) / boxHigh) * 100
      : undefined;

  // ===== 形态：趋势结构（回归判定） =====
  const trendWindow = closes.slice(-config.trendLookback);
  const regression = regressLogPrice(trendWindow);
  let structure: WeeklyStructure = 'sideways';
  if (regression.r2 >= config.trendR2Min) {
    if (regression.annualized >= config.trendSlopeMin) structure = 'up';
    else if (regression.annualized <= -config.trendSlopeMin) structure = 'down';
  }

  // ===== MACD =====
  const emaFast = ema(closes, 12);
  const emaSlow = ema(closes, 26);
  const dif = emaFast.map((v, i) => v - emaSlow[i]);
  const dea = ema(dif, 9);
  const macdBarArr = dif.map((v, i) => (v - dea[i]) * 2);
  const macdState = resolveMacdState(dif, dea, last, config.macdCrossLookback);
  const curDif = safe(dif, last);
  const curDea = safe(dea, last);
  const macdBullish =
    curDif !== undefined && curDea !== undefined && curDif > curDea && curDif > 0 && curDea > 0;

  return {
    code,
    name,
    bars: kline.length,
    confirmedBars: confirmed.length,
    runningWeekIncluded,
    lastWeekTime: lastBar.time,
    close: lastBar.close,
    weekChangePercent,
    ma5,
    ma8,
    ma10,
    ma20,
    ma30,
    maStack,
    ma20Slope,
    pxAboveMa8,
    pxAboveMa10,
    pxAboveMa20,
    ret13w,
    ret13wSkip1,
    ret1w,
    ret26w,
    ret52w,
    vol13w,
    high52w,
    low52w,
    pos52w,
    bias20,
    extBias,
    avgAmount20w,
    amount8wMedian,
    amountCrowd8w,
    volRatio5,
    volTrend4_26,
    atrPct,
    maxDD52w,
    boxHigh,
    boxLow,
    boxAmplitude,
    boxBreakout,
    boxBreakoutFirst,
    distToBoxHigh,
    structure,
    annualSlope: regression.annualized,
    trendR2: regression.r2,
    macdDif: safe(dif, last),
    macdDea: safe(dea, last),
    macdBar: safe(macdBarArr, last),
    macdGoldenCross: macdState.golden,
    macdGoldenAboveZero: macdState.goldenAboveZero,
    macdDeathCross: macdState.death,
    macdBullish,
    quality,
  };
}

/** 供外部复用：取某序列最后一个有效值 */
export { lastValid };
