/**
 * 周线评分：趋势健康度 + 战法 + 多周期共振 − 风险惩罚
 *
 * 分段与《周线选股》文档章节一一对应：
 *   第一章 趋势判断      → 趋势健康度（上限 30）
 *   第二章 核心买入战法  → 战法（上限 50）
 *   第三章 多周期共振    → 共振（上限 20）
 *   第四章 风险控制      → 风险惩罚（上限 30，扣分）
 *
 * 文档没有独立的「量价」章节——放量突破、连续堆量、缩量回踩都是各战法的组成部分，
 * 因此不再单列量价段：旧版只给放量加分，会让「缩量回踩」类战法系统性吃亏。
 *
 * 绝对分制的好处是分数不随池子构成漂移，且单票可独立计算；
 * scoreRank 按横截面计算，仅作展示，不计入总分。
 */

import { buildRankTable, clamp, percentileOfSorted } from './math';
import { DEFAULT_WEEKLY_CONFIG } from './factors';
import type {
  WeeklyAnalysis,
  WeeklyConfig,
  WeeklyFactors,
  WeeklyGates,
  WeeklyScoreParts,
} from './types';

/**
 * 趋势健康度（上限 30）：逐条对应文档第一章，彼此不重复。
 * 分段权重：多头排列且开口不大 12 / MA20 向上拐头 6 / MA60 走平上翘 6 /
 *          MACD 零轴上方 5 / MACD 底背离 3。
 * 「多头排列」与「MA20 向上拐头」已在 panel 里解耦，不再是同一事实计两次。
 */
function computeTrendScore(f: WeeklyFactors, max: number): number {
  let score = 0;

  // 「5/10/20/60 周均线由下向上依次排列，且开口不大」
  if (f.maBullStack) score += 12;
  else if (f.maStack) score += 6; // 只满足 5>10>20，未含 60 周线

  // 「股价站稳且 20 周均线向上拐头，中期趋势才成立」
  if (f.ma20TurnUp) score += 6;
  // 「60 周均线走平或上翘，是主升浪启动的标志」
  if (f.ma60FlatOrUp) score += 6;
  // 「周线 MACD 在零轴上方金叉为强势加仓信号」
  // 文档对零轴下方金叉的要求是「需谨慎」，因此不给正分
  if (f.macdBullish || f.macdGoldenAboveZero) score += 5;
  // 「周线底背离是中级底部反转信号」（与多头排列互斥，故上限不会溢出）
  if (f.macdBottomDivergence) score += 3;

  return Math.min(score, max);
}

/**
 * 多周期共振（上限 20）：对应文档第三章「周线选股，日线买股」。
 *   周线站在 5 周均线上方（定方向）        → 6
 *   日线站在 20 日均线上方（定主力控盘）   → 14
 * 文档称两条同时满足时「成功率大幅提升」，因此日线权重更重。
 *
 * 日线数据来自机会分析写入 IndexedDB 的 opportunityKlineCache；
 * 缺失时按满分的一半计，避免「没跑机会分析」被当成「日线走坏」而系统性扣分。
 */
function computeResonanceScore(f: WeeklyFactors, max: number): number {
  let score = 0;
  if (f.pxAboveMa5) score += 6;
  if (f.dailyAboveMa20 === true) score += 14;
  else if (f.dailyAboveMa20 === undefined) score += 7;
  return Math.min(score, max);
}

/**
 * 风险惩罚（正数，上限 config.maxRiskPenalty）。
 *
 * 文档第四章的止损/卖出信号给高权重（跌破 20 周线、MA10 拐头、顶背离、放量滞涨、放量长上影）；
 * 异常跳空、波动率、拥挤度、乖离属于工程性风控，文档未列出，单项权重压到 ≤5，
 * 以免把主升浪中的强势股（本就高乖离、高波动）直接压死。
 */
function riskPenalty(
  f: WeeklyFactors,
  config: WeeklyConfig
): { penalty: number; warnings: string[] } {
  const warnings: string[] = [];
  let penalty = 0;

  // ===== 文档第四章：止损 / 卖出信号 =====
  if (f.exitSignals.includes('有效跌破20周均线')) {
    penalty += 10;
    warnings.push('已有效跌破 20 周均线');
  }
  if (f.ma10TurnDown) {
    penalty += 6;
    warnings.push('10 周均线拐头向下');
  }
  if (f.macdTopDivergence) {
    penalty += 6;
    warnings.push('MACD 顶背离');
  }
  if (f.exitSignals.includes('高位放量滞涨')) {
    penalty += 6;
    warnings.push('高位放量滞涨，疑似主力出货');
  }
  if (f.exitSignals.some((s) => s.includes('放量长上影'))) {
    penalty += 6;
    warnings.push('累计涨幅较高后放量长上影');
  }

  // ===== 工程性风控（文档未列出，单项 ≤5） =====
  if (f.quality.suspectedGaps > config.maxSuspectedGaps) {
    penalty += 5;
    warnings.push('检测到异常跳空，数据可能未复权，结果仅供参考');
  }
  if (f.ret1w !== undefined && f.ret1w >= config.overheatRet1w) {
    penalty += 5;
    warnings.push(`近 1 周涨幅 ${f.ret1w.toFixed(1)}%，过热`);
  }
  if (f.amountCrowd8w !== undefined && f.amountCrowd8w >= 3) {
    penalty += 3;
    warnings.push('本周成交额相对近 8 周中位数显著放大，拥挤');
  }
  if (f.extBias !== undefined) {
    if (f.extBias >= config.extBiasSevere) {
      penalty += 5;
      warnings.push(`相对周MA20 乖离 ${f.extBias.toFixed(1)} ATR，严重透支`);
    } else if (f.extBias >= config.extBiasWarn) {
      penalty += 2;
      warnings.push(`相对周MA20 乖离 ${f.extBias.toFixed(1)} ATR，偏高`);
    }
  }
  if (f.atrPct !== undefined && f.atrPct > config.atrPctMax) {
    penalty += 3;
    warnings.push(`周波动率 ${f.atrPct.toFixed(1)}%，属投机品种`);
  }
  // 日线未站上 20 日均线：共振段已经给 0 分，这里只提示、不重复惩罚
  if (f.dailyAboveMa20 === false) {
    warnings.push('日线未站上 20 日均线，多周期共振不足');
  }

  return { penalty: Math.min(penalty, config.maxRiskPenalty), warnings };
}

