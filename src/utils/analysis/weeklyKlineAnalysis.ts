/**
 * 周线（周K）分析
 *
 * 核心原则：
 * 1. 周线的最后一根 K 线如果是「本周」，在周五收盘前数据仍在变动，
 *    因此所有信号一律基于「已收盘周」判定，未完成周只展示不参与信号（避免未来函数）。
 * 2. 参数换算：周 MA5≈月线，MA10≈季线（最核心），MA20≈半年线，MA30≈牛熊分界。
 * 3. 周线用于定方向/筛标的，具体买点仍应回到日线。
 */

import type { KLineData } from '@/types/stock';
import { calculateKDJ, calculateMA, calculateMACD } from './indicators';

/** 周线分析默认参数 */
export const WEEKLY_ANALYSIS_DEFAULTS = {
  /** 箱体回看周数 */
  boxLookback: 10,
  /** 箱体振幅上限（%） */
  boxAmplitudeMax: 30,
  /** 突破周量能倍数下限（相对前 5 周均量） */
  breakoutVolumeRatio: 1.5,
  /** 量能温和放大的下限 */
  volumeRatioMin: 1.2,
  /** 过热阈值：20 周涨幅超过该值判定为追高风险（%） */
  overheatChange20w: 80,
  /** 乖离率上限（相对周 MA20，%） */
  biasMax: 30,
  /** MACD 金叉/死叉回溯周数 */
  macdCrossLookback: 3,
  /** 结构判定回看周数（前后各一半对比） */
  structureLookback: 8,
} as const;

/** 单条周线信号 */
export interface WeeklySignal {
  /** 短标签 */
  label: string;
  /** 判定说明 */
  detail: string;
  /** 该信号贡献的分数（可为负） */
  score: number;
}

export type WeeklyStructure = 'higher_highs' | 'lower_highs' | 'sideways';

/** 周线分析结果 */
export interface WeeklyKlineAnalysis {
  code: string;
  name: string;
  /** 原始周K根数 */
  bars: number;
  /** 已收盘周K根数 */
  confirmedBars: number;
  /** 最后一根是否为「进行中的本周」（未收盘，不参与信号判定） */
  runningWeekIncluded: boolean;
  /** 最新周K时间 */
  lastWeekTime: number;
  /** 最新价（含未收盘周的即时价） */
  close: number;
  /** 最新一周涨跌幅（%） */
  weekChangePercent: number;

  /** 周线均线 */
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma30?: number;
  /** 均线多头排列（MA5>MA10>MA20 且 MA10 向上） */
  maBullish: boolean;
  /** 周 MA10 拐头向上 */
  ma10Rising: boolean;
  /** 收盘站上周 MA10 */
  aboveMa10: boolean;

  /** MACD */
  macdDif?: number;
  macdDea?: number;
  macdBar?: number;
  /** 近 N 周内出现金叉 */
  macdGoldenCross: boolean;
  /** 金叉发生在零轴上方（最强形态） */
  macdGoldenAboveZero: boolean;
  /** 近 N 周内出现死叉 */
  macdDeathCross: boolean;
  /** 红柱放大中 */
  macdHistogramRising: boolean;

  /** 量能：最新已收盘周成交量 / 前 5 周均量 */
  volumeRatio5?: number;
  /** 量能：最新已收盘周成交量 / 前 10 周均量 */
  volumeRatio10?: number;

  /** 箱体突破相关 */
  boxHigh?: number;
  boxLow?: number;
  boxAmplitude?: number;
  boxBreakout: boolean;

  /** 近 20 周涨幅（%） */
  change20w?: number;
  /** 相对周 MA20 的乖离率（%） */
  bias20?: number;

  /** 结构：高点抬高 / 高点降低 / 横向 */
  structure: WeeklyStructure;
  /** 最近两周连续阳线 */
  consecutiveYang: boolean;

  /** KDJ（周线 9,3,3） */
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  /** KDJ 在中轴（35~65）金叉 */
  kdjGoldenCrossMid: boolean;

  /** 综合评分 0~100 */
  score: number;
  /** 命中的正向信号 */
  signals: WeeklySignal[];
  /** 风险提示 */
  warnings: string[];
  /** 数据不足（无法完成判定） */
  insufficientData: boolean;
}

/** 取数组指定下标的有效数值（NaN 视为无效） */
function val(arr: number[], index: number): number | undefined {
  if (index < 0 || index >= arr.length) {
    return undefined;
  }
  const value = arr[index];
  return Number.isFinite(value) ? value : undefined;
}

