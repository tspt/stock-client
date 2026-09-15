/**
 * 周线评分：横截面分位标准化 + 硬性门槛
 *
 * 为什么要改成「分位」而不是旧的「固定加分」：
 * 1. 旧实现里「20周涨幅>80%算过热」这类绝对阈值，对高波动股与银行股一视同仁，本身就不公平。
 * 2. 旧实现让「站上MA10」既当硬门槛又贡献 15 分，导致 minScore 的含义被稀释。
 * 3. 分位评分的含义非常明确：这只票在当前股票池里处于什么水平，与行情整体强弱无关。
 *
 * 因此本模块分两步：
 *   - 硬性门槛（gates）：数据质量、流动性、结构、过热，属一票否决，不参与打分。
 *   - 加权分位（score）：趋势/动量/相对强度/位置/量能/形态六项加权，只用于排序。
 */

import {
  buildRankTable,
  clamp,
  percentileOfSorted,
} from './math';
import { DEFAULT_WEEKLY_CONFIG } from './factors';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFactors,
  WeeklyGates,
  WeeklyScoreParts,
} from './types';

/** 量比极端值截断：20 倍量能会把其余样本的分位全挤到一处 */
const VOL_RATIO_CAP = 5;

/** 位置分的理想区间（52 周分位） */
const POSITION_SWEET_LOW = 55;
const POSITION_SWEET_HIGH = 90;

/**
 * 位置分：偏好「已经走强但尚未透支」的区间。
 * 过低说明仍是弱势股，过高说明已在高位，两者都不给满分。
 */
function positionScore(pos: number | undefined): number {
  if (pos === undefined) return 50;
  if (pos <= 20) return 20 + (pos / 20) * 20;
  if (pos < POSITION_SWEET_LOW) {
    return 40 + ((pos - 20) / (POSITION_SWEET_LOW - 20)) * 40;
  }
  if (pos <= POSITION_SWEET_HIGH) {
    return 80 + ((pos - POSITION_SWEET_LOW) / (POSITION_SWEET_HIGH - POSITION_SWEET_LOW)) * 20;
  }
  // 创新高不必然是坏事，只做轻微折价；真正的过热由 extBias 与门槛负责
  return 100 - ((pos - POSITION_SWEET_HIGH) / (100 - POSITION_SWEET_HIGH)) * 10;
}

/**
 * 形态分：每个维度内部互斥（取最高档），跨维度相加，
 * 避免多头排列、站上MA20、结构向上三个高度相关的信号重复计数。
 */
function patternScore(f: WeeklyFactors): number {
  // 突破类
  let breakout = 0;
  if (f.boxBreakoutFirst) breakout = 50;
  else if (f.boxBreakout) breakout = 25;

  // 均线排列类（互斥取最高档）
  let alignment = 0;
  if (f.maStack) alignment = 30;
  else if (f.pxAboveMa20) alignment = 15;
  else if (f.pxAboveMa10) alignment = 5;

  // 结构类
  const structure = f.structure === 'up' ? 20 : f.structure === 'sideways' ? 10 : 0;

  // MACD 类：状态优先，刚金叉是加分项而非必要条件
  let macd = 0;
  if (f.macdBullish && f.macdGoldenCross) macd = 20;
  else if (f.macdBullish) macd = 15;
  else if (f.macdGoldenAboveZero) macd = 12;
  else if (f.macdGoldenCross) macd = 8;

  return clamp(breakout + alignment + structure + macd, 0, 100);
}

/** 风险扣分（在加权分位之外单独扣减） */
function riskPenalty(f: WeeklyFactors, config: WeeklyConfig): { penalty: number; warnings: string[] } {
  const warnings: string[] = [];
  let penalty = 0;

  if (f.extBias !== undefined) {
    if (f.extBias > config.extBiasSevere) {
      penalty += 15;
      warnings.push(`偏离周MA20达 ${f.extBias.toFixed(1)} 个 ATR，短期严重透支`);
    } else if (f.extBias > config.extBiasWarn) {
      penalty += 6;
      warnings.push(`偏离周MA20达 ${f.extBias.toFixed(1)} 个 ATR，追高风险`);
    }
  }

  if (f.atrPct !== undefined && f.atrPct > config.atrPctMax) {
    penalty += 8;
    warnings.push(`周波动率 ${f.atrPct.toFixed(1)}%，属高投机品种`);
  }

  if (f.maxDD52w !== undefined && f.maxDD52w > 60) {
    penalty += 5;
    warnings.push(`52 周最大回撤 ${f.maxDD52w.toFixed(0)}%，持股体验差`);
  }

  if (f.pos52w !== undefined && f.pos52w >= config.pos52wOverheat) {
    penalty += 5;
    warnings.push('处于 52 周最高价附近，缺乏安全边际');
  }

  if (f.structure === 'down') {
    penalty += 10;
    warnings.push('26 周回归趋势向下');
  }

  if (f.macdDeathCross) {
    penalty += 6;
    warnings.push('周线 MACD 最近一次交叉为死叉');
  } else if (
    !f.macdBullish &&
    f.macdDif !== undefined &&
    f.macdDea !== undefined &&
    f.macdDif < f.macdDea
  ) {
    // 没有金叉可扣，但空头排列本身就是风险
    penalty += 4;
    warnings.push('周线 MACD 处于空头排列');
  }

  if (f.quality.suspectedGaps > config.maxSuspectedGaps) {
    penalty += 10;
    warnings.push('检测到异常跳空，数据可能未复权，结果仅供参考');
  }

  return { penalty, warnings };
}