/** 展示用的信号：命中的战法 + 关键趋势特征 */
function buildSignals(f: WeeklyFactors): string[] {
  const out: string[] = [];
  f.setups.forEach((hit) => {
    out.push(`${hit.label}(${hit.score}/${hit.max})`);
  });
  if (f.maBullStack) out.push('均线多头排列');
  if (f.pxAboveMa60) out.push('站上60周线');
  if (f.ma60FlatOrUp) out.push('60周线走平或上翘');
  if (f.macdGoldenAboveZero) out.push('MACD零轴上方金叉');
  if (f.macdBottomDivergence) out.push('MACD底背离');
  if (f.ret1w !== undefined && f.ret1w < 0) out.push('近 1 周回踩');
  return out;
}

function emptyAnalysis(f: WeeklyFactors): WeeklyAnalysis {
  return {
    ...f,
    score: 0,
    parts: { trend: 0, setup: 0, resonance: 0, penalty: 0 },
    gates: {
      dataOk: false,
      notDowntrend: true,
      aboveMa60: false,
      ma20Up: false,
      hasSetup: false,
      dailyOk: true,
      notOverheated: true,
    },
    passed: false,
    signals: [],
    warnings: f.quality.reasons.slice(),
    insufficientData: true,
  };
}

export interface WeeklyScoreCore {
  score: number;
  parts: WeeklyScoreParts;
}

export interface WeeklyScorer {
  validCount: number;
  score(f: WeeklyFactors): WeeklyScoreCore | null;
}

/**
 * 构造评分子。
 *
 * 评分是绝对分（单票可独立计算），但仍整批构造，
 * 以保持与页面完全一致的算法。
 */
export function createWeeklyScorer(
  factors: WeeklyFactors[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG
): WeeklyScorer {
  const valid = factors.filter((f) => f.quality.ok);
  const w = config.weights;

  return {
    validCount: valid.length,
    score(f) {
      if (!f.quality.ok) return null;

      const trend = computeTrendScore(f, w.trend);
      const setup = Math.min(f.setupScore, w.setup);
      const resonance = computeResonanceScore(f, w.resonance);
      const { penalty } = riskPenalty(f, config);

      const parts: WeeklyScoreParts = {
        trend: clamp(trend, 0, w.trend),
        setup: clamp(setup, 0, w.setup),
        resonance: clamp(resonance, 0, w.resonance),
        penalty,
      };

      const raw = parts.trend + parts.setup + parts.resonance - parts.penalty;

      return {
        score: Math.round(clamp(raw, 0, 100)),
        parts,
      };
    },
  };
}

/** 空头排列：5<10<20<60 依次向下 */
export function isBearStack(f: WeeklyFactors): boolean {
  const { ma5, ma10, ma20, ma60 } = f;
  if (ma5 === undefined || ma10 === undefined || ma20 === undefined || ma60 === undefined) {
    return false;
  }
  return ma5 < ma10 && ma10 < ma20 && ma20 < ma60;
}

/**
 * 对一批因子做评分。
 * 评分是绝对分；scoreRank 为横截面参考量。
 */
export function scoreWeeklyFactors(
  factors: WeeklyFactors[],
  config: WeeklyConfig = DEFAULT_WEEKLY_CONFIG
): WeeklyAnalysis[] {
  const scorer = createWeeklyScorer(factors, config);
  const scored = factors.map((f) => {
    if (!f.quality.ok) return emptyAnalysis(f);

    const core = scorer.score(f);
    if (!core) return emptyAnalysis(f);
    const { score, parts } = core;
    const { warnings } = riskPenalty(f, config);

    const gates: WeeklyGates = {
      dataOk: f.quality.ok,
      // 剔除周线空头排列个股
      notDowntrend: f.structure !== 'down' && !isBearStack(f),
      aboveMa60: f.pxAboveMa60,
      ma20Up: f.ma20TurnUp,
      hasSetup: f.setups.length > 0,
      // 无日线数据时不阻断（15 分钟层未接入，日线层缺失只降级不否决）
      dailyOk: f.dailyAboveMa20 !== false,
      // 与风险惩罚共用同一阈值，避免「扣了分却不算过热」的自相矛盾
      notOverheated: !(f.ret1w !== undefined && f.ret1w >= config.overheatRet1w),
    };

    return {
      ...f,
      score,
      parts,
      gates,
      passed: gates.dataOk && gates.notDowntrend && gates.notOverheated,
      signals: buildSignals(f),
      warnings,
      insufficientData: false,
    };
  });

  const rankTable = buildRankTable(
    scored.filter((r) => !r.insufficientData).map((r) => r.score)
  );
  return scored.map((row) => {
    if (row.insufficientData) return row;
    return {
      ...row,
      scoreRank: percentileOfSorted(rankTable, row.score),
    };
  });
}