/** 周一 00:00 的时间戳 */
function startOfWeek(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  // getDay: 0=周日, 1=周一 ... 6=周六；转换为「距周一的天数」
  const offset = (date.getDay() + 6) % 7;
  return date.getTime() - offset * 24 * 60 * 60 * 1000;
}

/**
 * 判断最后一根周K是否为「进行中的本周」。
 * 周六/周日时本周已无交易日，视为已收盘。
 */
function isRunningWeek(lastBarTime: number, now: number): boolean {
  const nowDate = new Date(now);
  const day = nowDate.getDay();
  const weekFinished = day === 0 || day === 6;
  if (weekFinished) {
    return false;
  }
  return startOfWeek(lastBarTime) >= startOfWeek(now);
}

/** 拆分出「已收盘」的周K序列 */
export function splitConfirmedWeeklyKlines(
  kline: KLineData[],
  now: number = Date.now()
): { confirmed: KLineData[]; runningWeekIncluded: boolean } {
  if (kline.length === 0) {
    return { confirmed: [], runningWeekIncluded: false };
  }
  const running = isRunningWeek(kline[kline.length - 1].time, now);
  return {
    confirmed: running ? kline.slice(0, -1) : kline,
    runningWeekIncluded: running,
  };
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * 周线分析主入口
 * @param code 股票代码
 * @param name 股票名称
 * @param kline 周K数据（时间从旧到新）
 */
export function analyzeWeeklyKline(
  code: string,
  name: string,
  kline: KLineData[],
  now: number = Date.now()
): WeeklyKlineAnalysis {
  const emptyBase: WeeklyKlineAnalysis = {
    code,
    name,
    bars: kline.length,
    confirmedBars: 0,
    runningWeekIncluded: false,
    lastWeekTime: kline.length > 0 ? kline[kline.length - 1].time : 0,
    close: kline.length > 0 ? kline[kline.length - 1].close : 0,
    weekChangePercent: 0,
    maBullish: false,
    ma10Rising: false,
    aboveMa10: false,
    macdGoldenCross: false,
    macdGoldenAboveZero: false,
    macdDeathCross: false,
    macdHistogramRising: false,
    boxBreakout: false,
    structure: 'sideways',
    consecutiveYang: false,
    kdjGoldenCrossMid: false,
    score: 0,
    signals: [],
    warnings: [],
    insufficientData: true,
  };

  if (kline.length === 0) {
    return emptyBase;
  }

  const { confirmed, runningWeekIncluded } = splitConfirmedWeeklyKlines(kline, now);

  // 最新一周涨跌幅（含进行中的本周）
  const lastBar = kline[kline.length - 1];
  const prevBar = kline.length >= 2 ? kline[kline.length - 2] : undefined;
  const weekChangePercent =
    prevBar && prevBar.close > 0
      ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
      : 0;

  // 至少需要 30 根已收盘周K才做完整判定（MA30 + MACD 预热）
  if (confirmed.length < 30) {
    return {
      ...emptyBase,
      confirmedBars: confirmed.length,
      runningWeekIncluded,
      weekChangePercent,
      warnings: ['周K数据不足 30 根，无法完成判定'],
    };
  }

  const last = confirmed.length - 1;
  const ma5Arr = calculateMA(confirmed, 5);
  const ma10Arr = calculateMA(confirmed, 10);
  const ma20Arr = calculateMA(confirmed, 20);
  const ma30Arr = calculateMA(confirmed, 30);
  const macdResult = calculateMACD(confirmed);
  const kdjResult = calculateKDJ(confirmed);

  const ma5 = val(ma5Arr, last);
  const ma10 = val(ma10Arr, last);
  const ma20 = val(ma20Arr, last);
  const ma30 = val(ma30Arr, last);

  // ===== 均线 =====
  const ma10Prev = val(ma10Arr, last - 3);
  const ma10Rising = ma10 !== undefined && ma10Prev !== undefined && ma10 > ma10Prev;
  const maBullish =
    ma5 !== undefined &&
    ma10 !== undefined &&
    ma20 !== undefined &&
    ma5 > ma10 &&
    ma10 > ma20 &&
    ma10Rising;
  const aboveMa10 = ma10 !== undefined && confirmed[last].close >= ma10;

  // ===== MACD =====
  const dif = macdResult.dif;
  const dea = macdResult.dea;
  const bar = macdResult.macd;
  const macdDifValue = val(dif, last);
  const macdDeaValue = val(dea, last);
  const macdBarValue = val(bar, last);

  let macdGoldenCross = false;
  let macdDeathCross = false;
  let macdGoldenAboveZero = false;
  const crossStart = Math.max(1, last - WEEKLY_ANALYSIS_DEFAULTS.macdCrossLookback + 1);
  for (let i = crossStart; i <= last; i++) {
    const prevDif = val(dif, i - 1);
    const prevDea = val(dea, i - 1);
    const curDif = val(dif, i);
    const curDea = val(dea, i);
    if (prevDif === undefined || prevDea === undefined || curDif === undefined || curDea === undefined) {
      continue;
    }
    if (prevDif <= prevDea && curDif > curDea) {
      macdGoldenCross = true;
      if (curDif > 0 && curDea > 0) {
        macdGoldenAboveZero = true;
      }
    }
    if (prevDif >= prevDea && curDif < curDea) {
      macdDeathCross = true;
    }
  }
  const prevBarValue = val(bar, last - 1);
  const macdHistogramRising =
    macdBarValue !== undefined && prevBarValue !== undefined && macdBarValue > 0 && macdBarValue > prevBarValue;
  const macdAboveZero = macdDifValue !== undefined && macdDeaValue !== undefined && macdDifValue > 0 && macdDeaValue > 0;

  // ===== 量能 =====
  const volumeRatio5 = (() => {
    const prev = confirmed.slice(Math.max(0, last - 5), last).map((d) => d.volume);
    const base = avg(prev);
    return base && base > 0 ? confirmed[last].volume / base : undefined;
  })();
  const volumeRatio10 = (() => {
    const prev = confirmed.slice(Math.max(0, last - 10), last).map((d) => d.volume);
    const base = avg(prev);
    return base && base > 0 ? confirmed[last].volume / base : undefined;
  })();

  // ===== 箱体突破 =====
  const boxSource = confirmed.slice(Math.max(0, last - WEEKLY_ANALYSIS_DEFAULTS.boxLookback), last);
  const boxHigh = boxSource.length > 0 ? Math.max(...boxSource.map((d) => d.high)) : undefined;
  const boxLow = boxSource.length > 0 ? Math.min(...boxSource.map((d) => d.low)) : undefined;
  const boxAmplitude =
    boxHigh !== undefined && boxLow !== undefined && boxLow > 0
      ? ((boxHigh - boxLow) / boxLow) * 100
      : undefined;
  const boxBreakout =
    boxHigh !== undefined &&
    boxAmplitude !== undefined &&
    volumeRatio5 !== undefined &&
    confirmed[last].close > boxHigh &&
    boxAmplitude <= WEEKLY_ANALYSIS_DEFAULTS.boxAmplitudeMax &&
    volumeRatio5 >= WEEKLY_ANALYSIS_DEFAULTS.breakoutVolumeRatio;

  // ===== 20 周涨幅与乖离 =====
  const refIndex20 = Math.max(0, last - 20);
  const change20w =
    confirmed[refIndex20].close > 0
      ? ((confirmed[last].close - confirmed[refIndex20].close) / confirmed[refIndex20].close) * 100
      : undefined;
  const bias20 =
    ma20 !== undefined && ma20 > 0 ? ((confirmed[last].close - ma20) / ma20) * 100 : undefined;

  // ===== 结构：前后半段高点/低点对比 =====
  const lookback = WEEKLY_ANALYSIS_DEFAULTS.structureLookback;
  let structure: WeeklyStructure = 'sideways';
  if (confirmed.length >= lookback) {
    const seg = confirmed.slice(last - lookback + 1, last + 1);
    const half = Math.floor(seg.length / 2);
    const front = seg.slice(0, half);
    const back = seg.slice(half);
    const frontHigh = Math.max(...front.map((d) => d.high));
    const backHigh = Math.max(...back.map((d) => d.high));
    const frontLow = Math.min(...front.map((d) => d.low));
    const backLow = Math.min(...back.map((d) => d.low));
    if (backHigh > frontHigh && backLow > frontLow) {
      structure = 'higher_highs';
    } else if (backHigh < frontHigh && backLow < frontLow) {
      structure = 'lower_highs';
    }
  }

  // ===== 连阳 =====
  const lastTwo = confirmed.slice(-2);
  const consecutiveYang =
    lastTwo.length === 2 &&
    lastTwo.every((d) => d.close > d.open && (d.close - d.open) / d.open > 0.01);

  // ===== KDJ =====
  const kdjK = val(kdjResult.k, last);
  const kdjD = val(kdjResult.d, last);
  const kdjJ = val(kdjResult.j, last);
  const prevK = val(kdjResult.k, last - 1);
  const prevD = val(kdjResult.d, last - 1);
  const kdjGoldenCrossMid =
    kdjK !== undefined &&
    kdjD !== undefined &&
    prevK !== undefined &&
    prevD !== undefined &&
    prevK <= prevD &&
    kdjK > kdjD &&
    kdjK >= 35 &&
    kdjK <= 65;

  // ===== 评分与信号 =====
  const signals: WeeklySignal[] = [];
  const warnings: string[] = [];
  let score = 0;

  const add = (label: string, detail: string, delta: number) => {
    signals.push({ label, detail, score: delta });
    score += delta;
  };

  if (maBullish) {
    add('均线多头', '周线 MA5>MA10>MA20 且 MA10 向上', 20);
  }
  if (aboveMa10 && ma10Rising) {
    add('站上MA10', '已收盘周收盘价在周 MA10 上方，且 MA10 拐头向上', 15);
  } else if (aboveMa10) {
    add('站上MA10', '已收盘周收盘价在周 MA10 上方（MA10 未拐头）', 6);
  }
  if (macdGoldenCross) {
    add(
      'MACD金叉',
      macdGoldenAboveZero ? '近 3 周周线 MACD 在零轴上方金叉' : '近 3 周周线 MACD 金叉（零轴下方，按反弹对待）',
      macdGoldenAboveZero ? 20 : 8
    );
  }
  if (macdAboveZero && macdHistogramRising) {
    add('红柱放大', 'MACD 双线在零轴上方且红柱持续放大', 5);
  }
  if (boxBreakout) {
    add(
      '箱体突破',
      `突破前 ${WEEKLY_ANALYSIS_DEFAULTS.boxLookback} 周箱顶 ${boxHigh?.toFixed(2)}，振幅 ${boxAmplitude?.toFixed(
        1
      )}%，量比 ${volumeRatio5?.toFixed(2)}`,
      20
    );
  }
  if (
    volumeRatio5 !== undefined &&
    volumeRatio5 >= WEEKLY_ANALYSIS_DEFAULTS.volumeRatioMin &&
    volumeRatio5 < 3
  ) {
    add('量能放大', `最新周量能为前 5 周均量的 ${volumeRatio5.toFixed(2)} 倍`, 5);
  }
  if (kdjGoldenCrossMid) {
    add('KDJ中轴金叉', `周线 KDJ 在 ${kdjK?.toFixed(1)} 附近金叉（非超买区）`, 8);
  }
  if (structure === 'higher_highs') {
    add('高点抬高', '近 8 周低点抬高且高点抬高（N 字上升结构）', 8);
  }
  if (consecutiveYang) {
    add('周线连阳', '最近两周连续收阳且实体大于 1%', 5);
  }

  if (change20w !== undefined && change20w > WEEKLY_ANALYSIS_DEFAULTS.overheatChange20w) {
    warnings.push(`20 周累计涨幅 ${change20w.toFixed(1)}%，存在追高风险`);
    score -= 15;
  }
  if (bias20 !== undefined && bias20 > WEEKLY_ANALYSIS_DEFAULTS.biasMax) {
    warnings.push(`偏离周 MA20 达 ${bias20.toFixed(1)}%，乖离过大`);
    score -= 10;
  }
  if (macdDeathCross) {
    warnings.push('近 3 周周线 MACD 出现死叉');
    score -= 10;
  }
  if (!aboveMa10) {
    warnings.push('已收盘周收盘价跌破周 MA10');
    score -= 8;
  }
  if (structure === 'lower_highs') {
    warnings.push('近 8 周高点与低点同步下移（下降结构）');
    score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

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
    ma10,
    ma20,
    ma30,
    maBullish,
    ma10Rising,
    aboveMa10,
    macdDif: macdDifValue,
    macdDea: macdDeaValue,
    macdBar: macdBarValue,
    macdGoldenCross,
    macdGoldenAboveZero,
    macdDeathCross,
    macdHistogramRising,
    volumeRatio5,
    volumeRatio10,
    boxHigh,
    boxLow,
    boxAmplitude,
    boxBreakout,
    change20w,
    bias20,
    structure,
    consecutiveYang,
    kdjK,
    kdjD,
    kdjJ,
    kdjGoldenCrossMid,
    score,
    signals,
    warnings,
    insufficientData: false,
  };
}

/** 周线结构中文标签 */
export const WEEKLY_STRUCTURE_LABELS: Record<WeeklyStructure, string> = {
  higher_highs: '高点抬高',
  lower_highs: '高点降低',
  sideways: '横向震荡',
};
