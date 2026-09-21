/**
 * 周线因子计算
 *
 * 设计原则：
 * 1. 所有信号一律基于「已收盘周」判定，未完成周只用于展示，杜绝未来函数。
 * 2. 因子分层且尽量正交：趋势、动量、位置、量能、波动、形态各自独立计分。
 * 3. 涉及「偏离」的量一律用 ATR 归一化，让高波动股与低波动股可横向比较。
 * 4. **本模块不再自己算因子**：统一走 buildWeeklyPanel + snapshotAt + detectSetups，
 *    与逐周回测共用同一份实现，避免「页面一套逻辑、回测另一套」的失真。
 */

import type { KLineData } from '@/types/stock';
import { safe, sma, startOfWeek } from './math';
import { buildWeeklyPanel, snapshotAt } from './panel';
import { detectSetups, totalSetupScore } from './setups';
import { computeStopLoss, detectExitSignals } from './exitRules';
import type { WeeklyConfig, WeeklyDataQuality, WeeklyFactors } from './types';

export const DEFAULT_WEEKLY_CONFIG: WeeklyConfig = {
  /**
   * 至少 60 根已收盘周K。
   * MA60（牛熊分界线）与「60 周均线走平或上翘」是本轮趋势判定的核心，
   * 26 根只能算到 MA20。代价是剔除上市不足约 15 个月的新股。
   */
  minConfirmedBars: 60,
  boxLookback: 10,
  /**
   * 振幅下限：极窄箱体往往是「织布机」，突破质量差。
   * 文档只给了「波动幅度 ≤20%」的上限，8% 对 10 周平台偏严，
   * 会漏掉真实的窄幅平台；放宽到 6% 仍能剔除织布机。
   */
  boxAmplitudeMin: 6,
  /** 振幅上限：对应文档「波动幅度≤20%」，超过即视为单边趋势而非平台 */
  boxAmplitudeMax: 20,
  /** 突破量能倍数下限：对应「达近 5 周均量 1.5 倍以上」 */
  breakoutVolumeRatio: 1.5,
  /** 突破当周最小涨幅：对应「收中长阳」 */
  breakoutMinWeekGain: 5,
  /** 均线粘合度上限：平台突破要求均线粘合 */
  maConvergeMax: 5,
  /**
   * 多头排列开口度上限 (MA5-MA60)/MA60：对应文档「开口不大」。
   * 25% 对周线过于宽松——MA5 高于 MA60 两成以上通常已是中后段行情，
   * 收紧到 18%，才符合「均线依次排列且开口不大、趋势刚成型」的原意。
   */
  maStackSpreadMax: 18,
  maTurnUpWeeks: 4,
  ma10TurnDownWeeks: 2,
  ma60SlopeWeeks: 8,
  /** MA60 斜率高于该值即视为走平或上翘 */
  ma60FlatMin: -1,
  pileWeeks: 3,
  pileVolumeRatio: 1.2,
  /** 回踩低吸的缩量上限（相对前 8 周均量） */
  pullbackVolumeRatio: 0.8,
  /** 「靠近均线」的 ATR 容差 */
  pullbackAtrTolerance: 0.5,
  /** 三连阳回踩：成交量相对前三周均量的上限 */
  threeYangVolumeRatio: 0.5,
  duckHeadLookback: 26,
  goldenCrossLookback: 12,
  goldenCrossLongLookback: 26,
  divergenceLookback: 26,
  /** 累计涨幅超过该值后启动见顶观察 */
  exitGainPct: 40,
  /** 上涨时间达到该周数后考虑卖出 */
  exitHoldWeeks: 5,
  /**
   * 乖离阈值（相对周MA20 的 ATR 倍数）。
   * 注意不能设太紧：健康的上升趋势本身就会让价格持续高于 MA20，
   * 实测中强势股常年处于 2~3 个 ATR，设成 2 会系统性惩罚我们要找的票。
   */
  extBiasWarn: 2.5,
  extBiasSevere: 4,
  atrPctMax: 15,
  macdCrossLookback: 4,
  trendLookback: 26,
  trendR2Min: 0.3,
  trendSlopeMin: 15,
  gapThreshold: 40,
  maxSuspectedGaps: 2,
  /** 单周涨幅达到该值（%）视为过热：风险惩罚与 notOverheated 门槛共用同一阈值 */
  overheatRet1w: 20,
  /** 风险惩罚上限：文档项权重高、工程项权重低，合计封顶 */
  maxRiskPenalty: 30,
  /**
   * 三段式评分各段上限：趋势健康度 30 + 战法 50 + 多周期共振 20 = 100，再减去风险惩罚。
   *
   * 分段与《周线选股》文档章节一一对应：第一章趋势、第二章战法、第三章共振、第四章风控。
   * 文档没有独立的「量价」章节（量能判定内嵌在各战法里），因此不单列量价段。
   * 段内细分见 types.ts 的 SETUP_MAX_SCORES 与 score.ts 的 computeTrendScore / computeResonanceScore。
   */
  weights: {
    trend: 30,
    setup: 50,
    resonance: 20,
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

/** 空因子：数据不足时的占位，字段与 WeeklyFactors 保持一致 */
function emptyFactors(
  code: string,
  name: string,
  kline: KLineData[],
  confirmedBars: number,
  runningWeekIncluded: boolean,
  weekChangePercent: number,
  confirmedClose: number,
  quality: WeeklyDataQuality
): WeeklyFactors {
  return {
    code,
    name,
    bars: kline.length,
    confirmedBars,
    runningWeekIncluded,
    lastWeekTime: kline.length > 0 ? kline[kline.length - 1].time : 0,
    close: kline.length > 0 ? kline[kline.length - 1].close : 0,
    confirmedClose,
    weekChangePercent,
    maStack: false,
    maBullStack: false,
    pxAboveMa5: false,
    pxAboveMa8: false,
    pxAboveMa10: false,
    pxAboveMa20: false,
    pxAboveMa60: false,
    ma20TurnUp: false,
    ma10TurnDown: false,
    ma60FlatOrUp: false,
    boxBreakout: false,
    boxBreakoutFirst: false,
    structure: 'sideways',
    macdGoldenCross: false,
    macdGoldenAboveZero: false,
    macdDeathCross: false,
    macdBullish: false,
    macdBottomDivergence: false,
    macdTopDivergence: false,
    setups: [],
    setupScore: 0,
    exitSignals: [],
    quality,
  };
}

/** computeWeeklyFactors 的行为选项 */
export interface WeeklyFactorOptions {
  /**
   * 只用已收盘周：
   * - 本周涨幅回退到最近已收盘周（避免周一/盘中跑出来的「半天涨幅」被当成整周涨幅）；
   * - 始终额外输出 confirmedClose，供价格筛选用已收盘周口径。
   */
  completeWeeksOnly?: boolean;
}

/**
 * 计算单只股票的周线因子
 * @param kline 周K数据（时间从旧到新）
 * @param options 行为选项（见 WeeklyFactorOptions）
 */
export function computeWeeklyFactors(
  code: string,
  name: string,
  kline: KLineData[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG,
  now: number = Date.now(),
  options: WeeklyFactorOptions = {}
): WeeklyFactors {
  if (kline.length === 0) {
    return emptyFactors(code, name, kline, 0, false, 0, 0, {
      ok: false,
      reasons: ['无周K数据'],
      suspectedGaps: 0,
      pausedWeeks: 0,
    });
  }

  const { confirmed, runningWeekIncluded } = splitConfirmedWeeklyKlines(kline, now);
  const lastBar = kline[kline.length - 1];
  const prevBar = kline.length >= 2 ? kline[kline.length - 2] : undefined;
  const weekChangePercent =
    prevBar && prevBar.close > 0
      ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
      : 0;

  // 已收盘周口径：用于「只用完整周」模式下的涨幅与价格筛选
  const confirmedLast = confirmed.length > 0 ? confirmed[confirmed.length - 1] : undefined;
  const prevConfirmed = confirmed.length >= 2 ? confirmed[confirmed.length - 2] : undefined;
  const confirmedClose = confirmedLast ? confirmedLast.close : lastBar.close;
  const confirmedWeekChange =
    confirmedLast && prevConfirmed && prevConfirmed.close > 0
      ? ((confirmedLast.close - prevConfirmed.close) / prevConfirmed.close) * 100
      : 0;

  const quality = checkQuality(confirmed, config);
  if (!quality.ok || confirmed.length === 0) {
    return emptyFactors(
      code,
      name,
      kline,
      confirmed.length,
      runningWeekIncluded,
      weekChangePercent,
      confirmedClose,
      quality
    );
  }

  /**
   * 只构建「最近 N 周」的面板：MA60 需要 60 根、52 周位置需要 52 根，
   * 再给箱体（10 周）与回归窗口（26 周）留余量。
   * 全量 500 根逐只构建会让「一键分析」慢一个数量级，而多出来的历史并不影响末周判定。
   */
  const windowSize = Math.max(config.minConfirmedBars + 26, 156);
  const source = confirmed.length > windowSize ? confirmed.slice(-windowSize) : confirmed;

  const panel = buildWeeklyPanel(code, name, source, config);
  const last = panel.n - 1;
  const snap = snapshotAt(panel, last);

  const closes = source.map((d) => d.close);
  const ma30 = safe(sma(closes, 30), last);
  // confirmedClose 已在上方按已收盘周口径算出（source 为 confirmed 的后缀，末值一致），此处不再重复声明
  const bias20 =
    snap.ma20 !== undefined && snap.ma20 > 0 && Number.isFinite(confirmedClose)
      ? ((confirmedClose - snap.ma20) / snap.ma20) * 100
      : undefined;

  const window52 = source.slice(-52);
  const high52w = Math.max(...window52.map((d) => d.high));
  const low52w = Math.min(...window52.map((d) => d.low));

  const macdBar =
    snap.macdDif !== undefined && snap.macdDea !== undefined
      ? (snap.macdDif - snap.macdDea) * 2
      : undefined;

  const setups = detectSetups(panel, last, config);
  const { stopLoss, riskPct } = computeStopLoss(panel, last);

  return {
    ...snap,
    // 面板可能被截断，这里回填真实根数；close 保留「含未完成本周」的最新价
    bars: kline.length,
    confirmedBars: confirmed.length,
    runningWeekIncluded,
    lastWeekTime: lastBar.time,
    // 最新价保留「含未完成本周」的实时值，供展示/排序
    close: lastBar.close,
    confirmedClose,
    // 「只用完整周」时，本周涨幅回退到最近已收盘周，避免把盘中半天涨幅当成整周
    weekChangePercent: options.completeWeeksOnly ? confirmedWeekChange : weekChangePercent,
    ma30,
    high52w: Number.isFinite(high52w) ? high52w : undefined,
    low52w: Number.isFinite(low52w) ? low52w : undefined,
    bias20,
    macdBar,
    setups,
    setupScore: totalSetupScore(setups),
    stopLoss,
    riskPct,
    exitSignals: detectExitSignals(panel, last, config),
    quality,
  };
}