/** 生成正向信号标签（仅描述事实，不再带分数） */
function buildSignals(f: WeeklyFactors, parts: WeeklyScoreParts): string[] {
  const out: string[] = [];
  if (f.boxBreakoutFirst) out.push('首次箱体突破');
  else if (f.boxBreakout) out.push('箱体上方运行');
  if (f.maStack) out.push('均线多头');
  else if (f.pxAboveMa20) out.push('站上周MA20');
  else if (f.pxAboveMa10) out.push('站上周MA10');
  if (f.structure === 'up') out.push('中期趋势向上');
  if (f.macdBullish && f.macdGoldenCross) out.push('MACD零轴上金叉');
  else if (f.macdBullish) out.push('MACD多头');
  else if (f.macdGoldenCross) out.push('MACD金叉');
  if (parts.rs >= 80) out.push('相对强度居前');
  if (f.volRatio5 !== undefined && f.volRatio5 >= 1.5 && f.volRatio5 < 3) out.push('量能温和放大');
  return out;
}

/** 建议止损位：突破看箱顶，趋势看 MA20，其余看 MA10 */
function resolveStopLoss(f: WeeklyFactors): number | undefined {
  if (f.boxBreakoutFirst && f.boxHigh !== undefined && f.boxHigh < f.close) return f.boxHigh;
  if (f.pxAboveMa20 && f.ma20 !== undefined && f.ma20 < f.close) return f.ma20;
  if (f.pxAboveMa10 && f.ma10 !== undefined && f.ma10 < f.close) return f.ma10;
  return undefined;
}

function emptyAnalysis(f: WeeklyFactors, config: WeeklyConfig): WeeklyAnalysis {
  return {
    ...f,
    score: 0,
    parts: { rs: 0, trend: 0, momentum: 0, volume: 0, pattern: 0, position: 0 },
    gates: { dataOk: false, liquidity: false, notDowntrend: false, notOverheated: false },
    passed: false,
    signals: [],
    warnings: f.quality.reasons.slice(),
    insufficientData: true,
  };
}

/**
 * 对一批因子做横截面评分。
 *
 * 必须整批传入：相对强度与所有分位都以「本批样本」为总体，
 * 单只股票无法计算。这也是本次重构与旧实现的根本差异。
 */
export function scoreWeeklyFactors(
  factors: WeeklyFactors[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG
): WeeklyAnalysis[] {
  const valid = factors.filter((f) => f.quality.ok);

  if (valid.length < 10) {
    // 样本太少时分位没有统计意义，直接返回不可用结果
    return factors.map((f) => emptyAnalysis(f, config));
  }

  // 先算各收益期的分位，用于合成相对强度
  const ret13Table = buildRankTable(valid.map((f) => f.ret13w));
  const ret26Table = buildRankTable(valid.map((f) => f.ret26w));
  const ret52Table = buildRankTable(valid.map((f) => f.ret52w));

  const rsRaw = new Map<string, number>();
  valid.forEach((f) => {
    const p13 = f.ret13w === undefined ? 50 : percentileOfSorted(ret13Table, f.ret13w);
    const p26 = f.ret26w === undefined ? 50 : percentileOfSorted(ret26Table, f.ret26w);
    const p52 = f.ret52w === undefined ? 50 : percentileOfSorted(ret52Table, f.ret52w);
    // 中期权重最高：太短噪声大，太长则反应迟钝
    const rs = 0.25 * (p13 - 50) + 0.5 * (p26 - 50) + 0.25 * (p52 - 50);
    rsRaw.set(f.code, rs);
  });

  const rsTable = buildRankTable(valid.map((f) => rsRaw.get(f.code) ?? 0));
  const slopeTable = buildRankTable(valid.map((f) => f.ma20Slope));
  const momentumTable = buildRankTable(valid.map((f) => f.ret26w));
  const volumeTable = buildRankTable(
    valid.map((f) => (f.volRatio5 === undefined ? undefined : Math.min(f.volRatio5, VOL_RATIO_CAP)))
  );

  const w = config.weights;

  return factors.map((f) => {
    if (!f.quality.ok) return emptyAnalysis(f, config);

    const rs = rsRaw.get(f.code) ?? 0;
    const rsRank = percentileOfSorted(rsTable, rs);

    const parts: WeeklyScoreParts = {
      rs: rsRank,
      trend:
        f.ma20Slope === undefined ? 50 : percentileOfSorted(slopeTable, f.ma20Slope),
      momentum:
        f.ret26w === undefined ? 50 : percentileOfSorted(momentumTable, f.ret26w),
      volume:
        f.volRatio5 === undefined
          ? 50
          : percentileOfSorted(volumeTable, Math.min(f.volRatio5, VOL_RATIO_CAP)),
      pattern: patternScore(f),
      position: positionScore(f.pos52w),
    };

    const weighted =
      parts.rs * w.rs +
      parts.trend * w.trend +
      parts.momentum * w.momentum +
      parts.volume * w.volume +
      parts.pattern * w.pattern +
      parts.position * w.position;

    const { penalty, warnings } = riskPenalty(f, config);
    const score = Math.round(clamp(weighted - penalty, 0, 100));

    const gates: WeeklyGates = {
      dataOk: f.quality.ok,
      liquidity: true,
      notDowntrend: f.structure !== 'down',
      notOverheated:
        !(f.pos52w !== undefined && f.pos52w >= 99) &&
        !(f.extBias !== undefined && f.extBias > config.extBiasSevere),
    };

    const stopLoss = resolveStopLoss(f);
    const riskPct =
      stopLoss !== undefined && f.close > 0 ? ((f.close - stopLoss) / f.close) * 100 : undefined;

    return {
      ...f,
      score,
      rs,
      rsRank,
      parts,
      gates,
      passed: gates.dataOk && gates.liquidity && gates.notDowntrend && gates.notOverheated,
      stopLoss,
      riskPct,
      signals: buildSignals(f, parts),
      warnings,
      insufficientData: false,
    };
  });
}
